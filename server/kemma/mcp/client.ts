import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { flag } from "../../core/flags";
import { FORBIDDEN_MCP_WORDS, loadMcpConfig, type McpConfig, type McpToolMode } from "./config";

/** Wire-format tool definition. Kept local (not imported from the toolkit) so this module has no
 * dependency on server/kemma/toolkit, which itself depends on this module for MCP dispatch. */
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[]; items?: { type: string; description?: string } }>;
    required: string[];
  };
}

export const MCP_TOOL_PREFIX = "mcp__";
const CALL_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;
const MAX_RESULT_CHARS = 20_000;

/**
 * Maps a server-declared tool mode onto the toolkit's risk model (P1-02 spec): `read` stays a
 * read; `draft` is a write that needs no approval (it only stages a draft, nothing is sent);
 * `confirm` is a write that needs approval once P1-11 wires the approval gate. Informational only
 * today — `tools()` below is what actually keeps a confirm tool off the model.
 */
export function riskForMcpMode(mode: McpToolMode): { risk: "read" | "write"; requiresApproval: boolean } {
  if (mode === "read") return { risk: "read", requiresApproval: false };
  if (mode === "draft") return { risk: "write", requiresApproval: false };
  return { risk: "write", requiresApproval: true };
}

/** Reject if `p` has not settled within `ms`; used so one wedged MCP server can never hang a chat run. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`MCP ${label} timed out after ${ms / 1000}s`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

interface ExposedTool {
  fullName: string;
  server: string;
  tool: string;
  mode: McpToolMode;
  def: ToolDefinition;
}

interface Connection { client: Client; tools: ExposedTool[] }

export class McpRegistry {
  private conns = new Map<string, Connection>();
  private starting: Promise<void> | null = null;
  readonly config: McpConfig;
  readonly rejected: string[];

  constructor(loaded = loadMcpConfig()) {
    this.config = loaded.config;
    this.rejected = loaded.rejected;
    for (const r of this.rejected) console.warn(`[mcp] rejected forbidden tool name at load: ${r}`);
  }

  /** Connect every enabled server once. A server that fails to start is skipped, never fatal. */
  start(): Promise<void> {
    this.starting ??= (async () => {
      await Promise.all(
        Object.entries(this.config.servers)
          .filter(([, cfg]) => cfg.enabled)
          .map(async ([name, cfg]) => {
            try {
              const client = new Client({ name: "sutaeru", version: "1.0.0" });
              if (cfg.transport === "stdio") {
                // Minimal environment: PATH/HOME plus the credential variables this server declares.
                const env: Record<string, string> = {};
                for (const k of ["PATH", "HOME", ...cfg.envVars]) if (process.env[k]) env[k] = process.env[k]!;
                await withTimeout(client.connect(new StdioClientTransport({ command: cfg.command!, args: cfg.args, env, stderr: "ignore" })), CONNECT_TIMEOUT_MS, `connect "${name}"`);
              } else {
                const headers: Record<string, string> = {};
                const tokenVar = cfg.envVars[0];
                if (tokenVar && process.env[tokenVar]) headers.Authorization = `Bearer ${process.env[tokenVar]}`;
                await withTimeout(client.connect(new StreamableHTTPClientTransport(new URL(cfg.url!), { requestInit: { headers } })), CONNECT_TIMEOUT_MS, `connect "${name}"`);
              }
              const listed = await withTimeout(client.listTools(), CONNECT_TIMEOUT_MS, `listTools "${name}"`);
              const tools: ExposedTool[] = [];
              for (const t of listed.tools) {
                const mode = cfg.tools[t.name];
                if (!mode || FORBIDDEN_MCP_WORDS.test(t.name)) continue;
                const fullName = `${MCP_TOOL_PREFIX}${name}__${t.name}`.replace(/[^A-Za-z0-9_-]/g, "_");
                const schema = (t.inputSchema ?? { type: "object", properties: {} }) as ToolDefinition["parameters"];
                tools.push({
                  fullName, server: name, tool: t.name, mode,
                  def: {
                    name: fullName,
                    description: `${t.description ?? t.name}${mode === "draft" ? " (creates a draft only; nothing is sent)" : ""}`,
                    parameters: { ...schema, type: "object", properties: schema.properties ?? {} },
                  },
                });
              }
              this.conns.set(name, { client, tools });
            } catch (err) {
              console.warn(`[mcp] server "${name}" unavailable: ${(err as Error).message}`);
            }
          }),
      );
    })();
    return this.starting;
  }

  /**
   * Tools offered to the model. "confirm" tools are held back until the approval flow is switched
   * on (`flag("APPROVALS")`, P1-11), so a confirm-mode tool can never run unattended before then.
   */
  async tools(): Promise<ToolDefinition[]> {
    await this.start();
    const approvalsOn = flag("APPROVALS");
    return [...this.conns.values()].flatMap((c) => c.tools.filter((t) => t.mode !== "confirm" || approvalsOn).map((t) => t.def));
  }

  async modeOf(fullName: string): Promise<McpToolMode | undefined> {
    await this.start();
    for (const conn of this.conns.values()) {
      const t = conn.tools.find((x) => x.fullName === fullName);
      if (t) return t.mode;
    }
    return undefined;
  }

  async call(
    fullName: string,
    args: Record<string, unknown>,
    options?: { confirmed?: boolean },
  ): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
    await this.start();
    for (const conn of this.conns.values()) {
      const t = conn.tools.find((x) => x.fullName === fullName);
      if (!t) continue;
      if (t.mode === "confirm" && !options?.confirmed) {
        return { ok: false, error: "This tool needs user confirmation, which is not available yet." };
      }
      try {
        const res = await conn.client.callTool({ name: t.tool, arguments: args }, undefined, { timeout: CALL_TIMEOUT_MS });
        const content = Array.isArray(res.content) ? res.content : [];
        const text = content.map((c: { type: string; text?: string }) => (c.type === "text" ? c.text ?? "" : `[${c.type} content omitted]`)).join("\n").slice(0, MAX_RESULT_CHARS);
        return res.isError ? { ok: false, error: text || "Tool returned an error" } : { ok: true, text };
      } catch (err) {
        return { ok: false, error: (err as Error).message };
      }
    }
    return { ok: false, error: `Unknown MCP tool: ${fullName}` };
  }

  async close(): Promise<void> {
    await Promise.all([...this.conns.values()].map((c) => c.client.close().catch(() => {})));
    this.conns.clear();
    this.starting = null;
  }
}

let shared: McpRegistry | null = null;
export function getMcpRegistry(): McpRegistry {
  return (shared ??= new McpRegistry());
}

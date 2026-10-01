import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { ToolDefinition } from "../tools";
import { FORBIDDEN_MCP_WORDS, loadMcpConfig, type McpConfig, type McpToolMode } from "./config";

export const MCP_TOOL_PREFIX = "mcp__";
const CALL_TIMEOUT_MS = 30_000;
const CONNECT_TIMEOUT_MS = 15_000;
const MAX_RESULT_CHARS = 20_000;

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
   * Tools offered to the model. "confirm" tools are held back until a user-confirmation flow exists,
   * so a confirm-mode tool can never run unattended.
   */
  async tools(): Promise<ToolDefinition[]> {
    await this.start();
    return [...this.conns.values()].flatMap((c) => c.tools.filter((t) => t.mode !== "confirm").map((t) => t.def));
  }

  async call(fullName: string, args: Record<string, unknown>): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
    await this.start();
    for (const conn of this.conns.values()) {
      const t = conn.tools.find((x) => x.fullName === fullName);
      if (!t) continue;
      if (t.mode === "confirm") return { ok: false, error: "This tool needs user confirmation, which is not available yet." };
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

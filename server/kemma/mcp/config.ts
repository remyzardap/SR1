import fs from "fs";
import path from "path";
import { z } from "zod";

/** Any MCP tool whose name contains one of these can never be used, even if it is on an allowlist (G1). */
export const FORBIDDEN_MCP_WORDS = /(delete|remove|trash|share|permission|publish|send)/i;

export const McpToolMode = z.enum(["read", "draft", "confirm"]);
export type McpToolMode = z.infer<typeof McpToolMode>;

const ServerSchema = z.object({
  enabled: z.boolean().default(false),
  transport: z.enum(["stdio", "http"]),
  command: z.string().optional(),
  args: z.array(z.string()).default([]),
  url: z.string().url().optional(),
  /** Names of environment variables that hold credentials. Values are read from the process env, never from this file. */
  envVars: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).default([]),
  /** Explicit allowlist: server tool name to mode. A tool not listed here is never offered. */
  tools: z.record(z.string().min(1), McpToolMode),
});

const ConfigSchema = z.object({ servers: z.record(z.string().regex(/^[a-z0-9][a-z0-9-]{0,31}$/), ServerSchema) });

export type McpServerConfig = z.infer<typeof ServerSchema>;
export interface McpConfig { servers: Record<string, McpServerConfig> }

export interface LoadedConfig {
  config: McpConfig;
  /** Tool entries dropped at load time, as "server/tool". */
  rejected: string[];
}

export function parseMcpConfig(raw: unknown): LoadedConfig {
  const parsed = ConfigSchema.parse(raw);
  const rejected: string[] = [];
  for (const [server, cfg] of Object.entries(parsed.servers)) {
    if (cfg.transport === "stdio" && !cfg.command) throw new Error(`mcp.config.json: server "${server}" needs "command" for stdio`);
    if (cfg.transport === "http" && !cfg.url) throw new Error(`mcp.config.json: server "${server}" needs "url" for http`);
    for (const tool of Object.keys(cfg.tools)) {
      if (FORBIDDEN_MCP_WORDS.test(tool)) {
        delete cfg.tools[tool];
        rejected.push(`${server}/${tool}`);
      }
    }
  }
  return { config: parsed, rejected };
}

export function loadMcpConfig(file = process.env.MCP_CONFIG ? path.resolve(process.env.MCP_CONFIG) : path.resolve(process.cwd(), "mcp.config.json")): LoadedConfig {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf-8");
  } catch {
    return { config: { servers: {} }, rejected: [] };
  }
  return parseMcpConfig(JSON.parse(text));
}

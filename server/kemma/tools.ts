/**
 * Kemma Agent Tool Layer — compatibility re-exports.
 *
 * @module kemma/tools
 * @description
 * P1-02 moved tool definitions onto the typed toolkit (`./toolkit/types.ts`, `./toolkit/registry.ts`,
 * `./toolkit/builtin/*.ts`). The engine now calls `toolsFor()` / `runTool()` directly and does not
 * import from this file. It stays only so any other caller that previously imported
 * `KEMMA_TOOLS`, `DRIVE_TOOLS`, `SKILL_TOOLS`, `SKILL_TOOL_NAMES` or `VPS_FILES_TOOL` keeps
 * working: every export below is generated from the registered ToolSpecs, in the same shape
 * (`{ name, description, parameters: { type, properties, required } }`) as the old hand-written
 * definitions.
 */
import { registerBuiltinTools } from "./toolkit/builtin";
import { getToolSpec, toOpenAiTools, type OpenAiToolDef } from "./toolkit/registry";
import { DRIVE_TOOL_NAMES, SKILL_TOOL_NAMES as TOOLKIT_SKILL_TOOL_NAMES } from "./toolkit/names";

registerBuiltinTools();

const CORE_TOOL_NAMES = ["safe_files", "web_search", "browse", "run_code", "generate_file", "phone_scan"] as const;

function specsFor(names: readonly string[]) {
  return names.map((n) => getToolSpec(n)).filter((s): s is NonNullable<typeof s> => !!s);
}

export const KEMMA_TOOLS: OpenAiToolDef[] = toOpenAiTools(specsFor([...CORE_TOOL_NAMES, ...DRIVE_TOOL_NAMES]));

export const DRIVE_TOOLS = [...DRIVE_TOOL_NAMES];

export const SKILL_TOOL_NAMES = TOOLKIT_SKILL_TOOL_NAMES;

export const SKILL_TOOLS: OpenAiToolDef[] = toOpenAiTools(specsFor(TOOLKIT_SKILL_TOOL_NAMES));

export const VPS_FILES_TOOL: OpenAiToolDef = toOpenAiTools(specsFor(["vps_files"]))[0];

export type { OpenAiToolDef as ToolDefinition };
export type KemmaToolName = typeof KEMMA_TOOLS[number]["name"];

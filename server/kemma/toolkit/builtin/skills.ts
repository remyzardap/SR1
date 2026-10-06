/**
 * Skill tools: load_skill, read_skill_file, run_skill_script. Not offered by default — the
 * engine adds them (via toolsFor's skills handling) only on runs where at least one file skill is
 * enabled. They are read-only (load, read) or sandbox-only (run_skill_script, never on the
 * server) and never widen access beyond what a skill's own `allowed-tools` narrows it to.
 */
import { z } from "zod";
import { registerTool } from "../registry";
import { runSkillScript } from "../../kemmaMax";
import { getEnabledSkills } from "../../skillReviews";
import { readSkillFileContent, toLoadedSkill } from "../../fileSkills";
import { createErrorResult, createSuccessResult, type LegacyToolResult } from "./legacy";

const LoadSkillArgs = z.object({ name: z.string().describe("Skill name exactly as listed in the index") });
const ReadSkillFileArgs = z.object({
  name: z.string().describe("Skill name"),
  path: z.string().describe("Path relative to the skill folder, for example references/assumptions.md"),
});
const RunSkillScriptArgs = z.object({
  name: z.string().describe("Skill name"),
  script: z.string().describe("Script path relative to the skill folder, for example scripts/build_model.py"),
  args: z.array(z.string()).optional().describe("Command line arguments"),
});

async function findSkill(name: string) {
  return (await getEnabledSkills()).find((s) => s.slug === name);
}

async function executeLoadSkill(args: z.infer<typeof LoadSkillArgs>): Promise<LegacyToolResult> {
  const skill = await findSkill(args.name);
  if (!skill) return createErrorResult(`Skill "${args.name}" is not enabled.`, "SKILL_NOT_ENABLED");
  return createSuccessResult(toLoadedSkill(skill));
}

async function executeReadSkillFile(args: z.infer<typeof ReadSkillFileArgs>): Promise<LegacyToolResult> {
  const skill = await findSkill(args.name);
  if (!skill) return createErrorResult(`Skill "${args.name}" is not enabled.`, "SKILL_NOT_ENABLED");
  const r = await readSkillFileContent(skill, args.path ?? "");
  return "error" in r ? createErrorResult(r.error, "INVALID_PARAMS") : createSuccessResult(r);
}

async function executeRunSkillScript(args: z.infer<typeof RunSkillScriptArgs>): Promise<LegacyToolResult> {
  const skill = await findSkill(args.name);
  if (!skill) return createErrorResult(`Skill "${args.name}" is not enabled.`, "SKILL_NOT_ENABLED");
  return createSuccessResult(await runSkillScript(skill, args.script, args.args ?? []));
}

export function registerSkillTools(): void {
  registerTool({
    name: "load_skill",
    description: "Load the full instructions of an enabled skill by name (from the Skills index in the system prompt). Call this before starting a task the skill covers.",
    args: LoadSkillArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 10_000,
    maxModelChars: 20_000,
    execute: executeLoadSkill,
  });
  registerTool({
    name: "read_skill_file",
    description: "Read one text file that belongs to a loaded skill (for example references/source-hierarchy.md). Read-only and confined to that skill's folder.",
    args: ReadSkillFileArgs,
    risk: "read",
    parallelSafe: true,
    timeoutMs: 10_000,
    maxModelChars: 20_000,
    execute: executeReadSkillFile,
  });
  registerTool({
    name: "run_skill_script",
    description: "Run a script from a skill's scripts/ folder inside the isolated E2B sandbox (.py, .js or .sh). The skill folder is available at /skills/<name>; write outputs to /output. Returns stdout, stderr and the files written to /output.",
    args: RunSkillScriptArgs,
    risk: "write",
    parallelSafe: false,
    timeoutMs: 125_000,
    maxModelChars: 20_000,
    execute: executeRunSkillScript,
  });
}

/**
 * Registers every builtin tool exactly once. Importing this module for its side effect is enough
 * to make every tool name resolvable through `toolsFor` / `runTool`.
 */
import { registerSafeFiles } from "./safeFiles";
import { registerWebSearch } from "./webSearch";
import { registerBrowse } from "./browse";
import { registerRunCode } from "./runCode";
import { registerGenerateFile } from "./generateFile";
import { registerPhoneScan } from "./phoneScan";
import { registerDriveTools } from "./drive";
import { registerSkillTools } from "./skills";
import { registerVpsFiles } from "./vpsFiles";

let registered = false;

export function registerBuiltinTools(): void {
  if (registered) return;
  registered = true;
  registerSafeFiles();
  registerWebSearch();
  registerBrowse();
  registerRunCode();
  registerGenerateFile();
  registerPhoneScan();
  registerDriveTools();
  registerSkillTools();
  registerVpsFiles();
}

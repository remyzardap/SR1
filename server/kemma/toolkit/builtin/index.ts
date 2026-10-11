/**
 * Registers every builtin tool exactly once. Importing this module for its side effect is enough
 * to make every tool name resolvable through `toolsFor` / `runTool`.
 */
import { registerSafeFiles } from "./safeFiles";
import { registerReadResult } from "./readResult";
import { registerWebSearch } from "./webSearch";
import { registerBrowse } from "./browse";
import { registerRunCode } from "./runCode";
import { registerGenerateFile } from "./generateFile";
import { registerPhoneScan } from "./phoneScan";
import { registerDriveTools } from "./drive";
import { registerSkillTools } from "./skills";
import { registerVpsFiles } from "./vpsFiles";
import { registerEmailTools } from "./email";
import { registerCalendarTools } from "./calendar";
import { registerMediaTools } from "./media";
import { registerMonitorTools } from "./monitors";
import { flag } from "../../../core/flags";

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
  // P1-12: these are registered only while ACTION_TOOLS is on. Registering nothing is the strongest
  // form of the flag — a name that is not in the registry cannot be offered, however a caller sets
  // its `allowedTools`.
  if (flag("ACTION_TOOLS")) {
    registerEmailTools();
    registerCalendarTools();
  }
  // Last: it is gated on flag("CONTEXT_MANAGER"), so the default tool list is unaffected.
  registerReadResult();
  // P1-12 part 2: image, video, monitors — behind ACTION_TOOLS like email/calendar.
  if (flag("ACTION_TOOLS")) {
    registerMediaTools();
    registerMonitorTools();
  }
}

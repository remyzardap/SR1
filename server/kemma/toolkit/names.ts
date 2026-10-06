/**
 * Name sets shared between the registry and the builtin tool files, split out to avoid a
 * circular import between registry.ts (which special-cases these groups in `toolsFor`) and the
 * builtin files that register them.
 */
export const DRIVE_TOOL_NAMES = ["drive_search", "drive_read", "drive_create", "drive_edit", "drive_move"] as const;
export const SKILL_TOOL_NAMES = ["load_skill", "read_skill_file", "run_skill_script"] as const;

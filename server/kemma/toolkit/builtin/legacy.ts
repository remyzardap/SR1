/**
 * The result shape every tool used before this module existed, and that callers of
 * `executeToolCall` (kemmaMax.ts's compatibility wrapper) still receive. Builtin tools return this
 * shape as their `execute()` result so the JSON handed back to the model is byte-identical to
 * before: `runTool` wraps it as `{ ok: true, data: <this object> }`, and the engine's tool-result
 * message uses `data` directly, so the model sees the same `{ success, data }` / `{ success,
 * error, code }` body it always has.
 */
export interface LegacySuccessResult<T = unknown> {
  success: true;
  data: T;
}
export interface LegacyErrorResult {
  success: false;
  error: string;
  code: string;
}
export type LegacyToolResult<T = unknown> = LegacySuccessResult<T> | LegacyErrorResult;

export function createSuccessResult<T>(data: T): LegacySuccessResult<T> {
  return { success: true, data };
}
export function createErrorResult(error: string, code: string): LegacyErrorResult {
  return { success: false, error, code };
}

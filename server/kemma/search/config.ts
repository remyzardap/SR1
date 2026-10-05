/**
 * Env-driven configuration for the search provider layer (P1-08). Every function here reads
 * process.env at call time, never at import time, per docs/spec/HANDOVER.md §7 rule 3.
 */

const DEFAULT_PROVIDER_ORDER = ["brave", "tavily", "sonar"];

/** Default per-request cost estimate, used unless SEARCH_COST_<ID> overrides it. */
const DEFAULT_COST_USD: Record<string, number> = {
  brave: 0.005,
  tavily: 0.008,
  exa: 0.01,
  perplexity: 0.008,
  searxng: 0,
  sonar: 0.03, // the existing Sonar chat-completions path this layer replaces
};

/** `KEMMA_SEARCH_PROVIDERS`, default `brave,tavily,sonar`. Order matters: fast-path tries them left to right. */
export function searchProviderOrder(): string[] {
  const raw = process.env.KEMMA_SEARCH_PROVIDERS;
  const ids = (raw && raw.trim() !== "" ? raw : DEFAULT_PROVIDER_ORDER.join(","))
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return ids.length > 0 ? ids : DEFAULT_PROVIDER_ORDER;
}

/** Per-request cost in USD for a provider id, overridable with `SEARCH_COST_<ID>` (e.g. SEARCH_COST_BRAVE). */
export function searchCostPerRequestUsd(id: string): number {
  const envName = `SEARCH_COST_${id.toUpperCase()}`;
  const raw = process.env[envName];
  if (raw !== undefined && raw.trim() !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return DEFAULT_COST_USD[id] ?? 0.01;
}

/** Default requests-per-minute for the token bucket, shared by every provider unless overridden. */
export function searchDefaultRpm(): number {
  const raw = process.env.KEMMA_SEARCH_RPM;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 40;
}

/**
 * Per-provider RPM override pattern: `KEMMA_SEARCH_RPM_<ID>` (e.g. KEMMA_SEARCH_RPM_BRAVE). Falls
 * back to the shared default when absent or invalid.
 */
export function searchRpmFor(id: string): number {
  const raw = process.env[`KEMMA_SEARCH_RPM_${id.toUpperCase()}`];
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : searchDefaultRpm();
}

export function searchCacheTtlSec(): number {
  const raw = process.env.KEMMA_SEARCH_CACHE_TTL_SEC;
  const sec = raw === undefined || raw.trim() === "" ? 900 : Number(raw);
  return Number.isFinite(sec) && sec > 0 ? sec : 0;
}

/**
 * Source tracking and citation formatting for Kemma research runs.
 */

export interface Source {
  id: number;
  url: string;
  title: string;
  snippet?: string;
  date?: string;
  verified?: boolean;
}

export function extractSources(toolName: string, rawResult: unknown): Source[] {
  // The executor wraps tool output as { success, data }; unwrap it, and skip failed calls.
  const wrapped = rawResult as { success?: boolean; data?: unknown } | null;
  if (wrapped && typeof wrapped === "object" && "success" in wrapped && wrapped.success === false) return [];
  const result = wrapped && typeof wrapped === "object" && "success" in wrapped ? wrapped.data : rawResult;

  if (toolName === "web_search") {
    const items = Array.isArray(result) ? result : [];
    return items
      .filter((item: any) => item?.url)
      .map((item: any, idx: number) => ({
        id: idx + 1,
        url: item.url,
        title: item.title || "Search result",
        snippet: item.snippet || "",
        ...(item.date ? { date: String(item.date) } : {}),
      }));
  }

  if (toolName === "browse") {
    const r = result as any;
    if (r?.url || r?.title) {
      return [{
        id: 1,
        url: r.url || "",
        title: r.title || "Browsed page",
        snippet: r.content?.slice(0, 500) || "",
      }];
    }
  }

  return [];
}

export function dedupeSources(sources: Source[]): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];
  let id = 1;
  for (const s of sources) {
    const key = s.url || s.title;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...s, id: id++ });
  }
  return out;
}

export function appendCitations(answer: string, sources: Source[]): { text: string; sources: Source[] } {
  if (sources.length === 0) return { text: answer, sources: [] };

  // Simple citation strategy: append a Sources section with numbered links.
  const cited = sources.map((s) => `[${s.id}] ${s.title}${s.date ? ` (${s.date})` : ""}: ${s.url}`).join("\n");
  const separator = answer.endsWith("\n") ? "" : "\n\n";
  return {
    text: `${answer}${separator}Sources:\n${cited}`,
    sources,
  };
}

export async function verifyClaimsAgainstSources(
  claims: string[],
  sources: Source[],
  verifyModel: (prompt: string) => Promise<string>
): Promise<Source[]> {
  if (claims.length === 0 || sources.length === 0) return sources;

  const prompt = `You are a citation verifier. Given these claims and sources, mark each source as verified (true) or not verified (false) based on whether it supports any claim. Reply ONLY with a JSON array of booleans in the same order as the sources.

Claims:
${claims.map((c, i) => `${i + 1}. ${c}`).join("\n")}

Sources:
${sources.map((s, i) => `${i + 1}. ${s.title} ${s.url} ${s.snippet || ""}`).join("\n")}`;

  try {
    const raw = await verifyModel(prompt);
    const match = raw.match(/\[[\s\S]*\]/);
    const verdicts = match ? JSON.parse(match[0]) : [];
    return sources.map((s, i) => ({ ...s, verified: Boolean(verdicts[i]) }));
  } catch {
    return sources.map((s) => ({ ...s, verified: undefined }));
  }
}

/**
 * Rewrite a web_search tool result so each source carries the global id it will have in the final
 * Sources list, and remap the search answer's own [n] markers to those ids. Without this the model
 * copies per-search markers that do not match the numbered list appended at the end.
 */
export function annotateSearchResult(toolResult: unknown, allSources: Source[]): unknown {
  const r = toolResult as { success?: boolean; data?: unknown } | null;
  if (!r || r.success !== true || !Array.isArray(r.data)) return toolResult;
  const idByUrl = new Map(allSources.map((s) => [s.url || s.title, s.id]));
  const items = r.data as Array<{ url?: string; snippet?: string; [k: string]: unknown }>;
  const localToGlobal = (n: number) => {
    const it = items[n - 1];
    return it ? idByUrl.get(it.url ?? "") : undefined;
  };
  const data = items.map((it, i) => {
    const out: Record<string, unknown> = { id: idByUrl.get(it.url ?? ""), ...it };
    if (i === 0 && typeof it.snippet === "string") {
      out.snippet = it.snippet
        .replace(/\[(\d{1,3})\]/g, (m, d) => {
          const g = localToGlobal(Number(d));
          return g ? `[${g}]` : "";
        })
        .replace("markers [n] refer to the numbered sources in order", "markers [n] already use the source ids below; cite with those ids");
    }
    return out;
  });
  return { ...r, data };
}

/**
 * Keep only sources the answer cites, renumbered by first appearance, and rewrite the [n] markers
 * to match. Markers that point at no known source are dropped. If nothing is cited, all sources are kept.
 */
export function keepCitedSources(answer: string, sources: Source[]): { text: string; sources: Source[] } {
  const byId = new Map(sources.map((s) => [s.id, s]));
  const remap = new Map<number, number>();
  const kept: Source[] = [];
  const text = answer.replace(/(\s?)\[(\d{1,3}(?:\s*[,;]\s*\d{1,3})*)\]/g, (_m, lead: string, group: string) => {
    const out: string[] = [];
    for (const d of group.split(/[,;]/)) {
      const src = byId.get(Number(d.trim()));
      if (!src) continue;
      let n = remap.get(src.id);
      if (!n) {
        n = kept.length + 1;
        remap.set(src.id, n);
        kept.push({ ...src, id: n });
      }
      if (!out.includes(`[${n}]`)) out.push(`[${n}]`);
    }
    return out.length ? lead + out.join("") : "";
  });
  return kept.length === 0 ? { text: answer, sources } : { text, sources: kept };
}

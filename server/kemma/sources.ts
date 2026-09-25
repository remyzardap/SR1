/**
 * Source tracking and citation formatting for Kemma research runs.
 */

export interface Source {
  id: number;
  url: string;
  title: string;
  snippet?: string;
  verified?: boolean;
}

export function extractSources(toolName: string, result: unknown): Source[] {
  if (toolName === "web_search") {
    const items = Array.isArray(result) ? result : [];
    return items
      .filter((item: any) => item?.url)
      .map((item: any, idx: number) => ({
        id: idx + 1,
        url: item.url,
        title: item.title || "Search result",
        snippet: item.snippet || "",
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
  const cited = sources.map((s) => `[${s.id}] ${s.title} — ${s.url}`).join("\n");
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

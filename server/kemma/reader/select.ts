/**
 * Query-focused selection of the relevant part of a long page.
 *
 * When a page is longer than the model's budget and the caller gave a `query`, we split the
 * markdown into paragraph/heading-bounded chunks of roughly `CHUNK_TARGET_CHARS` characters,
 * score each chunk against the query with a small in-file BM25, and keep the top-scoring chunks
 * — always including the first chunk (the intro) regardless of its score — reassembled in their
 * original document order with "[…]" separators between chunks that are not adjacent in the
 * source. Without a query, or when the page already fits, we just truncate.
 */

export const CHUNK_TARGET_CHARS = 1500;
const SEPARATOR = "\n\n[…]\n\n";

export interface Selection {
  text: string;
  truncated: boolean;
}

/** Splits markdown into chunks of roughly `targetSize` characters, breaking on heading or blank-line boundaries. */
export function splitIntoChunks(markdown: string, targetSize: number = CHUNK_TARGET_CHARS): string[] {
  const trimmed = markdown.trim();
  if (!trimmed) return [];

  // Blank-line separated blocks. A block that is only a heading line is folded into the block
  // that follows it, so a heading never ends up alone in its own chunk, separated from its body.
  const isHeadingOnly = (block: string): boolean => block.split("\n").every((line) => line.trim() === "" || /^#{1,6}\s/.test(line));
  const rawBlocks = trimmed.split(/\n{2,}/);
  const blocks: string[] = [];
  for (const block of rawBlocks) {
    const prev = blocks.length > 0 ? blocks[blocks.length - 1] : null;
    if (prev !== null && isHeadingOnly(prev)) {
      blocks[blocks.length - 1] = `${prev}\n\n${block}`;
    } else {
      blocks.push(block);
    }
  }

  const chunks: string[] = [];
  let current = "";
  for (const block of blocks) {
    if (current && current.length + 2 + block.length > targetSize) {
      chunks.push(current);
      current = block;
    } else {
      current = current ? `${current}\n\n${block}` : block;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1);
}

/** Small BM25 over a fixed corpus of chunks, scored against one query. */
function bm25Scores(chunks: string[], query: string): number[] {
  const k1 = 1.5;
  const b = 0.75;
  const queryTerms = tokenize(query);
  const docTokens = chunks.map(tokenize);
  const n = chunks.length;
  if (n === 0 || queryTerms.length === 0) return chunks.map(() => 0);

  const avgLen = docTokens.reduce((s, t) => s + t.length, 0) / n;

  const df = new Map<string, number>();
  const uniqueQueryTerms = [...new Set(queryTerms)];
  for (const term of uniqueQueryTerms) {
    let count = 0;
    for (const tokens of docTokens) if (tokens.includes(term)) count++;
    df.set(term, count);
  }
  const idf = new Map<string, number>();
  for (const term of uniqueQueryTerms) {
    const d = df.get(term) ?? 0;
    idf.set(term, Math.log((n - d + 0.5) / (d + 0.5) + 1));
  }

  return docTokens.map((tokens) => {
    const len = tokens.length;
    let score = 0;
    for (const term of uniqueQueryTerms) {
      const tf = tokens.filter((t) => t === term).length;
      if (tf === 0) continue;
      const denom = tf + k1 * (1 - b + b * (len / (avgLen || 1)));
      score += (idf.get(term) ?? 0) * ((tf * (k1 + 1)) / (denom || 1));
    }
    return score;
  });
}

/**
 * Picks the chunks worth keeping for `query` within `maxChars`, in document order. The first
 * chunk is always kept. Returns the reassembled text and whether anything was left out.
 */
export function selectRelevantChunks(markdown: string, query: string, maxChars: number): Selection {
  const chunks = splitIntoChunks(markdown);
  if (chunks.length === 0) return { text: "", truncated: false };
  if (chunks.length === 1) return truncateText(chunks[0], maxChars);

  const scores = bm25Scores(chunks, query);
  const kept = new Set<number>([0]);
  let used = chunks[0].length;

  const order = scores
    .map((score, i) => ({ score, i }))
    .filter(({ i }) => i !== 0)
    .sort((a, b) => b.score - a.score);

  for (const { i } of order) {
    const addCost = chunks[i].length + SEPARATOR.length;
    if (used + addCost > maxChars) continue;
    kept.add(i);
    used += addCost;
  }

  const keptIndices = [...kept].sort((a, b) => a - b);
  let text = "";
  let prev = -1;
  for (const i of keptIndices) {
    if (prev !== -1 && i !== prev + 1) text += SEPARATOR;
    else if (prev !== -1) text += "\n\n";
    text += chunks[i];
    prev = i;
  }

  const truncated = keptIndices.length < chunks.length;
  if (text.length > maxChars) return truncateText(text, maxChars);
  return { text, truncated };
}

function truncateText(text: string, maxChars: number): Selection {
  if (text.length <= maxChars) return { text, truncated: false };
  return { text: `${text.slice(0, maxChars).trim()}${SEPARATOR}`, truncated: true };
}

/** Selects the text to return for a page: the whole thing if it fits, otherwise query-focused or a plain cut. */
export function selectForBudget(markdown: string, query: string | undefined, maxChars: number): Selection {
  if (markdown.length <= maxChars) return { text: markdown, truncated: false };
  if (query && query.trim()) return selectRelevantChunks(markdown, query.trim(), maxChars);
  return truncateText(markdown, maxChars);
}

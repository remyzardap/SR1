import { describe, it, expect } from "vitest";
import {
  KINDS,
  WORDS_PER_PAGE,
  assignRefs,
  countWords,
  extractJson,
  finalizeCitations,
  renderCitations,
  pagesFor,
  parseNotes,
  parseOutline,
  parsePolish,
  plannerPrompt,
  polishPrompt,
  qualityChecks,
  referencesFrom,
  researchPrompt,
  sectionPrompt,
  type DocKind,
  type Note,
  type Outline,
  type OutlineSection,
} from "./documentKinds";

const words = (n: number, seed = "alpha") => Array.from({ length: n }, (_, i) => `${seed}${i % 97}x${Math.floor(i / 97)}`).join(" ");

const section = (over: Partial<OutlineSection> = {}): OutlineSection => ({
  id: "s1",
  title: "Market size",
  purpose: "Show how big the market is.",
  researchQuestions: ["What was the 2023 market size in Germany?"],
  targetWords: 400,
  type: "text",
  ...over,
});
const outline: Outline = { title: "Report", subtitle: null, sections: [section(), section({ id: "s2", title: "Risks" })] };

describe("KINDS", () => {
  it("matches the spec numbers", () => {
    expect(KINDS.short).toMatchObject({ words: { min: 600, max: 1400 }, sections: { min: 3, max: 5 }, research: "light" });
    expect(KINDS.medium).toMatchObject({ maxPages: 15, words: { min: 3000, max: 6500 }, sections: { min: 5, max: 10 }, minSources: 5, research: "full" });
    expect(KINDS.academic).toMatchObject({ words: { min: 3500, max: 8000 }, sections: { min: 7, max: 11 }, minSources: 8, research: "scholarly" });
  });
  it("keeps the max words inside the page budget at 450 words per page", () => {
    expect(WORDS_PER_PAGE).toBe(450);
    expect(KINDS.short.words.max / WORDS_PER_PAGE).toBeLessThan(4);
    expect(KINDS.medium.words.max / WORDS_PER_PAGE).toBeLessThanOrEqual(KINDS.medium.maxPages);
    expect(KINDS.academic.words.max / WORDS_PER_PAGE).toBeLessThanOrEqual(KINDS.academic.maxPages);
  });
});

describe("plannerPrompt", () => {
  const base = { brief: "Electric buses in Europe", sourceContext: "" };
  it("short: answer first, 3 to 5 sections, strict JSON", () => {
    const { system, user } = plannerPrompt({ ...base, kind: "short" });
    expect(system).toContain("SHORT");
    expect(system).toContain("Bottom line first");
    expect(system).toContain("next steps");
    expect(system).toContain("Between 3 and 5 sections");
    expect(system).toContain("between 600 and 1400");
    expect(system).toContain("ONE JSON object");
    expect(user).toContain("Electric buses in Europe");
    expect(user).toContain("none");
  });
  it("medium: executive summary, context, analysis, recommendations, risks, sources", () => {
    const { system } = plannerPrompt({ ...base, kind: "medium" });
    for (const k of ["Executive summary", "Context", "analysis sections", "2 to 4 research questions", "Recommendations", "Risks", "references"]) {
      expect(system).toContain(k);
    }
    expect(system).toContain("between 3000 and 6500");
  });
  it("academic: the full scholarly structure and the chosen style", () => {
    const { system } = plannerPrompt({ ...base, kind: "academic", style: "harvard" });
    for (const k of ["Abstract", "Introduction", "THEMATICALLY", "Methodology", "inclusion and exclusion", "Discussion", "Limitations", "Conclusion", "Harvard"]) {
      expect(system).toContain(k);
    }
    expect(system).toContain("between 3500 and 8000");
  });
  it("includes the person's sources when supplied, and the safety rule and language", () => {
    const { system, user } = plannerPrompt({ ...base, kind: "medium", sourceContext: "[S1] annual-report.pdf: buses...", language: "German" });
    expect(user).toContain("[S1] annual-report.pdf");
    expect(system).toContain("Write in German");
    expect(system).toContain("minors");
    expect(system).not.toMatch(/[—–]/);
  });
});

describe("researchPrompt", () => {
  const args = { section: section(), brief: "Electric buses", sourceContext: "[S1] fleet.pdf: 120 buses" };
  it("encodes the research method", () => {
    const p = researchPrompt({ kind: "medium", ...args });
    for (const k of ["own sources first", "[S1] fleet.pdf", "web_search", "browse", "verbatim", "ATOMIC", "access date", "Conflicting figure", "Never fabricate", '{ "notes": [] }', "primary and authoritative"]) {
      expect(p).toContain(k);
    }
    expect(p).toContain("What was the 2023 market size in Germany?");
  });
  it("scales depth by kind", () => {
    expect(researchPrompt({ kind: "short", ...args })).toContain("LIGHT");
    expect(researchPrompt({ kind: "medium", ...args })).toContain("FULL");
    const academic = researchPrompt({ kind: "academic", ...args });
    expect(academic).toContain("SCHOLARLY");
    expect(academic).toContain("peer-reviewed");
  });
  it("says so when no sources were supplied", () => {
    expect(researchPrompt({ kind: "short", ...args, sourceContext: "" })).toContain("none were supplied");
  });
});

describe("sectionPrompt", () => {
  const notes: Note[] = [
    { claim: "Fleet grew 12% in 2023.", sourceTitle: "Fleet report", url: "https://a.example/r", quote: "grew by 12 percent" },
    { claim: "Costs fell.", sourceTitle: "Cost study", url: "https://b.example/c" },
  ];
  const base = { section: section(), notes, outline, written: [{ id: "s0", title: "Intro", content: "Earlier text here." }], brief: "Electric buses" };
  it("short voice", () => {
    const { system } = sectionPrompt({ kind: "short", ...base });
    expect(system).toContain("No throat-clearing");
    expect(system).toContain("360 to 440 words");
  });
  it("medium voice", () => {
    const { system } = sectionPrompt({ kind: "medium", ...base });
    expect(system).toContain("Lead each section");
    expect(system).toContain("[1] or [2, 3]");
    expect(system).toContain("numbers with units");
  });
  it("academic voice", () => {
    const { system } = sectionPrompt({ kind: "academic", ...base });
    for (const k of ["formal scholarly register", "Hedge", "Signpost", "Cite EVERY empirical claim", "Paraphrase", "counter-evidence", "APA 7"]) {
      expect(system).toContain(k);
    }
  });
  it("carries the evidence and consistency rules, notes and earlier sections", () => {
    const { system, user } = sectionPrompt({ kind: "medium", ...base });
    expect(system).toContain("Use ONLY the NOTES");
    expect(system).toContain("author's inference");
    expect(system).toContain("same terms");
    expect(user).toContain("[1] Fleet grew 12% in 2023.");
    expect(user).toContain("[2] Costs fell.");
    expect(user).toContain("Earlier text here.");
    expect(user).toContain("about 400 words");
  });
  it("uses assigned refs and shares a number between notes of one source", () => {
    const two: Note[] = [
      { claim: "A", sourceTitle: "X", url: "https://x.example/p", ref: 7 },
      { claim: "B", sourceTitle: "Y", url: "https://y.example/p" },
      { claim: "C", sourceTitle: "Y", url: "https://y.example/p/" },
    ];
    const { user } = sectionPrompt({ kind: "medium", ...base, notes: two });
    expect(user).toContain("[7] A");
    expect(user).toContain("[8] B");
    expect(user).toContain("[8] C");
  });
  it("handles no notes honestly", () => {
    const { system, user } = sectionPrompt({ kind: "medium", ...base, notes: [] });
    expect(user).toContain("(no notes for this section)");
    expect(system).toContain("no reliable source was found");
  });
});

describe("polishPrompt", () => {
  const sections = [{ id: "s1", title: "Intro", content: "Text." }];
  it("academic asks for a structured 150 to 250 word abstract and a conclusion check", () => {
    const { system } = polishPrompt({ kind: "academic", outline, sections });
    expect(system).toContain('"abstract"');
    expect(system).toContain("150 to 250 words");
    expect(system).toContain("conclusionFix");
    expect(system).toContain("answer the introduction");
    expect(system).toContain("No new claims");
  });
  it("medium asks for an executive summary and no abstract", () => {
    const { system } = polishPrompt({ kind: "medium", outline, sections });
    expect(system).toContain("executive summary");
    expect(system).not.toContain('"abstract": "string"');
  });
  it("short asks for a bottom line", () => {
    expect(polishPrompt({ kind: "short", outline, sections }).system).toContain("bottom line");
  });
});

describe("JSON parsing", () => {
  it("extractJson handles fences and prose", () => {
    expect(extractJson('Here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('sure {"a":2} done')).toEqual({ a: 2 });
    expect(extractJson("nope")).toBeNull();
  });
  it("parseNotes drops unusable notes and bad urls", () => {
    const notes = parseNotes('{"notes":[{"claim":"c","sourceTitle":"t","url":"javascript:x","year":"2020"},{"claim":"","sourceTitle":"t"},{"claim":"d","sourceTitle":"u","url":"https://u.example"}]}');
    expect(notes).toEqual([
      { claim: "c", sourceTitle: "t", year: "2020" },
      { claim: "d", sourceTitle: "u", url: "https://u.example" },
    ]);
    expect(parseNotes("garbage")).toEqual([]);
  });
  it("parseOutline rescales words into the range, fixes ids and the section cap", () => {
    const raw = {
      title: "T",
      sections: Array.from({ length: 4 }, (_, i) => ({ id: "dup", title: `S${i}`, purpose: "p", researchQuestions: ["q"], targetWords: 100, type: "weird" })),
    };
    const o = parseOutline(raw, "short");
    expect(o).not.toBeNull();
    expect(new Set(o!.sections.map((s) => s.id)).size).toBe(4);
    expect(o!.sections.every((s) => s.type === "text")).toBe(true);
    const total = o!.sections.reduce((n, s) => n + s.targetWords, 0);
    expect(total).toBeGreaterThanOrEqual(KINDS.short.words.min);
    expect(total).toBeLessThanOrEqual(KINDS.short.words.max);
  });
  it("parseOutline trims extra sections but keeps references, and rejects too few", () => {
    const many = {
      title: "T",
      sections: [
        ...Array.from({ length: 12 }, (_, i) => ({ title: `S${i}`, purpose: "p", targetWords: 500, type: "text" })),
        { title: "References", purpose: "p", targetWords: 0, type: "references" },
      ],
    };
    const o = parseOutline(many, "medium");
    expect(o!.sections.length).toBe(KINDS.medium.sections.max);
    expect(o!.sections.at(-1)!.type).toBe("references");
    expect(parseOutline({ title: "T", sections: [{ title: "only", purpose: "p" }] }, "medium")).toBeNull();
    expect(parseOutline("{}", "short")).toBeNull();
  });
  it("parsePolish", () => {
    expect(parsePolish('{"summary":"S","abstract":"A"}')).toEqual({ summary: "S", abstract: "A" });
    expect(parsePolish('{"summary":""}')).toBeNull();
  });
});

describe("referencesFrom golden examples", () => {
  const notes: Note[] = [
    { claim: "x", sourceTitle: "Global EV Outlook 2024", url: "https://www.iea.org/reports/global-ev-outlook-2024?utm_source=a", author: "International Energy Agency", year: "2024", site: "IEA", accessed: "2026-10-03" },
    { claim: "y", sourceTitle: "Global EV Outlook 2024", url: "https://iea.org/reports/global-ev-outlook-2024/", accessed: "2026-10-03" },
    { claim: "z", sourceTitle: "Battery costs and urban transit", url: "https://doi.example/10/abc", author: "Maria Garcia; John Smith", year: "2022", site: "Journal of Transit Studies", accessed: "2026-10-03" },
    { claim: "w", sourceTitle: "Bus fleet overview", url: "https://city.example.org/buses", accessed: "2026-10-03" },
  ];

  it("dedupes by url and keeps only real sources", () => {
    expect(referencesFrom(notes, "apa")).toHaveLength(3);
    expect(referencesFrom([{ claim: "c", sourceTitle: "", url: "" }], "apa")).toEqual([]);
  });

  it("APA 7: alphabetical, hanging-indent text, n.d. and retrieval date, no invented authors", () => {
    expect(referencesFrom(notes, "apa")).toEqual([
      "Bus fleet overview. (n.d.). Retrieved October 3, 2026, from https://city.example.org/buses",
      "Garcia, M., & Smith, J. (2022). Battery costs and urban transit. Journal of Transit Studies. Retrieved October 3, 2026, from https://doi.example/10/abc",
      "International Energy Agency. (2024). Global EV Outlook 2024. IEA. Retrieved October 3, 2026, from https://www.iea.org/reports/global-ev-outlook-2024?utm_source=a",
    ]);
  });

  it("MLA 9: Last, First, and First Last; protocol omitted; accessed date", () => {
    expect(referencesFrom(notes, "mla")).toEqual([
      "“Bus fleet overview.” city.example.org/buses. Accessed 3 Oct. 2026.",
      "Garcia, Maria, and John Smith. “Battery costs and urban transit.” Journal of Transit Studies, 2022, doi.example/10/abc. Accessed 3 Oct. 2026.",
      "International Energy Agency. “Global EV Outlook 2024.” IEA, 2024, www.iea.org/reports/global-ev-outlook-2024?utm_source=a. Accessed 3 Oct. 2026.",
    ]);
  });

  it("Harvard: initials without spaces, Available at, Accessed", () => {
    expect(referencesFrom(notes, "harvard")).toEqual([
      "Bus fleet overview (no date) Available at: https://city.example.org/buses (Accessed: 3 October 2026).",
      "Garcia, M. and Smith, J. (2022) Battery costs and urban transit. Journal of Transit Studies. Available at: https://doi.example/10/abc (Accessed: 3 October 2026).",
      "International Energy Agency (2024) Global EV Outlook 2024. IEA. Available at: https://www.iea.org/reports/global-ev-outlook-2024?utm_source=a (Accessed: 3 October 2026).",
    ]);
  });

  it("IEEE: numbered in order of first appearance, initials first", () => {
    expect(referencesFrom(notes, "ieee")).toEqual([
      "[1] International Energy Agency, “Global EV Outlook 2024,” IEA, 2024. [Online]. Available: https://www.iea.org/reports/global-ev-outlook-2024?utm_source=a. Accessed: Oct. 3, 2026.",
      "[2] M. Garcia and J. Smith, “Battery costs and urban transit,” Journal of Transit Studies, 2022. [Online]. Available: https://doi.example/10/abc. Accessed: Oct. 3, 2026.",
      "[3] “Bus fleet overview,” n.d. [Online]. Available: https://city.example.org/buses. Accessed: Oct. 3, 2026.",
    ]);
  });

  it("handles three authors, a source with no url, and a title ending in a question mark", () => {
    const n: Note[] = [{ claim: "c", sourceTitle: "Is it enough?", author: "Ana Li, Bo Chen, Cy Ng", year: "2020" }];
    expect(referencesFrom(n, "apa")[0]).toBe("Li, A., Chen, B., & Ng, C. (2020). Is it enough?");
    expect(referencesFrom(n, "mla")[0]).toBe("Li, Ana, et al. “Is it enough?” 2020.");
  });

  it("sorts ignoring leading articles and accents", () => {
    const n: Note[] = [
      { claim: "c", sourceTitle: "The Zebra report", url: "https://z.example" },
      { claim: "c", sourceTitle: "An apple study", url: "https://a.example" },
    ];
    const refs = referencesFrom(n, "apa");
    expect(refs[0].startsWith("An apple study")).toBe(true);
  });

  it("assignRefs gives the position in the reference list", () => {
    const out = assignRefs(notes, "apa");
    expect(out.map((n) => n.ref)).toEqual([3, 3, 2, 1]);
    const { user } = sectionPrompt({ kind: "medium", section: section(), notes: out, outline, written: [], brief: "b" });
    expect(user).toContain("[3] x");
  });
});

describe("counting", () => {
  it("ignores citation markers and markdown symbols", () => {
    expect(countWords("## Title\nOne two [1] three [2, 3] **four**")).toBe(5);
  });
  it("pages", () => expect(pagesFor(900)).toBe(2));
});

function report(kind: DocKind, over: { n?: number; refs?: string[]; sections?: Array<{ id?: string; title: string; type?: string; content: string }> } = {}) {
  const plan = KINDS[kind];
  const refs = over.refs ?? ["Ref one.", "Ref two.", "Ref three.", "Ref four.", "Ref five.", "Ref six.", "Ref seven.", "Ref eight."];
  const titles =
    kind === "academic"
      ? ["Abstract", "Introduction", "Literature review", "Methodology", "Findings", "Discussion", "Limitations", "Conclusion"]
      : Array.from({ length: plan.sections.min }, (_, i) => `Part ${i + 1}`);
  const body = titles.length;
  const per = Math.ceil(((plan.words.min + plan.words.max) / 2) / body);
  const cites = refs.map((_, i) => `[${i + 1}]`);
  const secs =
    over.sections ??
    titles.map((t, i) => ({
      id: `s${i}`,
      title: t,
      type: t === "Abstract" ? "abstract" : "text",
      content: `${words(per, `w${i}k`)} ${i < cites.length ? cites[i] : ""} ${i === 0 ? cites.slice(titles.length).join(" ") : ""}`,
    }));
  const all = kind === "short" ? secs : [...secs, { id: "refs", title: "References", type: "references", content: refs.join("\n") }];
  return { sections: all };
}

describe("qualityChecks", () => {
  it("passes a well-formed report of each kind", () => {
    for (const kind of ["short", "medium", "academic"] as DocKind[]) {
      const r = kind === "short" ? report(kind, { refs: [] }) : report(kind);
      const q = qualityChecks({ kind, report: r });
      expect(q.problems).toEqual([]);
      expect(q.ok).toBe(true);
      expect(q.pages).toBeCloseTo(q.words / 450, 1);
    }
  });

  it("flags length problems with tolerance", () => {
    const tiny = qualityChecks({ kind: "short", report: { sections: ["A", "B", "C"].map((t) => ({ title: t, content: words(50) })) } });
    expect(tiny.problems.join(" ")).toMatch(/Too short: 150 words/);
    const slightlyOver = qualityChecks({ kind: "short", report: { sections: ["A", "B", "C"].map((t) => ({ title: t, content: words(600, t) })) } });
    expect(slightlyOver.problems.join(" ")).toMatch(/Too long/);
    const withinTolerance = qualityChecks({ kind: "short", report: { sections: ["A", "B", "C"].map((t) => ({ title: t, content: words(510, t) })) } });
    expect(withinTolerance.problems.join(" ")).not.toMatch(/Too long/);
  });

  it("flags section count", () => {
    const q = qualityChecks({ kind: "medium", report: { sections: [{ title: "Only", content: words(4000) }] } });
    expect(q.problems.join(" ")).toMatch(/Only 1 sections/);
  });

  it("flags markers without references and references never cited", () => {
    const r = report("medium");
    r.sections[0].content += " [99]";
    r.sections[r.sections.length - 1].content += "\nUncited extra reference.";
    const q = qualityChecks({ kind: "medium", report: r });
    expect(q.problems.join(" ")).toMatch(/\[99\] have no matching reference/);
    expect(q.problems.join(" ")).toMatch(/References \[9\] are never cited/);
  });

  it("markers without any references section are a problem; short without markers is fine", () => {
    const r = report("short", { refs: [] });
    r.sections[0].content += " [1]";
    expect(qualityChecks({ kind: "short", report: r }).problems.join(" ")).toMatch(/no references section/);
  });

  it("requires enough sources only when research is available", () => {
    const few = report("medium", { refs: ["A.", "B."] });
    expect(qualityChecks({ kind: "medium", report: few }).problems.join(" ")).toMatch(/Only 2 references/);
    expect(qualityChecks({ kind: "medium", report: few, researchAvailable: false }).problems.join(" ")).not.toMatch(/Only 2 references/);
  });

  it("academic structure is required", () => {
    const r = report("academic");
    r.sections = r.sections.filter((s) => s.title !== "Methodology" && s.title !== "Limitations");
    const p = qualityChecks({ kind: "academic", report: r }).problems.join(" ");
    expect(p).toMatch(/missing its methodology/);
    expect(p).toMatch(/missing its limitations/);
  });

  it("flags placeholders and thin sections against the outline", () => {
    const r = report("medium");
    r.sections[1].content += " TODO fill in";
    r.sections[2].content += " [citation needed]";
    const o: Outline = {
      title: "t",
      subtitle: null,
      sections: r.sections.map((s) => ({ id: s.id as string, title: s.title, purpose: "p", researchQuestions: [], targetWords: s.id === "s3" ? 5000 : 100, type: "text" })),
    };
    const q = qualityChecks({ kind: "medium", report: r, outline: o });
    expect(q.problems.join(" ")).toMatch(/placeholder text \("TODO"\)/);
    expect(q.problems.join(" ")).toMatch(/placeholder text \("\[citation needed\]"\)/);
    expect(q.problems.join(" ")).toMatch(/under 40% of its target of 5000/);
    expect(q.ok).toBe(false);
  });

  it("flags repeated sentences across sections", () => {
    const sentence = "This exact long sentence is repeated verbatim in two different sections of the report.";
    const r = report("short", { refs: [] });
    r.sections[0].content += `\n${sentence}`;
    r.sections[1].content += `\n${sentence}`;
    expect(qualityChecks({ kind: "short", report: r }).problems.join(" ")).toMatch(/appears in both/);
  });

  it("ignores the reference list in the word count and recognises ranges in markers", () => {
    const r = report("medium");
    const before = qualityChecks({ kind: "medium", report: r }).words;
    r.sections[r.sections.length - 1].content += `\n${words(3000)}`;
    expect(qualityChecks({ kind: "medium", report: r }).words).toBe(before);
    const q = report("medium");
    q.sections[0].content += " [1-3]";
    expect(qualityChecks({ kind: "medium", report: q }).problems.join(" ")).not.toMatch(/matching/);
  });
});

describe("renderCitations and finalizeCitations", () => {
  const notes: Note[] = [
    { claim: "a", sourceTitle: "Global EV Outlook 2024", url: "https://iea.org/ev", author: "International Energy Agency", year: "2024", site: "IEA" },
    { claim: "b", sourceTitle: "Battery costs", url: "https://j.example/b", author: "Maria Garcia; John Smith", year: "2022", site: "Journal of Transit" },
    { claim: "c", sourceTitle: "Fleet electrification: a long title that keeps going", url: "https://k.example/f", author: "Ana Li, Bo Chen, Cy Ng", year: "2020" },
    { claim: "d", sourceTitle: "Bus fleet overview", url: "https://city.example.org/buses", site: "City Transit Office" },
    { claim: "e", sourceTitle: "Costs update", url: "https://m.example/c", author: "Priya Rao", year: "2021" },
  ];
  // alphabetical order for APA: Bus fleet overview(1), Garcia(2), International Energy Agency(3), Li(4), Rao(5)
  const refd = assignRefs(notes, "apa");
  const render = (text: string, style: "apa" | "mla" | "harvard" | "ieee") => renderCitations({ text, notes: refd, style });

  it("assignRefs matches the alphabetical list the renderer uses", () => {
    expect(refd.map((n) => n.ref)).toEqual([3, 2, 4, 1, 5]);
  });

  it("APA: author-year, organisation by name, 2 and 3+ authors, n.d. with quoted short title, multiple sources", () => {
    expect(render("Fact [3].", "apa")).toBe("Fact (International Energy Agency, 2024).");
    expect(render("Fact [2].", "apa")).toBe("Fact (Garcia & Smith, 2022).");
    expect(render("Fact [4].", "apa")).toBe("Fact (Li et al., 2020).");
    expect(render("Fact [1].", "apa")).toBe("Fact (\u201CBus fleet overview\u201D, n.d.).");
    expect(render("Fact [5, 2].", "apa")).toBe("Fact (Garcia & Smith, 2022; Rao, 2021).");
    expect(render("Fact [2-3].", "apa")).toBe("Fact (Garcia & Smith, 2022; International Energy Agency, 2024).");
  });

  it("Harvard: no comma, 3 authors listed, no-year and site-name fallback", () => {
    expect(render("Fact [3].", "harvard")).toBe("Fact (International Energy Agency 2024).");
    expect(render("Fact [2].", "harvard")).toBe("Fact (Garcia and Smith 2022).");
    expect(render("Fact [4].", "harvard")).toBe("Fact (Li, Chen and Ng 2020).");
    expect(render("Fact [1].", "harvard")).toBe("Fact (City Transit Office no date).");
    expect(render("Fact [5, 2].", "harvard")).toBe("Fact (Garcia and Smith 2022; Rao 2021).");
  });

  it("MLA: author only, et al. for 3+, quoted title when unknown", () => {
    const mla = assignRefs(notes, "mla");
    const r = (t: string) => renderCitations({ text: t, notes: mla, style: "mla" });
    expect(r("Fact [3].")).toBe("Fact (International Energy Agency).");
    expect(r("Fact [2].")).toBe("Fact (Garcia and Smith).");
    expect(r("Fact [4].")).toBe("Fact (Li et al.).");
    expect(r("Fact [1].")).toBe("Fact (\u201CBus fleet overview\u201D).");
    expect(r("Fact [2, 5].")).toBe("Fact (Garcia and Smith; Rao).");
  });

  it("leaves unknown markers and IEEE markers untouched", () => {
    expect(render("Fact [42].", "apa")).toBe("Fact [42].");
    expect(render("Fact [2].", "ieee")).toBe("Fact [2].");
  });

  describe("two sources that would print the same label", () => {
    const dup: Note[] = [
      { claim: "a", sourceTitle: "Battery costs", url: "https://x.example/batteries", author: "Anna Li", year: "2021" },
      { claim: "b", sourceTitle: "Grid storage", url: "https://y.example/grid", author: "Anna Li", year: "2021" },
      { claim: "c", sourceTitle: "Solar farms", url: "https://z.example/solar", author: "Anna Li", year: "2021" },
      { claim: "d", sourceTitle: "Unique work", url: "https://u.example/one", author: "Ben Ou", year: "2020" },
    ];
    const undated: Note[] = [
      { claim: "a", sourceTitle: "First undated", url: "https://a.example/1", author: "Anna Li" },
      { claim: "b", sourceTitle: "Second undated", url: "https://b.example/2", author: "Anna Li" },
    ];

    it("APA puts the letter after the year, in the text and in the list, and leaves unique labels alone", () => {
      const r = assignRefs(dup, "apa");
      const apa = (t: string) => renderCitations({ text: t, notes: r, style: "apa" });
      expect(apa("A [1], B [2], C [3].")).toBe("A (Li, 2021a), B (Li, 2021b), C (Li, 2021c).");
      expect(apa("Fact [4].")).toBe("Fact (Ou, 2020).");
      // One marker citing two of them: both letters, in list order.
      expect(apa("Both [1, 3].")).toBe("Both (Li, 2021a; Li, 2021c).");
      const list = referencesFrom(dup, "apa");
      expect(list[0]).toContain("(2021a)");
      expect(list[2]).toContain("(2021c)");
      expect(list[3]).toContain("(2020)");
    });

    it("APA uses n.d.-a when the year is unknown", () => {
      const r = assignRefs(undated, "apa");
      expect(renderCitations({ text: "A [1] and B [2].", notes: r, style: "apa" })).toBe("A (Li, n.d.-a) and B (Li, n.d.-b).");
      expect(referencesFrom(undated, "apa")[0]).toContain("(n.d.-a)");
    });

    it("Harvard puts the letter after the year, with no comma", () => {
      const r = assignRefs(dup, "harvard");
      expect(renderCitations({ text: "A [1] and B [2].", notes: r, style: "harvard" })).toBe("A (Li 2021a) and B (Li 2021b).");
      expect(referencesFrom(dup, "harvard")[1]).toContain("(2021b)");
    });

    it("MLA has no year to tell them apart, so it uses the short title", () => {
      const r = assignRefs(dup, "mla");
      expect(renderCitations({ text: "A [1] and B [2].", notes: r, style: "mla" })).toBe("A (Li, \u201CBattery costs\u201D) and B (Li, \u201CGrid storage\u201D).");
      expect(renderCitations({ text: "Fact [4].", notes: r, style: "mla" })).toBe("Fact (Ou).");
    });

    it("finalizeCitations renders the text and the list with the same letters", () => {
      const r = assignRefs(dup, "apa");
      const out = finalizeCitations({ sections: [{ id: "a", content: "One [1]." }, { id: "b", content: "Two [2]." }], notes: r, style: "apa" });
      expect(out.sections.map((s) => s.content)).toEqual(["One (Li, 2021a).", "Two (Li, 2021b)."]);
      expect(out.references).toEqual(referencesFrom(dup, "apa"));
      expect(out.references[0]).toContain("(2021a)");
      expect(out.references[1]).toContain("(2021b)");
    });
  });

  it("finalizeCitations (APA) renders every section and returns the alphabetical list", () => {
    const out = finalizeCitations({ sections: [{ id: "a", content: "One [3]." }, { id: "b", content: "Two [2, 5]." }], notes: refd, style: "apa" });
    expect(out.sections.map((s) => s.content)).toEqual(["One (International Energy Agency, 2024).", "Two (Garcia & Smith, 2022; Rao, 2021)."]);
    expect(out.references).toEqual(referencesFrom(notes, "apa"));
    expect(out.references[0].startsWith("Bus fleet overview")).toBe(true);
  });

  it("finalizeCitations (IEEE) renumbers by first appearance across sections and lists in that order", () => {
    const ieee = assignRefs(notes, "ieee"); // refs follow notes order
    const out = finalizeCitations({
      sections: [{ id: "a", content: "One [3]." }, { id: "b", content: "Two [1, 3] and [5]." }],
      notes: ieee,
      style: "ieee",
    });
    expect(out.sections.map((s) => s.content)).toEqual(["One [1].", "Two [1, 2] and [3]."]);
    expect(out.references).toHaveLength(5);
    expect(out.references[0]).toMatch(/^\[1\] A\. Li, B\. Chen, and C\. Ng, \u201CFleet electrification/);
    expect(out.references[1]).toMatch(/^\[2\] International Energy Agency/);
    expect(out.references[2]).toMatch(/^\[3\] P\. Rao/);
    expect(out.references[3]).toMatch(/^\[4\] /);
    expect(out.references[4]).toMatch(/^\[5\] /);
  });

  it("the writer prompt keeps stable markers and forbids hand-written author-year", () => {
    const { system } = sectionPrompt({ kind: "academic", section: section(), notes: refd, outline, written: [], brief: "b", style: "mla" });
    expect(system).toContain("Never write author names, years or parenthetical citations by hand");
    expect(system).toContain("MLA 9");
    expect(sectionPrompt({ kind: "medium", section: section(), notes: refd, outline, written: [], brief: "b" }).system).toContain("internal ids");
  });

  it("qualityChecks: rendered text must have no raw markers (non-IEEE), and skips marker matching", () => {
    const r = report("academic");
    const sections = finalizeCitations({ sections: r.sections.filter((s) => s.type !== "references"), notes: refd, style: "apa" });
    const refsSection = { id: "refs", title: "References", type: "references", content: sections.references.join("\n") };
    const body = sections.sections.map((s) => ({ ...s, content: s.content.replace(/\[\d+\]/g, "(Rao, 2021)") }));
    const ok = qualityChecks({ kind: "academic", report: { sections: [...body, refsSection] }, rendered: true, style: "apa", researchAvailable: false });
    expect(ok.problems.join(" ")).not.toMatch(/Raw citation|never cited|no matching/);
    body[1].content += " Stray [7].";
    const bad = qualityChecks({ kind: "academic", report: { sections: [...body, refsSection] }, rendered: true, style: "apa", researchAvailable: false });
    expect(bad.problems.join(" ")).toMatch(/Raw citation markers remain after rendering \(\[7\]\)/);
    // IEEE keeps [n]: matching still applies after rendering.
    const ieee = qualityChecks({ kind: "medium", report: { sections: [{ title: "A", content: words(3500) + " [9]" }, ...["B", "C", "D", "E"].map((t) => ({ title: t, content: words(10, t) })), { title: "References", type: "references", content: "[1] x" }] }, rendered: true, style: "ieee" });
    expect(ieee.problems.join(" ")).toMatch(/\[9\] have no matching reference/);
  });
});

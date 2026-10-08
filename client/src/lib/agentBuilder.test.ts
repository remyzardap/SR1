import { describe, expect, it } from "vitest";
import {
  AGENT_DEFAULTS,
  AGENT_STORAGE_KEY,
  BRIEF_SAMPLES,
  BLANK_BRIEF_MESSAGE,
  CREDITS_MESSAGE,
  DEPTH_LEVELS,
  IMAGE_BRIEF,
  OUTPUT_TYPES,
  SOURCE_OPTIONS,
  agentReducer,
  briefNotice,
  costLine,
  depthOf,
  goLabel,
  initialAgentState,
  isCreditMessage,
  loadSelection,
  parseSelection,
  planFor,
  requestText,
  saveSelection,
  serializeSelection,
  showsDepth,
  sourceSummary,
  summaryLine,
  swapBrief,
  type AgentSelection,
  type AgentState,
} from "./agentBuilder";
import { DOC_COVER_IDS } from "./docMini";
import { photoUrl } from "./studioPhotos";

const selection = (over: Partial<AgentSelection> = {}): AgentSelection => ({
  ...AGENT_DEFAULTS,
  srcs: { ...AGENT_DEFAULTS.srcs },
  ...over,
});

const state = (over: Partial<AgentSelection> = {}): AgentState => ({
  ...initialAgentState(selection(over)),
});

describe("agentBuilder output types", () => {
  it("carries the six cards in the prototype's order with their copy", () => {
    expect(OUTPUT_TYPES.map((o) => o.id)).toEqual(["report", "deck", "sheet", "image", "brief", "monitor"]);
    expect(OUTPUT_TYPES.map((o) => o.name)).toEqual(["Report", "Deck", "Sheet", "Image", "Brief", "Monitor"]);
    expect(OUTPUT_TYPES.find((o) => o.id === "sheet")?.blurb).toBe("Formulas, tabs and totals");
    expect(OUTPUT_TYPES.find((o) => o.id === "monitor")?.blurb).toBe("Watches and tells you when it moves");
  });

  it("keeps the three depths and their numbers", () => {
    expect(DEPTH_LEVELS.map((d) => d.id)).toEqual(["quick", "standard", "deep"]);
    expect(depthOf("quick")).toMatchObject({ label: "Quick", src: 6, min: 2, credits: 1, dots: 6 });
    expect(depthOf("deep")).toMatchObject({ label: "Deep", src: 40, min: 20, credits: 9, dots: 30 });
    expect(depthOf("nope" as never)).toBe(DEPTH_LEVELS[1]);
  });

  it("names the four sources with their letters", () => {
    expect(SOURCE_OPTIONS.map((s) => s.letter)).toEqual(["W", "F", "G", "N"]);
    expect(SOURCE_OPTIONS.map((s) => s.name)).toEqual(["Web", "My files", "Google Drive", "Notion"]);
  });
});

describe("agentBuilder planFor", () => {
  it("scales only the reading steps and keeps the totals", () => {
    const standard = planFor("report", "standard");
    expect(standard.rows).toEqual([
      { name: "Plan the search", sub: "Three questions, two source types", time: "18 s" },
      { name: "Search the web", sub: "14 sources found", time: "1 min" },
      { name: "Read the quotes", sub: "Starts with supplier_quotes.pdf", time: "2 min" },
      { name: "Write the report", sub: "Formatted, cited, ready to send", time: "2 min" },
    ]);
    expect(standard.total).toBe("About 5 min");
    expect(standard.credits).toBe(4);

    expect(planFor("report", "quick").rows.map((r) => r.time)).toEqual(["18 s", "27 s", "54 s", "2 min"]);
    expect(planFor("report", "quick").total).toBe("About 4 min");
    expect(planFor("report", "quick").credits).toBe(1);

    expect(planFor("report", "deep").rows.map((r) => r.time)).toEqual(["18 s", "3 min", "5 min", "2 min"]);
    expect(planFor("report", "deep").rows[1].sub).toBe("40 sources found");
    expect(planFor("report", "deep").total).toBe("About 10 min");
    expect(planFor("report", "deep").credits).toBe(9);
  });

  it("fills the source count into every SRC placeholder", () => {
    for (const kind of ["report", "brief", "monitor"] as const) {
      expect(planFor(kind, "standard").rows[1].sub).toContain("14");
      expect(planFor(kind, "quick").rows[1].sub).toContain("6");
      expect(planFor(kind, "deep").rows[1].sub).toContain("40");
    }
  });

  it("knows the sheet's sub-minute last step and the deck's first", () => {
    expect(planFor("sheet", "standard").rows.map((r) => r.time)).toEqual(["1 min", "2 min", "1 min", "42 s"]);
    expect(planFor("deck", "standard").rows.map((r) => r.time)).toEqual(["36 s", "1 min", "2 min", "2 min"]);
    expect(planFor("deck", "standard").total).toBe("About 6 min");
  });

  it("shows the monitor's cadence instead of a one-off total", () => {
    const monitor = planFor("monitor", "standard");
    expect(monitor.total).toBe("Then every 6 h");
    expect(monitor.rows.map((r) => r.name)).toEqual([
      "Set the watch list",
      "First check",
      "Record the baseline",
      "Schedule the next check",
    ]);
  });

  it("keeps the picture plan fixed whatever the depth says", () => {
    for (const depth of ["quick", "standard", "deep"] as const) {
      const image = planFor("image", depth);
      expect(image.rows).toEqual([
        { name: "You set up the shot", sub: "Shot, lens, light and look", time: "Next" },
        { name: "Sutaeru draws it", sub: "With the engine you pick", time: "15 s" },
        { name: "Saved to Files", sub: "Original size, ready to share", time: "1 s" },
      ]);
      expect(image.total).toBe("About 15 s");
      expect(image.credits).toBe(2);
    }
  });
});

describe("agentBuilder summary lines", () => {
  it("puts the depth in only for the things that read and write", () => {
    expect(summaryLine(selection())).toBe("Report · Standard · Web, My files");
    expect(summaryLine(selection({ out: "monitor", depth: "deep" }))).toBe("Monitor · Web, My files");
    expect(summaryLine(selection({ out: "image" }))).toBe("Image · Web, My files");
    expect(showsDepth("report")).toBe(true);
    expect(showsDepth("image")).toBe(false);
    expect(showsDepth("monitor")).toBe(false);
  });

  it("says No sources when every toggle is off", () => {
    const none = selection({ srcs: { web: false, files: false, drive: false, notion: false } });
    expect(sourceSummary(none.srcs)).toBe("No sources");
    expect(summaryLine(none)).toBe("Report · Standard · No sources");
    expect(sourceSummary({ web: false, files: false, drive: true, notion: true })).toBe("Drive, Notion");
  });

  it("cost line matches the prototype's total · credits", () => {
    expect(costLine(planFor("report", "standard"))).toBe("About 5 min · 4 credits");
  });

  it("labels the button by output type", () => {
    expect(goLabel("report")).toBe("Start");
    expect(goLabel("monitor")).toBe("Start watching");
    expect(goLabel("image")).toBe("Set up the shot");
  });
});

describe("agentBuilder brief swapping", () => {
  it("replaces a sample brief but never a typed one", () => {
    expect(swapBrief("report", "deck", BRIEF_SAMPLES.report.brief)).toBe(BRIEF_SAMPLES.deck.brief);
    expect(swapBrief("report", "deck", "")).toBe(BRIEF_SAMPLES.deck.brief);
    expect(swapBrief("report", "deck", "my own words")).toBe("my own words");
    expect(swapBrief("report", "image", BRIEF_SAMPLES.report.brief)).toBe(IMAGE_BRIEF);
    expect(swapBrief("image", "sheet", IMAGE_BRIEF)).toBe(BRIEF_SAMPLES.sheet.brief);
    expect(swapBrief("image", "sheet", "a mug I described")).toBe("a mug I described");
  });

  it("keeps the prototype's sample briefs verbatim", () => {
    expect(BRIEF_SAMPLES.report.brief).toBe(
      "Compare three PV module suppliers for a 500 kWp rooftop project. Include price per Wp, lead time and warranty."
    );
    expect(BRIEF_SAMPLES.monitor.brief).toBe("Watch PLN tariff changes in Indonesia and tell me when anything moves.");
    expect(BRIEF_SAMPLES.brief.title).toBe("Off grid solar board brief");
  });
});

describe("agentBuilder reducer", () => {
  it("starts from the prototype's defaults", () => {
    const s = state();
    expect(s).toMatchObject({ out: "report", depth: "standard", notify: true, status: "idle", notice: null });
    expect(s.srcs).toEqual({ web: true, files: true, drive: false, notion: false });
    expect(s.brief).toBe(BRIEF_SAMPLES.report.brief);
  });

  it("picking a card swaps the sample brief and drops the notice", () => {
    const blocked = agentReducer(state({ brief: "" }), { type: "start" });
    const picked = agentReducer(blocked, { type: "selectOutput", id: "deck" });
    expect(picked.out).toBe("deck");
    expect(picked.brief).toBe(BRIEF_SAMPLES.deck.brief);
    expect(picked.notice).toBeNull();
  });

  it("ignores a repeat or unknown pick", () => {
    const s = state();
    expect(agentReducer(s, { type: "selectOutput", id: "report" })).toBe(s);
    expect(agentReducer(s, { type: "selectOutput", id: "widget" as never })).toBe(s);
    expect(agentReducer(s, { type: "setDepth", id: "nope" as never })).toBe(s);
  });

  it("flips sources and depths without touching the brief", () => {
    const s = state();
    const toggled = agentReducer(s, { type: "toggleSource", id: "drive" });
    expect(toggled.srcs.drive).toBe(true);
    expect(toggled.srcs).not.toBe(s.srcs);
    expect(agentReducer(toggled, { type: "setDepth", id: "deep" }).depth).toBe("deep");
  });

  it("blocks an empty brief and points at the reason", () => {
    const blocked = agentReducer(state({ brief: "   " }), { type: "start" });
    expect(blocked.status).toBe("idle");
    expect(blocked.notice).toEqual({ kind: "validation", message: BLANK_BRIEF_MESSAGE });
    expect(briefNotice("Real brief")).toBeNull();
  });

  it("goes through submitting, then settles when the run appears", () => {
    const started = agentReducer(state(), { type: "start" });
    expect(started.status).toBe("submitting");
    expect(started.notice).toBeNull();
    expect(agentReducer(started, { type: "started" })).toMatchObject({ status: "idle", notice: null });
  });

  it("reports a failed send, credits in their own words", () => {
    const failed = agentReducer(state(), { type: "failed", message: CREDITS_MESSAGE });
    expect(failed).toMatchObject({ status: "idle", notice: { kind: "credits", message: CREDITS_MESSAGE } });
    expect(isCreditMessage(CREDITS_MESSAGE)).toBe(true);
    expect(isCreditMessage("Couldn't reach Sutaeru.")).toBe(false);
    const other = agentReducer(state(), { type: "failed", message: "Something went wrong. Please retry." });
    expect(other.notice?.kind).toBe("validation");
    expect(agentReducer(failed, { type: "dismiss" }).notice).toBeNull();
  });

  it("restores a stored draft and drops the old notice", () => {
    const blocked = agentReducer(state({ brief: "" }), { type: "start" });
    const hydrated = agentReducer({ ...blocked, status: "submitting" }, {
      type: "hydrate",
      selection: selection({ out: "sheet", depth: "quick", brief: BRIEF_SAMPLES.sheet.brief }),
    });
    expect(hydrated).toMatchObject({
      out: "sheet",
      depth: "quick",
      brief: BRIEF_SAMPLES.sheet.brief,
      notice: null,
      status: "submitting",
    });
  });

  it("leaves the state alone for an action it does not know", () => {
    const s = state();
    expect(agentReducer(s, { type: "unknown" } as never)).toBe(s);
  });
});

describe("agentBuilder request text", () => {
  it("sends the brief with the plan the card shows", () => {
    const s = selection();
    const text = requestText(s, planFor(s.out, s.depth));
    expect(text.split("\n")[0]).toBe(BRIEF_SAMPLES.report.brief);
    expect(text).toContain("Plan: Report · Standard depth · Sources: Web, My files · About 5 min · 4 credits.");
    expect(text).toContain("Tell me on Telegram when it is done.");
  });

  it("drops the notification line when the switch is off", () => {
    const s = selection({ notify: false });
    expect(requestText(s, planFor(s.out, s.depth))).not.toContain("Telegram");
  });

  it("names the cadence for a monitor and never credits for a picture", () => {
    const monitor = selection({ out: "monitor" });
    expect(requestText(monitor, planFor("monitor", "standard"))).toContain("every 6 hours");
    const image = selection({ out: "image" });
    expect(requestText(image, planFor("image", "standard"))).toContain("About 15 s");
    expect(requestText(image, planFor("image", "standard"))).not.toContain("credits");
  });
});

describe("agentBuilder draft storage", () => {
  it("round-trips a selection", () => {
    const s = selection({ out: "brief", depth: "deep", brief: "typed", srcs: { web: false, files: true, drive: true, notion: false }, notify: false });
    expect(parseSelection(serializeSelection(s))).toEqual(s);
  });

  it("rejects junk and fills in what is missing", () => {
    expect(parseSelection(null)).toBeNull();
    expect(parseSelection("")).toBeNull();
    expect(parseSelection("not json")).toBeNull();
    expect(parseSelection("[]")).toBeNull();
    expect(parseSelection(JSON.stringify({ out: "widget", depth: "nope" }))).toEqual(AGENT_DEFAULTS);
    const partial = parseSelection(JSON.stringify({ out: "sheet", srcs: { web: true } }));
    expect(partial).toMatchObject({ out: "sheet", depth: "standard", brief: BRIEF_SAMPLES.sheet.brief, notify: true });
    expect(partial?.srcs).toEqual({ web: true, files: true, drive: false, notion: false });
  });

  it("survives storage that is missing or throws", () => {
    expect(loadSelection(null)).toBeNull();
    expect(loadSelection(undefined)).toBeNull();
    const broken = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    } as unknown as Pick<Storage, "getItem" | "setItem">;
    expect(loadSelection(broken)).toBeNull();
    expect(() => saveSelection(broken, selection())).not.toThrow();
  });

  it("writes and reads through the key the app uses", () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    } as Pick<Storage, "getItem" | "setItem">;
    saveSelection(storage, selection({ brief: "Keep this draft" }));
    expect([...store.keys()]).toEqual([AGENT_STORAGE_KEY]);
    expect(loadSelection(storage)?.brief).toBe("Keep this draft");
  });
});

describe("agentBuilder document previews", () => {
  it("has a miniature for every card except the picture", () => {
    expect(OUTPUT_TYPES.filter((o) => o.id !== "image").map((o) => o.id)).toEqual([
      "report",
      "deck",
      "sheet",
      "brief",
      "monitor",
    ]);
  });

  it("resolves each sample cover to a real photo path", () => {
    for (const id of DOC_COVER_IDS) {
      expect(photoUrl(id, "l")).toBe(`/studio/c/${id}.webp`);
    }
  });
});

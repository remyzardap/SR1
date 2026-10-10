import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";

import { DocMini } from "@/components/DocMini";
import { DEFAULT_SHOT } from "@/lib/studio";
import { AGENT_LAB_STATES } from "@/lab/fixtures/agent";
import LabAgent from "@/lab/LabAgent";
import { planFor, BRIEF_SAMPLES, IMAGE_BRIEF, CREDITS_MESSAGE, BLANK_BRIEF_MESSAGE, AGENT_DEFAULTS, type AgentSelection, type AgentNotice } from "@/lib/agentBuilder";
import { AgentBuilder } from "./AgentBuilder";
import { AgentScreen } from "./AgentScreen";
import { DepthPicker } from "./DepthPicker";
import { PlanCard } from "./PlanCard";

/* StudioFrame loads a photograph through an effect and cannot render in the node test transform. */
vi.mock("@/components/studio/StudioFrame", () => ({
  StudioFrame: ({ shot }: { shot: unknown }) =>
    React.createElement("div", { className: "sf mock-frame", "data-shot": (shot as { shot: string }).shot }),
}));

const noop = () => {};

/** A draft as the reducer would leave it: the sample brief always matches the selected card. */
const chosen = (over: Partial<AgentSelection> = {}): AgentSelection => {
  const out = over.out ?? AGENT_DEFAULTS.out;
  return {
    ...AGENT_DEFAULTS,
    srcs: { ...AGENT_DEFAULTS.srcs },
    brief: out === "image" ? IMAGE_BRIEF : BRIEF_SAMPLES[out].brief,
    ...over,
    out,
  };
};

const validation: AgentNotice = { kind: "validation", message: BLANK_BRIEF_MESSAGE };
const credits: AgentNotice = { kind: "credits", message: CREDITS_MESSAGE };

function screenMarkup(over: Partial<React.ComponentProps<typeof AgentScreen>> = {}) {
  const agent = over.agent ?? chosen();
  return renderToStaticMarkup(
    React.createElement(AgentScreen, {
      agent,
      plan: planFor(agent.out, agent.depth),
      onSelectOutput: noop,
      onBrief: noop,
      onSelectDepth: noop,
      onToggleSource: noop,
      onNotify: noop,
      onStart: noop,
      ...over,
    })
  );
}

const count = (html: string, re: RegExp) => (html.match(re) || []).length;

describe("AgentScreen", () => {
  it("opens with the question and no step bar", () => {
    const html = screenMarkup();
    expect(html).toContain('<h1 class="title">What should Sutaeru make?</h1>');
    expect(html).not.toContain('aria-label="Steps"');
    expect(html).not.toContain("Describe the outcome");
  });

  it("offers the six outputs as one showcase radiogroup with one checked", () => {
    const html = screenMarkup();
    expect(html).toContain('aria-label="What to make"');
    expect(count(html, /<button[^>]*class="sc[ "]/g)).toBe(6);
    expect(count(html, /<button[^>]*class="sc on"/g)).toBe(1);
    expect(html).toContain("Cited research, ready to send");
  });

  it("keeps each output's own art", () => {
    const html = screenMarkup();
    for (const kind of ["report", "deck", "sheet", "brief", "monitor"]) {
      expect(html).toContain(`doc-stage doc-${kind}`);
    }
    expect(html).toContain('class="sf mock-frame" data-shot="medium"');
    expect(DEFAULT_SHOT.shot).toBe("medium");
  });

  it("keeps the brief wired for validation", () => {
    const html = screenMarkup({ agent: chosen({ brief: "" }), notice: validation });
    expect(html).toContain('id="agent-brief"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="agent-brief-error"');
    expect(html).toContain('id="agent-brief-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain(BLANK_BRIEF_MESSAGE);
    expect(html).toContain('data-tone="alert"');
  });

  it("hides the depth fold for pictures and monitors", () => {
    expect(screenMarkup({ agent: chosen({ out: "report" }) })).toContain('data-fold="depth"');
    for (const out of ["image", "monitor"] as const) {
      expect(screenMarkup({ agent: chosen({ out }) })).not.toContain('data-fold="depth"');
    }
  });

  it("shows the depth tiles with their source counts", () => {
    const html = renderToStaticMarkup(React.createElement(DepthPicker, { selected: "deep", onSelect: noop }));
    expect(count(html, /role="radio"/g)).toBe(3);
    expect(count(html, /aria-checked="true"/g)).toBe(1);
    expect(html).toContain("6 sources · 2 min");
    expect(html).toContain("40+ sources · 20 min");
    expect(html).toContain("/studio/o/depth-deep.webp");
  });

  it("folds sources, the Telegram switch and the plan", () => {
    /* On a phone the first fold is the only one open; a monitor has no depth, so Sources opens. */
    const html = screenMarkup({ agent: chosen({ out: "monitor" }) });
    expect(html).toContain('data-fold="sources"');
    expect(html).toContain('<span class="letter">W</span>Web');
    expect(html).toContain('role="switch" aria-checked="true" aria-label="Telegram when done"');
    expect(html).toContain('data-fold="plan"');
    expect(html).toContain("Sutaeru will");
    const sheet = renderToStaticMarkup(React.createElement(PlanCard, { plan: planFor("sheet", "deep") }));
    expect(count(sheet, /class="pf"/g)).toBe(4);
    expect(sheet).toContain("Take off quantities");
    expect(sheet).toContain("40 line items");
  });

  it("docks one bar with the summary, cost and label", () => {
    const html = screenMarkup();
    expect(html).toContain('class="gobar');
    expect(html).toContain("Report · Standard · Web, My files");
    expect(html).toContain("About 5 min · 4 credits");
    expect(html).toContain(">Start");
    expect(screenMarkup({ agent: chosen({ out: "monitor" }) })).toContain(">Start watching");
    expect(screenMarkup({ agent: chosen({ out: "image" }) })).toContain(">Set up the shot");
  });

  it("says why Start is blocked when out of credits", () => {
    const html = screenMarkup({ notice: credits });
    expect(html).toContain(CREDITS_MESSAGE);
    expect(html).not.toContain('aria-invalid="true"');
  });

  it("disables the bar while submitting", () => {
    const html = screenMarkup({ status: "submitting" });
    expect(html).toContain("disabled");
    expect(html).toContain(">Starting");
  });

  it("fades the plan rows while they are being reworked", () => {
    const plan = planFor("report", "standard");
    expect(renderToStaticMarkup(React.createElement(PlanCard, { plan }))).not.toContain('aria-busy="true"');
    const redraw = renderToStaticMarkup(React.createElement(PlanCard, { plan, redrawing: true }));
    expect(redraw).toContain('aria-busy="true"');
    expect(redraw).toContain("opacity:0.4");
  });
});

describe("PlanCard", () => {
  it("draws one dashed row per step", () => {
    const html = renderToStaticMarkup(React.createElement(PlanCard, { plan: planFor("brief", "quick") }));
    expect(count(html, /class="nd"/g)).toBe(4);
    expect(html).toContain("Research the costs");
    expect(html).toContain(">About 2 min<");
    expect(html).toContain(">1 cr<");
  });
});

describe("DocMini", () => {
  it("lays the stage out on 560 × 340 and marks it decorative", () => {
    const html = renderToStaticMarkup(React.createElement(DocMini, { kind: "report" }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('class="docbox"');
    expect(html).toContain('class="doc-stage doc-report"');
    expect(html).toContain("width:560px");
    expect(html).toContain("height:340px");
    expect(html).toContain("/studio/c/cov-solar.webp");
  });

  it("draws the spreadsheet with its formula bar and total", () => {
    const html = renderToStaticMarkup(React.createElement(DocMini, { kind: "sheet" }));
    expect(html).toContain("Villa BOQ and budget.xlsx");
    expect(html).toContain("=SUM(F2:F8)");
    expect(html).toContain('class="num sel">1,067.4m');
    expect(html).toContain(">Brick walls<");
    expect(html).toContain('class="dp-tabs"');
  });

  it("draws the deck cover over its photograph", () => {
    const html = renderToStaticMarkup(React.createElement(DocMini, { kind: "deck" }));
    expect(html).toContain("linear-gradient(180deg,rgba(14,13,12,.05),rgba(14,13,12,.78))");
    expect(html).toContain("/studio/c/cov-jakarta-bw.webp");
    expect(html).toContain("Q3 investor update");
    expect(html).toContain(">01 / 10<");
  });

  it("draws the one-page brief with its two decisions and the seal", () => {
    const html = renderToStaticMarkup(React.createElement(DocMini, { kind: "brief" }));
    expect(html).toContain("Board brief · One page");
    expect(html).toContain("Approve a pilot in one village");
    expect(html).toContain("Apply for the capital grant");
    expect(html).toContain("dp-seal");
  });

  it("draws the watch card with its chart and live marker", () => {
    const html = renderToStaticMarkup(React.createElement(DocMini, { kind: "monitor" }));
    expect(html).toContain('class="dp-chart"');
    expect(html).toContain("M18.0 62 L49.5 60");
    expect(html).toContain(">1,114.74<");
    expect(html).toContain("Watching");
    expect(count(html, /class="grid"/g)).toBe(4);
  });
});

describe("AgentBuilder container", () => {
  it("renders the builder for the chat page without touching storage", () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentBuilder, {
        onCreateTask: noop,
        onOpenStudio: noop,
        onOpenSession: noop,
        isStreaming: false,
        error: null,
        selection: chosen({ out: "deck", depth: "quick", brief: BRIEF_SAMPLES.deck.brief }),
      })
    );
    expect(html).toContain("view view-enter wide");
    expect(html).toContain("Turn the Q3 numbers into a 10 slide investor update");
    expect(html).toContain("Deck · Quick · Web, My files");
    expect(html).toContain("About 4 min · 1 credits");
  });

  it("falls back to the defaults when there is no storage to read", () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentBuilder, {
        onCreateTask: noop,
        onOpenStudio: noop,
        onOpenSession: noop,
        isStreaming: false,
        error: null,
      })
    );
    expect(html).toContain(BRIEF_SAMPLES.report.brief);
    expect(html).toContain("Report · Standard · Web, My files");
    expect(html).toContain(">Start");
  });
});

describe("Design lab fixtures", () => {
  it("render every state the reviewer has to check", () => {
    expect(AGENT_LAB_STATES.map((s) => s.id)).toEqual([
      "report",
      "deck",
      "sheet",
      "image",
      "brief",
      "monitor",
      "deep",
      "no-sources",
      "redraw",
      "validation",
      "credits",
      "submitting",
    ]);
    for (const state of AGENT_LAB_STATES) {
      const html = screenMarkup({
        agent: state.agent,
        plan: planFor(state.agent.out, state.agent.depth),
        status: state.status,
        notice: state.notice,
        redrawing: state.redrawing,
      });
      expect(html, state.id).toContain('class="gobar');
      expect(html, state.id).toContain('class="sc on"');
    }
  });

  it("the lab route renders the fixed state and the live one", () => {
    const fixed = renderToStaticMarkup(
      React.createElement(Router, { ssrPath: "/__lab/agent?state=sheet" }, React.createElement(LabAgent))
    );
    expect(fixed).toContain("Agent — task builder");
    expect(fixed).toContain("Villa BOQ and budget");

    const live = renderToStaticMarkup(
      React.createElement(Router, { ssrPath: "/__lab/agent?state=live" }, React.createElement(LabAgent))
    );
    expect(live).toContain("sessionStorage");
    expect(live).toContain('class="gobar');
  });
});

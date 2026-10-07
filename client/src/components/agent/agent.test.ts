import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Router } from "wouter";

import { DocMini } from "@/components/DocMini";
import { DEFAULT_SHOT, compose, photoTile } from "@/lib/studio";
import { AGENT_LAB_STATES } from "@/lab/fixtures/agent";
import LabAgent from "@/lab/LabAgent";
import { planFor, BRIEF_SAMPLES, IMAGE_BRIEF, CREDITS_MESSAGE, BLANK_BRIEF_MESSAGE, AGENT_DEFAULTS, type AgentSelection, type AgentNotice } from "@/lib/agentBuilder";
import { AgentBuilder } from "./AgentBuilder";
import { AgentGoBar } from "./AgentGoBar";
import { AgentScreen } from "./AgentScreen";
import { DepthPicker } from "./DepthPicker";
import { PlanCard } from "./PlanCard";
import { StepRail } from "./StepRail";

/*
 * StudioFrame loads a photograph through an effect, and its module does not import the
 * React namespace, so the node test transform cannot render it. The card's own markup is
 * what matters here; the picture data is checked against lib/studio below.
 */
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

describe("StepRail", () => {
  it("marks the first step current and counts four", () => {
    const html = renderToStaticMarkup(React.createElement(StepRail));
    expect(html).toContain('aria-label="Step 1 of 4"');
    expect(count(html, /class="st[ "]/g)).toBe(4);
    expect(html).toContain('class="st cur"');
    expect(html).toContain('<span class="num">01 </span>Brief');
    expect(html).toContain('<span class="num">04 </span>Done');
    expect(count(html, /class="ln"/g)).toBe(3);
  });

  it("marks finished steps and connectors done", () => {
    const html = renderToStaticMarkup(React.createElement(StepRail, { current: 2 }));
    expect(count(html, /class="ln done"/g)).toBe(2);
    expect(html).toContain('class="st done"');
    expect(html).toContain('aria-label="Step 3 of 4"');
  });
});

describe("AgentScreen", () => {
  it("opens with the prototype's headline and lede", () => {
    const html = screenMarkup();
    expect(html).toContain('class="view view-enter wide"');
    expect(html).toContain('<h1 class="title">What should Sutaeru make?</h1>');
    expect(html).toContain("Describe the outcome. Sutaeru plans it, works on it and hands back a finished file.");
    expect(html).toContain('class="agent-grid"');
    expect(html).toContain('class="agent-side"');
  });

  it("offers six output cards as a radiogroup with one checked", () => {
    const html = screenMarkup();
    expect(html).toContain('role="radiogroup" aria-label="What to make"');
    expect(count(html, /class="out[ "]/g)).toBe(6);
    expect(count(html, /<button[^>]*class="out is-on"/g)).toBe(1);
    expect(count(html, /class="out" role="radio" aria-checked="false"/g)).toBe(5);
    expect(html).toContain("Cited research, ready to send");
    expect(html).toContain("Set up the shot, then draw");
  });

  it("draws a miniature document for each document card and a frame for the picture", () => {
    const html = screenMarkup();
    for (const kind of ["report", "deck", "sheet", "brief", "monitor"]) {
      expect(html).toContain(`doc-stage doc-${kind}`);
    }
    expect(html).toContain('class="sf mock-frame" data-shot="medium"');
    expect(html).toContain("Jinko Tiger Neo");
  });

  it("sets the picture card to the studio's own default shot and tile", () => {
    expect(DEFAULT_SHOT.shot).toBe("medium");
    expect(photoTile(compose(DEFAULT_SHOT).photo)).toMatch(/^\/studio\/t\//);
  });

  it("moves the selection bracket and check badge with the card", () => {
    const html = screenMarkup({ agent: chosen({ out: "sheet" }) });
    const onSheet = html.match(/<button[^>]*class="out is-on"[^>]*>.*?<\/button>/s)?.[0] ?? "";
    expect(onSheet).toContain("Villa BOQ and budget");
    expect(onSheet).toContain('aria-checked="true"');
    expect(onSheet).toContain('class="brk art-brackets" data-tone="ink"');
    expect(onSheet).toContain('class="check-badge"');
    // FocusBrackets draws as soon as it is mounted, so the other five must not carry it.
    // (The check badge stays CSS-driven — .is-on > .check-badge — as the prototype has it.)
    const offCards = html.match(/<button[^>]*class="out"[^>]*>.*?<\/button>/gs) ?? [];
    expect(offCards).toHaveLength(5);
    for (const card of offCards) {
      expect(card).not.toContain("art-brackets");
    }
  });

  it("keeps the brief field wired to its label", () => {
    const html = screenMarkup({ agent: chosen({ out: "brief" }) });
    expect(html).toContain('<label class="mono" for="agent-brief">Your brief</label>');
    expect(html).toContain('<textarea id="agent-brief"');
    expect(html).toContain('rows="3"');
    expect(html).toContain(BRIEF_SAMPLES.brief.brief);
  });

  it("hides the depth field for pictures and monitors", () => {
    expect(screenMarkup({ agent: chosen({ out: "report" }) })).not.toContain('class="field" hidden');
    for (const out of ["image", "monitor"] as const) {
      const html = screenMarkup({ agent: chosen({ out }) });
      expect(html).toContain('hidden=""');
      expect(html).toContain('aria-label="How deep"');
    }
  });

  it("shows the depth cards with their dot meters and source counts", () => {
    const html = renderToStaticMarkup(React.createElement(DepthPicker, { selected: "deep", onSelect: noop }));
    expect(count(html, /role="radio"/g)).toBe(3);
    expect(count(html, /aria-checked="true"/g)).toBe(1);
    expect(count(html, /<i class="on"/g)).toBe(6 + 14 + 30);
    expect(html).toContain("6 sources · 2 min");
    expect(html).toContain("14 sources · 6 min");
    expect(html).toContain("40+ sources · 20 min");
    // .brk.tight's geometry travels as props now: one bracket, on the chosen chip only.
    expect(count(html, /brk art-brackets/g)).toBe(1);
    expect(html).toContain('data-tone="ink" style="inset:-6px;opacity:0.55"');
    expect(html).toContain('viewBox="0 0 9 9"');
  });

  it("keeps the source pills and the Telegram switch pressable", () => {
    const html = screenMarkup();
    expect(count(html, /aria-pressed/g)).toBe(4);
    expect(count(html, /aria-pressed="true"/g)).toBe(2);
    expect(html).toContain('<span class="letter">W</span>Web');
    expect(html).toContain('<span class="letter">G</span>Google Drive');
    expect(html).toContain('role="switch" aria-checked="true" aria-label="Telegram when done"');
  });

  it("defaults the brief to the picture prompt when the picture card is picked", () => {
    const html = screenMarkup({ agent: chosen({ out: "image", brief: IMAGE_BRIEF }) });
    expect(html).toContain("A ceramic mug on a wooden table in soft morning light.");
  });

  it("prints the plan the side card shows", () => {
    const html = screenMarkup({ agent: chosen({ out: "sheet", depth: "deep" }) });
    expect(html).toContain('<p class="mono">Sutaeru will</p>');
    expect(count(html, /class="pf"/g)).toBe(4);
    expect(html).toContain("Take off quantities");
    expect(html).toContain("40 line items");
    expect(html).toContain(">About 10 min<");
    expect(html).toContain(">9 cr<");
  });

  it("summarises the choice and its cost in the sticky footer", () => {
    const html = screenMarkup();
    expect(html).toContain('class="go-bar"');
    expect(html).toContain("Report · Standard · Web, My files");
    expect(html).toContain("About 5 min · 4 credits");
    expect(html).toContain('class="btn ink big"');
    expect(html).toContain(">Start");
  });

  it("changes the button label for a watch and a picture", () => {
    expect(screenMarkup({ agent: chosen({ out: "monitor" }) })).toContain(">Start watching");
    expect(screenMarkup({ agent: chosen({ out: "image" }) })).toContain(">Set up the shot");
    expect(screenMarkup({ agent: chosen({ out: "monitor" }) })).toContain("Then every 6 h · 4 credits");
  });

  it("blocks Start with a validation message on the brief", () => {
    const html = screenMarkup({ agent: chosen({ brief: "" }), notice: validation });
    expect(html).toContain('role="alert"');
    expect(html).toContain(BLANK_BRIEF_MESSAGE);
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="agent-brief-error"');
    expect(html).toContain('id="agent-brief-error"');
    // .show is what rests the bracket: base.css keeps it at scale(1.04) without a .is-on parent.
    expect(html).toContain('class="brk art-brackets show" data-tone="alert"');
  });

  it("says why Start is blocked when the workspace is out of credits", () => {
    const html = screenMarkup({ notice: credits });
    expect(html).toContain(CREDITS_MESSAGE);
    expect(html).toContain("color:var(--alert)");
    expect(html).not.toContain('aria-invalid="true"');
  });

  it("shows a disabled, busy button while the task is being created", () => {
    const html = screenMarkup({ status: "submitting" });
    expect(html).toContain('class="btn ink big" disabled="" aria-busy="true"');
    expect(html).toContain('class="live-dot pulse"');
    expect(count(html, /disabled/g)).toBeGreaterThan(6);
  });

  it("fades the plan rows while they are being reworked", () => {
    const settled = screenMarkup();
    expect(settled).not.toContain('aria-busy="true"');
    const redraw = screenMarkup({ redrawing: true });
    expect(redraw).toContain('aria-busy="true"');
    expect(redraw).toContain("opacity:0.4");
  });
});

describe("AgentGoBar", () => {
  it("keeps the cost line and the arrow together", () => {
    const html = renderToStaticMarkup(
      React.createElement(AgentGoBar, {
        summary: "Deck · Quick · No sources",
        cost: "About 4 min · 1 credits",
        label: "Start",
        onStart: noop,
      })
    );
    expect(html).toContain("<b class=\"tnum\">About 4 min · 1 credits</b>");
    expect(html).toContain('class="sutaeru-feature-icon ico"');
    expect(html).not.toContain('role="alert"');
  });
});

describe("PlanCard", () => {
  it("draws one dashed row per step", () => {
    const html = renderToStaticMarkup(
      React.createElement(PlanCard, { plan: planFor("brief", "quick") })
    );
    expect(count(html, /class="nd"/g)).toBe(4);
    expect(html).toContain("Research the costs");
    expect(html).toContain("Starts with village_costs.csv");
    expect(html).toContain(">54 s<");
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
    expect(html).toContain('class="view view-enter wide"');
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
    // No window in this environment, so the saved draft cannot be read and nothing throws.
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
      expect(html, state.id).toContain('class="go-bar"');
      expect(html, state.id).toContain(`class="out is-on"`);
    }
  });

  it("the lab route renders the fixed state and the live one", () => {
    const fixed = renderToStaticMarkup(
      React.createElement(Router, { ssrPath: "/__lab/agent?state=sheet" }, React.createElement(LabAgent))
    );
    expect(fixed).toContain("Agent — task builder");
    expect(fixed).toContain("Villa BOQ and budget");
    expect(fixed).toContain("Spreadsheet miniature");

    const live = renderToStaticMarkup(
      React.createElement(Router, { ssrPath: "/__lab/agent?state=live" }, React.createElement(LabAgent))
    );
    expect(live).toContain("sessionStorage");
    expect(live).toContain('class="go-bar"');
  });
});

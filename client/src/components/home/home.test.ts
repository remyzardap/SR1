import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chatModes } from "@/components/chat/ModeMenu";
import { HomeScreen } from "./HomeScreen";
import { HomeComposer, driveCaption } from "./HomeComposer";
import type { HomeComposerProps } from "./HomeComposer";
import { relativeTime } from "./relativeTime";
import { drawBar, rng } from "./bar";
import { MAX_MB } from "@/lib/attachments";

const SOURCES = [
  { id: "web_search", label: "Web", caption: "News, papers and public sites" },
  { id: "safe_files", label: "My files", caption: "Everything in Files" },
  { id: "browse", label: "Browse", caption: "Pages opened and read in full" },
];

function composerProps(overrides: Partial<HomeComposerProps> = {}): HomeComposerProps {
  return {
    value: "",
    onChange: () => {},
    onSubmit: () => {},
    onListen: () => {},
    onStopListen: () => {},
    listening: false,
    offline: false,
    mode: "fast",
    modes: chatModes(false),
    onModeChange: () => {},
    thinking: false,
    onThinkingChange: () => {},
    privateChat: false,
    onPrivateChange: () => {},
    allowedTools: ["web_search"],
    onToggleTool: () => {},
    sourceRows: SOURCES,
    attachments: [],
    onAddAttachment: () => {},
    onRemoveAttachment: () => {},
    ...overrides,
  };
}

function quietScreen(overrides: Partial<React.ComponentProps<typeof HomeScreen>> = {}) {
  const composer = {
    value: "",
    onChange: () => {},
    onSubmit: () => {},
    onListen: () => {},
    onStopListen: () => {},
    listening: false,
    offline: false,
    attachments: [],
    onAddAttachment: () => {},
    onRemoveAttachment: () => {},
    ...overrides.composer,
  };
  return renderToStaticMarkup(
    React.createElement(HomeScreen, {
      ...overrides,
      composer,
    })
  );
}

describe("Quiet Home screen markup, ported from Main.dc.html", () => {
  it("carries the Quiet header with brand logo, name, seal and avatar", () => {
    const html = quietScreen();
    expect(html).toContain('class="q-header"');
    expect(html).toContain('aria-label="Open menu"');
    expect(html).toContain("q-brand-name");
    expect(html).toContain("Sutaeru");
    expect(html).toContain('aria-label="スタエル"');
    expect(html).toContain('aria-label="Account"');
    expect(html).toContain(">R<");
  });

  it("renders the floating artifacts hero with 3 cards", () => {
    const html = quietScreen();
    expect(html).toContain('class="q-hero"');
    expect(html).toContain("Villa build");
    expect(html).toContain("budget");
    expect(html).toContain("Q4 pipeline");
    expect(html).toContain("PV module");
    expect(html).toContain("supplier comparison");
    expect(html).toContain("Writing");
    expect(html).toContain("qsheen");
  });

  it("renders the center brand mark, date/status pill and What's next headline", () => {
    const html = quietScreen();
    expect(html).toContain('class="q-main"');
    expect(html).toContain("q-badge");
    expect(html).toContain("What’s");
    expect(html).toContain("next?");
  });

  it("renders the 6 mode cards with index badges and running indicator", () => {
    const html = quietScreen();
    expect(html).toContain('aria-label="Mode"');
    expect(html).toContain("Chat");
    expect(html).toContain("01");
    expect(html).toContain("Agent");
    expect(html).toContain("02");
    expect(html).toContain("qlive");
    expect(html).toContain("Studio");
    expect(html).toContain("Docs");
    expect(html).toContain("Video");
    expect(html).toContain("Files");
  });

  it("marks the selected mode card with aria-pressed", () => {
    const chatActive = quietScreen({ activeModeIndex: 0 });
    expect(chatActive).toMatch(/aria-pressed="true"[^>]*>[\s\S]*Chat/);

    const agentActive = quietScreen({ activeModeIndex: 1 });
    expect(agentActive).toMatch(/aria-pressed="true"[^>]*>[\s\S]*Agent/);
  });

  it("shows the private-on class only when private is on", () => {
    const plain = quietScreen();
    expect(plain).not.toContain("private-on");
    const privateOn = quietScreen({ composer: { ...composerProps(), privateChat: true } });
    expect(privateOn).toContain("home private-on");
  });

  it("docks the composer with the pill bar, add file button and textarea", () => {
    const html = quietScreen();
    expect(html).toContain('class="q-dock"');
    expect(html).toContain("qbar");
    expect(html).toContain('aria-label="Add a file"');
    expect(html).toMatch(/<textarea[^>]*id="qAsk"/);
    expect(html).toMatch(/rows="1"/);
  });

  it("swaps the placeholders and speak/send button based on state and value", () => {
    expect(quietScreen()).toContain('placeholder="Ask anything"');
    expect(quietScreen({ composer: { ...composerProps(), offline: true } })).toContain('placeholder="Ask now. It sends when you reconnect."');
    expect(quietScreen({ composer: { ...composerProps(), listening: true } })).toContain('placeholder="Listening…"');
    expect(quietScreen({ composer: { ...composerProps(), listening: true } })).toContain('aria-label="Stop listening"');
    expect(quietScreen()).toContain('aria-label="Speak"');
    expect(quietScreen({ composer: { ...composerProps(), value: "hello" } })).toContain('aria-label="Send"');
  });

  it("has no legacy recent list, hand-off card or example prompts", () => {
    const html = quietScreen();
    expect(html).not.toContain("Recently updated");
    expect(html).not.toContain("Hand off a project");
    expect(html).not.toContain("recent-row");
  });

  it("puts the banners in the dock above composer", () => {
    const html = quietScreen({ banners: React.createElement("p", { className: "mono" }, "No connection.") });
    expect(html).toContain("No connection.");
    expect(html).toContain("q-dock-banners");
  });

  it("renders attached file chips with remove buttons and metadata", () => {
    const html = quietScreen({
      composer: {
        ...composerProps(),
        attachments: [{ id: "held-0", name: "ledger.xlsx", meta: "312 KB" }],
      },
    });
    expect(html).toContain("ledger.xlsx");
    expect(html).toContain("312 KB");
    expect(html).toContain('aria-label="Remove ledger.xlsx"');
    expect(html).toContain("q-dock-att-chip");
  });
});

describe("the composer's file chips", () => {
  it("draws the prototype's upload bar only while a file is being read", () => {
    const reading = renderToStaticMarkup(
      React.createElement(HomeComposer, {
        ...composerProps({ attachments: [{ id: "pending-x", name: "ledger.xlsx", meta: "312 KB", icon: "report", startedAt: performance.now() }] }),
      })
    );
    expect(reading).toContain('class="att"');
    expect(reading).toContain("Uploading");
    expect(reading).toContain('<canvas class="bar"');
    expect(reading).toContain('aria-label="Remove ledger.xlsx"');

    // The same chip once the read is done: the size, and no bar.
    const done = renderToStaticMarkup(
      React.createElement(HomeComposer, {
        ...composerProps({ attachments: [{ id: "held-0", name: "ledger.xlsx", meta: "312 KB", icon: "report", startedAt: null }] }),
      })
    );
    expect(done).toContain("312 KB");
    expect(done).not.toContain("Uploading");
    expect(done).not.toContain('<canvas class="bar"');
  });

  it("only claims a Drive account that is really connected", () => {
    expect(driveCaption("remy@example.com")).toBe("Connected as remy@example.com");
    expect(driveCaption(null)).toBe("Not connected yet");
    expect(driveCaption(undefined)).toBe("Not connected yet");
  });

  it("opens the attach panel on the three real ways in", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeComposer, { ...composerProps({ initialPanel: "attach", driveEmail: "remy@example.com" }) })
    );
    expect(html).toContain('class="popover"');
    expect(html).toContain("Add to this chat");
    expect(html).toContain("Photos and files");
    expect(html).toContain("Take a photo");
    expect(html).toContain("Connected as remy@example.com");
    // The real per-file cap, not the prototype's made-up one.
    expect(html).toContain(`up to ${MAX_MB} MB`);
    expect(html).toContain('aria-expanded="true"');
  });

  it("shows the picture itself when the file is a photo", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeComposer, {
        ...composerProps({
          attachments: [{ id: "held-1", name: "mug.webp", meta: "1.1 MB", icon: "camera", preview: "/studio/t/light-window.webp", startedAt: null }],
        }),
      })
    );
    expect(html).toContain('src="/studio/t/light-window.webp"');
  });
});

describe("the mode chip and its sheet", () => {
  it("opens on the mode carousel with Sources and the Thinking switch folded below", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeComposer, {
        ...composerProps({ initialPanel: "mode", allowedTools: ["web_search"] }),
      })
    );
    expect(html).toContain('aria-label="Mode"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain("Quick answers, with search");
    expect(html).toContain("/studio/o/fast.webp");
    // The Mode section is open and Sources is a folded row naming what is on.
    expect(html).toContain('data-fold="sources"');
    expect(html).toContain(">Web<");
    // Only the Thinking switch: the sources are picture tiles now.
    expect(html.match(/role="switch"/g)).toHaveLength(1);
    expect(html).not.toContain("Run settings");
  });

  it("only offers Code mode to people who may use it", () => {
    expect(chatModes(false).map((mode) => mode.key)).toEqual(["fast", "deep", "image", "document"]);
    expect(chatModes(true).map((mode) => mode.key)).toContain("code");
  });
});

describe("relativeTime", () => {
  const now = Date.parse("2026-07-15T12:00:00Z");

  it("phrases the buckets the prototype writes by hand", () => {
    expect(relativeTime(now - 30_000, now)).toBe("Just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5 min ago");
    expect(relativeTime(now - 60 * 60_000, now)).toBe("1 hour ago");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3 hours ago");
    expect(relativeTime(now - 36 * 3_600_000, now)).toBe("Yesterday");
    expect(relativeTime(now - 2 * 86_400_000, now)).toBe("2 days ago");
  });

  it("takes a Date and says nothing when there is no time", () => {
    expect(relativeTime(new Date(now - 60_000), now)).toBe("1 min ago");
    expect(relativeTime(null, now)).toBe("");
    expect(relativeTime(Number.NaN, now)).toBe("");
  });
});

describe("the composer CSS", () => {
  const css = readFileSync(new URL("../../styles/redo/composer.css", import.meta.url), "utf8");
  const home = readFileSync(new URL("../../styles/redo/home.css", import.meta.url), "utf8");

  it("is spacious: 18px text, a 30px radius and a 50px send button", () => {
    expect(css).toMatch(/\.composer \{[^}]*border-radius: 30px/);
    expect(css).toMatch(/\.composer textarea \{[^}]*font: 400 18px/);
    expect(css).toMatch(/\.send \{[^}]*width: 50px/);
  });

  it("lets the mode chip fall back to its short name instead of clipping", () => {
    expect(css).toContain(".mode-chip");
    expect(css).toContain("container-type: inline-size");
  });

  it("honours the two settings the art rules belong to", () => {
    expect(home).toContain('[data-art="off"] .art-deco');
  });
});

describe("the canvas bar drawer", () => {
  it("is the prototype's seeded generator: same seed, same numbers", () => {
    const a = rng(31);
    const b = rng(31);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(rng(1)()).not.toBe(rng(2)());
  });

  it("ignores a canvas it cannot paint instead of throwing", () => {
    expect(() => drawBar(null, 0.5, { t: 0 })).not.toThrow();
    expect(() => drawBar({ isConnected: false } as unknown as HTMLCanvasElement, 0.5)).not.toThrow();
  });
});

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

function screen(overrides: Partial<React.ComponentProps<typeof HomeScreen>> = {}) {
  return renderToStaticMarkup(
    React.createElement(HomeScreen, {
      composer: composerProps(),
      ...overrides,
    })
  );
}

describe("Home screen markup, ported from VIEWS.home", () => {
  it("carries the prototype's section, hero and wordmark lockup", () => {
    const html = screen();
    expect(html).toContain('class="view home view-enter"');
    expect(html).toContain("home-hero lockup no-intro");
    expect(html).toContain('class="glyph sutaeru-glyph mark"');
    expect(html).toContain('<h1 class="word">Sutaeru</h1>');
    expect(html).toContain("hero-seal");
    expect(html).toContain('<p class="mono tagline">Ask once. We do the rest.</p>');
  });

  it("plays the intro only when it is asked to", () => {
    expect(screen({ intro: true })).toContain("home-hero lockup intro");
    expect(screen({ intro: false })).toContain("home-hero lockup no-intro");
  });

  it("renders the refined 27-dot halftone ramp that fades out at both ends", () => {
    const html = screen();
    expect(html).toContain('class="ramp art-deco"');
    expect(html).toContain('id="ramp"');
    expect(html.match(/--d:/g)).toHaveLength(27);
    expect(html).toContain("--d:1.6px");
    expect(html).toContain("--d:13px");
  });

  it("shows the private note and the dashed composer only when private is on", () => {
    const plain = screen();
    expect(plain).toContain("private-note mono");
    expect(plain).toContain("Private · not saved to history or memory");
    expect(plain).not.toContain("private-on");
    expect(screen({ composer: composerProps({ privateChat: true }) })).toContain("view home view-enter private-on");
  });

  it("docks the composer with the focus brackets always on, as Home has them", () => {
    const html = screen();
    expect(html).toContain('class="composer-wrap is-on"');
    expect(html).toContain('class="art-brackets"');
    expect(html).toContain('class="composer dock"');
    // The server renderer keeps the React spelling; the browser reads it case-insensitively.
    expect(html).toMatch(/autocomplete="off"/i);
    expect(html).toContain('<label class="sr" for="q">Ask Sutaeru</label>');
    expect(html).toMatch(/enterkeyhint="send"/i);
  });

  it("gives the field three lines", () => {
    expect(screen()).toMatch(/<textarea[^>]*rows="3"/);
  });

  it("swaps the placeholders and the send button the way the prototype does", () => {
    expect(screen()).toContain('placeholder="Ask anything…"');
    expect(screen({ composer: composerProps({ offline: true }) })).toContain('placeholder="Ask now. It sends when you reconnect."');
    expect(screen({ composer: composerProps({ listening: true }) })).toContain('placeholder="Listening…"');
    expect(screen({ composer: composerProps({ listening: true }) })).toContain('class="composer-wrap is-on listening"');
    // Nothing typed: the button is the mic.
    expect(screen()).toContain('aria-label="Talk to Sutaeru"');
    expect(screen()).toContain('<span class="mic-ico" id="sendIco">');
    expect(screen()).toContain('class="voice-meter"');
    // Something typed: it becomes Send with the up arrow.
    expect(screen({ composer: composerProps({ value: "hello" }) })).toContain('aria-label="Send"');
  });

  it("shows the current mode on a chip that opens the mode sheet", () => {
    const fast = screen();
    expect(fast).toContain("mode-chip");
    expect(fast).toContain("Mode: Fast. Change mode and sources");
    expect(fast).toContain('aria-haspopup="dialog"');
    expect(screen({ composer: composerProps({ mode: "deep" }) })).toContain("Mode: Deep research.");
    expect(screen({ composer: composerProps({ mode: "image" }) })).toContain("Mode: Image.");
  });

  it("keeps the sources pill out of the tools row", () => {
    const html = screen();
    expect(html).not.toContain("src-text");
    expect(html).not.toContain(">No sources<");
  });

  it("says why the private switch cannot be used yet", () => {
    const html = screen({ composer: composerProps({ privateHint: "Private chats are not available yet." }) });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="Private chats are not available yet."');
  });

  it("has no recent list, hand-off card or example prompts", () => {
    const html = screen();
    expect(html).not.toContain("Recently updated");
    expect(html).not.toContain("Hand off a project");
    expect(html).not.toContain("recent-row");
  });

  it("puts the banners between the hero and the composer", () => {
    const html = screen({ banners: React.createElement("p", { className: "mono" }, "No connection.") });
    expect(html.indexOf("No connection.")).toBeGreaterThan(html.indexOf("ramp"));
    expect(html.indexOf("No connection.")).toBeLessThan(html.indexOf("composer-wrap"));
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
  it("opens on the modes, the sources, Thinking and the run settings", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeComposer, {
        ...composerProps({ initialPanel: "mode", allowedTools: ["web_search"], onOpenSettings: () => {} }),
      })
    );
    expect(html).toContain('aria-label="Chat mode"');
    expect(html).toContain("Quick answers, with search");
    expect(html).toContain("Search in");
    expect(html).toContain('class="pop-toggles"');
    // Web, My files and Browse, plus the Thinking switch; only Web is on.
    expect(html.match(/role="switch"/g)).toHaveLength(4);
    expect(html).toContain("News, papers and public sites");
    expect(html).toContain("Run settings");
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

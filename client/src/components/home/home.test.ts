import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeScreen, type HomeRecentRow } from "./HomeScreen";
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
      rows: [],
      composer: composerProps(),
      onHandoff: () => {},
      ...overrides,
    })
  );
}

const RUNNING: HomeRecentRow = { id: "run", kind: "running", title: "Rooftop solar payback", when: "Now", progress: 0.42 };
const DONE: HomeRecentRow = { id: "d", kind: "done", title: "Villa BOQ and budget", when: "Just now", tag: "Done" };
const STOPPED: HomeRecentRow = { id: "s", kind: "stopped", title: "Off grid solar board brief", when: "Today", tag: "Stopped" };
const QUEUED: HomeRecentRow = { id: "q", kind: "queued", title: "Summarise the attached file" };
const PHOTO: HomeRecentRow = {
  id: "p",
  kind: "photo",
  title: "Ceramic mug, morning light",
  when: "2 days ago",
  image: { src: "/studio/t/light-window.webp", alt: "Ceramic mug, morning light" },
};

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
    expect(html).toContain('class="brk art-brackets"');
    expect(html).toContain('class="composer dock"');
    // The server renderer keeps the React spelling; the browser reads it case-insensitively.
    expect(html).toMatch(/autocomplete="off"/i);
    expect(html).toContain('<label class="sr" for="q">Ask Sutaeru</label>');
    expect(html).toMatch(/enterkeyhint="send"/i);
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

  it("counts the sources the way the prototype's label does", () => {
    expect(screen({ composer: composerProps({ allowedTools: ["web_search"] }) })).toContain(">Web<");
    expect(screen({ composer: composerProps({ allowedTools: ["web_search", "browse"] }) })).toContain(">Web +1<");
    expect(screen({ composer: composerProps({ allowedTools: ["browse", "safe_files"] }) })).toContain(">2 sources<");
    expect(screen({ composer: composerProps({ allowedTools: [] }) })).toContain(">No sources<");
  });

  it("marks the toggles with the state the screen is in", () => {
    const html = screen({ composer: composerProps({ thinking: true, allowedTools: ["web_search", "safe_files"] }) });
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-expanded="false"');
  });

  it("says why the private switch cannot be used yet", () => {
    const html = screen({ composer: composerProps({ privateHint: "Private chats are not available yet." }) });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('title="Private chats are not available yet."');
  });

  it("renders the handoff card with one blended halftone fade", () => {
    const html = screen();
    expect(html).toContain('class="handoff"');
    expect(html).toContain("<b>Hand off a project</b><small>Works while you are away</small>");
    expect(html).toContain('class="cols art-deco"');
    expect(html).toContain('class="go"');
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

  it("opens the sources panel on the switches that own those tools", () => {
    const html = renderToStaticMarkup(
      React.createElement(HomeComposer, { ...composerProps({ initialPanel: "sources", allowedTools: ["web_search"] }) })
    );
    expect(html).toContain("Search in");
    expect(html).toContain('class="pop-toggles"');
    expect(html).toContain('role="switch"');
    // Web is on, My files and Browse are off: three rows, one checked.
    expect(html.match(/role="switch"/g)).toHaveLength(3);
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
    expect(html).toContain("News, papers and public sites");
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

describe("Home's Recently updated rows", () => {
  it("draws the running row with the live rings, the converging bar and the percent", () => {
    const html = screen({ rows: [RUNNING] });
    expect(html).toContain('class="orb run"');
    expect(html).toContain('<canvas class="bar"');
    expect(html).toContain("42%");
    expect(html).toContain('<span class="when">Now</span>');
    expect(html).toContain("Rooftop solar payback");
  });

  it("draws the finished and stopped rows with their chips", () => {
    const html = screen({ rows: [DONE, STOPPED] });
    expect(html).toContain('class="tag"');
    expect(html).toContain(">Done<");
    expect(html).toContain('class="tag alert"');
    expect(html).toContain(">Stopped<");
  });

  it("keeps the waiting row a div with the dotted rail, as the prototype does", () => {
    const html = screen({ rows: [QUEUED] });
    expect(html).toContain('class="recent-row queued"');
    expect(html).toContain(">Waiting to send<");
    expect(html).toContain('<i class="dotline"');
    expect(html).not.toContain('<button class="recent-row queued"');
  });

  it("puts the real picture in the leading box of a photo row", () => {
    const html = screen({ rows: [PHOTO] });
    expect(html).toContain('class="st thumb-ph"');
    expect(html).toContain('src="/studio/t/light-window.webp"');
    expect(html).toContain('alt="Ceramic mug, morning light"');
  });

  it("shows placeholders while the rows are still arriving", () => {
    const html = screen({ loading: true, rows: [RUNNING] });
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status"');
    expect(html.match(/class="sk-line"/g)).toHaveLength(3);
    expect(html).not.toContain("Rooftop solar payback");
  });

  it("says so when nothing has been updated", () => {
    const html = screen({ rows: [] });
    expect(html).toContain('class="mono recent-empty"');
    expect(html).toContain("Nothing here yet.");
  });

  it("puts the banners above the rows, where the prototype keeps them", () => {
    const html = screen({
      rows: [DONE],
      banners: React.createElement("p", { className: "mono" }, "No connection."),
    });
    expect(html.indexOf("No connection.")).toBeLessThan(html.indexOf("Recently updated"));
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

describe("the CSS Home had to add to the shared sheet", () => {
  const css = readFileSync(new URL("../../styles/redo/home.css", import.meta.url), "utf8");

  it("carries the rules this screen's markup depends on", () => {
    expect(css).toContain(".sec-label");
    expect(css).toContain(".orb.run i");
    expect(css).toContain("@keyframes ring");
    expect(css).toContain(".recent-row .dotline");
    expect(css).toContain(".pop-toggles .toggle-row");
    expect(css).toContain(".recent-row .st.thumb-ph img");
    expect(css).toContain(".recent-row .sk-line");
  });

  it("honours the two settings the art rules belong to", () => {
    expect(css).toContain('[data-art="off"] .art-deco');
    // Reduced motion still reads as running: the rings hold open instead of vanishing.
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*\.orb\.run i \{ animation: none/);
  });

  it("collapses the sources pill to its icon on a phone, as app.css 978-986 does", () => {
    expect(css).toMatch(/@media \(max-width: 759px\)[\s\S]*?\.src-text \{ display: none;/);
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

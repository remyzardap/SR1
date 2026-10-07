import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const HOURS = 3_600_000;

// The container reads the person's own conversations and their Google connection, so the
// test says what those queries answer and checks that the screen shows it.
const { SESSIONS, DRIVE } = vi.hoisted(() => ({
  SESSIONS: [
    { id: "a", title: "Villa BOQ and budget", lastMessageAt: new Date(Date.now() - 26 * 3_600_000), updatedAt: null, createdAt: null },
    { id: "b", title: "Off grid solar board brief", lastMessageAt: null, updatedAt: new Date(Date.now() - 3 * 3_600_000), createdAt: null },
    { id: "c", title: null, lastMessageAt: new Date(Date.now() - 40_000), updatedAt: null, createdAt: null },
  ],
  DRIVE: { connected: true, email: "remy@example.com" },
}));

vi.mock("@/lib/trpc", () => ({
  trpc: {
    chat: { listSessions: { useQuery: () => ({ data: SESSIONS, isLoading: false }) } },
    google: { status: { useQuery: () => ({ data: DRIVE }) } },
  },
}));

// The Drive browser is a Radix dialog of its own; this test is about what Home asks for.
vi.mock("@/components/DrivePicker", () => ({ DrivePicker: () => null }));

import { Router } from "wouter";
import { Home } from "./Home";

function render(overrides: Record<string, unknown> = {}) {
  return renderToStaticMarkup(
    React.createElement(
      Router,
      { ssrPath: "/chat" },
      React.createElement(Home, {
        onSend: () => {},
        value: "",
        onValueChange: () => {},
        attachments: [],
        onAttachmentsChange: () => {},
        allowedTools: ["web_search"],
        onToggleTool: () => {},
        thinking: false,
        onThinkingChange: () => {},
        privateChat: false,
        onPrivateChange: () => {},
        offline: false,
        running: false,
        onOpenSession: () => {},
        onHandoff: () => {},
        ...overrides,
      } as React.ComponentProps<typeof Home>)
    )
  );
}

describe("Home container", () => {
  it("lists the person's own conversations with real relative times", () => {
    const html = render();
    expect(html).toContain("Villa BOQ and budget");
    expect(html).toContain("Yesterday");
    expect(html).toContain("3 hours ago");
    // A thread with no title of its own is still a conversation they had.
    expect(html).toContain("Untitled chat");
    expect(html).toContain("Just now");
  });

  it("offers the real pickers behind the plus control", () => {
    const html = render();
    // One input for any file the person may attach, one that asks the device for a photo.
    expect(html).toContain('type="file"');
    expect(html).toContain('capture="environment"');
    expect(html).toContain("application/pdf");
  });

  it("keeps the draft and the files the page holds", () => {
    const html = render({
      value: "How fast do commercial rooftop systems pay back?",
      attachments: [{ source: "device", filename: "quotes.pdf", mediaType: "application/pdf", dataUrl: "data:application/pdf;base64,AAAA" }],
    });
    expect(html).toContain("How fast do commercial rooftop systems pay back?");
    expect(html).toContain("quotes.pdf");
    // A file that has finished reading shows its size, and no bar.
    expect(html).not.toContain("Uploading");
    expect(html).toContain("3 B");
  });

  it("carries a Drive file as the real reference the page holds", () => {
    const html = render({
      attachments: [{ source: "drive", fileId: "1abc", filename: "Q3 ledger.xlsx", mediaType: "application/vnd.ms-excel" }],
    });
    expect(html).toContain("Q3 ledger.xlsx");
    expect(html).toContain("Google Drive");
  });

  it("shows the waiting row when a question is held offline", () => {
    const html = render({ offline: true, queued: "Summarise the attached file" });
    expect(html).toContain('class="recent-row queued"');
    expect(html).toContain("Waiting to send");
    expect(html).toContain("Ask now. It sends when you reconnect.");
  });

  it("draws the live row from the steps the run has reported", () => {
    const activity = [
      { id: "1", label: "Searching", status: "done" },
      { id: "2", label: "Reading", status: "running" },
      { id: "3", label: "Writing", status: "open" },
    ];
    const html = render({ running: true, runningTitle: "Rooftop solar payback", activity });
    expect(html).toContain('class="orb run"');
    expect(html).toContain("Rooftop solar payback");
    // Two of three steps: the same measure the run card prints.
    expect(html).toContain("50%");
  });

  it("does not invent a row for a run that is not happening", () => {
    const html = render({ running: false });
    expect(html).not.toContain('class="orb run"');
  });
});

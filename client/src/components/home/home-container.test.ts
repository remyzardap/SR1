import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The container reads the person's Google connection, so the test says what that query
// answers and checks that the screen shows it.
vi.mock("@/lib/trpc", () => ({
  trpc: {
    google: { status: { useQuery: () => ({ data: { connected: true, email: "remy@example.com" } }) } },
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
        mode: "fast",
        modes: [{ key: "fast", label: "Fast", text: "Quick answers", icon: "ask" }],
        onModeChange: () => {},
        thinking: false,
        onThinkingChange: () => {},
        privateChat: false,
        onPrivateChange: () => {},
        offline: false,
        ...overrides,
      } as React.ComponentProps<typeof Home>)
    )
  );
}

describe("Home container", () => {
  it("shows no list of past chats: those live in the logo menu", () => {
    const html = render();
    expect(html).not.toContain("Recently updated");
    expect(html).not.toContain("Hand off a project");
    expect(html).not.toContain("recent-row");
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

  it("says an offline question sends when the connection returns", () => {
    expect(render({ offline: true })).toContain("Ask now. It sends when you reconnect.");
  });

  it("shows the mode the page is in on the chip", () => {
    expect(render()).toContain("Mode: Fast.");
  });
});

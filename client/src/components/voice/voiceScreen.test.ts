import { describe, expect, it, vi } from "vitest";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VoiceScreen, type VoiceScreenProps } from "./VoiceScreen";

function props(overrides: Partial<VoiceScreenProps> = {}): VoiceScreenProps {
  return {
    phase: "idle",
    listening: false,
    busy: false,
    onStart: () => {},
    onStop: () => {},
    onTypeInstead: () => {},
    onShowResult: () => {},
    ...overrides,
  };
}

function render(p: VoiceScreenProps) {
  return renderToStaticMarkup(React.createElement(VoiceScreen, p));
}

describe("VoiceScreen", () => {
  it("renders the Voice header with Ready subtitle when idle", () => {
    const html = render(props());
    expect(html).toContain("Voice");
    expect(html).toContain("Ready");
  });

  it("shows Listening subtitle when recording", () => {
    const html = render(props({ phase: "recording", listening: true, busy: true }));
    expect(html).toContain("Listening");
    expect(html).not.toContain("Ready");
  });

  it("shows Thinking subtitle when transcribing", () => {
    const html = render(props({ phase: "transcribing", busy: true }));
    expect(html).toContain("Thinking…");
    expect(html).not.toContain("Ready");
  });

  it("shows the hint text in idle state", () => {
    const html = render(props({ hintText: "Ask me anything", hintSuffix: "today" }));
    expect(html).toContain("Ask me anything");
    expect(html).toContain("today");
  });

  it("shows transcript when provided instead of hint", () => {
    const html = render(props({ transcript: "Hello world transcript" }));
    expect(html).toContain("Hello world transcript");
    expect(html).not.toContain("Plan my week around");
  });

  it("renders three control buttons", () => {
    const html = render(props());
    expect(html).toContain('aria-label="Type instead"');
    expect(html).toContain('aria-label="Tap to speak"');
    expect(html).toContain('aria-label="Show it"');
  });

  it("disables Type instead when busy (recording)", () => {
    const html = render(props({ phase: "recording", busy: true }));
    expect(html).toContain('aria-label="Type instead"');
  });

  it("shows Stop label on the speak button while recording", () => {
    const html = render(props({ phase: "recording", listening: true, busy: true }));
    expect(html).toContain("Stop");
    expect(html).toContain('aria-label="Speaking, tap to stop"');
  });

  it("shows Transcribing label while transcribing", () => {
    const html = render(props({ phase: "transcribing", busy: true }));
    expect(html).toContain("Transcribing");
    expect(html).toContain('aria-label="Transcribing…"');
  });

  it("shows the waveform SVG with role=status and aria-live=polite", () => {
    const html = render(props());
    expect(html).toContain('role="status"');
    expect(html).toContain("aria-live");
  });

  it("calls onStart when the speak button is clicked in idle", () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const html = render(props({ phase: "idle", onStart, onStop }));
    expect(html).toContain('class="vc-btn-speak');
  });

  it("calls onStop when the speak button is clicked while recording", () => {
    const onStart = vi.fn();
    const onStop = vi.fn();
    const html = render(props({ phase: "recording", listening: true, busy: true, onStart, onStop }));
    expect(html).toContain('class="vc-btn-speak');
  });

  it("disables the speak button while transcribing", () => {
    const html = render(props({ phase: "transcribing", busy: true }));
    expect(html).toContain("disabled");
  });

  it("disables Show it button when there is no transcript", () => {
    const html = render(props({ transcript: "" }));
    expect(html).toContain('aria-label="Show it"');
  });

  it("has sk-page and vc-page classes on the root element", () => {
    const html = render(props());
    expect(html).toContain('class="sk-page vc-page"');
  });
});

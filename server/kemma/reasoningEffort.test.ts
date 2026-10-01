import { describe, expect, it } from "vitest";
import { reasoningEffortFor } from "./engine";

describe("reasoningEffortFor", () => {
  const flash = { provider: "gemini", model: "gemini-3.8-flash" };
  it("defaults to low for gemini flash", () => {
    expect(reasoningEffortFor(flash, undefined)).toBe("low");
  });
  it("honours medium and high, and treats unknown values as low", () => {
    expect(reasoningEffortFor(flash, "medium")).toBe("medium");
    expect(reasoningEffortFor(flash, "HIGH")).toBe("high");
    expect(reasoningEffortFor(flash, "turbo")).toBe("low");
  });
  it("sends nothing when switched off", () => {
    expect(reasoningEffortFor(flash, "off")).toBeUndefined();
    expect(reasoningEffortFor(flash, "")).toBeUndefined();
  });
  it("never limits pro models or other providers", () => {
    expect(reasoningEffortFor({ provider: "gemini", model: "gemini-3.1-pro-preview" }, undefined)).toBeUndefined();
    expect(reasoningEffortFor({ provider: "qwen", model: "qwen3.8-max" }, undefined)).toBeUndefined();
    expect(reasoningEffortFor({ provider: "litellm", model: "deepseek" }, undefined)).toBeUndefined();
  });
});

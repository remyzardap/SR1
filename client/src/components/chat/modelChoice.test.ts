import { describe, expect, it } from "vitest";
import { modelIdFor } from "./modelChoice";

const models = [
  { id: "chat-a", hasKey: true, tier: "x" },
  { id: "report-b", hasKey: false, tier: "x" },
  { id: "pro-c", hasKey: true, tier: "x" },
  { id: "venice/u", hasKey: true, tier: "venice" },
];

describe("modelIdFor", () => {
  it("leaves Auto to the router", () => {
    expect(modelIdFor("auto", models)).toBeUndefined();
    expect(modelIdFor("anything", models)).toBeUndefined();
  });
  it("maps Fast to the first keyed model and Best to the last, skipping admin-only ones", () => {
    expect(modelIdFor("fast", models)).toBe("chat-a");
    expect(modelIdFor("best", models)).toBe("pro-c");
  });
  it("falls back to Auto when no model has a key", () => {
    expect(modelIdFor("best", [{ id: "a", hasKey: false }])).toBeUndefined();
    expect(modelIdFor("fast", [])).toBeUndefined();
  });
});

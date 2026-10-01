import { describe, expect, it } from "vitest";
import { routeFor, detectProvider, isAdminOnlyModel, listSelectableModels } from "./kemmaRouter";
import { resolveSettings } from "../kemma/settings";

describe("venice routing", () => {
  it("routes venice/ ids to the venice provider and strips the prefix", () => {
    process.env.VENICE_API_KEY = "k";
    expect(detectProvider("venice/venice-uncensored")).toBe("venice");
    const r = routeFor("venice/venice-uncensored");
    expect(r.model).toBe("venice-uncensored");
    expect(r.baseUrl).toBe("https://api.venice.ai/api/v1");
    expect(r.apiKey).toBe("k");
  });
  it("only admins can pick or even see venice models", () => {
    expect(isAdminOnlyModel("venice/x")).toBe(true);
    const asUser = resolveSettings({}, { model: "venice/venice-uncensored" }, undefined, { isAdmin: false });
    const asAdmin = resolveSettings({}, { model: "venice/venice-uncensored" }, undefined, { isAdmin: true });
    expect(asUser.model).toBe("auto");
    expect(asAdmin.model).toBe("venice/venice-uncensored");
    expect(listSelectableModels(false).some((m) => m.tier === "venice")).toBe(false);
    expect(listSelectableModels(true).some((m) => m.tier === "venice")).toBe(true);
  });
});

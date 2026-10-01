import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// --- Mocked seams -------------------------------------------------------------

const authState = vi.hoisted(() => ({ token: "fake-access-token", projectId: "adc-project" }));

vi.mock("google-auth-library", () => ({
  GoogleAuth: class {
    async getClient() {
      return { getAccessToken: async () => ({ token: authState.token }) };
    }
    async getProjectId() {
      return authState.projectId;
    }
  },
}));

const fsState = vi.hoisted(() => ({ readable: true }));

vi.mock("node:fs", () => ({
  accessSync: vi.fn(() => {
    if (!fsState.readable) throw new Error("ENOENT");
  }),
  constants: { R_OK: 4 },
}));

const OWN_SESSION = "11111111-1111-4111-8111-111111111111";
const OTHER_SESSION = "22222222-2222-4222-8222-222222222222";

const dbState = vi.hoisted(() => ({
  sessionSettings: {} as Record<string, unknown>,
  deletedSessions: [] as string[],
  savedMessages: [] as unknown[],
  settingsUpdates: [] as unknown[],
  executed: [] as unknown[],
  quotaAllowed: true,
}));

vi.mock("../db", () => ({
  getDb: vi.fn(async () => null),
  listChatSessions: vi.fn(async () => [{ id: OWN_SESSION, userId: 1 }]),
  getChatSessionMessages: vi.fn(async () => []),
  createChatSession: vi.fn(async () => "new-id"),
  deleteChatSession: vi.fn(async (sessionId: string) => {
    dbState.deletedSessions.push(sessionId);
  }),
  updateChatSessionTitle: vi.fn(),
  addChatMessage: vi.fn(async () => {
    dbState.savedMessages.push(1);
    return "msg-id";
  }),
  getChatSessionSettings: vi.fn(async () => dbState.sessionSettings),
  updateChatSessionSettings: vi.fn(async (_id: string, _userId: number, settings: unknown) => {
    dbState.settingsUpdates.push(settings);
  }),
  searchChatMessages: vi.fn(async () => []),
}));

vi.mock("../core/quotaCheck", () => ({
  checkQuota: vi.fn(async () =>
    dbState.quotaAllowed ? { allowed: true } : { allowed: false, reason: "Daily message limit reached" }
  ),
  getQuotaSummary: vi.fn(async () => ({ tier: "free" })),
  activateTrial: vi.fn(async () => undefined),
}));

vi.mock("../kemma/engine", () => ({
  kemmaExecute: vi.fn(async (input: unknown) => {
    dbState.executed.push(input);
    return { response: "ok", toolCalls: [], isAgentic: false, tokensUsed: { input: 0, output: 0, total: 0 }, modelsUsed: [], stepsUsed: 1, durationMs: 1, sources: [] };
  }),
}));

vi.mock("../kemma/skillReviews", () => ({
  listSkillStatuses: vi.fn(() => []),
  reviewSkill: vi.fn(),
  setSkillEnabled: vi.fn(),
}));

const ENV_NAMES = [
  "GEMINI_BACKEND", "GOOGLE_APPLICATION_CREDENTIALS", "VERTEX_PROJECT", "VERTEX_LOCATION",
  "KEMMA_MODEL_CHAT", "KEMMA_MODEL_REPORT", "KEMMA_MODEL_LONG_DOC", "KEMMA_MODEL_VISION",
  "KEMMA_MODEL_PRO", "KEMMA_MODEL_FALLBACK", "GEMINI_API_KEY", "QWEN_API_KEY",
  "SONAR_API_KEY", "PERPLEXITY_API_KEY", "LITELLM_API_KEY", "KOBOILLM_API_KEY",
];
const saved = new Map<string, string | undefined>();

beforeEach(() => {
  vi.resetModules();
  for (const name of ENV_NAMES) {
    saved.set(name, process.env[name]);
    delete process.env[name];
  }
  process.env.QWEN_API_KEY = "q";
  fsState.readable = true;
  dbState.sessionSettings = {};
  dbState.deletedSessions = [];
  dbState.savedMessages = [];
  dbState.settingsUpdates = [];
  dbState.executed = [];
  dbState.quotaAllowed = true;
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  saved.clear();
});

async function makeCaller(user: Record<string, unknown> = { id: 1, role: "user", name: "T" }) {
  const { kemmaRouter } = await import("./kemma");
  const ctx = {
    user,
    req: { protocol: "https", headers: {} },
    res: { clearCookie: () => {} },
  } as any;
  return kemmaRouter.createCaller(ctx);
}

// --- availableModels: the picker feed ----------------------------------------

describe("kemma.availableModels hasKey (audit)", () => {
  it("marks gemini slots hasKey=true in vertex mode with no GEMINI_API_KEY", async () => {
    process.env.GEMINI_BACKEND = "vertex";
    process.env.GOOGLE_APPLICATION_CREDENTIALS = "/tmp/private/service-account.json";
    const caller = await makeCaller();
    const models = await caller.availableModels();
    const gemini = models.filter((m) => m.provider === "gemini" || m.tier === "gemini");
    expect(gemini.length).toBeGreaterThan(0);
    expect(gemini.every((m) => m.hasKey)).toBe(true);
    expect(models.some((m) => m.id === "gemini-3.1-pro-preview")).toBe(true);
  });

  it("marks gemini slots hasKey=false on aistudio without a key (picker hides them)", async () => {
    const caller = await makeCaller();
    const models = await caller.availableModels();
    const gemini = models.filter((m) => m.tier === "gemini");
    expect(gemini.length).toBeGreaterThan(0);
    expect(gemini.every((m) => m.hasKey)).toBe(false);
    expect(models.find((m) => m.tier === "qwen")?.hasKey).toBe(true);
  });

  it("marks gemini slots hasKey=true on aistudio with a key", async () => {
    process.env.GEMINI_API_KEY = "studio-key";
    const caller = await makeCaller();
    const models = await caller.availableModels();
    expect(models.filter((m) => m.tier === "gemini").every((m) => m.hasKey)).toBe(true);
  });

  it("rejects anonymous callers (picker data needs a session)", async () => {
    const caller = await makeCaller(null as any);
    await expect(caller.availableModels()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// --- execute: modelOverride and quota ----------------------------------------

describe("kemma.execute model handling (audit)", () => {
  const baseInput = {
    messages: [{ role: "user", content: "hi" }],
    isThinking: false,
    isVoice: false,
  };

  it("never forwards a client-supplied model to the engine, garbage or not", async () => {
    dbState.sessionSettings = { model: "gpt-5-turbo-ultra" };
    const caller = await makeCaller();
    await caller.execute({ ...baseInput, sessionId: OWN_SESSION, settings: { model: "not-a-real-model" } });
    expect(dbState.executed).toHaveLength(1);
    expect((dbState.executed[0] as any).modelOverride).toBeUndefined();
  });

  it("blocks with TOO_MANY_REQUESTS when the daily quota is exhausted", async () => {
    dbState.quotaAllowed = false;
    const caller = await makeCaller();
    await expect(caller.execute(baseInput)).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
    expect(dbState.executed).toHaveLength(0);
  });

  it("filters unapproved skills before calling the engine", async () => {
    // getDb mocked to null above: skill lookup is skipped entirely, so the
    // engine receives an empty skill list even if the client pins ids.
    const caller = await makeCaller();
    await caller.execute({ ...baseInput, settings: { taggedSkills: [7, 8] } });
    expect((dbState.executed[0] as any).skills).toEqual([]);
  });
});

// --- updateSessionSettings: what does the server accept? --------------------

describe("kemma.updateSessionSettings validation (audit)", () => {
  it("currently accepts an arbitrary model string and unknown extra keys", async () => {
    const caller = await makeCaller();
    const result = await caller.updateSessionSettings({
      sessionId: OWN_SESSION,
      settings: { model: "definitely-not-a-real-model", bogusKey: { nested: true } },
    });
    expect(result).toEqual({ success: true });
    // Documents the garbage-in hole: nothing validates model against
    // listSelectableModels(); it is harmless only because resolveSettings
    // ignores the stored model at execute time.
    expect((dbState.settingsUpdates[0] as any).model).toBe("definitely-not-a-real-model");
  });

  it("validates the mode enum and rejects invalid values", async () => {
    const caller = await makeCaller();
    await expect(
      caller.updateSessionSettings({ sessionId: OWN_SESSION, settings: { mode: "ultra" as any } })
    ).rejects.toBeTruthy();
  });

  it("rejects a non-uuid sessionId", async () => {
    const caller = await makeCaller();
    await expect(
      caller.updateSessionSettings({ sessionId: "not-a-uuid", settings: {} })
    ).rejects.toBeTruthy();
  });
});

// --- Ownership checks on session procedures ---------------------------------

describe("kemma session ownership (audit)", () => {
  it("getMessages refuses another user's session", async () => {
    const caller = await makeCaller();
    await expect(caller.getMessages({ sessionId: OTHER_SESSION })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("getSessionSettings refuses another user's session", async () => {
    const caller = await makeCaller();
    await expect(caller.getSessionSettings({ sessionId: OTHER_SESSION })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("saveMessage refuses another user's session", async () => {
    const caller = await makeCaller();
    await expect(
      caller.saveMessage({ sessionId: OTHER_SESSION, role: "user", content: "x" })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(dbState.savedMessages).toHaveLength(0);
  });

  it("deleteSession refuses another user's session without touching the db", async () => {
    const caller = await makeCaller();
    await expect(caller.deleteSession({ sessionId: OTHER_SESSION })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // The db helper deletes chat_messages BEFORE filtering by userId, so a
    // missing pre-check lets one user wipe another user's message rows.
    expect(dbState.deletedSessions).toHaveLength(0);
  });

  it("deleteSession on own session succeeds", async () => {
    const caller = await makeCaller();
    await expect(caller.deleteSession({ sessionId: OWN_SESSION })).resolves.toEqual({ success: true });
    expect(dbState.deletedSessions).toEqual([OWN_SESSION]);
  });
});

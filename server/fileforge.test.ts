import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import { COOKIE_NAME } from "../shared/const";
import type { TrpcContext } from "./_core/context";

// ─── Shared test helpers ──────────────────────────────────────────────────────

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function makeUser(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 1,
    openId: "test-user-openid",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
}

type CookieCall = { name: string; options: Record<string, unknown> };

function createAuthContext(user?: AuthenticatedUser): {
  ctx: TrpcContext;
  clearedCookies: CookieCall[];
} {
  const clearedCookies: CookieCall[] = [];
  const ctx: TrpcContext = {
    user: user ?? makeUser(),
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: (name: string, options: Record<string, unknown>) => {
        clearedCookies.push({ name, options });
      },
    } as TrpcContext["res"],
  };
  return { ctx, clearedCookies };
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe("auth.logout", () => {
  it("clears the session cookie and reports success", async () => {
    const { ctx, clearedCookies } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(clearedCookies).toHaveLength(1);
    expect(clearedCookies[0]?.name).toBe(COOKIE_NAME);
    expect(clearedCookies[0]?.options).toMatchObject({ maxAge: -1 });
  });

  it("auth.me returns the current user", async () => {
    const user = makeUser({ name: "Alice" });
    const { ctx } = createAuthContext(user);
    const caller = appRouter.createCaller(ctx);
    const me = await caller.auth.me();
    expect(me?.name).toBe("Alice");
  });
});

// ─── Files router tests ───────────────────────────────────────────────────────

describe("files router", () => {
  // Mock db and llm modules
  vi.mock("./db", () => ({
    getFilesByUser: vi.fn().mockResolvedValue([
      {
        id: 1,
        userId: 1,
        name: "Test Report",
        originalPrompt: "A test report",
        format: "pdf",
        styleLabel: "Minimal Clean",
        fileKey: "user-1/files/test.pdf",
        fileUrl: "https://cdn.example.com/test.pdf",
        fileSizeBytes: 1024,
        mimeType: "application/pdf",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]),
    getFileById: vi.fn().mockResolvedValue({
      id: 1,
      userId: 1,
      name: "Test Report",
      originalPrompt: "A test report",
      format: "pdf",
      styleLabel: "Minimal Clean",
      fileKey: "user-1/files/test.pdf",
      fileUrl: "https://cdn.example.com/test.pdf",
      fileSizeBytes: 1024,
      mimeType: "application/pdf",
      createdAt: new Date(),
      updatedAt: new Date(),
    }),
    renameFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue({
      id: 1,
      userId: 1,
      name: "Test Report",
      fileKey: "user-1/files/test.pdf",
    }),
    createFile: vi.fn().mockResolvedValue({}),
  }));

  it("files.list returns user files", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const files = await caller.files.list();
    expect(Array.isArray(files)).toBe(true);
    expect(files[0]?.name).toBe("Test Report");
  });

  it("files.rename returns success", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.files.rename({ id: 1, name: "Renamed Report" });
    expect(result).toEqual({ success: true });
  });

  it("files.delete returns success", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.files.delete({ id: 1 });
    expect(result).toEqual({ success: true });
  });

  it("files.getById returns the file", async () => {
    const { ctx } = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const file = await caller.files.getById({ id: 1 });
    expect(file.name).toBe("Test Report");
  });
});

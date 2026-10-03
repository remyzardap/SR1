import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { AddressInfo } from "net";
import speakeasy from "speakeasy";

const db = vi.hoisted(() => ({
  getUserById: vi.fn(),
}));
vi.mock("../db", () => db);

import { allowedModes, codeProjects, codeSessionsGate, codeSessionsRouter, extractAttachments } from "./codeSessions";

const on = { CODE_SESSIONS_ENABLED: "1", CODE_SESSIONS_URL: "http://x", CODE_SESSIONS_TOKEN: "t" } as NodeJS.ProcessEnv;

describe("codeSessionsGate", () => {
  it("lets only an admin with two-factor in when switched on", () => {
    expect(codeSessionsGate({ role: "admin", totpEnabled: true }, on)).toEqual({ ok: true });
  });
  it("refuses non-admins, a switched-off feature, missing config and accounts without two-factor", () => {
    expect(codeSessionsGate({ role: "user", totpEnabled: true }, on)).toMatchObject({ ok: false, reason: "admin" });
    expect(codeSessionsGate({ role: "admin", totpEnabled: true }, { ...on, CODE_SESSIONS_ENABLED: "0" })).toMatchObject({ reason: "disabled" });
    expect(codeSessionsGate({ role: "admin", totpEnabled: true }, { ...on, CODE_SESSIONS_TOKEN: "" })).toMatchObject({ reason: "unconfigured" });
    expect(codeSessionsGate({ role: "admin", totpEnabled: false }, on)).toMatchObject({ reason: "2fa" });
    expect(codeSessionsGate(undefined, on)).toMatchObject({ ok: false });
  });
});

describe("codeProjects", () => {
  it("defaults to the Sutaeru repo and only accepts folders under /root", () => {
    expect(codeProjects({} as NodeJS.ProcessEnv)).toEqual({ sutaeru: "/root/sr1" });
    expect(codeProjects({ CODE_SESSIONS_PROJECTS: "a:/root/a, b:/etc, c:/root/c" } as NodeJS.ProcessEnv)).toEqual({ a: "/root/a", c: "/root/c" });
  });
});

describe("allowedModes", () => {
  it("only allows read and edit by default", () => {
    expect(allowedModes({} as NodeJS.ProcessEnv)).toEqual(new Set(["read", "edit"]));
    expect(allowedModes({ CODE_SESSIONS_FULL: "0" } as NodeJS.ProcessEnv)).toEqual(new Set(["read", "edit"]));
  });
  it("includes full when CODE_SESSIONS_FULL is 1", () => {
    expect(allowedModes({ CODE_SESSIONS_FULL: "1" } as NodeJS.ProcessEnv)).toEqual(new Set(["read", "edit", "full"]));
  });
});

describe("extractAttachments", () => {
  const device = (name: string, content: string) => ({
    source: "device" as const,
    filename: name,
    mediaType: "text/plain",
    dataUrl: "data:text/plain;base64," + Buffer.from(content).toString("base64"),
  });

  it("returns empty object when no attachments are present", async () => {
    const res = await extractAttachments({ body: {} } as any);
    expect(res).toEqual({});
  });

  it("extracts and validates device attachments", async () => {
    const res = await extractAttachments({
      body: { attachments: [device("test.txt", "hello world")] },
    } as any);
    expect(res.error).toBeUndefined();
    expect(res.attachments).toHaveLength(1);
    expect(res.attachments![0].filename).toBe("test.txt");
    expect(res.attachments![0].mediaType).toBe("text/plain");
  });

  it("rejects more than 5 attachments with 400", async () => {
    const files = [1, 2, 3, 4, 5, 6].map((i) => device(`f${i}.txt`, `content ${i}`));
    const res = await extractAttachments({ body: { attachments: files } } as any);
    expect(res.error?.status).toBe(400);
    expect(res.error?.message).toMatch(/Up to 5 files/);
  });

  it("rejects attachment over 10 MB with 413", async () => {
    const bigB64 = "data:text/plain;base64," + Buffer.alloc(11 * 1024 * 1024, "a").toString("base64");
    const res = await extractAttachments({
      body: { attachments: [{ source: "device", filename: "big.txt", mediaType: "text/plain", dataUrl: bigB64 }] },
    } as any);
    expect(res.error?.status).toBe(413);
  });

  it("rejects attachments exceeding 20 MB total with 413", async () => {
    const eightMb = "data:text/plain;base64," + Buffer.alloc(8 * 1024 * 1024, "a").toString("base64");
    const res = await extractAttachments({
      body: {
        attachments: [
          { source: "device", filename: "a.txt", mediaType: "text/plain", dataUrl: eightMb },
          { source: "device", filename: "b.txt", mediaType: "text/plain", dataUrl: eightMb },
          { source: "device", filename: "c.txt", mediaType: "text/plain", dataUrl: eightMb },
        ],
      },
    } as any);
    expect(res.error?.status).toBe(413);
    expect(res.error?.message).toMatch(/20 MB/);
  });
});

describe("codeSessions HTTP routes", () => {
  let server: import("http").Server;
  let base = "";
  let user: any = { id: 1, role: "admin", totpEnabled: true };
  let fetchSpy: any;
  const totpSecret = speakeasy.generateSecret({ length: 20 }).base32;

  beforeEach(async () => {
    user = { id: 1, role: "admin", totpEnabled: true };
    db.getUserById.mockResolvedValue({ id: 1, role: "admin", totpEnabled: true, totpSecret });

    vi.stubEnv("CODE_SESSIONS_ENABLED", "1");
    vi.stubEnv("CODE_SESSIONS_URL", "http://127.0.0.1:8789");
    vi.stubEnv("CODE_SESSIONS_TOKEN", "mock-token");
    vi.stubEnv("CODE_SESSIONS_FULL", "0");

    const realFetch = globalThis.fetch;
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url: any, init: any) => {
      const urlStr = String(url);
      if (urlStr.includes("8789")) {
        if (urlStr.includes("/health")) {
          return new Response(JSON.stringify({ ok: true, providers: ["anthropic"] }), { status: 200 });
        }
        if (urlStr.includes("/sessions") && init?.method === "POST") {
          return new Response(JSON.stringify({ id: "mock-session-id", status: "running" }), { status: 200 });
        }
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return realFetch(url, init);
    });

    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      (req as any).user = user;
      next();
    });
    app.use("/api/admin/code-sessions", codeSessionsRouter);
    await new Promise<void>((r) => {
      server = app.listen(0, "127.0.0.1", () => r());
    });
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/admin/code-sessions`;
  });

  afterEach(async () => {
    await new Promise((r) => server.close(r));
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe("GET /status", () => {
    it("reports fullAvailable=false and 2 modes when CODE_SESSIONS_FULL is not 1", async () => {
      const res = await fetch(`${base}/status`);
      const body = await res.json();
      expect(body.fullAvailable).toBe(false);
      expect(body.modes).toEqual(["read", "edit"]);
    });

    it("reports fullAvailable=true and 3 modes when CODE_SESSIONS_FULL=1", async () => {
      vi.stubEnv("CODE_SESSIONS_FULL", "1");
      const res = await fetch(`${base}/status`);
      const body = await res.json();
      expect(body.fullAvailable).toBe(true);
      expect(body.modes).toEqual(["read", "edit", "full"]);
    });
  });

  describe("POST / with mode=full", () => {
    it("refuses mode=full when CODE_SESSIONS_FULL is not 1", async () => {
      const res = await fetch(`${base}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Do something risky", mode: "full" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/Mode must be read or edit/);
    });

    it("refuses mode=full without a totp code when enabled", async () => {
      vi.stubEnv("CODE_SESSIONS_FULL", "1");
      const res = await fetch(`${base}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Do something risky", mode: "full" }),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toMatch(/6-digit two-factor code is required/);
    });

    it("refuses mode=full with invalid totp code", async () => {
      vi.stubEnv("CODE_SESSIONS_FULL", "1");
      const res = await fetch(`${base}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Do something risky", mode: "full", totp: "000000" }),
      });
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toMatch(/Invalid two-factor code/);
    });

    it("accepts mode=full with valid totp code, defaults budget to $3, and passes mode to daemon", async () => {
      vi.stubEnv("CODE_SESSIONS_FULL", "1");
      const code = speakeasy.totp({ secret: totpSecret, encoding: "base32" });
      const res = await fetch(`${base}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Run full speed", mode: "full", totp: code }),
      });
      expect(res.status).toBe(200);

      // Verify what was sent to daemon
      const daemonCall = fetchSpy.mock.calls.find((c: any) => String(c[0]).includes("/sessions") && c[1]?.method === "POST");
      expect(daemonCall).toBeDefined();
      const daemonBody = JSON.parse(daemonCall[1].body);
      expect(daemonBody.mode).toBe("full");
      expect(daemonBody.budget_usd).toBe(3);
    });
  });

  describe("POST / with attachments", () => {
    it("passes attachments through to daemon", async () => {
      const deviceFile = {
        source: "device",
        filename: "config.txt",
        mediaType: "text/plain",
        dataUrl: "data:text/plain;base64," + Buffer.from('{"key":"value"}').toString("base64"),
      };
      const res = await fetch(`${base}/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: "Inspect config", mode: "read", attachments: [deviceFile] }),
      });
      expect(res.status).toBe(200);

      const daemonCall = fetchSpy.mock.calls.find((c: any) => String(c[0]).includes("/sessions") && c[1]?.method === "POST");
      expect(daemonCall).toBeDefined();
      const daemonBody = JSON.parse(daemonCall[1].body);
      expect(daemonBody.attachments).toHaveLength(1);
      expect(daemonBody.attachments[0].filename).toBe("config.txt");
      expect(daemonBody.attachments[0].mediaType).toBe("text/plain");
      expect(daemonBody.attachments[0].dataUrl).toBe(deviceFile.dataUrl);
    });
  });
});

import { describe, expect, it } from "vitest";
import { codeProjects, codeSessionsGate } from "./codeSessions";

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

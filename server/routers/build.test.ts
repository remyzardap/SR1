import { describe, it, expect, vi, beforeEach } from "vitest";
import type { TrpcContext } from "../_core/context";

const llm = vi.hoisted(() => {
  class LlmUnavailableError extends Error {}
  return { complete: vi.fn(), LlmUnavailableError };
});
vi.mock("../lib/fnLlm", () => llm);

import { buildRouter } from "./build";

function ctx(user: boolean): TrpcContext {
  return {
    user: user ? ({ id: 7, role: "user" } as unknown as NonNullable<TrpcContext["user"]>) : null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  } as TrpcContext;
}

const files = { "/App.js": "export default function App() {\n  return <h1>Hello</h1>;\n}\n" };

describe("build.edit", () => {
  beforeEach(() => {
    llm.complete.mockReset();
  });

  it("returns the reply and only the changed files", async () => {
    llm.complete.mockResolvedValue({
      text: '<reply>Changed the title.</reply><edit path="/App.js"><find><h1>Hello</h1></find><replace><h1>Hi</h1></replace></edit><file path="/Card.js">export const Card = 1;</file>',
    });
    const out = await buildRouter.createCaller(ctx(true)).edit({ files, instruction: "Say hi" });
    expect(out.reply).toBe("Changed the title.");
    expect(out.changed["/App.js"]).toContain("<h1>Hi</h1>");
    expect(out.changed["/Card.js"]).toBe("export const Card = 1;");
    expect(out.skipped).toEqual([]);
    const [messages, opts] = llm.complete.mock.calls[0];
    expect(messages[0].role).toBe("system");
    expect(messages.at(-1).content).toContain('<current path="/App.js">');
    expect(opts).toMatchObject({ userId: 7, purpose: "build_edit" });
  });

  it("needs a signed-in person", async () => {
    await expect(buildRouter.createCaller(ctx(false)).edit({ files, instruction: "x" })).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(llm.complete).not.toHaveBeenCalled();
  });

  it("refuses projects that are too large", async () => {
    const big: Record<string, string> = {};
    for (let i = 0; i < 61; i++) big[`/f${i}.js`] = "x";
    await expect(buildRouter.createCaller(ctx(true)).edit({ files: big, instruction: "x" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("says plainly when no model is configured", async () => {
    llm.complete.mockRejectedValue(new llm.LlmUnavailableError("none"));
    await expect(buildRouter.createCaller(ctx(true)).edit({ files, instruction: "x" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
      message: "No model is set up for Build mode.",
    });
  });
});

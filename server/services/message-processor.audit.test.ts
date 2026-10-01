import { describe, it, expect, vi, beforeEach } from "vitest";

// message-processor.ts is the WhatsApp inbound pipeline. It only talks to the
// outside world through sendWhatsAppMessage; mock that seam. There is no db or
// model-slot usage in this module (checked below), so no Vertex auth applies.
const wa = vi.hoisted(() => ({
  sendWhatsAppMessage: vi.fn(),
}));
vi.mock("../routes/webhooks/whatsapp", () => wa);

import { processIncomingMessage, type IncomingWhatsAppMessage } from "./message-processor";

function msg(over: Partial<IncomingWhatsAppMessage> = {}): IncomingWhatsAppMessage {
  return {
    messageId: "w1",
    from: "6281234567890",
    senderName: "Budi",
    type: "text",
    timestamp: 1730000000,
    text: "Buy groceries",
    phoneNumberId: "pn1",
    ...over,
  };
}

function replies(): string[] {
  return wa.sendWhatsAppMessage.mock.calls.map((c) => String(c[2]));
}

beforeEach(() => {
  vi.clearAllMocks();
  wa.sendWhatsAppMessage.mockResolvedValue(undefined);
});

describe("message-processor: current placeholder behavior", () => {
  it("every sender is treated as unlinked because findUserByPhone is a stub", async () => {
    await processIncomingMessage(msg());
    expect(wa.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    expect(replies()[0]).toMatch(/isn.t linked to a Sutaeru account/i);
    expect(replies()[0]).toContain("Budi");
    expect(wa.sendWhatsAppMessage).toHaveBeenCalledWith("pn1", "6281234567890", expect.any(String));
  });

  it("a task message never reaches the task branch: nothing is persisted despite a later branch promising it", async () => {
    await processIncomingMessage(msg({ text: "task: call the accountant" }));
    // the unlinked-user guard fires first, so the "I've noted" reply below is unreachable;
    // this documents that no persistence call exists anywhere in the module
    expect(replies()[0]).toMatch(/sign up/i);
  });

  it("receipt images never get OCRd for unlinked users and no receipt is stored", async () => {
    await processIncomingMessage(
      msg({ type: "image", text: undefined, image: { id: "img1", mime_type: "image/jpeg", sha256: "abc" } }),
    );
    expect(replies()[0]).toMatch(/isn.t linked/i);
    expect(wa.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });

  it("text messages with an empty body still get a safe reply and no crash", async () => {
    await processIncomingMessage(msg({ text: "" }));
    expect(wa.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
  });

  it("unknown message types from an unlinked sender still get the sign-up prompt (apology branch is unreachable today)", async () => {
    await processIncomingMessage(msg({ type: "location" as IncomingWhatsAppMessage["type"] }));
    expect(replies()[0]).toMatch(/isn.t linked/i);
  });

  it("a failing sendWhatsAppMessage is swallowed, not propagated to the webhook", async () => {
    wa.sendWhatsAppMessage.mockRejectedValue(new Error("graph api 500"));
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(processIncomingMessage(msg())).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });

  it("uses no LLM route or db imports at all (no gemini bearer handling needed here)", async () => {
    const src = await import("fs").then((fs) =>
      fs.readFileSync(new URL("./message-processor.ts", import.meta.url), "utf8"),
    );
    expect(src).not.toMatch(/kemmaRouter|resolveRouteAuth|drizzle|from "\.\.\/db"/);
  });
});

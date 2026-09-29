import { describe, it, expect } from "vitest";
import {
  FnError,
  actionOf,
  asRecord,
  optionalText,
  requireBoolean,
  requireIntegerId,
  requireOneOf,
  requireStringId,
  requireText,
  safeLabel,
  sendError,
  unknownAction,
} from "./shared";

const FREQ = ["daily", "weekly"] as const;

function fakeRes() {
  const res = {
    statusCode: 200,
    body: null as unknown,
    headersSent: false,
    ended: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
    end() {
      this.ended = true;
    },
  };
  return res;
}

describe("body readers", () => {
  it("rejects a body that is not a JSON object", () => {
    for (const bad of [undefined, null, "text", 42, []]) {
      expect(() => asRecord(bad)).toThrowError(FnError);
    }
    expect(() => asRecord([])).toThrowError("A JSON body is required.");
  });

  it("reads the action selector", () => {
    expect(actionOf({ action: " list " })).toBe("list");
    expect(() => actionOf({})).toThrowError("Action is required.");
  });

  it("names an unknown action without echoing arbitrary content", () => {
    let message = "";
    try {
      unknownAction("dr0p table; ../../etc/passwd");
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toBe("Unknown action: dr0ptableetcpasswd");
    expect(message).not.toMatch(/[;/]/);
  });

  it("caps text fields on both ends", () => {
    expect(requireText({ topic: "  nickel policy  " }, "topic", 50)).toBe("nickel policy");
    expect(() => requireText({ topic: "abc" }, "topic", 50, 5)).toThrowError("Topic is too short.");
    expect(() => requireText({ topic: "x".repeat(51) }, "topic", 50)).toThrowError("Topic is too long (max 50).");
    expect(() => requireText({}, "topic", 50)).toThrowError("Topic is required.");
  });

  it("treats an oversized optional field as a payload too large", () => {
    expect(optionalText({ text: "hello" }, "text", 100)).toBe("hello");
    expect(optionalText({ text: "" }, "text", 100)).toBeUndefined();
    expect(() => optionalText({ text: "x".repeat(101) }, "text", 100)).toThrowError("Text is too large (max 100).");
  });

  it("requires real booleans", () => {
    expect(requireBoolean({ active: false }, "active")).toBe(false);
    expect(() => requireBoolean({ active: "false" }, "active")).toThrowError("Active is required.");
  });

  it("accepts numeric ids and the numeric string form", () => {
    expect(requireIntegerId({ id: 12 }, "id")).toBe(12);
    expect(requireIntegerId({ id: "12" }, "id")).toBe(12);
    for (const bad of [0, -1, 1.5, "0", "abc", undefined, true]) {
      expect(() => requireIntegerId({ id: bad }, "id")).toThrowError("Id is not valid.");
    }
  });

  it("limits an opaque id to something safe", () => {
    expect(requireStringId({ id: "c3c1a2b0-1111" }, "id")).toBe("c3c1a2b0-1111");
    expect(() => requireStringId({ id: "x".repeat(65) }, "id")).toThrowError();
  });

  it("only allows the cadences the client offers", () => {
    expect(requireOneOf(" daily ", FREQ, "frequency")).toBe("daily");
    expect(() => requireOneOf("hourly", FREQ, "frequency")).toThrowError("Frequency is not valid.");
    expect(() => requireOneOf(undefined, FREQ, "frequency")).toThrowError("Frequency is required.");
  });

  it("strips a label before putting it in a message", () => {
    expect(safeLabel('a"b\nc<script>')).toBe("abcscript");
    expect(safeLabel("y".repeat(60))).toHaveLength(40);
  });
});

describe("sendError", () => {
  it("returns the { error } body the client parses", () => {
    const res = fakeRes();
    sendError(res as never, 400, "Nope.");
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "Nope." });
  });

  it("only closes a stream that already started", () => {
    const res = fakeRes();
    res.headersSent = true;
    sendError(res as never, 500, "Nope.");
    expect(res.statusCode).toBe(200);
    expect(res.ended).toBe(true);
  });
});

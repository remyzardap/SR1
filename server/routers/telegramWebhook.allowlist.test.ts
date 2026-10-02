import { describe, expect, it } from "vitest";
import { isTelegramUserAllowed } from "./telegramWebhook";

describe("isTelegramUserAllowed", () => {
  it("allows only listed numeric ids", () => {
    expect(isTelegramUserAllowed(12345, "12345,67890")).toBe(true);
    expect(isTelegramUserAllowed("67890", " 12345 , 67890 ")).toBe(true);
    expect(isTelegramUserAllowed(555, "12345,67890")).toBe(false);
  });
  it("allows nobody when the list is empty or unset", () => {
    expect(isTelegramUserAllowed(12345, "")).toBe(false);
    expect(isTelegramUserAllowed(12345, undefined)).toBe(false);
  });
  it("rejects missing or non-numeric ids, and does not match partial ids", () => {
    expect(isTelegramUserAllowed(undefined, "12345")).toBe(false);
    expect(isTelegramUserAllowed("abc", "abc")).toBe(false);
    expect(isTelegramUserAllowed(1234, "12345")).toBe(false);
    expect(isTelegramUserAllowed("12345 ", "12345")).toBe(true);
  });
});

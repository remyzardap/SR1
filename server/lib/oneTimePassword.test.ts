/**
 * T-84: the one-time password an admin hands to a newly created account. These tests pin the
 * unpredictability contract: long enough to be a real credential, drawn from an alphabet without
 * the characters people misread aloud, and generated without Math.random.
 */
import { readFileSync } from "fs";
import { describe, expect, it, vi } from "vitest";
import {
  generateOneTimePassword,
  OTP_ALPHABET,
  OTP_LENGTH,
  OTP_MIN_LENGTH,
} from "./oneTimePassword";

describe("generateOneTimePassword", () => {
  it("returns 20 characters drawn from the documented alphabet", () => {
    const otp = generateOneTimePassword();
    expect(otp).toHaveLength(OTP_LENGTH);
    expect(OTP_ALPHABET).toHaveLength(56);
    for (const char of otp) expect(OTP_ALPHABET.includes(char)).toBe(true);
  });

  it("excludes the look-alike characters 0 O o 1 l I", () => {
    for (const excluded of ["0", "O", "o", "1", "l", "I"]) {
      expect(OTP_ALPHABET).not.toContain(excluded);
    }
    for (let i = 0; i < 100; i++) {
      expect(generateOneTimePassword()).not.toMatch(/[0Oo1lI]/);
    }
  });

  it("is at least 16 characters, the floor the acceptance criteria set", () => {
    expect(OTP_LENGTH).toBeGreaterThanOrEqual(OTP_MIN_LENGTH);
    expect(generateOneTimePassword().length).toBeGreaterThanOrEqual(16);
  });

  it("refuses to generate a password shorter than the floor", () => {
    expect(() => generateOneTimePassword(6)).toThrow(/at least 16/);
    expect(() => generateOneTimePassword(OTP_MIN_LENGTH)).not.toThrow();
  });

  it("never produces the same value twice", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateOneTimePassword());
    expect(seen.size).toBe(500);
  });

  it("reaches every character of the alphabet across a realistic number of draws", () => {
    // A biased draw (wrong modulus, truncated range) shows up as unreachable tail characters.
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      for (const char of generateOneTimePassword()) seen.add(char);
    }
    expect(seen.size).toBe(OTP_ALPHABET.length);
  });

  it("uses crypto.randomInt and never a non-crypto RNG", () => {
    const source = readFileSync(new URL("./oneTimePassword.ts", import.meta.url), "utf-8");
    expect(source).toMatch(/from "crypto"/);
    expect(source).toContain("randomInt(");
    expect(source).not.toMatch(/Math\.random\(/);

    const mathRandom = vi.spyOn(Math, "random");
    generateOneTimePassword();
    expect(mathRandom).not.toHaveBeenCalled();
    mathRandom.mockRestore();
  });
});

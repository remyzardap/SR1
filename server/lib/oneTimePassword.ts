/**
 * One-time passwords for admin-managed accounts (T-84).
 *
 * An admin hands the value over out-of-band and the holder has to replace it before doing anything
 * else, so a good OTP is hard to guess *and* easy to read aloud: 20 characters drawn from a
 * 56-character alphabet with the look-alike pairs (0/O/o, 1/l/I) removed — about 116 bits.
 *
 * Drawn with crypto.randomInt, never a non-crypto RNG: this is a credential, so an unpredictable
 * draw is part of the contract.
 */
import { randomInt } from "crypto";

/** Look-alike characters are excluded: 0 O o 1 l I. */
export const OTP_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export const OTP_LENGTH = 20;

/** Floor the acceptance criteria set for admin-issued credentials. */
export const OTP_MIN_LENGTH = 16;

export function generateOneTimePassword(length: number = OTP_LENGTH): string {
  if (length < OTP_MIN_LENGTH) {
    throw new Error(`One-time passwords must be at least ${OTP_MIN_LENGTH} characters`);
  }
  let out = "";
  for (let i = 0; i < length; i++) {
    out += OTP_ALPHABET[randomInt(OTP_ALPHABET.length)];
  }
  return out;
}

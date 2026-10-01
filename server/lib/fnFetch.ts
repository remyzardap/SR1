/**
 * Guarded outbound fetch for file references handed to us by the client.
 *
 * Only http and https to public addresses: no loopback, private, link-local or
 * carrier-grade NAT ranges, no cloud metadata hostnames, and redirects are
 * followed by hand so every hop is checked again. Responses are read with a
 * byte cap.
 */

import { lookup } from "node:dns/promises";
import { FnError } from "./fnErrors";

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_REFERENCE_FILES = 5;
const MAX_REDIRECTS = 3;

/**
 * v6 blocks we treat as private: unspecified and loopback, unique-local
 * fc00::/7, link-local fe80::/10, multicast ff00::/8, and every address that
 * forwards to a private IPv4.
 */
function isPrivateAddressV6(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return isPrivateAddress(mapped[1]);

  const groups = expandV6(ip);
  if (!groups) return true; // unparsable is never fetched

  // new URL() rewrites [::ffff:127.0.0.1] into the hex form [::ffff:7f00:1] before this
  // runs, and Linux connects a mapped address to that IPv4. 6to4 carries one in its
  // second and third groups. What they embed is what actually gets reached.
  const embedded = embeddedV4(groups);
  if (embedded) return isPrivateAddress(embedded);

  const first = groups[0];
  const isZero = groups.every((group) => group === 0);
  if (isZero) return true; // ::
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true; // ::1 and its expanded form
  if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((first & 0xff00) === 0xff00) return true; // ff00::/8 multicast and reserved
  return false;
}

/**
 * The IPv4 an v6 address hands traffic to, or null when it carries none: the
 * v4-mapped ::ffff:0:0/96 form (what URL writes for a dotted mapped address), the
 * obsolete ::/96 form, 6to4 2002::/16 and the NAT64 well-known prefix 64:ff9b::/96.
 * A mapped loopback is loopback as surely as the dotted one, so the caller runs the
 * v4 rules on the address inside it.
 */
function embeddedV4(groups: number[]): string | null {
  const low = (high: number, tail: number) => `${high >> 8}.${high & 0xff}.${tail >> 8}.${tail & 0xff}`;
  const zero = (from: number, to: number) => groups.slice(from, to).every((group) => group === 0);

  if (groups[0] === 0x2002) return low(groups[1], groups[2]); // 6to4 2002::/16
  if (groups[5] === 0xffff && zero(0, 5)) return low(groups[6], groups[7]); // ::ffff:0:0/96
  if (groups[6] !== 0 && zero(0, 6)) return low(groups[6], groups[7]); // ::/96, the obsolete form
  if (groups[0] === 0x0064 && groups[1] === 0xff9b && zero(2, 6)) return low(groups[6], groups[7]); // NAT64 64:ff9b::/96
  return null;
}

/** Eight 16 bit groups, with the :: compression filled in. Null when malformed. */
function expandV6(ip: string): number[] | null {
  if (!/^[0-9a-f:.]+$/.test(ip)) return null;
  if (ip.includes(".")) return null; // v4 and v4-mapped forms are handled by the caller

  const parts = ip.split("::");
  if (parts.length > 2) return null;
  const head = parts[0] === "" ? [] : parts[0].split(":");
  const tail = parts.length === 2 ? (parts[1] === "" ? [] : parts[1].split(":")) : [];

  const toGroups = (words: string[]): number[] | null => {
    const out: number[] = [];
    for (const word of words) {
      if (!/^[0-9a-f]{1,4}$/.test(word)) return null;
      out.push(Number.parseInt(word, 16));
    }
    return out;
  };

  const headGroups = toGroups(head);
  const tailGroups = toGroups(tail);
  if (!headGroups || !tailGroups) return null;

  if (parts.length === 1) return headGroups.length === 8 ? headGroups : null;
  const total = headGroups.length + tailGroups.length;
  if (total > 7) return null; // :: must stand for at least one group
  return [...headGroups, ...new Array(8 - total).fill(0), ...tailGroups];
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata", "metadata.google.internal"]);

/** True for addresses we must never fetch: loopback, private, link-local, reserved. */
export function isPrivateAddress(address: string): boolean {
  const ip = address.trim().toLowerCase();
  if (ip.includes(":")) return isPrivateAddressV6(ip);
  const octets = ip.split(".").map((part) => Number(part));
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10
  if (a === 169 && b === 254) return true; // link-local, includes 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast and reserved
  return false;
}

/** Rejects anything but a public http(s) URL. Returns the validated URL object. */
export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FnError(400, "A file reference is not a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FnError(400, "File references must be http or https URLs.");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (BLOCKED_HOSTNAMES.has(host) || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new FnError(400, "That file reference is not allowed.");
  }
  if (/^\d+$/.test(host)) throw new FnError(400, "That file reference is not allowed."); // bare integer
  if (host.includes(":") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    if (isPrivateAddress(host)) throw new FnError(400, "That file reference is not allowed.");
    return url;
  }
  let addresses: Array<{ address: string }>;
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new FnError(400, "That file reference cannot be resolved.");
  }
  if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new FnError(400, "That file reference is not allowed.");
  }
  return url;
}

/**
 * Fetches a reference with redirects checked by hand and a hard byte cap.
 * Returns the bytes and the content type of the final response.
 */
export async function fetchCapped(
  raw: string,
  maxBytes: number = MAX_FILE_BYTES
): Promise<{ buffer: Buffer; contentType: string; bytes: number }> {
  let url = await assertPublicUrl(raw);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const res = await fetch(url.toString(), {
      method: "GET",
      redirect: "manual",
      headers: { Accept: "*/*" },
    });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      await res.body?.cancel().catch(() => {});
      if (!location) throw new FnError(400, "That file reference could not be read.");
      url = await assertPublicUrl(new URL(location, url).toString());
      continue;
    }
    if (!res.ok) throw new FnError(400, `That file could not be fetched (status ${res.status}).`);

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > maxBytes) throw new FnError(413, "Files up to 10 MB are supported.");

    const buffer = await readCapped(res.body, maxBytes);
    return { buffer, contentType: (res.headers.get("content-type") ?? "").split(";")[0], bytes: buffer.byteLength };
  }

  throw new FnError(400, "That file reference redirected too many times.");
}

async function readCapped(body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new FnError(413, "Files up to 10 MB are supported.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
}

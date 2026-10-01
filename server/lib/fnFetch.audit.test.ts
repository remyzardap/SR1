/**
 * Audit test (area 3): the SSRF guard in server/lib/fnFetch.ts against IPv4 embedded in
 * an IPv6 literal.
 *
 * WHATWG URL parsing (what `new URL()` does in assertPublicUrl) rewrites
 * [::ffff:127.0.0.1] to the hex form [::ffff:7f00:1] before the guard ever sees it, and
 * isPrivateAddressV6 only recognised the dotted form. Node connects a v4-mapped IPv6
 * address to that IPv4 host, so a reference URL of [::ffff:a9fe:a9fe] reaches the same
 * 169.254.169.254 the blocklist was written to keep out.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => dns);

import { assertPublicUrl, fetchCapped, isPrivateAddress } from "./fnFetch";

beforeEach(() => {
  vi.clearAllMocks();
  dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("IPv4 hidden inside an IPv6 literal", () => {
  it("normalises the dotted mapped form into hex before the guard sees it", () => {
    // Why the dotted-only regex in isPrivateAddressV6 is not enough on its own.
    expect(new URL("http://[::ffff:127.0.0.1]/x").hostname).toBe("[::ffff:7f00:1]");
    expect(new URL("http://[::ffff:169.254.169.254]/x").hostname).toBe("[::ffff:a9fe:a9fe]");
  });

  it("calls the hex mapped forms private", () => {
    for (const address of [
      "::ffff:7f00:1", // 127.0.0.1
      "::ffff:a9fe:a9fe", // 169.254.169.254, the cloud metadata address
      "::ffff:0a00:0001", // 10.0.0.1
      "::ffff:c0a8:1", // 192.168.0.1
      "::ffff:6441:a9fe", // 100.65.169.254, inside the CGNAT block
      "::ffff:0:1", // 0.0.0.1
    ]) {
      expect(isPrivateAddress(address), `${address} must not be fetched`).toBe(true);
    }
  });

  it("calls the obsolete v4-compatible forms private too", () => {
    for (const address of ["::7f00:1", "::a9fe:a9fe", "::a00:1"]) {
      expect(isPrivateAddress(address), `${address} must not be fetched`).toBe(true);
    }
  });

  it("still lets a real v6 address through", () => {
    for (const address of ["2001:4860:4860::8888", "::ffff:0101:0101", "2606:4700:4700::1111"]) {
      expect(isPrivateAddress(address), `${address} is public`).toBe(false);
    }
  });

  it("keeps the forms the guard already caught", () => {
    for (const address of ["127.0.0.1", "169.254.169.254", "::1", "::", "fe80::1", "fc00::1", "not an address"]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
  });
});

describe("assertPublicUrl against a mapped address", () => {
  it("refuses a mapped loopback literal without asking DNS", async () => {
    await expect(assertPublicUrl("http://[::ffff:7f00:1]/latest/meta-data")).rejects.toThrow("not allowed");
    await expect(assertPublicUrl("http://[::ffff:a9fe:a9fe]/x")).rejects.toThrow("not allowed");
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("refuses the dotted form as the user types it", async () => {
    await expect(assertPublicUrl("http://[::ffff:127.0.0.1]/x")).rejects.toThrow("not allowed");
  });
});

describe("fetchCapped against a mapped address", () => {
  it("never opens a connection to the IPv4 behind a mapped literal", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCapped("http://[::ffff:7f00:1]:8080/secret")).rejects.toThrow("not allowed");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a redirect that turns into a mapped address", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://[::ffff:a9fe:a9fe]/x" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchCapped("https://files.example.com/start.pdf")).rejects.toThrow("not allowed");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

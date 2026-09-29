import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock("node:dns/promises", () => dns);

import { MAX_FILE_BYTES, assertPublicUrl, fetchCapped, isPrivateAddress } from "./fnFetch";
import { FnError } from "./fnErrors";

const okResponse = (body: BodyInit | null, init?: ResponseInit) => new Response(body, { status: 200, ...init });
const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

beforeEach(() => {
  vi.clearAllMocks();
  dns.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assertPublicUrl", () => {
  it("accepts a public http(s) URL", async () => {
    const url = await assertPublicUrl("https://files.example.com/report.pdf");
    expect(url.hostname).toBe("files.example.com");
    expect(dns.lookup).toHaveBeenCalledWith("files.example.com", { all: true, verbatim: true });
  });

  it("refuses every other scheme", async () => {
    for (const bad of ["file:///etc/passwd", "gopher://example.com", "data:text/plain,hi", "ftp://example.com/f", "//example.com/x"]) {
      await expect(assertPublicUrl(bad)).rejects.toBeInstanceOf(FnError);
    }
  });

  it("refuses local hostnames without asking DNS", async () => {
    for (const bad of ["http://localhost/x", "http://metadata.google.internal/x", "http://db.internal/x", "http://thing.localhost/x"]) {
      await expect(assertPublicUrl(bad)).rejects.toThrow("That file reference is not allowed.");
    }
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("refuses a literal private address", async () => {
    await expect(assertPublicUrl("http://169.254.169.254/latest/meta-data")).rejects.toThrow("not allowed");
    await expect(assertPublicUrl("http://[::1]/x")).rejects.toThrow("not allowed");
    expect(dns.lookup).not.toHaveBeenCalled();
  });

  it("refuses a public name that resolves to a private address", async () => {
    dns.lookup.mockResolvedValueOnce([{ address: "10.0.0.5", family: 4 }]);
    await expect(assertPublicUrl("https://evil.example.com/x")).rejects.toThrow("not allowed");
  });

  it("refuses a name with no answer and a malformed URL", async () => {
    dns.lookup.mockResolvedValueOnce([]);
    await expect(assertPublicUrl("https://nowhere.example")).rejects.toThrow("not allowed");
    await expect(assertPublicUrl("not a url")).rejects.toThrow("A file reference is not a valid URL.");
    // A nonsense IPv4 is rejected by the URL parser itself.
    await expect(assertPublicUrl("https://12.34.56.999/x")).rejects.toThrow("not a valid URL");
  });
});

describe("fetchCapped", () => {
  it("returns the bytes and the content type", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse("hello", { headers: { "content-type": "application/pdf; charset=binary" } })));
    const out = await fetchCapped("https://files.example.com/report.pdf");
    expect(out.buffer.toString()).toBe("hello");
    expect(out.contentType).toBe("application/pdf");
    expect(out.bytes).toBe(5);
    const [url, init] = vi.mocked(fetch).mock.calls[0] as unknown as [string, { redirect: string }];
    expect(url).toBe("https://files.example.com/report.pdf");
    expect(init.redirect).toBe("manual");
  });

  it("follows a redirect to a public target and re-checks it", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redirect("/next.pdf"))
      .mockResolvedValueOnce(redirect("https://other.example.com/two.pdf"))
      .mockResolvedValueOnce(okResponse("final"));
    vi.stubGlobal("fetch", fetchMock);

    const out = await fetchCapped("https://files.example.com/start.pdf");
    expect(out.buffer.toString()).toBe("final");
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[1][0]).toBe("https://files.example.com/next.pdf");
  });

  it("refuses a redirect that lands on a private address", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(redirect("http://169.254.169.254/")));
    await expect(fetchCapped("https://files.example.com/report.pdf")).rejects.toThrow("That file reference is not allowed.");
  });

  it("stops after three redirects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(redirect("https://next.example.com/loop")));
    await expect(fetchCapped("https://files.example.com/report.pdf")).rejects.toThrow("redirected too many times");
  });

  it("refuses a declared size over the cap without reading the body", async () => {
    const body = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(null, { status: 200, headers: { "content-length": String(MAX_FILE_BYTES + 1) } }) as never as Response & { body: unknown }
      )
    );
    await expect(fetchCapped("https://files.example.com/big.pdf")).rejects.toMatchObject({ status: 413 });
    expect(body).not.toHaveBeenCalled();
  });

  it("cuts off a body that streams more than the cap", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < 12; i++) controller.enqueue(chunk);
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(stream, { status: 200 })));
    await expect(fetchCapped("https://files.example.com/big.pdf")).rejects.toMatchObject({
      status: 413,
      message: "Files up to 10 MB are supported.",
    });
  });

  it("lets a small body through untouched", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse("x".repeat(2048))));
    const out = await fetchCapped("https://files.example.com/small.txt");
    expect(out.bytes).toBe(2048);
  });

  it("passes a non-ok status through as a plain rejection", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("gone", { status: 404 })));
    await expect(fetchCapped("https://files.example.com/gone.pdf")).rejects.toThrow("That file could not be fetched (status 404).");
  });
});

describe("isPrivateAddress", () => {
  it("blocks loopback, private and link-local v4 ranges", () => {
    for (const address of [
      "127.0.0.1",
      "127.2.3.4",
      "0.0.0.0",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "100.127.255.255",
      "198.18.0.1",
      "224.0.0.1",
      "240.0.0.1",
    ]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    for (const address of ["93.184.216.34", "172.15.0.1", "172.32.0.1", "100.63.0.1", "100.128.0.1", "8.8.8.8", "198.17.255.1"]) {
      expect(isPrivateAddress(address)).toBe(false);
    }
  });

  it("blocks v6 loopback, unspecified, unique-local and link-local", () => {
    for (const address of ["::1", "::", "fe80::1", "fc00::1234", "fd12:3456::1", "0:0:0:0:0:0:0:1"]) {
      expect(isPrivateAddress(address)).toBe(true);
    }
    expect(isPrivateAddress("2001:4860:4860::8888")).toBe(false);
  });

  it("blocks v4 mapped inside v6 and treats anything unparsable as unsafe", () => {
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateAddress("::ffff:8.8.8.8")).toBe(false);
    expect(isPrivateAddress("not an address")).toBe(true);
    expect(isPrivateAddress("256.1.1.1")).toBe(true);
    expect(isPrivateAddress("1.2.3")).toBe(true);
  });

  it("is wired to the cap the brief set", () => {
    expect(MAX_FILE_BYTES).toBe(10 * 1024 * 1024);
  });
});

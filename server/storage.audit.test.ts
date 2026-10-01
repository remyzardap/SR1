// Audit tests for server/storage.ts (Forge proxy storage helpers).
// Verifies PLAN.md B1: storageGet must return downloaded BYTES, not the
// signed download URL string. All network is mocked; fake creds only.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const ENV_KEYS = ["BUILT_IN_FORGE_API_URL", "BUILT_IN_FORGE_API_KEY"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

function stubForgeEnv() {
  process.env.BUILT_IN_FORGE_API_URL = "https://forge.example.com/api";
  process.env.BUILT_IN_FORGE_API_KEY = "fake-token";
}

describe("storageGet returns bytes, not a URL string (PLAN.md B1)", () => {
  it("resolves to the actual file bytes fetched from the signed URL", async () => {
    stubForgeEnv();
    const pdfBytes = new TextEncoder().encode("%PDF-1.4 fake pdf body").buffer;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        const u = String(url);
        calls.push({ url: u, init });
        if (u.includes("v1/storage/downloadUrl")) {
          return new Response(
            JSON.stringify({ url: "https://cdn.example.com/signed/abc" }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        if (u === "https://cdn.example.com/signed/abc") {
          return new Response(pdfBytes, { status: 200 });
        }
        return new Response("not found", { status: 404 });
      })
    );
    const { storageGet } = await import("./storage");
    const buf = await storageGet("users/1/files/report.pdf");
    expect(Buffer.isBuffer(buf)).toBe(true);
    expect(buf.toString("utf-8")).toBe("%PDF-1.4 fake pdf body");
    // the string "https://cdn.example.com/signed/abc" must NOT be the content
    expect(buf.toString("utf-8")).not.toContain("signed/abc");
    // two hops: downloadUrl resolution, then the actual bytes fetch
    expect(calls.map((c) => c.url)).toEqual([
      "https://forge.example.com/api/v1/storage/downloadUrl?path=users%2F1%2Ffiles%2Freport.pdf",
      "https://cdn.example.com/signed/abc",
    ]);
  });

  it("throws when the signed download URL fetch fails (expired signature)", async () => {
    stubForgeEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        if (u.includes("v1/storage/downloadUrl")) {
          return new Response(JSON.stringify({ url: "https://cdn.example.com/signed/expired" }), { status: 200 });
        }
        return new Response("gone", { status: 403 });
      })
    );
    const { storageGet } = await import("./storage");
    await expect(storageGet("users/1/files/report.pdf")).rejects.toThrow(/Storage download failed \(403/);
  });

  it("never yields a URL or undefined as file content when proxy JSON lacks url", async () => {
    stubForgeEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        if (u.includes("v1/storage/downloadUrl")) {
          // proxy answers 500 with a non-JSON error body. After the fix,
          // buildDownloadUrl checks !response.ok and throws a clear status
          // error instead of a cryptic JSON SyntaxError from response.json().
          return new Response("internal error", { status: 500, statusText: "Server Error" });
        }
        return new Response("should never be fetched", { status: 200 });
      })
    );
    const { storageGet } = await import("./storage");
    await expect(storageGet("users/1/files/report.pdf")).rejects.toThrow(
      /Storage download-url lookup failed \(500/
    );
  });

  it("rejects a 200 download-url response that carries no url field", async () => {
    stubForgeEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        const u = String(url);
        if (u.includes("v1/storage/downloadUrl")) {
          // 200 but malformed payload: no .url. Must not fetch(undefined) or
          // silently treat the key/url as content.
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
        return new Response("unexpected", { status: 200 });
      })
    );
    const { storageGet } = await import("./storage");
    await expect(storageGet("users/1/files/report.pdf")).rejects.toThrow(
      /download-url response did not include a url/
    );
  });

  it("throws a clear message when forge credentials are missing", async () => {
    const { storageGet } = await import("./storage");
    await expect(storageGet("users/1/files/report.pdf")).rejects.toThrow(
      /Storage proxy credentials missing/
    );
  });
});

describe("storagePut", () => {
  it("posts the file to the upload endpoint with the normalized path and returns the proxy url", async () => {
    stubForgeEnv();
    let capturedUrl = "";
    let capturedInit: RequestInit | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        capturedUrl = String(url);
        capturedInit = init;
        return new Response(JSON.stringify({ url: "https://cdn.example.com/stored/report.pdf" }), { status: 200 });
      })
    );
    const { storagePut } = await import("./storage");
    const res = await storagePut("/users/1/files/report.pdf", Buffer.from("%PDF data"), "application/pdf");
    expect(res.key).toBe("users/1/files/report.pdf"); // leading slash normalized away
    expect(res.url).toBe("https://cdn.example.com/stored/report.pdf");
    expect(capturedUrl).toBe("https://forge.example.com/api/v1/storage/upload?path=users%2F1%2Ffiles%2Freport.pdf");
    expect((capturedInit?.headers as Record<string, string>).Authorization).toBe("Bearer fake-token");
  });

  it("throws with status and body when the upload fails", async () => {
    stubForgeEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("quota exceeded", { status: 507 }))
    );
    const { storagePut } = await import("./storage");
    await expect(storagePut("a/b.txt", Buffer.from("x"), "text/plain")).rejects.toThrow(
      /Storage upload failed \(507/
    );
  });
});

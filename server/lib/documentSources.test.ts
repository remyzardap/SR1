import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";

const dns = vi.hoisted(() => ({ lookup: vi.fn() }));
const google = vi.hoisted(() => ({
  getConnectionStatus: vi.fn(),
  getDriveFileMeta: vi.fn(),
  downloadDriveFile: vi.fn(),
  exportDriveFile: vi.fn(),
  listDriveAttachments: vi.fn(),
}));
const engine = vi.hoisted(() => ({ kemmaDocumentScan: vi.fn() }));
const quota = vi.hoisted(() => ({ getQuotaSummary: vi.fn() }));

vi.mock("node:dns/promises", () => dns);
vi.mock("../services/google", () => google);
vi.mock("../kemma/engine", () => engine);
vi.mock("../core/quotaCheck", () => quota);

import {
  DEFAULT_SOURCE_CHARS,
  MAX_HTML_BYTES,
  MAX_SOURCE_URLS,
  fairShares,
  fetchPublicPage,
  guardedLookup,
  htmlToText,
  ingestSources,
  requestOnce,
  type HopRequest,
  type HopResponse,
} from "./documentSources";
import type { Attachment } from "./attachments";

const USER = 7;
const PUBLIC_IP = [{ address: "93.184.216.34", family: 4 }];
const dataUrl = (type: string, value: string | Buffer) => `data:${type};base64,${Buffer.from(value).toString("base64")}`;
const textFile = (filename: string, value: string): Attachment => ({
  source: "device",
  filename,
  mediaType: "text/plain",
  dataUrl: dataUrl("text/plain", value),
});

function reply(status: number, contentType: string | null, body: string | Buffer, extra: Record<string, string> = {}): HopResponse {
  const buffer = Buffer.from(body);
  return {
    status,
    headers: { ...(contentType ? { "content-type": contentType } : {}), ...extra },
    body: (async function* () {
      // two chunks so the byte cap is checked as data arrives
      const half = Math.floor(buffer.length / 2);
      yield buffer.subarray(0, half);
      yield buffer.subarray(half);
    })(),
    destroy: vi.fn(),
  };
}

/** A fake network keyed by URL; an unknown URL is a failed connection. */
function network(routes: Record<string, () => HopResponse>): { request: HopRequest; calls: string[] } {
  const calls: string[] = [];
  const request: HopRequest = async (url) => {
    calls.push(url.toString());
    const route = routes[url.toString()];
    if (!route) throw new Error("connect ECONNREFUSED 10.1.2.3:80 secret-internal-detail");
    return route();
  };
  return { request, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
  dns.lookup.mockResolvedValue(PUBLIC_IP);
  quota.getQuotaSummary.mockResolvedValue({ tier: "free" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("htmlToText", () => {
  const page = `<!doctype html><html><head><title>Heat pumps &amp; homes</title>
    <style>body{color:red}</style><script>var secret = "<p>not text</p>";</script></head>
    <body><nav><a href="/">Home</a><ul><li>Menu item</li></ul></nav>
    <!-- a comment --><h1>Heat pumps</h1><p>They move heat.&nbsp;Efficiency is <b>3x</b>.</p>
    <h2>Costs</h2><ul><li>Install: &euro;9,000</li><li>Run: low</li></ul>
    <table><tr><th>Type</th><th>COP</th></tr><tr><td>Air</td><td>3.2</td></tr></table>
    <aside>Related ads</aside><footer>Copyright footer</footer><img src="x.png" alt="A diagram"></body></html>`;

  it("keeps the title, headings, lists and table rows and drops scripts, styles and nav", () => {
    const { title, text } = htmlToText(page);
    expect(title).toBe("Heat pumps & homes");
    expect(text).toContain("# Heat pumps");
    expect(text).toContain("## Costs");
    expect(text).toContain("They move heat. Efficiency is 3x.");
    expect(text).toContain("- Install: EUR9,000");
    expect(text).toContain("Type | COP");
    expect(text).toContain("Air | 3.2");
    expect(text).toContain("[image: A diagram]");
    for (const gone of ["secret", "not text", "color:red", "Menu item", "Home", "Related ads", "Copyright footer", "comment"]) {
      expect(text).not.toContain(gone);
    }
  });

  it("decodes numeric entities and survives unclosed tags, comments and scripts", () => {
    const { text } = htmlToText("<p>a &#65;&#x42; &bogus; <p>b <!-- never closed <script>alert(1)");
    expect(text).toContain("a AB &bogus;");
    expect(text).not.toContain("alert");
  });

  it("is linear on hostile input", () => {
    const hostile = "<nav ".repeat(150_000) + "<!--".repeat(50_000) + "<script>".repeat(50_000);
    const started = Date.now();
    htmlToText(hostile);
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe("fairShares", () => {
  it("gives short sources all they have and shares the rest evenly", () => {
    expect(fairShares([100, 5000, 5000], 3100)).toEqual([100, 1500, 1500]);
  });

  it("splits evenly when everything is long, and never exceeds the budget", () => {
    const shares = fairShares([9000, 9000, 9000], 10);
    expect(shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(10);
    expect(Math.max(...shares) - Math.min(...shares)).toBeLessThanOrEqual(1);
    expect(fairShares([10, 20], 1000)).toEqual([10, 20]);
    expect(fairShares([10, 20], 0)).toEqual([0, 0]);
  });
});

describe("fetchPublicPage: address rules", () => {
  const refused = async (url: string) => {
    const net = network({});
    await expect(fetchPublicPage(url, { request: net.request })).rejects.toThrow(/not public|valid web address|only http|login/);
    expect(net.calls).toEqual([]);
  };

  it("refuses private, loopback, link-local, carrier-grade NAT and metadata hosts before connecting", async () => {
    for (const url of [
      "http://127.0.0.1/",
      "http://127.1.2.3:8080/x",
      "http://10.0.0.5/",
      "http://172.16.0.1/",
      "http://192.168.1.1/",
      "http://169.254.169.254/latest/meta-data/",
      "http://100.64.0.1/",
      "http://0.0.0.0/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://[fd00::1]/",
      "http://[fe80::1]/",
      "http://localhost/",
      "http://metadata.google.internal/computeMetadata/v1/",
      "http://intranet/",
      "http://2130706433/",
      "http://0x7f.0.0.1/",
    ]) {
      await refused(url);
    }
  });

  it("refuses other schemes and links with credentials", async () => {
    for (const url of ["file:///etc/passwd", "ftp://example.com/x", "gopher://example.com", "javascript:alert(1)", "not a url", "http://user:pw@example.com/"]) {
      await refused(url);
    }
  });

  it("refuses a name that resolves to a private address, even when another answer is public", async () => {
    dns.lookup.mockResolvedValue([...PUBLIC_IP, { address: "10.0.0.8", family: 4 }]);
    const net = network({ "https://rebind.example.com/": () => reply(200, "text/html", "<p>x</p>") });
    await expect(fetchPublicPage("https://rebind.example.com/", { request: net.request })).rejects.toThrow("not public");
    expect(net.calls).toEqual([]);
  });

  it("refuses a name that does not resolve without leaking the resolver error", async () => {
    dns.lookup.mockRejectedValue(new Error("getaddrinfo ENOTFOUND internal.corp 10.9.9.9"));
    const net = network({});
    const err = await fetchPublicPage("https://nope.example.com/", { request: net.request }).catch((e: Error) => e);
    expect((err as Error).message).toBe("the address could not be found.");
  });

  it("re-checks every redirect: a hop to a private address is refused and never requested", async () => {
    for (const target of ["http://127.0.0.1/admin", "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "file:///etc/passwd"]) {
      const net = network({ "https://good.example.com/": () => reply(302, null, "", { location: target }) });
      await expect(fetchPublicPage("https://good.example.com/", { request: net.request })).rejects.toThrow(/not public|only http/);
      expect(net.calls).toEqual(["https://good.example.com/"]);
    }
  });

  it("re-resolves DNS on a redirect hop (rebinding style: second host resolves privately)", async () => {
    dns.lookup.mockImplementation(async (host: string) => (host === "evil.example.net" ? [{ address: "192.168.0.9", family: 4 }] : PUBLIC_IP));
    const net = network({ "https://good.example.com/": () => reply(301, null, "", { location: "https://evil.example.net/x" }) });
    await expect(fetchPublicPage("https://good.example.com/", { request: net.request })).rejects.toThrow("redirected to an address that is not public");
    expect(net.calls).toHaveLength(1);
  });

  it("follows a public redirect and gives up after too many", async () => {
    const ok = network({
      "https://a.example.com/": () => reply(302, null, "", { location: "/b" }),
      "https://a.example.com/b": () => reply(200, "text/plain", "landed"),
    });
    const page = await fetchPublicPage("https://a.example.com/", { request: ok.request });
    expect(page.buffer.toString()).toBe("landed");
    expect(page.url).toBe("https://a.example.com/b");

    const loop = network({ "https://l.example.com/": () => reply(302, null, "", { location: "https://l.example.com/" }) });
    await expect(fetchPublicPage("https://l.example.com/", { request: loop.request })).rejects.toThrow("too many times");
    expect(loop.calls.length).toBeLessThanOrEqual(5);
  });
});

describe("guardedLookup (connect-time check)", () => {
  const run = (host: string, all = false) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown }>((resolve) => {
      (guardedLookup as unknown as (h: string, o: object, cb: (e: NodeJS.ErrnoException | null, a: unknown) => void) => void)(
        host,
        all ? { all: true } : {},
        (err, address) => resolve({ err, address })
      );
    });

  it("hands back a public address and blocks one that turned private since the pre-check", async () => {
    dns.lookup.mockResolvedValueOnce(PUBLIC_IP);
    expect((await run("ok.example.com")).address).toBe("93.184.216.34");
    dns.lookup.mockResolvedValueOnce(PUBLIC_IP);
    expect((await run("ok.example.com", true)).address).toEqual(PUBLIC_IP);

    dns.lookup.mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);
    expect((await run("rebind.example.com")).err?.code).toBe("EBLOCKED");
    dns.lookup.mockResolvedValueOnce([{ address: "::1", family: 6 }]);
    expect((await run("rebind6.example.com", true)).err?.code).toBe("EBLOCKED");
    dns.lookup.mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
    expect((await run("meta.example.com")).err?.code).toBe("EBLOCKED");
  });
});

describe("fetchPublicPage: content, size and time caps", () => {
  it("accepts html, plain text and pdf and refuses everything else", async () => {
    for (const type of ["text/html; charset=utf-8", "text/plain", "application/pdf"]) {
      const net = network({ "https://t.example.com/": () => reply(200, type, "x") });
      await expect(fetchPublicPage("https://t.example.com/", { request: net.request })).resolves.toBeTruthy();
    }
    for (const type of ["application/zip", "image/png", "application/json", "video/mp4", null]) {
      const net = network({ "https://t.example.com/": () => reply(200, type, "x") });
      await expect(fetchPublicPage("https://t.example.com/", { request: net.request })).rejects.toThrow("only web pages, plain text and PDF");
    }
  });

  it("stops at 2 MB, by header and by bytes received", async () => {
    const big = Buffer.alloc(2 * 1024 * 1024 + 1, 97);
    const net = network({ "https://big.example.com/": () => reply(200, "text/plain", big) });
    await expect(fetchPublicPage("https://big.example.com/", { request: net.request })).rejects.toThrow("larger than 2 MB");

    const declared = network({
      "https://big.example.com/": () => reply(200, "text/plain", "small", { "content-length": String(5 * 1024 * 1024) }),
    });
    await expect(fetchPublicPage("https://big.example.com/", { request: declared.request })).rejects.toThrow("larger than 2 MB");

    const exact = network({ "https://big.example.com/": () => reply(200, "text/plain", Buffer.alloc(2 * 1024 * 1024, 97)) });
    await expect(fetchPublicPage("https://big.example.com/", { request: exact.request })).resolves.toBeTruthy();
  });

  it("gives up after the deadline with a plain sentence", async () => {
    const hang: HopRequest = (_url, signal) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(new Error("aborted 10.0.0.1")), { once: true }));
    const err = await fetchPublicPage("https://slow.example.com/", { request: hang, timeoutMs: 30 }).catch((e: Error) => e);
    expect((err as Error).message).toBe("it took longer than 10 seconds to respond.");
  });

  it("times out a body that stalls after the headers", async () => {
    const stall: HopRequest = async (_url, signal) => ({
      status: 200,
      headers: { "content-type": "text/plain" },
      destroy: () => undefined,
      body: (async function* () {
        yield Buffer.from("start");
        await new Promise((_r, reject) => signal.addEventListener("abort", () => reject(new Error("x")), { once: true }));
      })(),
    });
    const err = await fetchPublicPage("https://slow.example.com/", { request: stall, timeoutMs: 30 }).catch((e: Error) => e);
    expect((err as Error).message).toBe("it took longer than 10 seconds to respond.");
  });

  it("propagates a caller abort", async () => {
    const controller = new AbortController();
    const hang: HopRequest = (_url, signal) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    const work = fetchPublicPage("https://slow.example.com/", { request: hang, signal: controller.signal });
    controller.abort(new Error("client left"));
    await expect(work).rejects.toThrow("client left");
  });
});

describe("requestOnce (real transport, local server, lookup bypassed on purpose)", () => {
  it("does not follow redirects and reads headers, and the default guard refuses loopback", async () => {
    const server = http.createServer((req, res) => {
      if (req.url === "/r") {
        res.writeHead(302, { Location: "http://127.0.0.1:1/" });
        res.end();
      } else {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("hello");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as AddressInfo;
    try {
      const open = ((_h: string, o: { all?: boolean }, cb: (e: null, a: unknown, f?: number) => void) =>
        o?.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4)) as never;
      const redirect = await requestOnce(new URL(`http://local.test:${port}/r`), AbortSignal.timeout(2000), open);
      expect(redirect.status).toBe(302);
      expect(redirect.headers.location).toBe("http://127.0.0.1:1/");
      redirect.destroy();

      const ok = await requestOnce(new URL(`http://local.test:${port}/`), AbortSignal.timeout(2000), open);
      const chunks: Buffer[] = [];
      for await (const chunk of ok.body) chunks.push(Buffer.from(chunk));
      expect(Buffer.concat(chunks).toString()).toBe("hello");

      dns.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
      await expect(requestOnce(new URL(`http://rebind.test:${port}/`), AbortSignal.timeout(2000))).rejects.toThrow();
    } finally {
      server.close();
    }
  });
});

describe("ingestSources", () => {
  const pageHtml = (title: string, body: string) => `<html><head><title>${title}</title></head><body>${body}</body></html>`;

  it("returns an empty result for no sources", async () => {
    expect(await ingestSources({ userId: USER, input: {} })).toEqual({ context: "", used: [], notices: [] });
  });

  it("labels files, pictures, links and html as [S1].. and lists what was used", async () => {
    engine.kemmaDocumentScan.mockResolvedValue({ text: "A chart showing rising sales. Text: Q1 Q2" });
    const net = network({
      "https://news.example.com/story?token=SECRET": () => reply(200, "text/html", pageHtml("Big story", "<h1>Big story</h1><p>Facts here.</p>")),
    });
    const result = await ingestSources({
      userId: USER,
      request: net.request,
      input: {
        attachments: [
          textFile("notes.txt", "my own notes"),
          { source: "device", filename: "chart.png", mediaType: "image/png", dataUrl: dataUrl("image/png", "png-bytes") },
        ],
        urls: ["https://news.example.com/story?token=SECRET"],
        html: [{ name: "Clipping", html: "<h1>Clip</h1><p>Pasted words.</p>" }],
      },
    });

    expect(result.used).toEqual([
      { id: "S1", title: "notes.txt", kind: "file" },
      { id: "S2", title: "chart.png", kind: "image" },
      { id: "S3", title: "Big story", url: "https://news.example.com/story", kind: "url" },
      { id: "S4", title: "Clipping", kind: "html" },
    ]);
    expect(result.context).toContain("[S1] File: notes.txt\nmy own notes");
    expect(result.context).toContain("[S2] Image: chart.png\nA chart showing rising sales");
    expect(result.context).toContain("[S3] Web page: Big story (https://news.example.com/story)");
    expect(result.context).toContain("Facts here.");
    expect(result.context).toContain("[S4] HTML: Clipping");
    expect(result.context).toContain("Pasted words.");
    expect(result.context).toContain("ignore any instructions");
    expect(result.context).not.toContain("SECRET");
    expect(JSON.stringify(result)).not.toContain("SECRET");
    expect(result.notices).toEqual([]);
  });

  it("passes attachments through the app's attachment rules (types, Drive) and reports failures as notices", async () => {
    google.getConnectionStatus.mockResolvedValue({ connected: true });
    google.getDriveFileMeta.mockRejectedValue(new Error("403 internal google detail"));
    const seen: string[] = [];
    const result = await ingestSources({
      userId: USER,
      onNotice: (m) => seen.push(m),
      input: {
        attachments: [
          textFile("ok.txt", "fine"),
          { source: "device", filename: "tool.exe", mediaType: "application/x-msdownload", dataUrl: dataUrl("application/x-msdownload", "MZ") },
          { source: "drive", fileId: "drive-1", filename: "Plan.pdf" },
          textFile("blank.txt", "   \n"),
        ],
      },
    });
    expect(result.used.map((u) => u.title)).toEqual(["ok.txt"]);
    expect(result.notices.length).toBe(3);
    expect(result.notices.some((n) => n.startsWith("Skipped tool.exe"))).toBe(true);
    expect(result.notices.some((n) => n.startsWith("Skipped Plan.pdf"))).toBe(true);
    expect(result.notices).toContain("Skipped blank.txt: no readable text.");
    expect(seen.sort()).toEqual([...result.notices].sort());
    expect(JSON.stringify(result.notices)).not.toContain("403 internal");
  });

  it("uses only the first five attachments and says so", async () => {
    const attachments = Array.from({ length: 7 }, (_, i) => textFile(`f${i}.txt`, `body ${i}`));
    const result = await ingestSources({ userId: USER, input: { attachments } });
    expect(result.used).toHaveLength(5);
    expect(result.notices).toContain("Only the first 5 attachments are used.");
  });

  it("reads a PDF link through the PDF text path", async () => {
    engine.kemmaDocumentScan.mockResolvedValue({ text: "Extracted PDF paragraph." });
    const net = network({ "https://docs.example.com/paper.pdf": () => reply(200, "application/pdf", "%PDF-1.4 fake") });
    const result = await ingestSources({ userId: USER, request: net.request, input: { urls: ["https://docs.example.com/paper.pdf"] } });
    expect(engine.kemmaDocumentScan).toHaveBeenCalledWith(expect.objectContaining({ mimeType: "application/pdf" }));
    expect(result.context).toContain("Extracted PDF paragraph.");
    expect(result.used[0]).toMatchObject({ kind: "url", url: "https://docs.example.com/paper.pdf", title: "docs.example.com/paper.pdf" });
  });

  it("turns every link failure into a safe notice without internal addresses or stack traces", async () => {
    const net = network({
      "https://gone.example.com/": () => reply(404, "text/html", "nope"),
      "https://zip.example.com/": () => reply(200, "application/zip", "PK"),
      "https://empty.example.com/": () => reply(200, "text/html", "<script>1</script>"),
    });
    const result = await ingestSources({
      userId: USER,
      request: net.request,
      input: {
        urls: [
          "http://127.0.0.1/admin",
          "http://169.254.169.254/latest/meta-data/",
          "http://[::1]:8080/",
          "https://gone.example.com/",
          "https://zip.example.com/",
          "https://empty.example.com/",
          "https://down.example.com/page",
          "not a url",
        ],
      },
    });
    expect(result.used).toEqual([]);
    expect(result.context).toBe("");
    expect(result.notices).toHaveLength(8);
    const all = result.notices.join("\n");
    expect(all).not.toMatch(/ECONNREFUSED|secret-internal-detail|10\.1\.2\.3|at \w+ \(|stack/i);
    expect(all).toContain("Skipped down.example.com/page: the site could not be reached.");
    expect(all).toContain("status 404");
    expect(all).toContain("only web pages, plain text and PDF");
    expect(all).toContain("no readable text");
    expect(net.calls).not.toContain("http://127.0.0.1/admin");
  });

  it("caps links at eight, drops duplicates, and caps html at three blobs of 200 KB", async () => {
    const urls = Array.from({ length: 11 }, (_, i) => `https://s${i}.example.com/`);
    const routes: Record<string, () => HopResponse> = {};
    for (const u of urls) routes[u] = () => reply(200, "text/plain", `text of ${u}`);
    const net = network(routes);
    const result = await ingestSources({
      userId: USER,
      request: net.request,
      input: {
        urls: [urls[0], urls[0], ...urls],
        html: [
          { html: "<p>one</p>" },
          { html: `<p>${"x".repeat(MAX_HTML_BYTES + 1)}</p>` },
          { name: "three", html: "<p>three</p>" },
          { html: "<p>four</p>" },
        ],
      },
    });
    expect(net.calls).toHaveLength(MAX_SOURCE_URLS);
    expect(result.notices).toContain(`Only the first ${MAX_SOURCE_URLS} links are used.`);
    expect(result.notices).toContain("Only the first 3 pasted HTML sources are used.");
    expect(result.notices.some((n) => n.includes("up to 200 KB"))).toBe(true);
    expect(result.used.filter((u) => u.kind === "html").map((u) => u.title)).toEqual(["Pasted HTML 1", "three"]);
    expect(result.context).not.toContain("four");
  });

  it("splits the character cap fairly and never exceeds it", async () => {
    const long = "word ".repeat(30_000);
    const result = await ingestSources({
      userId: USER,
      maxChars: 6000,
      input: {
        attachments: [textFile("short.txt", "tiny but complete"), textFile("a.txt", long), textFile("b.txt", long)],
      },
    });
    expect(result.context.length).toBeLessThanOrEqual(6000);
    expect(result.context).toContain("tiny but complete");
    const [, a, b] = result.context.split("\n\n---\n\n");
    expect(Math.abs(a.length - b.length)).toBeLessThanOrEqual(40);
    expect(a.length).toBeGreaterThan(2000);
    expect(a).toContain("[truncated]");
    expect(a).toMatch(/^\[S2\] File: a\.txt/);
  });

  it("defaults to a 60,000 character cap", async () => {
    const long = "w ".repeat(40_000);
    const result = await ingestSources({ userId: USER, input: { html: [{ html: `<p>${long.slice(0, 150_000)}</p>` }, { html: `<p>${long.slice(0, 150_000)}</p>` }] } });
    expect(result.context.length).toBeLessThanOrEqual(DEFAULT_SOURCE_CHARS);
    expect(result.context.length).toBeGreaterThan(DEFAULT_SOURCE_CHARS - 200);
  });

  it("stops when the caller aborts", async () => {
    const controller = new AbortController();
    const hang: HopRequest = (_url, signal) =>
      new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    const work = ingestSources({ userId: USER, signal: controller.signal, request: hang, input: { urls: ["https://slow.example.com/"] } });
    controller.abort(new Error("stopped"));
    await expect(work).rejects.toThrow("stopped");
  });
});

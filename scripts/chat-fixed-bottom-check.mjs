// Checks that /chat has no fixed or sticky element docked to the bottom except the composer.
//   node scripts/chat-fixed-bottom-check.mjs <baseUrl> [storageState.json]
// Needs a signed-in session for the real route: pass a Playwright storage state file
// (saved with context.storageState()). Exit code 1 when something else is docked.
const { chromium } = await import("playwright");

const base = process.argv[2] ?? "http://localhost:5173";
const storageState = process.argv[3];
const browser = await chromium.launch();
let failures = 0;

for (const [w, h] of [[360, 780], [390, 844], [1280, 800]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ...(storageState ? { storageState } : {}) });
  const page = await ctx.newPage();
  await page.goto(`${base}/chat`, { waitUntil: "networkidle" });
  const docked = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const style = getComputedStyle(el);
      if (style.position !== "fixed" && style.position !== "sticky") continue;
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const nearBottom = r.bottom >= window.innerHeight - 4 && r.top > window.innerHeight * 0.4;
      if (!nearBottom) continue;
      if (el.closest(".sutaeru-run-controls, .home-dock, .composer-wrap, [data-sonner-toaster]")) continue;
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`);
    }
    return out;
  });
  if (docked.length) {
    failures++;
    console.log(`FAIL ${w}x${h}: docked at the bottom besides the composer:`, docked);
  } else {
    console.log(`ok ${w}x${h}`);
  }
  await ctx.close();
}
await browser.close();
process.exit(failures ? 1 : 0);

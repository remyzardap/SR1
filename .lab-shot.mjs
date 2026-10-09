const { chromium } = await import("playwright");
const out = "/tmp/claude-0/shots-b";
import fs from "node:fs";
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch();
const jobs = [
  ["motion-m", "/__lab/motion", 390, 844],
  ["motion-d", "/__lab/motion", 1280, 800],
  ["art-m", "/__lab/art", 390, 844],
];
for (const [name, path, w, h] of jobs) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR", name, e.message));
  page.on("console", (m) => m.type() === "error" && console.log("CONSOLE", name, m.text().slice(0, 200)));
  await page.goto("http://localhost:5391" + path, { waitUntil: "networkidle" });
  await page.mouse.move(w / 2, 200);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/${name}.png` });
  await ctx.close();
}
await browser.close();

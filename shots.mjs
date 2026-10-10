import { spawn } from "node:child_process";
import { chromium } from "playwright";
import fs from "node:fs";

const PORT = 5391;
const out = "/tmp/claude-0/w2b-shots";
fs.mkdirSync(out, { recursive: true });

const vite = spawn("npx", ["vite", "--port", String(PORT)], {
  env: { ...process.env, VITE_DESIGN_LAB: "1", PLAYWRIGHT_BROWSERS_PATH: "/opt/pw-browsers" },
  stdio: ["ignore", "pipe", "pipe"],
});
await new Promise((resolve) => {
  vite.stdout.on("data", (d) => String(d).includes("Local") && resolve());
  setTimeout(resolve, 20000);
});

const browser = await chromium.launch();
const sizes = [
  { n: "m", w: 390, h: 844 },
  { n: "d", w: 1280, h: 800 },
];
const shots = [
  ["agent-report", "/__lab/agent?state=report"],
  ["agent-image", "/__lab/agent?state=image"],
  ["agent-validation", "/__lab/agent?state=validation"],
  ["documents", "/__lab/create?screen=documents"],
  ["new", "/__lab/create?screen=new"],
  ["improve", "/__lab/create?screen=improve"],
  ["video", "/__lab/create?screen=video"],
];
for (const s of sizes) {
  for (const theme of ["light", "dark"]) {
    const ctx = await browser.newContext({ viewport: { width: s.w, height: s.h } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.log("PAGEERROR", e.message));
    for (const [name, path] of shots) {
      await page.goto(`http://localhost:${PORT}${path}${path.includes("?") ? "&" : "?"}theme=${theme}`);
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${out}/${name}-${s.n}-${theme}.png`, fullPage: false });
    }
    await ctx.close();
  }
}
await browser.close();
vite.kill();
console.log("done");

// Visual and layout check for the composer (package C1). Run with a dev server up:
//   node scripts/composer-check.mjs http://localhost:5191 [outDir]
// It opens /__lab/home in each mode, theme and phone width, asserts the mode chip never
// clips (scrollWidth <= clientWidth on the chip and its name) and that the tools row does
// not overflow, and writes screenshots. Exit code 1 on any failure.
// Browsers: the default Playwright cache, or PLAYWRIGHT_BROWSERS_PATH when set.
const { chromium } = await import("playwright");

const base = process.argv[2] ?? "http://localhost:5191";
const out = process.argv[3] ?? "shots";
import { mkdirSync } from "node:fs";
mkdirSync(out, { recursive: true });

const widths = [320, 360, 390, 1280];
const states = ["default", "deep", "image", "typing", "mode", "attach", "files", "private", "offline"];
const modeStates = ["default", "deep", "image"];
let failures = 0;

const browser = await chromium.launch();
for (const theme of ["light", "dark"]) {
  for (const w of widths) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w > 700 ? 800 : 844 }, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    for (const state of states) {
      await page.goto(`${base}/__lab/home?state=${state}&theme=${theme}`, { waitUntil: "networkidle" });
      await page.waitForSelector(".mode-chip");
      await page.waitForTimeout(450);
      const m = await page.evaluate(() => {
        const chip = document.querySelector(".mode-chip");
        const name = [...document.querySelectorAll(".mode-chip-name > span")].find((s) => getComputedStyle(s).display !== "none");
        const ctrls = document.querySelector(".composer .ctrls");
        const box = (el) => el.getBoundingClientRect();
        const cb = box(chip);
        const rb = box(ctrls);
        return {
          chipClipped: chip.scrollWidth > chip.clientWidth + 0.5,
          // An inline box reports no overflow, so compare the text's own extent with the box that holds it.
          nameClipped: name
            ? (() => {
                const range = document.createRange();
                range.selectNodeContents(name);
                return range.getBoundingClientRect().width > name.parentElement.getBoundingClientRect().width + 0.5;
              })()
            : true,
          rowOverflow: ctrls.scrollWidth > ctrls.clientWidth + 0.5,
          chipInsideRow: cb.left >= rb.left - 0.5 && cb.right <= rb.right + 0.5,
          chipH: cb.height,
          textarea: (() => { const t = document.querySelector(".composer textarea"); const s = getComputedStyle(t); return { h: t.getBoundingClientRect().height, fs: s.fontSize }; })(),
        };
      });
      const bad = m.chipClipped || m.nameClipped || m.rowOverflow || !m.chipInsideRow;
      if (bad) {
        failures++;
        console.log(`FAIL ${theme} ${w} ${state}`, JSON.stringify(m));
      }
      if (state === "default" && w === 360 && theme === "light") console.log("sample", JSON.stringify(m));
      await page.screenshot({ path: `${out}/home-${state}-${w}-${theme}.png` });
    }
    await ctx.close();
  }
}
await browser.close();
console.log(failures ? `${failures} failure(s)` : "composer-check: all good");
process.exit(failures ? 1 : 0);

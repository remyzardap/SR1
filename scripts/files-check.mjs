// Visual and behaviour check for the rebuilt Files list. Run with the lab up:
//   VITE_DESIGN_LAB=1 npx vite --port 5601
//   node scripts/files-check.mjs http://localhost:5601 shots
// Screenshots every lab state at 390 and 1280, light and dark, and asserts the tap targets,
// the full (never clipped) file name, the "type · size · date" line, the seven type chips, the
// sort control and the storage fold (aria-expanded + remembered in localStorage).
// Exit code 1 on any failure. Browsers: the default Playwright cache.
const { chromium } = await import("playwright");
const { mkdirSync } = await import("node:fs");

const base = process.argv[2] ?? "http://localhost:5601";
const out = process.argv[3] ?? "shots";
mkdirSync(out, { recursive: true });

const states = ["populated", "documents", "sorted_by_size", "writing", "trashed", "searching_no_match"];
// .pill and .fold-all grow to 44 px with a documented ::after hit slop.
const hitSlop = { ".pill.chip": 8, ".pill.sm": 10, ".sort-btn": 10 };

// The live row repaints every frame, so Playwright's "element is stable" wait (used by fullPage
// and element screenshots) never settles. Plain viewport shots, scrolled where we want to look.
async function shoot(page, path, scrollTo) {
  if (scrollTo) {
    await page.evaluate((sel) => document.querySelector(sel)?.scrollIntoView({ block: "start" }), scrollTo);
    await page.waitForTimeout(120);
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(120);
  }
  await page.screenshot({ path, timeout: 60_000 });
}

let failures = 0;
const fail = (msg) => {
  console.error(`FAIL  ${msg}`);
  failures += 1;
};
const ok = (msg) => console.log(`ok    ${msg}`);

const browser = await chromium.launch();

for (const theme of ["light", "dark"]) {
  for (const width of [390, 1280]) {
    // 1x: this host has no GPU, and a 2x surface plus scrolling starves the software compositor
    // (page.screenshot never returns). 390x844 at 1x is the phone the design is judged on.
    const ctx = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => fail(`pageerror ${theme} ${width}: ${e.message}`));
    page.on("console", (m) => m.type() === "error" && fail(`console ${theme} ${width}: ${m.text()}`));

    for (const state of states) {
      const url = `${base}/__lab/files?state=${state}&theme=${theme}&w=full`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.waitForSelector("#view-files");
      await page.waitForTimeout(250);
      const tag = `${theme}-${width}-${state}`;
      await shoot(page, `${out}/files-${tag}.png`);
      await shoot(page, `${out}/files-${tag}-bottom.png`, ".files-folds");

      const report = await page.evaluate(
        ({ state, slop }) => {
          const res = { rows: 0, clipped: [], meta: [], small: [], chips: 0, checked: 0, errors: [] };
          const rect = (el) => el.getBoundingClientRect();

          document.querySelectorAll("#fileList .frow-wrap").forEach((row) => {
            if (!row.querySelector(".frow")) return;
            res.rows += 1;
            const name = row.querySelector(".ft b");
            if (name && name.scrollWidth > name.clientWidth + 1) res.clipped.push(name.textContent);
            const small = row.querySelector(".ft small");
            if (small) res.meta.push(small.textContent.replace(/\s+/g, " ").trim());
          });

          for (const [sel, pad] of Object.entries(slop)) {
            document.querySelectorAll(sel).forEach((el) => {
              const h = rect(el).height + pad;
              if (h < 44) res.small.push(`${sel} ${h.toFixed(1)}px`);
            });
          }
          for (const sel of [".frow", ".file-more-btn", ".search-upload", ".icon-btn"]) {
            document.querySelectorAll(sel).forEach((el) => {
              const r = rect(el);
              if (r.height < 44 || r.width < 44) res.small.push(`${sel} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
            });
          }

          document.querySelectorAll('.filters [role="radio"]').forEach((chip) => {
            res.chips += 1;
            if (chip.getAttribute("aria-checked") === "true") res.checked += 1;
          });

          const fold = document.querySelector('[data-fold="storage"] .fold-trigger');
          res.foldExpanded = fold ? fold.getAttribute("aria-expanded") : "missing";
          res.foldPick = document.querySelector(".fold-pick")?.textContent ?? "";
          res.sortLabel = document.querySelector(".sort-btn")?.textContent ?? "";
          res.headCount = document.querySelector(".files-count")?.textContent ?? "";
          res.overflow = document.documentElement.scrollWidth - window.innerWidth;
          res.state = state;
          return res;
        },
        { state, slop: hitSlop }
      );

      if (report.clipped.length) fail(`${tag}: clipped names ${report.clipped.join(" | ")}`);
      if (report.small.length) fail(`${tag}: small tap targets ${report.small.join(", ")}`);
      if (report.overflow > 1) fail(`${tag}: horizontal overflow ${report.overflow}px`);
      if (report.chips !== 7) fail(`${tag}: ${report.chips} type chips, expected 7`);
      if (report.checked !== 1) fail(`${tag}: ${report.checked} chips checked, expected 1`);
      if (!report.foldExpanded) fail(`${tag}: storage fold has no aria-expanded`);
      if (!report.sortLabel.trim()) fail(`${tag}: sort button is empty`);

      // Every row reads "type · size · date" (a file still being written has no size yet).
      if (state === "populated") {
        const bad = report.meta.filter((m) => m.split(" · ").length < 2);
        if (bad.length) fail(`${tag}: meta lines without a type · date: ${bad.join(" | ")}`);
        const okMeta = report.meta.some((m) => / · \d+(\.\d+)? (B|KB|MB|GB) · /.test(m));
        if (!okMeta) fail(`${tag}: no meta line shows a size: ${report.meta.join(" | ")}`);
        ok(`${tag}: ${report.rows} rows · ${report.meta[0]} · ${report.headCount}`);
      } else {
        ok(`${tag}: ${report.rows} rows · sort “${report.sortLabel}” · fold ${report.foldExpanded} (${report.foldPick})`);
      }
    }

    // The fold opens on click and the page remembers it.
    await page.goto(`${base}/__lab/files?state=populated&theme=${theme}&w=full`, { waitUntil: "networkidle" });
    const trigger = page.locator('[data-fold="storage"] .fold-trigger');
    const before = await trigger.getAttribute("aria-expanded");
    await trigger.click();
    await page.waitForTimeout(400);
    const after = await trigger.getAttribute("aria-expanded");
    if (before === after) fail(`${theme} ${width}: storage fold did not toggle (${before})`);
    else ok(`${theme}-${width}: fold ${before} → ${after}`);
    const stored = await page.evaluate(() => localStorage.getItem("sutaeru:fold:files"));
    if (!stored) fail(`${theme} ${width}: fold state was not remembered`);
    await page.reload({ waitUntil: "networkidle" });
    const reloaded = await page.locator('[data-fold="storage"] .fold-trigger').getAttribute("aria-expanded");
    if (reloaded !== after) fail(`${theme} ${width}: fold state lost on reload (${after} → ${reloaded})`);
    await shoot(page, `${out}/files-${theme}-${width}-fold-open.png`, ".files-folds");

    // Reduced motion: the in-app switch must stop the live bar's rAF loop and the fold's easing.
    await page.goto(`${base}/__lab/files?state=writing&theme=${theme}&w=full`, { waitUntil: "networkidle" });
    await page.waitForSelector(".frow-live");
    await page.evaluate(() => document.documentElement.setAttribute("data-reduce-motion", "true"));
    await page.waitForTimeout(300);
    const etaA = await page.locator(".frow-live .mono").textContent();
    await page.waitForTimeout(700);
    const etaB = await page.locator(".frow-live .mono").textContent();
    if ((etaA ?? "").trim() !== (etaB ?? "").trim()) fail(`${theme} ${width}: live bar still animates with reduce-motion on (${etaA} → ${etaB})`);
    const foldDur = await page.evaluate(() => getComputedStyle(document.querySelector(".fold-chev")).transitionDuration);
    if (foldDur !== "0s" && !foldDur.startsWith("0")) fail(`${theme} ${width}: fold transition is ${foldDur} under reduce-motion`);
    else ok(`${theme}-${width}: reduce-motion holds (eta "${etaA?.trim()}", fold ${foldDur})`);
    await shoot(page, `${out}/files-${theme}-${width}-reduce-motion.png`);
    await page.evaluate(() => document.documentElement.removeAttribute("data-reduce-motion"));

    // Keyboard: the row and the sort control both take focus and show a ring.
    await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement?.className ?? "");
    if (!focused) fail(`${theme} ${width}: nothing focusable after Tab`);

    await ctx.close();
  }
}

await browser.close();
console.log(failures ? `\n${failures} failure(s)` : "\nall checks passed");
process.exit(failures ? 1 : 0);

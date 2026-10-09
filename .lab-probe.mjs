const { chromium } = await import("playwright");
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
await p.goto("http://localhost:5391/__lab/motion", { waitUntil: "networkidle" });
await p.mouse.move(600, 300);
await p.waitForTimeout(1200);
console.log(await p.evaluate(() => {
  const c = document.querySelector("canvas.living-bg");
  if (!c) return "no canvas; cores=" + navigator.hardwareConcurrency + " living=" + document.documentElement.dataset.living;
  const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
  const bgs = []; for (let e = c.parentElement; e; e = e.parentElement) bgs.push(e.className.toString().slice(0,30) + ":" + getComputedStyle(e).backgroundColor);
  return { w: c.width, h: c.height, painted: n, mode: c.dataset.mode, z: getComputedStyle(c).zIndex, bgs };
}));
await b.close();

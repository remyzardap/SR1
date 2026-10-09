import fs from "node:fs";
for (const d of ["/root/.cache/ms-playwright", "/ms-playwright", "/usr/bin", "/root/sr1/node_modules/.cache"]) {
  try { console.log(d, fs.readdirSync(d).filter((x) => /chrom|playwright/i.test(x))); } catch (e) { console.log(d, "none"); }
}

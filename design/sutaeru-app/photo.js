/* Sutaeru studio photo compositor.
   Real photographs (Unsplash, credited in PHOTOS) become a live preview of the shot:
   - camera angle picks the photograph (overhead, high and low have their own; eye level uses the light's photo)
   - light picks the photograph at eye level, and grades the angle photographs elsewhere
   - shot and lens zoom toward the cup; long lenses soften the edges like real depth of field
   - shape crops, tilted rotates, film adds grain and fade
   - ink and dots prints the photograph as a true halftone; illustration and clay fall back to drawn renders */
(function () {
  "use strict";
  const SC = window.SutaeruScene;
  const DIR = "img/";

  /* f = focal point of the cup in % of the frame */
  const PHOTOS = {
    "light-window": { by: "Thomas Park", id: "1591745742384-ee81ec590924", f: [66, 62], rim: [63, 41] },
    "light-golden": { by: "Barney Goodman", id: "1781460877110-6988cbaf0eb0", f: [56, 70], rim: [53, 52] },
    "light-studio": { by: "Giorgio Trovato", id: "1680818080459-1b9ad0e9cd78", f: [50, 46], rim: [46, 15] },
    "light-backlit": { by: "René Porter", id: "1561766926-a7c863179e15", f: [60, 66], rim: [61, 46] },
    "light-night": { by: "Olena Bohovyk", id: "1671207549881-94b69004888a", f: [50, 52], rim: [51, 46] },
    "angle-top": { by: "Debby Hudson", id: "1652703747774-558a10faacc2", f: [51, 50], rim: [51, 50] },
    "angle-high": { by: "Erik Witsoe", id: "1523179985834-1363f5c47d84", f: [52, 52], rim: [51, 47] },
    "angle-low": { by: "Zach Lezniewicz", id: "1547583881-58685cb3210f", f: [47, 57], rim: [47, 49] },
    "var-window-2": { by: "Thabet Studio", id: "1644889017176-c97b128dece3", f: [48, 56] },
    "var-window-3": { by: "Barney Goodman", id: "1781460903505-c82fe437be4b", f: [50, 70] },
    "var-window-4": { by: "engin akyurt", id: "1769412340371-c9f18ea1e71f", f: [48, 34] },
    "var-golden-2": { by: "Charmil Gandhi", id: "1771736385651-c071580a9d78", f: [50, 58] },
    "var-golden-3": { by: "tabitha turner", id: "1596098823457-74e360fcd023", f: [55, 74] },
    "var-golden-4": { by: "Jei Lee", id: "1678068317141-13ef6a709354", f: [53, 42] },
    "var-studio-2": { by: "Daniel Dan", id: "1740593021483-a898ac0d4ab7", f: [36, 42] },
    "var-studio-3": { by: "Monaz Nazary", id: "1771623117490-58382d47f882", f: [50, 48] },
    "var-studio-4": { by: "Daniel Dan", id: "1740593022235-becbadbcaf97", f: [36, 48] },
    "var-backlit-2": { by: "Tim Foster", id: "1526385159909-196a9ac0ef64", f: [44, 86] },
    "var-backlit-3": { by: "Jocelyn Morales", id: "1611162458324-aae1eb4129a4", f: [57, 56] },
    "var-backlit-4": { by: "Luca Massimilian", id: "1590082871875-064201a27373", f: [52, 62] },
    "var-night-2": { by: "Olena Bohovyk", id: "1671207589776-730a149bc597", f: [40, 69] },
    "var-night-3": { by: "Martyn Yakub", id: "1636405348751-3a7faad27231", f: [34, 71] },
    "var-night-4": { by: "John Forson", id: "1518358246973-95637f1df901", f: [52, 80] },
    "look-painted": { by: "Europeana", id: "1741119336848-4e2eb08b9709", f: [46, 56] },
    "look-clay": { by: "BlushStudio Creations", id: "1744853261830-5167b853519f", f: [50, 58] },
    "eng-gemini": { by: "Brett Jordan", id: "1610454059772-5c751844f937", f: [50, 50], tileOnly: true },
    "eng-openai": { by: "pariwat pannium", id: "1647919234555-3d06e2c923f4", f: [50, 60], tileOnly: true },
    "eng-wan": { by: "Danielle-Claude Bélanger", id: "1733338638542-45e79232a3df", f: [50, 50], tileOnly: true },
    "ref": { by: "Charmil Gandhi", id: "1771736385651-c071580a9d78", f: [45, 55], tileOnly: true },
  };
  const SHOT_Z = { detail: 2.2, close: 1.5, medium: 1.12, wide: 1 };
  const LENS_Z = { "24": 1, "35": 1.02, "50": 1.06, "85": 1.16, "100": 1.34 };
  const LENS_B = { "24": 0, "35": 0, "50": 0.6, "85": 3.2, "100": 6.5 };
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const src = (name, size) => `${DIR}${size === "l" && !PHOTOS[name].tileOnly ? "l" : size === "m" && !PHOTOS[name].tileOnly ? "m" : "t"}/${name}.webp`;
  /* Phones get the 800 px set; only big, zoomed frames on dense screens fetch 1280 px */
  const pick = (name, need) => src(name, need <= 480 ? "t" : need <= 820 ? "m" : "l");
  const loaded = new Set();
  const imgCache = new Map();

  function base(p) {
    if (p.angle === "top" || p.angle === "high" || p.angle === "low") return { name: `angle-${p.angle}`, grade: true };
    return { name: `light-${p.light}`, grade: false };
  }
  function framing(p) {
    let z = (SHOT_Z[p.shot] || 1.12) * (LENS_Z[p.lens] || 1.06), r = 0;
    if (p.angle === "dutch") { r = -8; z *= 1.22; }
    return { z: Math.min(z, 3.4), r, b: LENS_B[p.lens] || 0 };
  }

  /* o: { size: "l" | "t", name: override photo, w: frame width in px (scales blur and grain) } */
  function comp(params, o) {
    o = o || {};
    const p = Object.assign({}, SC.DEFAULT, params);
    if (p.look === "illustration" || p.look === "clay") {
      /* Painted and clay are shown with a real style reference, framed by the chosen shot and shape */
      const name = p.look === "clay" ? "look-clay" : "look-painted";
      return comp(Object.assign({}, p, { look: "photo", lens: "24", angle: p.angle === "dutch" ? "dutch" : "eye", shot: p.shot === "detail" ? "close" : p.shot }), Object.assign({}, o, { name }));
    }
    const b = o.name ? { name: o.name, grade: o.name.startsWith("angle-") && !PHOTOS[o.name].tileOnly } : base(p);
    const ph = PHOTOS[b.name];
    const fr = framing(p);
    const f = p.shot === "detail" && ph.rim ? ph.rim : ph.f;
    const k = (o.w || 520) / 520;
    const vars = `--fx:${f[0]}%;--fy:${f[1]}%;--z:${fr.z.toFixed(3)};--r:${fr.r}deg;--b:${(fr.b * k).toFixed(2)}px`;
    const cls = `ph look-${p.look}${b.grade ? ` grade-${p.light}` : ""}${fr.b ? " dof" : ""}`;
    const need = (o.w || 520) * DPR * fr.z;
    const hi = o.size === "t" ? pick(b.name, Math.min(need, 480)) : pick(b.name, need), lo = src(b.name, "t");
    if (p.look === "ink") return `<div class="${cls}" style="${vars}"><canvas class="ph-ht" data-src="${hi}" data-fx="${f[0]}" data-fy="${f[1]}" data-z="${fr.z}" data-r="${fr.r}" data-grade="${b.grade ? p.light : ""}"></canvas></div>`;
    const first = loaded.has(hi) ? hi : lo;
    return `<div class="${cls}" style="${vars}"><img class="ph-img${first === hi ? " hi" : ""}" src="${first}" ${first === hi ? "" : `data-hi="${hi}"`} alt="" decoding="async" draggable="false"><i class="ph-blur"></i><i class="ph-tone"></i><i class="ph-grain"></i><i class="ph-vig"></i></div>`;
  }

  function loadImg(url) {
    if (imgCache.has(url)) return imgCache.get(url);
    const pr = new Promise((res, rej) => { const im = new Image(); im.decoding = "async"; im.onload = () => { loaded.add(url); res(im); }; im.onerror = rej; im.src = url; });
    imgCache.set(url, pr);
    return pr;
  }

  /* Swap low-res placeholders for the full photo, and print halftones. */
  function hydrate(root) {
    (root || document).querySelectorAll("img.ph-img[data-hi]").forEach((im) => {
      const url = im.getAttribute("data-hi");
      im.removeAttribute("data-hi");
      loadImg(url).then(() => { if (im.isConnected) { im.src = url; im.classList.add("hi"); } }, () => {});
    });
    (root || document).querySelectorAll("canvas.ph-ht").forEach((c) => {
      if (c._done) return; c._done = true;
      loadImg(c.dataset.src).then((im) => halftone(c, im), () => {});
    });
  }

  /* Halftone print of the framed photo: dot area follows darkness after auto levels. */
  function halftone(c, im) {
    if (!c.isConnected) return;
    const r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.max(1, r.width), H = Math.max(1, r.height);
    c.width = Math.round(W * d); c.height = Math.round(H * d);
    const x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0);
    const cs = getComputedStyle(document.documentElement);
    const ink = cs.getPropertyValue("--ink").trim() || "#242320", paper = cs.getPropertyValue("--paper").trim() || "#F7F6F2";
    const cell = Math.max(2.8, Math.min(4.8, W / 90));
    const cols = Math.ceil(W / cell) + 2, rows = Math.ceil(H / (cell * 0.866)) + 2;
    const off = document.createElement("canvas"); off.width = cols; off.height = rows;
    const ox = off.getContext("2d", { willReadFrequently: true });
    const fx = +c.dataset.fx / 100, fy = +c.dataset.fy / 100, z = +c.dataset.z, rot = (+c.dataset.r * Math.PI) / 180;
    const s = Math.max(cols / im.width, rows / im.height) * z;
    ox.translate(cols * fx, rows * fy); ox.rotate(rot); ox.scale(s, s);
    ox.drawImage(im, -im.width * fx, -im.height * fy);
    let px;
    try { px = ox.getImageData(0, 0, cols, rows).data; } catch (e) { return; }
    const L = new Float32Array(cols * rows);
    let lo = 1, hi = 0;
    const g = c.dataset.grade;
    for (let i = 0; i < L.length; i++) {
      let v = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
      if (g === "night") v *= 0.6; else if (g === "studio") v = 0.2 + v * 0.85;
      L[i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    const span = Math.max(0.2, hi - lo);
    x.fillStyle = paper; x.fillRect(0, 0, W, H);
    x.fillStyle = ink;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      let v = (L[j * cols + i] - lo) / span;
      v = v < 0.5 ? 2 * v * v : 1 - 2 * (1 - v) * (1 - v);
      v = Math.min(1, Math.max(0, (v - 0.5) * 1.18 + 0.56));
      const dark = 1 - v;
      const rad = cell * 0.6 * Math.sqrt(Math.max(0, dark - 0.08));
      if (rad < 0.3) continue;
      x.beginPath(); x.arc(i * cell + (j % 2 ? cell / 2 : 0) - cell, j * cell * 0.866 - cell * 0.5, rad, 0, 6.283); x.fill();
    }
  }

  function variants(p) {
    if (isRef(p)) return ["wide", "medium", "close", "wide"].map((s, i) => ({ name: refName(p), p: Object.assign({}, p, { shot: s, angle: i === 3 ? "dutch" : p.angle }) }));
    const b = base(p);
    if (!b.grade) return [b.name, `var-${p.light}-2`, `var-${p.light}-3`, `var-${p.light}-4`].map((n) => ({ name: n, p }));
    const shots = ["medium", "close", "detail", "wide"];
    return shots.map((s) => ({ name: b.name, p: Object.assign({}, p, { shot: s }) }));
  }

  function credits() {
    const seen = new Set();
    return Object.values(PHOTOS).filter((v) => !seen.has(v.by) && seen.add(v.by)).map((v) => v.by);
  }

  const isRef = (p) => p.look === "illustration" || p.look === "clay";
  const refName = (p) => (p.look === "clay" ? "look-clay" : "look-painted");
  function focus(p) {
    if (isRef(p)) return PHOTOS[refName(p)].f;
    const ph = PHOTOS[base(p).name];
    return p.shot === "detail" && ph.rim ? ph.rim : ph.f;
  }
  window.SutaeruPhoto = { pick, isRef, refName, focus, PHOTOS, comp, hydrate, base, variants, credits, src, loadImg, framing };
})();

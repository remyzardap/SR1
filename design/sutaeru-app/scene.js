/* Sutaeru studio scene renderer.
   Draws one subject (a ceramic mug on a table) as an SVG sketch so every option a person can
   pick (shot, camera angle, lens, light, look, shape) is shown, not described.
   World space is 1000 x 1000; the camera is a viewBox that crops, zooms and tilts it.
   Colours inside the scene are picture colours, so they do not follow the UI theme. */
(function () {
  "use strict";

  const OPTIONS = {
    shot: [
      { id: "detail", label: "Detail", sub: "Rim and crema", zoom: 2.6 },
      { id: "close", label: "Close up", sub: "Mug fills frame", zoom: 1.7 },
      { id: "medium", label: "Medium", sub: "Mug and table", zoom: 1.12 },
      { id: "wide", label: "Wide", sub: "Whole corner", zoom: 0.68 },
    ],
    angle: [
      { id: "top", label: "Overhead", sub: "90° flat lay" },
      { id: "high", label: "High", sub: "45° down" },
      { id: "eye", label: "Eye level", sub: "0° straight on" },
      { id: "low", label: "Low", sub: "Looking up" },
      { id: "dutch", label: "Tilted", sub: "9° dutch" },
    ],
    lens: [
      { id: "24", label: "24mm", sub: "Wide, deep focus", ry: 1.28, rx: 1.06, bg: 0.74, blur: 0, zoom: 0.9 },
      { id: "35", label: "35mm", sub: "Natural, a little wide", ry: 1.12, rx: 1.03, bg: 0.88, blur: 1.2, zoom: 1 },
      { id: "50", label: "50mm", sub: "Like the eye", ry: 1, rx: 1, bg: 1, blur: 3, zoom: 1 },
      { id: "85", label: "85mm", sub: "Soft background", ry: 0.9, rx: 1, bg: 1.32, blur: 8, zoom: 1.08 },
      { id: "100", label: "100mm macro", sub: "Razor thin focus", ry: 0.86, rx: 1, bg: 1.6, blur: 14, zoom: 1.4 },
    ],
    light: [
      { id: "window", label: "Soft window", sub: "Morning, from the left" },
      { id: "golden", label: "Golden hour", sub: "Warm, long shadows" },
      { id: "studio", label: "Studio", sub: "Even, seamless" },
      { id: "backlit", label: "Backlit", sub: "Glow from behind" },
      { id: "night", label: "Night lamp", sub: "One warm pool" },
    ],
    look: [
      { id: "photo", label: "Photo", sub: "True to life" },
      { id: "film", label: "Film", sub: "Grain and fade" },
      { id: "illustration", label: "Illustration", sub: "Flat with outlines" },
      { id: "clay", label: "Clay 3D", sub: "Soft rendered" },
      { id: "ink", label: "Ink and dots", sub: "Halftone print" },
    ],
    ratio: [
      { id: "1:1", label: "Square", sub: "1:1", r: 1 },
      { id: "4:5", label: "Portrait", sub: "4:5", r: 0.8 },
      { id: "3:2", label: "Landscape", sub: "3:2", r: 1.5 },
      { id: "16:9", label: "Wide", sub: "16:9", r: 16 / 9 },
      { id: "9:16", label: "Story", sub: "9:16", r: 9 / 16 },
    ],
  };

  const DEFAULT = { shot: "medium", angle: "eye", lens: "50", light: "window", look: "photo", ratio: "1:1", label: "" };

  const byId = (group, id) => OPTIONS[group].find((o) => o.id === id) || OPTIONS[group][0];

  const LIGHT = {
    window: {
      wallT: "#ECE7DC", wallB: "#DCD4C5", tabT: "#C29A72", tabB: "#9E7049", grain: "#7E5536",
      mug: "#F3F0E9", hi: "#FFFFFF", shade: "#C7C0B3", deep: "#A8A093", rim: "#FBF9F4",
      coffee: "#3E2718", crema: "#8A5C3A", shadow: "#2E2116", shadowOp: 0.34, sx: 1, sy: 0.18, len: 1,
      key: "left", tint: "rgba(196,214,232,.10)", pane: "#FBFAF6", frame: "#CFC6B6", shaft: "rgba(255,255,255,.16)",
      leaf: "#5B7B55", leaf2: "#48663F", pot: "#D8CDBB", steam: "rgba(255,255,255,.55)",
    },
    golden: {
      wallT: "#F0CFA4", wallB: "#DCAA78", tabT: "#B9794A", tabB: "#8E5530", grain: "#6E3C1E",
      mug: "#F7EAD6", hi: "#FFF7EA", shade: "#CDA27A", deep: "#A97A52", rim: "#FFF3E2",
      coffee: "#3A2113", crema: "#94603A", shadow: "#3C1F0D", shadowOp: 0.42, sx: 1, sy: 0.14, len: 1.95,
      key: "left", tint: "rgba(255,146,56,.16)", pane: "#FFE5B5", frame: "#D9A877", shaft: "rgba(255,206,140,.26)",
      leaf: "#6C7A3C", leaf2: "#55612C", pot: "#D7A77C", steam: "rgba(255,240,220,.55)",
    },
    studio: {
      wallT: "#F2F2F0", wallB: "#DEDDDA", tabT: "#E2E1DD", tabB: "#D2D1CD", grain: "#BDBCB7",
      mug: "#F8F8F6", hi: "#FFFFFF", shade: "#C3C3BE", deep: "#A9A9A4", rim: "#FFFFFF",
      coffee: "#36231A", crema: "#8B634A", shadow: "#000000", shadowOp: 0.22, sx: 0.18, sy: 0.12, len: 0.45,
      key: "both", tint: "", pane: "#FFFFFF", frame: "#D6D5D1", shaft: "",
      leaf: "#5F7A5C", leaf2: "#4C6649", pot: "#E7E6E2", steam: "",
    },
    backlit: {
      wallT: "#D7CFC1", wallB: "#BFB4A3", tabT: "#9A7454", tabB: "#6F4E34", grain: "#553824",
      mug: "#B9B0A2", hi: "#FFFDF6", shade: "#7A7064", deep: "#5E564C", rim: "#E9E3D8",
      coffee: "#2A1A10", crema: "#6E4A30", shadow: "#1E140C", shadowOp: 0.36, sx: 0, sy: 1, len: 0.9,
      key: "back", tint: "rgba(255,244,222,.10)", pane: "#FFFDF4", frame: "#B9AE9C", shaft: "",
      leaf: "#4E5F45", leaf2: "#3D4C36", pot: "#A99C88", steam: "rgba(255,255,255,.5)",
    },
    night: {
      wallT: "#2F2A26", wallB: "#1D1916", tabT: "#4D3627", tabB: "#2E1F15", grain: "#22160E",
      mug: "#EAE2D5", hi: "#FFF0DA", shade: "#6E6152", deep: "#40362B", rim: "#F6EBDA",
      coffee: "#22140B", crema: "#6A4529", shadow: "#000000", shadowOp: 0.55, sx: -1, sy: 0.22, len: 1.15,
      key: "right", tint: "rgba(255,166,80,.08)", pane: "#243040", frame: "#3A332D", shaft: "",
      leaf: "#2E3A2A", leaf2: "#232D20", pot: "#4A4038", steam: "rgba(255,226,190,.38)",
    },
  };

  const INK = "#242320";
  let uid = 0;

  function palette(p) {
    const c = Object.assign({}, LIGHT[p.light] || LIGHT.window);
    if (p.look === "clay") {
      Object.assign(c, {
        mug: "#F28C6B", hi: "#FFC2AC", shade: "#D0623F", deep: "#B24F31", rim: "#F9A68D",
        coffee: "#6B3E2A", crema: "#A86A48", shadow: "#6F3F30", shadowOp: 0.24, pot: "#F4C9B5",
        leaf: "#6DBF8E", leaf2: "#55A877", grain: c.tabB,
      });
      if (p.light !== "night") Object.assign(c, { wallT: "#F7DACB", wallB: "#F0C4AF", tabT: "#AEDDD0", tabB: "#8CC7B8", pane: "#FFF6EC", frame: "#F1D2C1" });
    }
    if (p.look === "ink") {
      Object.assign(c, {
        wallT: "#F7F6F2", wallB: "#F7F6F2", tabT: "#F7F6F2", tabB: "#F7F6F2", grain: INK,
        mug: "#FFFFFF", hi: "#FFFFFF", shade: "#FFFFFF", deep: "#FFFFFF", rim: "#FFFFFF",
        coffee: "#FFFFFF", crema: "#FFFFFF", shadow: INK, pane: "#FFFFFF", frame: INK,
        leaf: "#FFFFFF", leaf2: "#FFFFFF", pot: "#FFFFFF", tint: "", shaft: "", steam: INK,
      });
    }
    return c;
  }

  function geo(p) {
    const L = byId("lens", p.lens);
    let g;
    if (p.angle === "top") g = { top: true, cx: 500, cy: 520, r: 112 };
    else if (p.angle === "high") g = { hz: 300, cx: 500, baseY: 690, h: 168, rxB: 94, rxT: 100, ryT: 50, ryB: 46 };
    else if (p.angle === "low") g = { hz: 800, cx: 500, baseY: 812, h: 280, rxB: 100, rxT: 86, ryT: 13, ryB: 5, low: true };
    else g = { hz: 540, cx: 500, baseY: 664, h: 204, rxB: 94, rxT: 100, ryT: 17, ryB: 15 };
    if (g.top) g.r *= L.rx;
    else {
      g.ryT *= L.ry; g.ryB *= L.ry; g.rxT *= L.rx; g.rxB *= L.rx; g.h *= L.rx;
      g.topY = g.baseY - g.h;
      g.mid = (g.baseY + g.topY) / 2;
    }
    g.L = L;
    return g;
  }

  function camera(p, g, ratio) {
    const shot = byId("shot", p.shot);
    const zoom = shot.zoom * g.L.zoom;
    const S = 1000 / zoom;
    const vw = S * Math.sqrt(ratio), vh = S / Math.sqrt(ratio);
    let fx = 500, fy;
    if (g.top) fy = p.shot === "detail" ? g.cy - 10 : g.cy;
    else if (p.shot === "detail") { fy = g.topY + 26; fx = 470; }
    else if (p.shot === "close") fy = g.mid - S * 0.02;
    else if (p.shot === "wide") fy = g.mid - S * 0.1;
    else fy = g.mid - S * 0.05;
    return { x: fx - vw / 2, y: fy - vh / 2, w: vw, h: vh, fx, fy, zoom };
  }

  const r1 = (n) => Math.round(n * 10) / 10;

  function render(params, opt) {
    opt = opt || {};
    const p = Object.assign({}, DEFAULT, params);
    const id = "s" + (++uid);
    const ratio = opt.ratio || byId("ratio", p.ratio).r;
    const c = palette(p);
    const g = geo(p);
    const cam = camera(p, g, ratio);
    const look = p.look;
    const flat = look === "illustration" || look === "ink";
    const outline = flat ? (look === "ink" ? 4 : 5) : 0;
    const oc = look === "ink" ? INK : "#2A2622";
    const blurBg = flat ? 0 : g.L.blur * (look === "clay" ? 0.7 : 1);
    const sh = [];
    const defs = [];

    // ── defs
    defs.push(`<linearGradient id="${id}w" x1="0" y1="${(g.hz || 0) - 900}" x2="0" y2="${g.hz || 1000}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.wallT}"/><stop offset="1" stop-color="${c.wallB}"/></linearGradient>`);
    defs.push(`<linearGradient id="${id}t" x1="0" y1="${g.hz || 0}" x2="0" y2="${(g.hz || 0) + 760}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.tabT}"/><stop offset="1" stop-color="${c.tabB}"/></linearGradient>`);
    if (blurBg) defs.push(`<filter id="${id}bb" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="${blurBg}"/></filter>`);
    const shBlur = look === "clay" ? 26 : flat ? 0 : 13;
    if (shBlur) defs.push(`<filter id="${id}sb" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${shBlur}"/></filter>`);
    defs.push(`<filter id="${id}s4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>`);
    if (look === "ink") {
      defs.push(`<pattern id="${id}h1" width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2.6" fill="${INK}"/><circle cx="12" cy="12" r="2.6" fill="${INK}"/></pattern>`);
      defs.push(`<pattern id="${id}h2" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="3" cy="3" r="3" fill="${INK}"/><circle cx="9" cy="9" r="3" fill="${INK}"/></pattern>`);
      defs.push(`<pattern id="${id}h0" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="5" cy="5" r="1.6" fill="${INK}"/></pattern>`);
    }

    // Body shading gradient across the cylinder
    if (!g.top) {
      const x1 = g.cx - g.rxT, x2 = g.cx + g.rxT;
      let stops;
      if (flat) stops = [[0, c.mug], [1, c.mug]];
      else if (c.key === "right") stops = [[0, c.deep], [0.25, c.shade], [0.62, c.mug], [0.86, c.hi], [1, c.shade]];
      else if (c.key === "both") stops = [[0, c.shade], [0.14, c.hi], [0.42, c.mug], [0.78, c.hi], [1, c.shade]];
      else if (c.key === "back") stops = [[0, c.hi], [0.07, c.shade], [0.5, c.deep], [0.93, c.shade], [1, c.hi]];
      else stops = [[0, c.shade], [0.13, c.hi], [0.36, c.mug], [0.74, c.shade], [1, c.deep]];
      defs.push(`<linearGradient id="${id}m" x1="${x1}" x2="${x2}" y1="0" y2="0" gradientUnits="userSpaceOnUse">${stops.map((s) => `<stop offset="${s[0]}" stop-color="${s[1]}"/>`).join("")}</linearGradient>`);
    } else {
      defs.push(`<radialGradient id="${id}m" cx="${g.cx - 30 * (c.sx || 0.5)}" cy="${g.cy - 30}" r="${g.r * 1.2}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${c.hi}"/><stop offset=".7" stop-color="${c.mug}"/><stop offset="1" stop-color="${c.shade}"/></radialGradient>`);
    }
    defs.push(`<radialGradient id="${id}c" cx=".42" cy=".38" r=".7"><stop offset="0" stop-color="${look === "ink" ? "#FFFFFF" : c.crema}"/><stop offset=".55" stop-color="${c.coffee}"/><stop offset="1" stop-color="${c.coffee}"/></radialGradient>`);

    // ── scene group (rotated for dutch)
    const rot = p.angle === "dutch" ? `rotate(-9 ${cam.fx} ${cam.fy}) translate(${cam.fx} ${cam.fy}) scale(1.22) translate(${-cam.fx} ${-cam.fy})` : "";
    const oy = g.top ? cam.fy : g.hz;
    const bgT = `translate(${cam.fx} ${oy}) scale(${g.L.bg}) translate(${-cam.fx} ${-oy})`;
    sh.push(`<g transform="${rot}">`);

    if (g.top) drawTop(sh, p, c, g, id, outline, oc, look);
    else drawSide(sh, p, c, g, id, outline, oc, look, bgT, blurBg, shBlur);

    sh.push(`</g>`);

    // ── overlays in camera space
    const V = `x="${r1(cam.x)}" y="${r1(cam.y)}" width="${r1(cam.w)}" height="${r1(cam.h)}"`;
    if (c.tint) sh.push(`<rect ${V} fill="${c.tint}"/>`);
    if (p.light === "backlit" && !g.top && look !== "ink") {
      defs.push(`<radialGradient id="${id}hz" cx=".5" cy=".18" r=".75"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".42"/><stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/></radialGradient>`);
      sh.push(`<rect ${V} fill="url(#${id}hz)"/>`);
    }
    const vig = look === "film" ? 0.42 : p.light === "night" ? 0.5 : look === "photo" ? 0.14 : 0;
    if (vig) {
      defs.push(`<radialGradient id="${id}v" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${vig}"/></radialGradient>`);
      sh.push(`<rect ${V} fill="url(#${id}v)"/>`);
    }
    if (look === "film") {
      const f = Math.min(3.2, 1.25 * cam.zoom);
      defs.push(`<filter id="${id}g" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${f}" numOctaves="1" seed="7" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .5 0"/></filter>`);
      sh.push(`<rect ${V} fill="rgba(255,236,206,.10)"/>`);
      sh.push(`<rect ${V} filter="url(#${id}g)" opacity="${opt.thumb ? 0.3 : 0.36}"/>`);
    }

    return `<svg viewBox="${r1(cam.x)} ${r1(cam.y)} ${r1(cam.w)} ${r1(cam.h)}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><defs>${defs.join("")}</defs>${sh.join("")}</svg>`;
  }

  function drawSide(sh, p, c, g, id, ow, oc, look, bgT, blurBg, shBlur) {
    const ink = look === "ink";
    const studio = p.light === "studio";
    // Wall and table
    sh.push(`<g ${blurBg ? `filter="url(#${id}bb)"` : ""}><g transform="${bgT}">`);
    sh.push(`<rect x="-3000" y="-3000" width="7000" height="${3600 + g.hz}" fill="url(#${id}w)"/>`);
    if (ink && p.light === "night") sh.push(`<rect x="-3000" y="-3000" width="7000" height="${3000 + g.hz}" fill="url(#${id}h0)"/>`);
    // Window
    if (p.light !== "studio") {
      const back = p.light === "backlit";
      const wx = back ? 290 : 40, ww = back ? 420 : 280, wy = g.hz - (back ? 520 : 480), wh = back ? 440 : 360;
      if (back && !ink) sh.push(`<ellipse cx="${wx + ww / 2}" cy="${wy + wh / 2}" rx="${ww * 0.95}" ry="${wh * 0.85}" fill="#FFFFFF" opacity=".35" filter="url(#${id}sb)"/>`);
      sh.push(`<rect x="${wx}" y="${wy}" width="${ww}" height="${wh}" rx="${look === "clay" ? 26 : 4}" fill="${c.frame}" ${ink ? `stroke="${INK}" stroke-width="${ow}"` : ""}/>`);
      const pw = (ww - 36) / 2, ph = (wh - 36) / 2;
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
        sh.push(`<rect x="${wx + 12 + i * (pw + 12)}" y="${wy + 12 + j * (ph + 12)}" width="${pw}" height="${ph}" rx="${look === "clay" ? 16 : 2}" fill="${c.pane}" ${ink ? `stroke="${INK}" stroke-width="${ow * 0.7}"` : ""}/>`);
      }
      if (p.light === "night" && !ink) {
        const pts = [[70, 60], [150, 110], [205, 70], [100, 150], [230, 160], [180, 210], [80, 240], [240, 260]];
        pts.forEach(([x, y]) => sh.push(`<circle cx="${wx + x}" cy="${wy + y}" r="4" fill="#FFD9A0" opacity=".8"/>`));
      }
      if (p.light === "golden" && !ink && look !== "clay") sh.push(`<circle cx="${wx + 70}" cy="${wy + wh - 70}" r="46" fill="#FFF1C8" opacity=".9" filter="url(#${id}s4)"/>`);
    }
    // Plant at the back right (seen in wider shots)
    const px = 790, pb = g.hz + 6;
    if (!studio) {
    sh.push(`<g ${ow ? `stroke="${oc}" stroke-width="${ow}" stroke-linejoin="round"` : ""}>`);
    const leaves = [[-34, -150, -28], [0, -186, 4], [34, -150, 30], [-60, -100, -55], [58, -102, 52], [-14, -120, -12], [18, -128, 16]];
    leaves.forEach(([dx, dy, a], i) => sh.push(`<ellipse cx="${px + 50 + dx}" cy="${pb - 120 + dy * 0.6}" rx="22" ry="62" transform="rotate(${a} ${px + 50 + dx} ${pb - 120 + dy * 0.6})" fill="${i % 2 ? c.leaf : c.leaf2}"/>`));
    sh.push(`<path d="M${px} ${pb - 120} h100 l-12 120 h-76 Z" fill="${c.pot}"/>`);
    sh.push(`</g>`);
    }
    sh.push(`</g></g>`);

    // Table plane
    if (!studio) {
      sh.push(`<rect x="-3000" y="${g.hz}" width="7000" height="4000" fill="url(#${id}t)" ${ow ? `stroke="${oc}" stroke-width="${ow}"` : ""}/>`);
      // planks converge to the vanishing point
      const n = 15, op = ink ? 0.45 : look === "clay" ? 0.12 : 0.28;
      for (let i = 0; i < n; i++) {
        const k = i - (n - 1) / 2;
        sh.push(`<line x1="${500 + k * 42}" y1="${g.hz}" x2="${500 + k * 300}" y2="${g.hz + 1600}" stroke="${c.grain}" stroke-width="${ink ? 2 : 2.4}" opacity="${op}"/>`);
      }
      if (!flat(look)) sh.push(`<rect x="-3000" y="${g.hz}" width="7000" height="10" fill="#000" opacity=".12" filter="url(#${id}s4)"/>`);
    } else {
      sh.push(`<rect x="-3000" y="${g.hz}" width="7000" height="4000" fill="url(#${id}t)"/>`);
    }
    // Light shaft from the window across the table
    if (c.shaft && !g.low) sh.push(`<path d="M${g.cx - 300} ${g.hz + 20} L${g.cx + 420} ${g.hz + 20} L${g.cx + 600} ${g.baseY + 170} L${g.cx - 140} ${g.baseY + 170} Z" fill="${c.shaft}" ${shBlur ? `filter="url(#${id}sb)"` : ""}/>`);
    // Lamp pool at night
    if (p.light === "night" && !ink) {
      sh.push(`<radialGradient id="${id}lp" cx="${g.cx + 220}" cy="${g.topY - 160}" r="620" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFB868" stop-opacity=".42"/><stop offset="1" stop-color="#FFB868" stop-opacity="0"/></radialGradient>`);
      sh.push(`<rect x="-3000" y="-3000" width="7000" height="7000" fill="url(#${id}lp)"/>`);
    }

    // Shadow cast by the mug
    const len = c.len;
    const scx = g.cx + c.sx * len * 120, scy = g.baseY + c.sy * len * (g.ryB * 2 + 26) + 4;
    const srx = g.rxB * (1 + 0.75 * len * Math.abs(c.sx)) + (c.sy > 0.5 ? 10 : 0);
    const sry = g.ryB + 10 + (c.sy > 0.5 ? 34 : 0) + (p.angle === "high" ? 12 : 0);
    if (ink) sh.push(`<ellipse cx="${scx}" cy="${scy}" rx="${srx}" ry="${sry}" fill="url(#${id}h2)"/>`);
    else sh.push(`<ellipse cx="${scx}" cy="${scy}" rx="${srx}" ry="${sry}" fill="${c.shadow}" opacity="${c.shadowOp}" ${shBlur ? `filter="url(#${id}sb)"` : ""}/>`);
    if (!flat(look)) sh.push(`<ellipse cx="${g.cx}" cy="${g.baseY + 2}" rx="${g.rxB * 1.02}" ry="${g.ryB * 0.9 + 5}" fill="#000" opacity=".32" filter="url(#${id}s4)"/>`);

    drawMug(sh, p, c, g, id, ow, oc, look);

    // Steam
    if (c.steam && !g.low) {
      const sw = ink ? `stroke-dasharray="10 12"` : `filter="url(#${id}s4)"`;
      [-34, 0, 34].forEach((dx, i) => {
        const x = g.cx + dx, y = g.topY - 14 - i * 6;
        sh.push(`<path d="M${x} ${y} c-16 -24 16 -44 0 -68 s16 -44 0 -68" fill="none" stroke="${c.steam}" stroke-width="${ink ? 3.5 : 7}" stroke-linecap="round" ${sw}/>`);
      });
    }
  }

  const flat = (look) => look === "illustration" || look === "ink";

  function drawMug(sh, p, c, g, id, ow, oc, look) {
    const ink = look === "ink";
    const { cx, topY, baseY, rxT, rxB, ryT, ryB } = g;
    const strokeA = ow ? `stroke="${oc}" stroke-width="${ow}" stroke-linejoin="round"` : "";
    // Handle (drawn first so the body overlaps its ends)
    const hx = cx + (rxT + rxB) / 2 - 4, h1 = topY + g.h * 0.24, h2 = baseY - g.h * 0.24;
    const hd = `M${hx} ${h1} C${hx + 86} ${h1 - 8} ${hx + 92} ${h2 + 10} ${hx - 2} ${h2}`;
    if (ow) sh.push(`<path d="${hd}" fill="none" stroke="${oc}" stroke-width="${24 + ow * 2}" stroke-linecap="round"/>`);
    sh.push(`<path d="${hd}" fill="none" stroke="${flat(look) ? c.mug : c.key === "right" ? c.mug : c.shade}" stroke-width="24" stroke-linecap="round"/>`);
    if (!flat(look)) sh.push(`<path d="${hd}" fill="none" stroke="${c.deep}" stroke-width="8" stroke-linecap="round" opacity=".35" transform="translate(4 3)"/>`);

    // Body: sides, rounded base, closed over the back of the rim
    const body = `M${cx - rxT} ${topY} L${cx - rxB} ${baseY} A${rxB} ${ryB} 0 0 0 ${cx + rxB} ${baseY} L${cx + rxT} ${topY} A${rxT} ${ryT} 0 0 0 ${cx - rxT} ${topY} Z`;
    sh.push(`<clipPath id="${id}bc"><path d="${body}"/></clipPath>`);
    sh.push(`<path d="${body}" fill="url(#${id}m)" ${strokeA}/>`);
    if (look === "clay") sh.push(`<path d="${body}" fill="none" stroke="${c.mug}" stroke-width="10" stroke-linejoin="round" opacity=".6"/>`);
    // Flat shading on the side away from the light
    if (flat(look)) {
      const right = c.key !== "right";
      const sx = right ? cx + rxT * 0.28 : cx - rxT * 1.2;
      sh.push(`<g clip-path="url(#${id}bc)"><rect x="${sx}" y="${topY - 40}" width="${rxT * 0.92}" height="${g.h + 80}" fill="${ink ? `url(#${id}h1)` : c.shade}"/></g>`);
      if (c.key === "back") sh.push(`<g clip-path="url(#${id}bc)"><rect x="${cx - rxT}" y="${topY - 40}" width="${rxT * 2}" height="${g.h + 80}" fill="${ink ? `url(#${id}h1)` : c.shade}"/></g>`);
      if (ow) sh.push(`<path d="${body}" fill="none" ${strokeA}/>`);
    }
    // Speckles in the glaze
    if (look === "photo" || look === "film") {
      const dots = [];
      for (let i = 0; i < 46; i++) {
        const a = (i * 137.5) % 360, t = ((i * 0.61803) % 1);
        const x = cx - rxT * 0.86 + ((a / 360) * rxT * 1.72), y = topY + 16 + t * (g.h - 26);
        dots.push(`<circle cx="${r1(x)}" cy="${r1(y)}" r="${1.4 + (i % 3) * 0.5}" fill="${c.deep}" opacity=".45"/>`);
      }
      sh.push(`<g clip-path="url(#${id}bc)">${dots.join("")}</g>`);
    }
    // Printed label (shown when the prompt asks for words on the mug)
    if (p.label && !g.low) {
      const ty = topY + g.h * 0.52;
      sh.push(`<g clip-path="url(#${id}bc)"><text x="${cx - 6}" y="${ty}" text-anchor="middle" font-family="Inter Tight, Inter, sans-serif" font-weight="800" font-size="${Math.min(34, 210 / Math.max(4, p.label.length))}" letter-spacing="3" fill="${INK}">${esc(p.label)}</text><rect x="${cx - 40}" y="${ty + 14}" width="68" height="6" rx="3" fill="#F4511E"/></g>`);
    }
    // Specular highlight strip
    if (!flat(look)) {
      const hx2 = c.key === "right" ? cx + rxT * 0.55 : c.key === "back" ? cx - rxT * 0.92 : cx - rxT * 0.62;
      const w = look === "clay" ? 26 : 14;
      sh.push(`<g clip-path="url(#${id}bc)"><rect x="${hx2}" y="${topY + 18}" width="${w}" height="${g.h - 40}" rx="${w / 2}" fill="#FFFFFF" opacity="${look === "clay" ? 0.38 : 0.5}" filter="url(#${id}s4)"/></g>`);
      if (c.key === "back") sh.push(`<g clip-path="url(#${id}bc)"><rect x="${cx + rxT * 0.8}" y="${topY + 10}" width="12" height="${g.h - 20}" rx="6" fill="#FFFFFF" opacity=".7" filter="url(#${id}s4)"/></g>`);
      if (c.key === "both") sh.push(`<g clip-path="url(#${id}bc)"><rect x="${cx + rxT * 0.5}" y="${topY + 18}" width="10" height="${g.h - 40}" rx="5" fill="#FFFFFF" opacity=".55" filter="url(#${id}s4)"/></g>`);
    }
    // Rim and coffee (seen from above), or the rim edge alone (seen from below)
    if (!g.low) {
      sh.push(`<ellipse cx="${cx}" cy="${topY}" rx="${rxT}" ry="${ryT}" fill="${c.rim}" ${strokeA}/>`);
      const iry = Math.max(2, ryT * 0.8), irx = rxT - 10;
      sh.push(`<ellipse cx="${cx}" cy="${topY + ryT * 0.08}" rx="${irx}" ry="${iry}" fill="${ink ? `url(#${id}h2)` : `url(#${id}c)`}" ${ow ? `stroke="${oc}" stroke-width="${ow * 0.7}"` : ""}/>`);
      if (!flat(look) && iry > 8) sh.push(`<ellipse cx="${cx - irx * 0.25}" cy="${topY}" rx="${irx * 0.4}" ry="${iry * 0.3}" fill="${c.crema}" opacity=".5" filter="url(#${id}s4)"/>`);
    } else {
      sh.push(`<path d="M${cx - rxT} ${topY} A${rxT} ${ryT} 0 0 1 ${cx + rxT} ${topY}" fill="none" stroke="${ow ? oc : c.hi}" stroke-width="${ow || 3}" opacity="${ow ? 1 : 0.7}"/>`);
    }
    if (c.key === "back" && !flat(look)) sh.push(`<path d="${body}" fill="none" stroke="#FFFFFF" stroke-width="4" opacity=".55" filter="url(#${id}s4)"/>`);
  }

  function drawTop(sh, p, c, g, id, ow, oc, look) {
    const ink = look === "ink";
    const strokeA = ow ? `stroke="${oc}" stroke-width="${ow}"` : "";
    // Table top fills the frame; planks run across
    sh.push(`<rect x="-3000" y="-3000" width="7000" height="7000" fill="${look === "ink" ? "#F7F6F2" : c.tabT}"/>`);
    if (p.light !== "studio") {
      for (let i = -12; i < 22; i++) sh.push(`<line x1="-3000" y1="${i * 120}" x2="4000" y2="${i * 120}" stroke="${c.grain}" stroke-width="${ink ? 2 : 3}" opacity="${ink ? 0.4 : look === "clay" ? 0.1 : 0.3}"/>`);
      if (!flat(look)) for (let i = 0; i < 6; i++) sh.push(`<ellipse cx="${120 + i * 170}" cy="${(i % 2 ? 300 : 780) + i * 8}" rx="26" ry="9" fill="none" stroke="${c.grain}" stroke-width="2" opacity=".25"/>`);
    }
    if (p.light === "night" && !ink) sh.push(`<radialGradient id="${id}lp" cx="${g.cx + 200}" cy="${g.cy - 220}" r="700" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#FFB868" stop-opacity=".45"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient><rect x="-3000" y="-3000" width="7000" height="7000" fill="url(#${id}lp)"/>`);
    if (c.shaft) sh.push(`<path d="M-400 120 L1500 -300 L1500 160 L-400 600 Z" fill="${c.shaft}" ${flat(look) ? "" : `filter="url(#${id}sb)"`}/>`);
    // Flat lay props: notebook, pen, leaves
    sh.push(`<g ${ow ? `stroke="${oc}" stroke-width="${ow}" stroke-linejoin="round"` : ""}>`);
    sh.push(`<g transform="rotate(-8 210 770)"><rect x="70" y="660" width="280" height="200" rx="${look === "clay" ? 18 : 6}" fill="${ink ? "#FFFFFF" : look === "clay" ? "#FFF3E8" : "#EEE9DF"}"/>${[0, 1, 2, 3, 4].map((i) => `<line x1="100" y1="${700 + i * 32}" x2="${310 - (i === 4 ? 90 : 0)}" y2="${700 + i * 32}" stroke="${ink ? INK : "#B9B2A6"}" stroke-width="3" opacity=".7"/>`).join("")}</g>`);
    sh.push(`<rect x="380" y="770" width="230" height="14" rx="7" transform="rotate(-18 495 777)" fill="${ink ? "#FFFFFF" : "#2B2A27"}"/>`);
    [[860, 160, 30], [930, 230, 70], [820, 90, -10], [960, 120, 40]].forEach(([x, y, a], i) => sh.push(`<ellipse cx="${x}" cy="${y}" rx="34" ry="92" transform="rotate(${a} ${x} ${y})" fill="${i % 2 ? c.leaf : c.leaf2}"/>`));
    sh.push(`</g>`);
    // Shadow
    const dx = (c.sx || 0) * 34 * c.len + 10, dy = (c.sy || 0) * 30 + 16;
    if (ink) sh.push(`<circle cx="${g.cx + dx}" cy="${g.cy + dy}" r="${g.r + 6}" fill="url(#${id}h2)"/>`);
    else sh.push(`<circle cx="${g.cx + dx}" cy="${g.cy + dy}" r="${g.r + 4}" fill="${c.shadow}" opacity="${c.shadowOp}" ${flat(look) ? "" : `filter="url(#${id}sb)"`}/>`);
    // Handle loop
    const hx = g.cx + g.r - 12;
    if (ow) sh.push(`<rect x="${hx}" y="${g.cy - 30}" width="${g.r * 0.72}" height="60" rx="30" fill="${oc}"/>`);
    sh.push(`<rect x="${hx + (ow ? ow : 0)}" y="${g.cy - 30 + (ow ? ow : 0)}" width="${g.r * 0.72 - (ow ? ow * 2 : 0)}" height="${60 - (ow ? ow * 2 : 0)}" rx="${30 - ow}" fill="${flat(look) ? c.mug : c.shade}"/>`);
    sh.push(`<rect x="${hx + 22}" y="${g.cy - 11}" width="${g.r * 0.72 - 44}" height="22" rx="11" fill="${look === "ink" ? "#F7F6F2" : c.tabT}" ${strokeA}/>`);
    // Cup seen from above
    sh.push(`<circle cx="${g.cx}" cy="${g.cy}" r="${g.r}" fill="${flat(look) ? c.mug : `url(#${id}m)`}" ${strokeA}/>`);
    sh.push(`<circle cx="${g.cx}" cy="${g.cy}" r="${g.r - 15}" fill="${ink ? `url(#${id}h2)` : `url(#${id}c)`}" ${ow ? `stroke="${oc}" stroke-width="${ow * 0.7}"` : ""}/>`);
    if (!ink) sh.push(`<path d="M${g.cx - 40} ${g.cy - 30} q40 -26 80 0" fill="none" stroke="${c.crema}" stroke-width="7" stroke-linecap="round" opacity=".55"/>`);
    if (!flat(look)) sh.push(`<circle cx="${g.cx - g.r * 0.45}" cy="${g.cy - g.r * 0.45}" r="${g.r * 0.12}" fill="#FFFFFF" opacity=".55" filter="url(#${id}s4)"/>`);
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]); }

  /* Engine character previews come from the same renderer, set to what each engine does best. */
  const ENGINES = [
    { id: "gemini", name: "Gemini", time: "10 to 17 s", line: "Best at clean text and crisp shapes.", meters: { Speed: 4, Detail: 3, Text: 5 }, cost: 2,
      preview: { shot: "medium", angle: "eye", lens: "50", light: "studio", look: "illustration", label: "SUTAERU" } },
    { id: "openai", name: "OpenAI", time: "12 to 20 s", line: "Soft light and a cinematic mood.", meters: { Speed: 3, Detail: 4, Text: 3 }, cost: 3,
      preview: { shot: "medium", angle: "eye", lens: "85", light: "night", look: "film" } },
    { id: "wan", name: "Wan", time: "16 s and up", line: "Fine natural detail and texture.", meters: { Speed: 2, Detail: 5, Text: 2 }, cost: 2,
      preview: { shot: "close", angle: "high", lens: "100", light: "window", look: "photo" } },
  ];

  window.SutaeruScene = { render, OPTIONS, DEFAULT, ENGINES, byId };
})();

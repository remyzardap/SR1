// WCAG contrast audit for the Studio-standard redo styles. Static analysis, no browser:
//   node scripts/contrast-check.mjs            # human report, exit 1 on any failure
//   node scripts/contrast-check.mjs --json      # machine-readable failures
//   node scripts/contrast-check.mjs --all       # also list every passing check
//
// It reads the colour tokens defined under client/src/styles/** in real cascade order (the
// stylesheet imports in client/src/main.tsx, then the @imports inside each file), resolves them
// per theme through var() indirection, color-mix() and alpha compositing, then measures the
// pairs the redo stylesheets actually ship, in light and dark:
//   text   4.5:1, or 3:1 for large text (>= 24px, or >= 18.66px at weight >= 700) — SC 1.4.3
//   glyph  3:1 for icons and other meaningful graphics                — SC 1.4.11
//   ui     3:1 for focus indicators                                   — SC 1.4.11 / 2.4.7
// Pairs come from two places. (1) Automatically, from any redo rule that declares both a text
// colour and a solid background in the same block — no assumption needed. (2) From the CURATED
// list, which covers combinations a single rule cannot see (quiet text on panel, hero text,
// chips and buttons whose colour comes from a parent). Each curated entry cites the selector it
// came from and the script verifies that selector still exists, so the list cannot silently
// drift. Findings the static method cannot judge (text over a photograph, the scaled document
// preview mock, resting hairline borders) are reported as ADVISORY with a reason and do not
// fail the run; --strict promotes them to failures.
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "client/src");
const args = process.argv.slice(2);
const AS_JSON = args.includes("--json");
const SHOW_ALL = args.includes("--all");
const STRICT = args.includes("--strict");

// ── CSS reading ────────────────────────────────────────────────────────────
function cssFileOrder() {
  const seen = new Set();
  const order = [];
  const visit = (abs) => {
    if (!abs || !existsSync(abs)) return;
    const norm = resolve(abs);
    if (seen.has(norm)) return;
    seen.add(norm);
    const text = readFileSync(norm, "utf8");
    for (const m of text.matchAll(/^\s*@import\s+["']([^"']+)["']/gm)) {
      const target = m[1];
      if (/^(https?:)?\/\//.test(target)) continue;
      visit(target.startsWith(".") ? resolve(dirname(norm), target) : join(SRC, target));
    }
    order.push({ abs: norm, text });
  };
  // main.tsx lists every stylesheet the app ships, in the order the browser sees them.
  const main = readFileSync(join(SRC, "main.tsx"), "utf8");
  for (const m of main.matchAll(/^\s*import\s+["']([^"']+\.css)["']/gm)) {
    if (!m[1].startsWith(".")) continue; // @fontsource/… carries no tokens
    visit(join(SRC, m[1]));
  }
  return order;
}

// Comments blanked, not removed, so every offset still maps to its original line.
function blankComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    if (src[i] === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
    } else out += src[i++];
  }
  return out;
}

function matchingBrace(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return i;
  }
  return src.length - 1;
}

// Split on a separator that sits at paren depth 0 and outside quotes.
function splitTop(value, sep) {
  const parts = [];
  let depth = 0, quote = null, cur = "";
  for (let i = 0; i < value.length; i++) {
    const ch = value[i];
    if (quote) {
      cur += ch;
      if (ch === quote && value[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === sep && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function splitWs(value) {
  const parts = [];
  let depth = 0, cur = "";
  for (const ch of value) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && depth === 0) {
      if (cur) parts.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function lineMapper(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return (offset) => {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= offset) lo = mid; else hi = mid - 1;
    }
    return lo + 1;
  };
}

// Flat rule list. The redo stylesheets use no nesting; a nested block inside a rule is skipped.
function parseRules(src, file, conds, out, lineOf, offsetBase = 0) {
  let i = 0;
  while (i < src.length) {
    let j = i, depth = 0, quote = null;
    while (j < src.length) {
      const ch = src[j];
      if (quote) {
        if (ch === quote && src[j - 1] !== "\\") quote = null;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
      else if ((ch === "{" || ch === ";") && depth === 0) break;
      j++;
    }
    if (j >= src.length) break;
    const prelude = src.slice(i, j).trim();
    if (src[j] === ";") { i = j + 1; continue; }
    const bodyStart = j + 1;
    const bodyEnd = matchingBrace(src, j);
    if (prelude.startsWith("@")) {
      const name = prelude.split(/\s+/)[0].toLowerCase();
      // @keyframes / @font-face / @property hold no theme-relevant colour pairs.
      if (["@media", "@supports", "@container", "@layer"].includes(name)) {
        parseRules(src.slice(bodyStart, bodyEnd), file, [...conds, prelude], out, lineOf, offsetBase + bodyStart);
      }
    } else {
      const decls = [];
      const body = src.slice(bodyStart, bodyEnd);
      let k = 0;
      while (k < body.length) {
        let m = k, d = 0, q = null;
        while (m < body.length) {
          const ch = body[m];
          if (q) {
            if (ch === q && body[m - 1] !== "\\") q = null;
          } else if (ch === '"' || ch === "'") q = ch;
          else if (ch === "(") d++;
          else if (ch === ")") d--;
          else if ((ch === ";" || ch === "{") && d === 0) break;
          m++;
        }
        if (m >= body.length) break;
        if (body[m] === "{") { k = matchingBrace(body, m) + 1; continue; }
        const chunk = body.slice(k, m).trim();
        const colon = chunk.indexOf(":");
        if (colon > 0) {
          decls.push({
            prop: chunk.slice(0, colon).trim().toLowerCase(),
            value: chunk.slice(colon + 1).trim(),
            line: lineOf(offsetBase + bodyStart + m),
          });
        }
        k = m + 1;
      }
      out.push({ selector: prelude.replace(/\s+/g, " "), conds, decls, file, line: lineOf(offsetBase + i) });
    }
    i = bodyEnd + 1;
  }
}

const rules = [];
for (const { abs, text } of cssFileOrder()) {
  const src = blankComments(text);
  const rel = abs.startsWith(ROOT) ? abs.slice(ROOT.length + 1) : abs;
  parseRules(src, rel, [], rules, lineMapper(src));
}
const inRedo = (file) => file.startsWith("client/src/styles/redo/");

// ── theme applicability ────────────────────────────────────────────────────
// :not([data-theme="light"]) means "not explicitly light", so :not(...) is stripped before
// looking for theme hooks — otherwise the auto-dark guard would read as light-only.
const stripNot = (sel) => sel.replace(/:not\([^)]*\)/g, "");
function selectorTheme(sel) {
  const s = stripNot(sel);
  let theme = "any";
  const set = (t) => { theme = theme === "any" || theme === t ? t : "conflict"; };
  for (const m of s.matchAll(/\[data-(?:theme|mode)="(dark|light)"\]/g)) set(m[1]);
  for (const m of s.matchAll(/(?:^|[\s,>+~])\.(dark|light)(?![\w-])/g)) set(m[1]);
  return theme;
}
function conditionsTheme(conds) {
  let theme = "any";
  for (const c of conds) {
    const m = c.match(/prefers-color-scheme:\s*(dark|light)/);
    if (!m) continue;
    theme = theme === "any" || theme === m[1] ? m[1] : "conflict";
  }
  return theme;
}
function appliesTo(rule, theme) {
  const cond = conditionsTheme(rule.conds);
  const sel = selectorTheme(rule.selector);
  if (sel === "conflict" || cond === "conflict") return false;
  if (sel !== "any") return sel === theme; // an explicit choice beats prefers-color-scheme
  return cond === "any" || cond === theme;
}

// ── colour maths ───────────────────────────────────────────────────────────
const NAMED = { white: "#fff", black: "#000", transparent: "rgba(0,0,0,0)" };

function parseColor(raw) {
  const v = String(raw).trim().toLowerCase();
  if (!v) return null;
  if (NAMED[v]) return parseColor(NAMED[v]);
  let m = v.match(/^#([\da-f]{3,8})$/);
  if (m) {
    const h = m[1];
    const ch = (i, n) => parseInt(h.slice(i, i + n), 16) / (n === 1 ? 15 : 255);
    if (h.length === 3) return { r: ch(0, 1), g: ch(1, 1), b: ch(2, 1), a: 1 };
    if (h.length === 4) return { r: ch(0, 1), g: ch(1, 1), b: ch(2, 1), a: ch(3, 1) };
    if (h.length === 6) return { r: ch(0, 2), g: ch(2, 2), b: ch(4, 2), a: 1 };
    if (h.length === 8) return { r: ch(0, 2), g: ch(2, 2), b: ch(4, 2), a: ch(6, 2) };
    return null;
  }
  m = v.match(/^rgba?\(([^)]*)\)$/);
  if (m) return rgbArgs(m[1]);
  m = v.match(/^hsla?\(([^)]*)\)$/);
  if (m) return hslArgs(m[1]);
  return null;
}

function rgbArgs(inner) {
  const [head, alphaPart] = inner.split("/");
  const nums = splitTop(head, ",");
  if (nums.length < 3) return null;
  const chan = (s) => (s.trim().endsWith("%") ? parseFloat(s) / 100 : parseFloat(s) / 255);
  const [r, g, b] = nums.slice(0, 3).map(chan);
  if ([r, g, b].some((n) => !Number.isFinite(n))) return null;
  let a = alphaPart !== undefined ? parseFloat(alphaPart) : nums.length >= 4 ? parseFloat(nums[3]) : 1;
  if (alphaPart?.trim().endsWith("%")) a = parseFloat(alphaPart) / 100;
  return { r, g, b, a: Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1 };
}

function hslArgs(inner) {
  const parts = splitTop(inner.replace(/\//g, ","), ",");
  if (parts.length < 3) return null;
  const h = parseFloat(parts[0]) / 360;
  const s = parseFloat(parts[1]) / 100;
  const l = parseFloat(parts[2]) / 100;
  if (![h, s, l].every(Number.isFinite)) return null;
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1;
  return { r: f(0), g: f(8), b: f(4), a: Number.isFinite(a) ? Math.max(0, Math.min(1, a)) : 1 };
}

// Resolve any value to {r,g,b,a}, following var() chains and evaluating color-mix().
function resolveColor(raw, tokens, seen = new Set()) {
  if (raw == null) return null;
  let v = String(raw).trim();
  if (!v || /^(inherit|initial|unset|revert|currentcolor|none|auto)$/.test(v.toLowerCase())) return null;

  for (let guard = 0; guard < 24; guard++) {
    const m = v.match(/^var\(\s*(--[\w-]+)\s*(,[\s\S]*)?\)$/);
    if (!m) break;
    if (seen.has(m[1])) return null;
    seen.add(m[1]);
    const next = tokens.get(m[1]);
    if (next !== undefined) { v = String(next).trim(); continue; }
    if (!m[2]) return null;
    v = m[2].slice(1).trim();
  }

  const mix = v.match(/^color-mix\(\s*in\s+[\w-]+(.?)\s*,([\s\S]*)\)$/);
  if (mix) {
    const parts = splitTop(mix[2], ",");
    if (parts.length !== 2) return null;
    const arg = (s) => {
      const ws = splitWs(s);
      const last = ws[ws.length - 1] ?? "";
      const pct = /%$/.test(last) ? parseFloat(last) : null;
      const color = pct === null ? s : s.slice(0, s.lastIndexOf(last)).trim();
      return { c: resolveColor(color, tokens, new Set(seen)), pct };
    };
    const a = arg(parts[0]);
    const b = arg(parts[1]);
    if (!a.c || !b.c) return null;
    // sRGB mixing is gamma-encoded, alpha premultiplied (css-color-5 §interpolation).
    const pa = (a.pct ?? (b.pct === null ? 50 : 100 - b.pct)) / 100;
    const pb = (b.pct ?? 100 * (1 - pa)) / 100;
    const out = { r: 0, g: 0, b: 0, a: a.c.a * pa + b.c.a * pb };
    for (const c of ["r", "g", "b"]) {
      out[c] = out.a > 0 ? (a.c[c] * a.c.a * pa + b.c[c] * b.c.a * pb) / out.a : 0;
    }
    return out;
  }

  return parseColor(v); // gradients, lengths and unknown functions → null
}

const composite = (fg, bg) =>
  !fg ? null : fg.a >= 1 || !bg ? { ...fg, a: 1 } : {
    r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1,
  };

function luminance(c) {
  const f = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
}
function ratio(fg, bg) {
  if (!fg || !bg) return null;
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
}
function hex(c) {
  if (!c) return "n/a";
  const to = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0").toUpperCase();
  return `#${to(c.r)}${to(c.g)}${to(c.b)}${c.a < 1 ? `@${c.a.toFixed(2)}` : ""}`;
}
const same = (a, b) => !!a && !!b && hex(a) === hex(b);

// ── per-theme token tables (cascade: specificity, then document order) ─────
const isRootSelector = (sel) =>
  splitTop(sel, ",").every((part) =>
    /^(:root|html|body)(\[[^\]]+\]|\.[-\w]+|:not\([^)]*\))*$/i.test(part) ||
    /^\.(dark|light)$/i.test(part) ||
    /^(?:html|body)\.(dark|light)$/i.test(part) ||
    /^\[[^\]]+="[^"]+"\]$/.test(part)
  );
const specificity = (sel) =>
  splitTop(sel, ",").reduce((max, part) => {
    const s = stripNot(part);
    const a = (s.match(/#[\w-]+/g) || []).length;
    const b = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!not\b|:)[\w-]+/g) || []).length;
    const c = (s.match(/(?:^|[\s>+~])(?:\*|[a-z][\w-]*)/gi) || []).length;
    return Math.max(max, a * 100 + b * 10 + c);
  }, 0);

const TOKENS = { light: new Map(), dark: new Map() };
const WEIGHT = { light: new Map(), dark: new Map() };
let order = 0;
for (const rule of rules) {
  if (!isRootSelector(rule.selector)) continue;
  const weight = specificity(rule.selector) * 1e6 + ++order;
  for (const d of rule.decls) {
    if (!d.prop.startsWith("--")) continue;
    for (const theme of ["light", "dark"]) {
      if (!appliesTo(rule, theme)) continue;
      if ((WEIGHT[theme].get(d.prop) ?? -1) > weight) continue;
      WEIGHT[theme].set(d.prop, weight);
      TOKENS[theme].set(d.prop, d.value); // raw: var() chains are followed at lookup time
    }
  }
}
const tok = (theme, name) => resolveColor(`var(${name})`, TOKENS[theme]);

// ── thresholds ─────────────────────────────────────────────────────────────
const WEIGHT_WORDS = { thin: 100, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700 };
function ruleType(rule) {
  let size = null, weight = null, opacity = 1;
  for (const d of rule.decls) {
    if (d.prop === "font-size" || d.prop === "font") {
      const found = d.value.match(/(\d*\.?\d+)(px|rem)\b/);
      if (found) size = parseFloat(found[1]) * (found[2] === "rem" ? 16 : 1);
    }
    if (d.prop === "font-weight") weight = WEIGHT_WORDS[d.value] ?? parseFloat(d.value);
    if (d.prop === "font") {
      const w = d.value.match(/(?:^|\s)(\d00)\b/);
      if (w) weight = parseInt(w[1], 10);
    }
    if (d.prop === "opacity") opacity = Math.max(0, Math.min(1, parseFloat(d.value) || 1));
  }
  return { size, weight, opacity };
}
const need = (kind, size, weight) =>
  kind === "text" ? (size !== null && (size >= 24 || (size >= 18.66 && weight >= 700)) ? 3 : 4.5) : 3;

// A class name ending in one of these marks a graphic (icon, arrow, dot), not running text.
const GLYPH = /(?:^|[\s,>+~])[\w.\-\[\]"=]*\.[\w-]*(ico|icon|svg|mark|dot|tick|arrow|chev|glyph|plus|spinner|stamp|ramp|dither|thumb|pic|photo|art|ftype)\b/;
// Contrast here is not app UI text: it sits on a photograph or user image, or inside the scaled
// document-preview mock. Reported as advisory, with the number it measures on its own surface.
const IMAGERY = [
  [/(?:^|[\s,>+~])\.dp[-\w]*/, "document-preview mock: a picture of a page scaled to 30%, not UI text"],
  [/(?:^|[\s,>+~])\.(sc|sc-|ph-img|run-chip|st-stamp|doc-stamp|live-photo|live-tag)/, "text or graphic laid over a photograph; the image sets the contrast"],
];
const advisoryReason = (sel) => IMAGERY.find(([re]) => re.test(sel))?.[1] ?? null;
// A background painted with alpha (a tint or hairline wash) is only half the story: the colour
// behind it comes from the container. Known containers, so the composite is measured, not guessed.
const BACKDROP = [
  [/(?:^|[\s,>+~])[\w.\-\[\]"=]*\.(on-hero|hero-card|result|figs|done-stamp|sent-line)\b|\.hero-/, "--hero", "hero card"],
];
function backdropToken(selector) {
  const hit = BACKDROP.find(([re]) => re.test(selector));
  return hit ? hit[1] : "--paper";
}

// Tokens whose role is a hairline or a wash. They may not be used as a foreground: they are
// tuned against a surface, not against ink, so any text or icon drawn with them is unreadable.
// (opacity <= .5 is exempt: that is a deliberately decorative wash, not information.)
const HAIRLINE_TOKENS = ["--rule", "--stroke", "--hair", "--seg-off", "--hero-hair", "--scrim"];

const checks = [];
const note = (c) => checks.push(c);

// ── 1. rules that declare both a text colour and a background ─────────────
// A translucent background (a tint or wash) is measured over every surface it can actually sit
// on, because the tint alone does not decide the contrast behind it.
const pairFrom = (theme, rule, fgRaw, bgRaw, line) => {
  const bg0 = resolveColor(bgRaw, TOKENS[theme]);
  const fg0 = resolveColor(fgRaw, TOKENS[theme]);
  if (!bg0 || bg0.a === 0 || !fg0) return []; // gradient or transparent: nothing solid behind the text
  const { size, weight, opacity } = ruleType(rule);
  const named = backdropToken(rule.selector);
  const backdrops = bg0.a < 1 && named === "--paper" ? ["--paper", "--card"] : [named];
  return backdrops
    .map((name) => ({ c: tok(theme, name), label: `var(${name})` }))
    .filter((b) => b.c)
    .map(({ c, label }) => {
      const bg = composite(bg0, c);
      return {
        theme, kind: GLYPH.test(rule.selector) ? "glyph" : "text", size, weight,
        fg: composite({ ...fg0, a: fg0.a * opacity }, bg), bg,
        fgLabel: fgRaw, bgLabel: `${bgRaw} over ${label}`,
        where: `${rule.file}:${line}`, selector: rule.selector,
        advisory: advisoryReason(rule.selector),
      };
    });
};
for (const rule of rules) {
  if (!inRedo(rule.file)) continue;
  if (rule.decls.some((d) => d.prop === "content" && /^(""|'')$/.test(d.value))) continue;
  const colorDecl = rule.decls.find((d) => d.prop === "color");
  const bgDecl = rule.decls.find((d) => d.prop === "background" || d.prop === "background-color");
  if (!colorDecl || !bgDecl) continue;
  const lastLayer = splitTop(bgDecl.value, ",").slice(-1)[0];
  for (const theme of ["light", "dark"]) {
    if (!appliesTo(rule, theme)) continue;
    for (const pair of pairFrom(theme, rule, colorDecl.value, lastLayer, colorDecl.line)) note(pair);
  }
}

// ── 1b. a state rule that only repaints the background keeps its base colour ─
// `.pfield-ib:hover { background: var(--seg-off) }` paints under the colour set by `.pfield-ib`,
// so the two rules have to be joined before the pair can be measured.
const stripState = (compound) =>
  compound
    .replace(/::[\w-]+/g, "")
    .replace(/:(hover|active|focus-visible|focus-within|focus|visited|first-child|last-child)/g, "")
    .replace(/\[[a-z-]+="[^"]*"\]/g, "")
    .replace(/\.on\b/g, "")
    .trim();
const elementCompound = (sel) => splitTop(sel, ",").map((part) => splitWs(part).slice(-1)[0]).filter(Boolean);
const colorByBase = new Map();
for (const rule of rules) {
  if (!inRedo(rule.file)) continue;
  const colorDecl = rule.decls.find((d) => d.prop === "color");
  const bgDecl = rule.decls.find((d) => d.prop === "background" || d.prop === "background-color");
  if (!colorDecl || bgDecl) continue; // base rules only: a colour and no repaint of their own
  for (const compound of elementCompound(rule.selector)) {
    if (!colorByBase.has(compound)) colorByBase.set(compound, { value: colorDecl.value, rule });
  }
}
for (const rule of rules) {
  if (!inRedo(rule.file)) continue;
  if (rule.decls.some((d) => d.prop === "color")) continue;
  // A pseudo-element that only paints a bar or a wash carries no text of its own.
  if (rule.decls.some((d) => d.prop === "content" && /^(""|'')$/.test(d.value))) continue;
  const bgDecl = rule.decls.find((d) => d.prop === "background" || d.prop === "background-color");
  if (!bgDecl) continue;
  const lastLayer = splitTop(bgDecl.value, ",").slice(-1)[0];
  for (const compound of elementCompound(rule.selector)) {
    if (compound.includes("::")) continue;
    const base = colorByBase.get(stripState(compound));
    if (!base || base.rule === rule) continue;
    for (const theme of ["light", "dark"]) {
      if (!appliesTo(rule, theme) || !appliesTo(base.rule, theme)) continue;
      for (const pair of pairFrom(theme, base.rule, base.value, lastLayer, bgDecl.line)) {
        note({ ...pair, selector: `${base.rule.selector} + ${rule.selector}`, where: `${rule.file}:${bgDecl.line} (state of ${base.rule.selector})` });
      }
    }
  }
}

// ── 1c. a hairline token used as a foreground is unreadable by construction ─
for (const rule of rules) {
  if (!inRedo(rule.file)) continue;
  const colorDecl = rule.decls.find((d) => d.prop === "color");
  if (!colorDecl) continue;
  const token = colorDecl.value.match(/^var\((--[\w-]+)\)$/)?.[1];
  if (!token || !HAIRLINE_TOKENS.includes(token)) continue;
  if (ruleType(rule).opacity <= 0.5) continue; // deliberately decorative wash
  const bgDecl = rule.decls.find((d) => d.prop === "background" || d.prop === "background-color");
  const bgRaw = bgDecl ? splitTop(bgDecl.value, ",").slice(-1)[0] : `var(${backdropToken(rule.selector)})`;
  for (const theme of ["light", "dark"]) {
    if (!appliesTo(rule, theme)) continue;
    for (const pair of pairFrom(theme, rule, colorDecl.value, bgRaw, colorDecl.line)) {
      note({ ...pair, where: `${rule.file}:${colorDecl.line} — hairline token drawn as foreground` });
    }
  }
}

// ── 2. focus indicators: the ring against its gap and the surfaces around it ─
// Only pure rings count (`0 0 0 <spread> colour`) — offset or blurred layers are drop shadows.
// The outermost ring layer is the indicator; the layers inside it are the gap that lifts it off
// the page, and a ring painted in the page colour is only a halo, so the outline carries signal.
const isRingLayer = (layer) => /^(?:inset\s+)?0\s+0\s+0\s+[-\d.]+(?:px|rem)?\s+/.test(layer);
const RING_SURFACES = ["--paper", "--card", "--panel"]; // --seg-off is a control's interior, never a ring backdrop
const lastColorIn = (value, theme) => {
  for (const part of splitWs(value).reverse()) {
    const c = resolveColor(part, TOKENS[theme]);
    if (c && c.a > 0) return { c, label: part };
  }
  return null;
};
for (const rule of rules) {
  if (!inRedo(rule.file)) continue;
  if (!/:focus/.test(rule.selector)) continue;
  for (const theme of ["light", "dark"]) {
    if (!appliesTo(rule, theme)) continue;
    const page = tok(theme, "--paper");
    const rings = [];
    for (const d of rule.decls) {
      if (!["box-shadow", "outline", "outline-color", "border-color", "border"].includes(d.prop)) continue;
      if (d.prop === "box-shadow") {
        const layers = splitTop(d.value, ",").filter(isRingLayer);
        for (let i = layers.length - 1; i >= 0; i--) {
          const ring = lastColorIn(layers[i], theme);
          if (!ring || same(ring.c, page)) continue; // halo in the page colour
          const gap = i > 0 ? lastColorIn(layers[i - 1], theme) : null;
          rings.push({ ring, gap: gap && !same(gap.c, ring.c) ? gap : null, line: d.line });
          break;
        }
      } else if (["outline", "outline-color", "border-color", "border"].includes(d.prop)) {
        // A focus border is the indicator just as much as an outline or a ring shadow is — unless
        // the same rule repaints the foreground too, which makes it a state wash rather than a ring
        // (the global :focus-visible outline in base.css still draws the indicator there).
        if (["border", "border-color"].includes(d.prop) && rule.decls.some((x) => x.prop === "color")) continue;
        const ring = lastColorIn(d.value, theme);
        if (ring && !same(ring.c, page)) rings.push({ ring, gap: null, line: d.line });
      }
    }
    for (const { ring, gap, line } of rings) {
      const adjacents = [gap ?? { c: page, label: "var(--paper)" }, ...RING_SURFACES.map((s) => ({ c: tok(theme, s), label: `var(${s})` }))];
      for (const other of adjacents) {
        if (!other.c || same(ring.c, other.c)) continue;
        note({
          theme, kind: "ui", size: null, weight: null, fg: ring.c, bg: composite(other.c, page),
          fgLabel: ring.label, bgLabel: other.label,
          where: `${rule.file}:${line}`, selector: rule.selector,
        });
      }
    }
  }
}

// ── 3. resting form-field borders (advisory unless --strict) ───────────────
const FIELD = /(?:^|[\s,>+~])(input|textarea|select)\b|\.set-input\b|\.pfield\b|\.composer\b|\.search\b/;
for (const rule of rules) {
  if (!inRedo(rule.file)) continue;
  if (/\[class\*=/.test(rule.selector)) continue; // Tailwind hooks, not our own fields
  if (!FIELD.test(rule.selector) || /:focus|:hover|:active|::/.test(rule.selector)) continue;
  const border = rule.decls.find((d) => d.prop === "border-color") ?? rule.decls.find((d) => d.prop === "border");
  if (!border) continue;
  for (const theme of ["light", "dark"]) {
    if (!appliesTo(rule, theme)) continue;
    let edge = null;
    for (const part of splitWs(border.value).reverse()) {
      edge = resolveColor(part, TOKENS[theme]);
      if (edge && edge.a > 0) break;
    }
    if (!edge) continue;
    const bgDecl = rule.decls.find((d) => d.prop === "background" || d.prop === "background-color");
    const bgRaw = (bgDecl ? resolveColor(splitTop(bgDecl.value, ",").slice(-1)[0], TOKENS[theme]) : null) ?? tok(theme, "--card");
    if (!bgRaw) continue;
    note({
      theme, kind: "ui", size: null, weight: null, fg: edge, bg: composite(bgRaw, tok(theme, "--paper")),
      fgLabel: border.value, bgLabel: bgDecl ? bgDecl.value : "var(--card)",
      where: `${rule.file}:${border.line}`, selector: rule.selector,
      advisory: "resting hairline border: the field box is intentional, not a contrast target (focus and label carry it)",
    });
  }
}

// ── 4. curated pairs: the combinations a single rule cannot see ────────────
// [what, foreground token, background token, px, weight, opacity, the rule that uses it]
const CURATED = [
  ["body text", "--ink", "--paper", 15, 400, 1, "body"],
  ["quiet body text", "--quiet", "--paper", 15, 400, 1, ".lede"],
  ["mono / quiet label", "--quiet", "--paper", 11, 500, 1, ".mono"],
  ["fold counter (small mono)", "--quiet", "--paper", 10, 500, 1, ".fold-n"],
  ["quiet note on card", "--quiet", "--card", 14, 400, 1, ".set-note"],
  ["alert note on card", "--alert", "--card", 13, 400, 1, ".set-alert"],
  ["mono value on card", "--ink", "--card", 13, 500, 1, ".set-key-value"],
  ["icon on seg-off (hover)", "--ink", "--seg-off", 20, 400, 1, ".pfield-ib"],
  ["quiet text on panel", "--quiet", "--panel", 12, 400, 1, ".fold-bi > .why"],
  ["tag text", "--ink", "--panel", 11, 500, 1, ".tag"],
  ["quiet tag", "--quiet", "--panel", 11, 500, 1, ".tag.quiet"],
  ["alert tag", "--alert", "--alert-tint", 11, 500, 1, ".tag.alert"],
  ["btn text", "--ink", "--card", 15, 600, 1, ".btn"],
  ["btn.ink (inverted)", "--paper", "--ink", 15, 600, 1, ".btn.ink"],
  ["selected pill / chip", "--paper", "--ink", 14, 600, 1, '.pill[aria-pressed="true"]'],
  ["nav item (current page)", "--paper", "--ink", 16, 600, 1, '.nav-item[aria-current="page"]'],
  ["nav item meta on ink", "--paper", "--ink", 11, 500, 0.7, '.nav-item[aria-current="page"] .mono'],
  ["segment thumb label", "--paper", "--ink", 15, 700, 1, '.seg button[aria-pressed="true"]'],
  ["hero text", "--hero-ink", "--hero", 15, 400, 1, ".hero-card"],
  ["hero quiet text", "--hero-quiet", "--hero", 11, 500, 1, ".hero-card .mono"],
  ["hero result copy", "--hero-quiet", "--hero", 16, 400, 1, ".result p"],
  // (.sr-first-run-done and .ftype.accent declare colour and background together: check 1 sees them.)
  ["landing label on ink", "color-mix(in srgb, var(--paper) 65%, transparent)", "--ink", 11, 500, 1, ".sk-land-card-dark .sk-label"],
  ["shadcn muted text", "--muted-foreground", "--muted", 14, 400, 1, ".btn"],
  ["shadcn primary button", "--primary-foreground", "--primary", 15, 600, 1, ".btn.ink"],
  ["shadcn popover text", "--popover-foreground", "--popover", 14, 400, 1, ".btn"],
  ["shadcn destructive text", "--destructive-foreground", "--destructive", 14, 400, 1, ".btn"],
  ["shadcn secondary text", "--secondary-foreground", "--secondary", 14, 400, 1, ".btn"],
];
const selectorPool = rules.filter((r) => inRedo(r.file)).map((r) => r.selector);
for (const [what, fg, bg, size, weight, opacity, seen] of CURATED) {
  const found = selectorPool.some((s) => splitTop(s, ",").some((p) => p.trim() === seen)) || selectorPool.some((s) => s.includes(seen));
  for (const theme of ["light", "dark"]) {
    // A curated foreground may be a token name (--quiet) or the literal the CSS uses.
    const ref = (x) => (x.startsWith("--") ? `var(${x})` : x);
    const fgc = resolveColor(ref(fg), TOKENS[theme]);
    const bgc = resolveColor(ref(bg), TOKENS[theme]);
    if (!fgc || !bgc) {
      note({ theme, kind: "text", size, weight, fg: fgc, bg: bgc, fgLabel: ref(fg), bgLabel: ref(bg), where: `curated: ${what}`, selector: seen, advisory: null, stale: true, unresolved: true });
      continue;
    }
    const page = tok(theme, "--paper");
    note({
      theme, kind: "text", size, weight,
      fg: composite({ ...fgc, a: fgc.a * opacity }, composite(bgc, page)),
      bg: composite(bgc, page),
      fgLabel: `${ref(fg)}${opacity < 1 ? ` @opacity ${opacity}` : ""}`, bgLabel: ref(bg),
      where: found ? `curated: ${what} (via ${seen})` : `curated: ${what} — SELECTOR NOT FOUND: ${seen}`,
      selector: seen, stale: !found,
    });
  }
}

// ── report ─────────────────────────────────────────────────────────────────
for (const c of checks) {
  c.value = c.fg && c.bg ? ratio(c.fg, c.bg) : null;
  c.need = need(c.kind, c.size, c.weight);
  c.pass = c.value !== null && c.value >= c.need;
}
const worst = new Map();
for (const c of checks) {
  if (c.pass && !c.stale) continue;
  const key = `${c.theme}|${c.selector}|${c.fgLabel}|${c.bgLabel}|${c.kind}|${c.advisory ? "a" : "f"}`;
  const prev = worst.get(key);
  if (!prev || (c.value ?? Infinity) < (prev.value ?? Infinity)) worst.set(key, c);
}
const rows = [...worst.values()];
const fails = rows.filter((c) => !c.advisory || STRICT);
const advisories = rows.filter((c) => c.advisory && !STRICT);
const compare = (a, b) => (a.theme === b.theme ? (a.value ?? 0) - (b.value ?? 0) : a.theme === "light" ? -1 : 1);
fails.sort(compare);
advisories.sort(compare);

if (AS_JSON) {
  const shape = (c) => ({ theme: c.theme, kind: c.kind, ratio: +(c.value ?? 0).toFixed(3), need: c.need, selector: c.selector, where: c.where, fg: c.fgLabel, fgHex: hex(c.fg), bg: c.bgLabel, bgHex: hex(c.bg), size: c.size, weight: c.weight, stale: !!c.stale });
  console.log(JSON.stringify({ total: checks.length, failures: fails.map(shape), advisories: advisories.map(shape) }, null, 2));
} else {
  const passed = checks.filter((c) => c.pass && !c.stale);
  console.log(`contrast: ${checks.length} checks (${new Set(checks.map((c) => c.selector)).size} selectors) — ${passed.length} pass, ${fails.length} fail, ${advisories.length} advisory`);
  if (SHOW_ALL) for (const c of checks.filter((x) => x.pass && !x.stale).sort(compare)) console.log(`  pass ${c.theme.padEnd(5)} ${c.value.toFixed(2).padStart(5)}:1  ${c.selector}  ${hex(c.fg)} on ${hex(c.bg)}`);
  const print = (c, tag) =>
    console.log(`  ${tag} ${c.stale ? "STALE — " : ""}${(c.value ?? 0).toFixed(2).padStart(5)}:1 need ${c.need}:1  ${c.where}\n` +
      `        ${c.selector} · ${c.kind}${c.size ? ` ${c.size}px${c.weight ? ` w${c.weight}` : ""}` : ""} · fg ${c.fgLabel} = ${hex(c.fg)} · bg ${c.bgLabel} = ${hex(c.bg)}${c.advisory ? `\n        why advisory: ${c.advisory}` : ""}`);
  for (const group of ["light", "dark"]) {
    const set = fails.filter((c) => c.theme === group);
    if (!set.length) continue;
    console.log(`\nFAIL — ${group.toUpperCase()} (${set.length})`);
    for (const c of set) print(c, "FAIL");
  }
  if (advisories.length) {
    console.log(`\nADVISORY (${advisories.length}) — not judged by WCAG statically; --strict makes these fail`);
    for (const c of advisories) print(c, "adv ");
  }
}
process.exit(fails.length ? 1 : 0);

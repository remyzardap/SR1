/* Sutaeru app prototype: router, live art and every screen.
   Plain JS, no build step. Views are functions that return markup, then mount() wires them up.
   Anything that moves registers with the view's lifecycle so leaving a view stops it. */
(function () {
  "use strict";
  const SC = window.SutaeruScene;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sutaeru." + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("sutaeru." + k, JSON.stringify(v)); } catch (e) { /* storage may be blocked */ } },
  };
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const cv = (n) => getComputedStyle(document.documentElement).getPropertyValue("--" + n).trim();

  /* ── Icons: the product's own set (SutaeruIcon), plus a few it lacks ── */
  const P = {
    search: '<circle cx="42" cy="40" r="18"/><path d="m55 53 15 15"/>',
    research: '<path d="m20 34 28-15 28 15-28 15-28-15Z"/><path d="m28 46 20 11 20-11M28 57l20 11 20-11"/>',
    ask: '<path d="M27 24h42a8 8 0 0 1 8 8v21a8 8 0 0 1-8 8H47L33 73V61h-6a8 8 0 0 1-8-8V32a8 8 0 0 1 8-8Z"/>',
    report: '<path d="M30 15h29l12 12v52H30V15Z"/><path d="M59 15v13h12M42 43h18M42 55h18"/>',
    web: '<circle cx="48" cy="48" r="31"/><path d="M17 48h62M48 17c12 11 16 21 16 31S60 68 48 79M48 17C36 28 32 38 32 48s4 20 16 31"/>',
    agent: '<path d="M48 17c18 0 29 13 29 31v25H19V48c0-18 11-31 29-31Z"/><circle cx="48" cy="47" r="14"/><path d="M32 73V62M64 73V62"/>',
    memory: '<ellipse cx="48" cy="23" rx="24" ry="9"/><path d="M24 23v47c0 5 11 9 24 9s24-4 24-9V23M24 46c0 5 11 9 24 9s24-4 24-9"/>',
    schedule: '<rect x="18" y="24" width="60" height="54" rx="7"/><path d="M18 40h60M33 17v14M63 17v14"/>',
    files: '<path d="M15 31h25l7 8h34v37H15V31Z"/>',
    models: '<path d="M20 27h56M20 48h56M20 69h56"/><circle cx="36" cy="27" r="7"/><circle cx="61" cy="48" r="7"/><circle cx="43" cy="69" r="7"/>',
    make: '<path d="M48 13c2 20 10 31 26 35-16 4-24 15-26 35-2-20-10-31-26-35 16-4 24-15 26-35Z"/>',
    connections: '<circle cx="28" cy="48" r="12"/><circle cx="68" cy="27" r="12"/><circle cx="68" cy="69" r="12"/><path d="m39 42 17-9M39 54l17 9"/>',
    settings: '<circle cx="48" cy="48" r="13"/><path d="M48 14v10M48 72v10M14 48h10M72 48h10M24 24l7 7M65 65l7 7M72 24l-7 7M31 65l-7 7"/>',
    close: '<path d="m27 27 42 42M69 27 27 69"/>',
    check: '<path d="m22 50 17 17 36-39"/>',
    plus: '<path d="M48 20v56M20 48h56"/>',
    arrow: '<path d="M18 48h56M55 28l20 20-20 20"/>',
    up: '<path d="M48 78V22M28 41l20-20 20 20"/>',
    upright: '<path d="M30 66 66 30M38 30h28v28"/>',
    more: '<circle cx="24" cy="48" r="3"/><circle cx="48" cy="48" r="3"/><circle cx="72" cy="48" r="3"/>',
    edit: '<path d="M24 67l4-18 32-32 14 14-32 32-18 4ZM54 23l14 14"/>',
    copy: '<rect x="28" y="28" width="46" height="50" rx="6"/><path d="M22 66h-4V18h44v4"/>',
    download: '<path d="M48 16v43M31 43l17 17 17-17M20 75h56"/>',
    share: '<path d="M41 30h-17v48h48V60M48 48l27-27M55 21h20v20"/>',
    lock: '<rect x="23" y="42" width="50" height="37" rx="6"/><path d="M33 42V31a15 15 0 0 1 30 0v11M48 57v10"/>',
    voice: '<rect x="36" y="17" width="24" height="42" rx="12"/><path d="M26 47a22 22 0 0 0 44 0M48 69v12M36 81h24"/>',
    wave: '<path d="M18 42v12M30 32v32M42 22v52M54 30v36M66 38v20M78 44v8"/>',
    image: '<rect x="17" y="21" width="62" height="54" rx="7"/><circle cx="36" cy="39" r="7"/><path d="m20 68 18-17 12 11 10-9 16 15"/>',
    video: '<rect x="18" y="24" width="44" height="48" rx="8"/><path d="m62 38 16-10v40l-16-10"/>',
    review: '<path d="M26 20h44v59H26V20ZM37 36l5 5 9-10M37 56l5 5 9-10M57 38h6M57 58h6"/>',
    plan: '<path d="M18 24h60v48H18V24Z"/><path d="M18 40h60M39 40v32M28 32h2M36 32h2M56 52h12M56 61h8"/>',
    pause: '<rect x="32" y="26" width="14" height="44" rx="7"/><rect x="50" y="26" width="14" height="44" rx="7"/>',
    chev: '<path d="m28 40 20 20 20-20"/>',
    back: '<path d="M78 48H22M41 28 21 48l20 20"/>',
    grid: '<rect x="18" y="18" width="60" height="60" rx="6"/><path d="M38 18v60M58 18v60M18 38h60M18 58h60"/>',
    stop: '<rect x="29" y="29" width="38" height="38" rx="6"/>',
    eyeoff: '<path d="M16 48s12-22 32-22 32 22 32 22-12 22-32 22-32-22-32-22Z"/><circle cx="48" cy="48" r="10"/><path d="M20 20l56 56"/>',
    send: '<path d="M16 46 80 18 66 80 46 56Z"/><path d="m46 56 34-38"/>',
    camera: '<path d="M18 34h14l6-9h20l6 9h14v40H18Z"/><circle cx="48" cy="52" r="12"/>',
    refresh: '<path d="M73 38a27 27 0 1 0 2 18"/><path d="M76 20v20H56"/>',
    alert: '<path d="M48 18 80 74H16Z"/><path d="M48 42v14M48 64v2"/>',
    sun: '<circle cx="48" cy="48" r="14"/><path d="M48 14v8M48 74v8M14 48h8M74 48h8M24 24l6 6M66 66l6 6M72 24l-6 6M30 66l-6 6"/>',
  };
  const SIG = { search: [42, 40], research: [48, 34], ask: [55, 42], report: [48, 63], web: [48, 48], agent: [57, 42], memory: [48, 67], schedule: [58, 59], files: [51, 54], models: [61, 48], make: [70, 31], connections: [68, 48], settings: [48, 48], image: [66, 68], review: [42, 41], plan: [68, 60] };
  function icon(name, o = {}) {
    const s = o.signal && SIG[name] ? `<circle class="sig" cx="${SIG[name][0]}" cy="${SIG[name][1]}" r="5"/>` : "";
    return `<svg class="ico ${o.cls || ""}" viewBox="0 0 96 96" aria-hidden="true">${P[name] || ""}${s}</svg>`;
  }
  const SB = window.SutaeruBrand, SP = window.SutaeruPhoto;
  const GLYPH = (cls = "glyph", detail = "compact") => SB.glyph({ cls, detail });
  const ENGINE_MARK = {
    gemini: '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M48 14c2 18 12 30 30 34-18 4-28 16-30 34-2-18-12-30-30-34 18-4 28-16 30-34Z" fill="currentColor"/></svg>',
    openai: '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M48 16 76 32v32L48 80 20 64V32Z" fill="none" stroke="currentColor" stroke-width="8" stroke-linejoin="round"/></svg>',
    wan: '<svg viewBox="0 0 96 96" aria-hidden="true"><path d="M20 66a28 28 0 0 1 56 0M34 66a14 14 0 0 1 28 0" fill="none" stroke="currentColor" stroke-width="8" stroke-linecap="round"/></svg>',
  };
  const BRK = (cls = "") => `<span class="brk ${cls}" aria-hidden="true"><i></i><i></i><i></i><i></i></span>`;

  /* ── Content ───────────────────────────────────────────────────────── */
  const SAMPLE_Q = "How fast do commercial rooftop systems pay back?";
  const SOURCES = [
    ["I", "irena.org", "Renewable cost report"],
    ["P", "pln.co.id", "Rooftop PV tariff rules"],
    ["E", "esdm.go.id", "Net metering regulation"],
    ["I", "iea.org", "Southeast Asia solar outlook"],
    ["T", "tgwi.id", "C&I project payback data"],
  ];
  const DEPTH = {
    quick: { label: "Quick", src: 6, min: 2, credits: 1, dots: 6 },
    standard: { label: "Standard", src: 14, min: 6, credits: 4, dots: 14 },
    deep: { label: "Deep", src: 40, min: 20, credits: 9, dots: 30 },
  };
  const OUTS = [
    { id: "report", name: "Report", blurb: "Cited research, ready to send" },
    { id: "deck", name: "Deck", blurb: "Slides with charts and notes" },
    { id: "sheet", name: "Sheet", blurb: "Formulas, tabs and totals" },
    { id: "image", name: "Image", blurb: "Set up the shot, then draw" },
    { id: "brief", name: "Brief", blurb: "One page with clear decisions" },
    { id: "monitor", name: "Monitor", blurb: "Watches and tells you when it moves" },
  ];
  const KINDS = {
    report: {
      title: "Solar PV supplier research",
      brief: "Compare three PV module suppliers for a 500 kWp rooftop project. Include price per Wp, lead time and warranty.",
      steps: [
        { k: "plan", name: "Plan the search", done: "Three questions, two source types", m: 0.3 },
        { k: "search", name: "Search the web", done: "SRC sources found", m: 1 },
        { k: "read", name: "Read the quotes", file: "supplier_quotes.pdf", pages: 12, m: 2 },
        { k: "write", name: "Write the report", m: 2 },
      ],
      draft: { eyebrow: "Result · Draft", title: "PV module supplier comparison", lede: "Three shortlisted suppliers compared on price per Wp, lead time and warranty.",
        rows: [["Jinko Tiger Neo 620 W", "USD 0.11 / Wp · 6 wks"], ["LONGi Hi-MO 6 580 W", "USD 0.12 / Wp · 4 wks"], ["Trina Vertex 600 W", "USD 0.11 / Wp · 8 wks"]] },
      result: { kind: "Report", title: "PV module supplier comparison",
        summary: "Jinko and Trina tie on price at USD 0.11 per Wp. LONGi costs a cent more but ships in four weeks, which keeps the 500 kWp build on schedule.",
        figs: [["Suppliers", "3"], ["Best price", "0.11"], ["Fastest", "4 wks"]], meta: "PDF · 12 pages · 2.4 MB",
        head: ["Supplier", "Price per Wp", "Lead time", "Warranty"],
        rows: [["Jinko Tiger Neo 620 W", "USD 0.11", "6 weeks", "30 years"], ["LONGi Hi-MO 6 580 W", "USD 0.12", "4 weeks", "25 years"], ["Trina Vertex 600 W", "USD 0.11", "8 weeks", "30 years"]], best: 1 },
    },
    deck: {
      title: "TGWI investor update Q3",
      brief: "Turn the Q3 numbers into a 10 slide investor update with one chart per slide.",
      steps: [
        { k: "plan", name: "Read your files", done: "Q3 ledger and board notes", m: 0.6 },
        { k: "search", name: "Outline 10 slides", done: "Story set, one idea per slide", m: 1 },
        { k: "read", name: "Build the charts", file: "q3_ledger.xlsx", pages: 10, m: 2 },
        { k: "write", name: "Lay out the deck", m: 2 },
      ],
      draft: { eyebrow: "Deck · Draft", title: "Q3 investor update", lede: "Ten slides. Revenue first, then margin, then the three risks with owners.",
        rows: [["01 Revenue up 12 percent", "Bar chart · quarter on quarter"], ["02 Margin held at 21 percent", "Line chart · trailing 4 quarters"], ["03 Three risks for the board", "Table · owner and date"]] },
      result: { kind: "Deck", title: "Q3 investor update", summary: "Revenue grew 12 percent on Q2 and operating margin held at 21 percent. Three risks are flagged, each with an owner and a date.",
        figs: [["Slides", "10"], ["Revenue", "+12%"], ["Margin", "21%"]], meta: "PPTX · 10 slides · 6.1 MB",
        head: ["Slide", "Message", "Chart"], rows: [["1", "Revenue up 12 percent", "Bars"], ["2", "Margin held at 21 percent", "Line"], ["3", "Three risks, three owners", "Table"]], best: 0 },
    },
    sheet: {
      title: "Villa BOQ and budget",
      brief: "Build a BOQ and budget sheet for the villa, with formulas for quantities and totals.",
      steps: [
        { k: "plan", name: "Read the drawings", done: "Plans, sections and finishes list", m: 1 },
        { k: "search", name: "Take off quantities", done: "SRC line items", m: 2 },
        { k: "read", name: "Write the formulas", file: "villa_drawings.pdf", pages: 8, m: 1 },
        { k: "write", name: "Check the totals", m: 0.7 },
      ],
      draft: { eyebrow: "Sheet · Draft", title: "Villa BOQ and budget", lede: "Six tabs. Quantities link to unit rates, so totals update when a rate changes.",
        rows: [["Structure", "IDR 1.42 bn"], ["Finishes", "IDR 0.86 bn"], ["MEP", "IDR 0.51 bn"]] },
      result: { kind: "Sheet", title: "Villa BOQ and budget", summary: "Total build cost comes to IDR 3.1 billion. Structure is 46 percent of it; finishes are where the range is widest.",
        figs: [["Tabs", "6"], ["Line items", "212"], ["Total", "3.1 bn"]], meta: "XLSX · 6 tabs · 840 KB",
        head: ["Package", "Amount (IDR)", "Share"], rows: [["Structure", "1.42 bn", "46%"], ["Finishes", "0.86 bn", "28%"], ["MEP", "0.51 bn", "16%"]], best: 0 },
    },
    brief: {
      title: "Off grid solar board brief",
      brief: "Write a one page board brief on off grid solar for remote villages, with two decisions.",
      steps: [
        { k: "plan", name: "Plan the brief", done: "One page, two decisions", m: 0.3 },
        { k: "search", name: "Research the costs", done: "SRC sources found", m: 2 },
        { k: "read", name: "Draft the page", file: "village_costs.csv", pages: 6, m: 1 },
        { k: "write", name: "Tighten it", m: 0.5 },
      ],
      draft: { eyebrow: "Brief · Draft", title: "Off grid solar for remote villages", lede: "A 120 kWp array with storage delivers power at USD 0.28 to 0.45 per kWh.",
        rows: [["Decision 1", "Approve a pilot in one village"], ["Decision 2", "Apply for the capital grant"], ["Risk", "Battery prices move the range"]] },
      result: { kind: "Brief", title: "Off grid solar for remote villages", summary: "The case rests on capital grants, not tariff revenue. The brief asks the board for a one village pilot and a grant application.",
        figs: [["Pages", "1"], ["Decisions", "2"], ["Cost", "0.28"]], meta: "DOCX · 1 page · 120 KB",
        head: ["Item", "What the board decides"], rows: [["Decision 1", "Approve a pilot in one village"], ["Decision 2", "Apply for the capital grant"]], best: 0 },
    },
    monitor: {
      title: "PLN tariff watch",
      brief: "Watch PLN tariff changes in Indonesia and tell me when anything moves.",
      steps: [
        { k: "plan", name: "Set the watch list", done: "PLN, ESDM and two news desks", m: 0.3 },
        { k: "search", name: "First check", done: "SRC pages read", m: 1 },
        { k: "read", name: "Record the baseline", file: "tariff_table.html", pages: 4, m: 0.5 },
        { k: "write", name: "Schedule the next check", m: 0.2 },
      ],
      draft: { eyebrow: "Monitor · Baseline", title: "PLN tariff watch", lede: "Baseline recorded. Sutaeru checks every 6 hours and tells you only when something changes.",
        rows: [["R-1 household", "IDR 1,444.70 / kWh"], ["I-3 industry", "IDR 1,114.74 / kWh"], ["Next check", "Today 20:00"]] },
      result: { kind: "Monitor", title: "PLN tariff watch", summary: "The watch is live. Nothing has moved since the baseline. You will get a Telegram message when a tariff changes.",
        figs: [["Pages", "4"], ["Every", "6 h"], ["Changes", "0"]], meta: "Monitor · every 6 hours",
        head: ["Tariff", "Rate", "Since"], rows: [["R-1 household", "IDR 1,444.70", "July"], ["I-3 industry", "IDR 1,114.74", "July"]], best: 0 },
    },
  };
  const FILES = [
    { t: "report", name: "Off grid solar cost per kWh", meta: "Edited 2 h ago · 14 sources", go: "done" },
    { t: "deck", name: "TGWI investor update Q3", meta: "Yesterday · 18 slides" },
    { t: "sheet", name: "Villa BOQ and budget", meta: "3 days ago · 6 tabs" },
    { t: "image", name: "Ceramic mug, morning light", meta: "Gemini · 1:1", p: { shot: "close", light: "window", look: "photo" } },
    { t: "report", name: "Clay thermal storage review", meta: "Last week · 22 sources" },
    { t: "deck", name: "Kopdes PLTS proposal", meta: "2 weeks ago · 12 slides" },
    { t: "image", name: "Night lamp, film look", meta: "OpenAI · 4:5", p: { light: "night", look: "film", ratio: "4:5", shot: "close" } },
    { t: "report", name: "Weekly market brief", meta: "Step 3 of 5", live: true },
  ];

  /* ── State ─────────────────────────────────────────────────────────── */
  const mqReduce = window.matchMedia ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false };
  const state = {
    theme: store.get("theme", "system"),
    reduce: store.get("reduce", false),
    art: store.get("art", true),
    intensity: store.get("intensity", 70),
    voice: store.get("voice", { detail: 45, tone: 62 }),
    chat: { thinking: false, priv: false, srcs: { web: true, files: false, memory: false }, atts: [], listening: false },
    q: SAMPLE_Q, answerPlayed: false, thread: [], turnTo: "report",
    agent: { out: "report", depth: "standard", brief: KINDS.report.brief, srcs: { web: true, files: true, drive: false, notion: false }, notify: true },
    studio: { prompt: "A ceramic mug on a wooden table in soft morning light.", p: Object.assign({}, SC.DEFAULT), engine: null, quality: "standard", count: 1, grid: true, ref: false },
    img: { status: "idle", p: null, engine: "gemini", quality: "standard", count: 1, took: 0, pick: 0, t0: 0 },
    session: { type: "report", depth: "standard", p: 0.38, status: "running", t0: Date.now() - 34000, confirm: false },
    files: { filter: "all", q: "" },
    navOpen: false,
  };
  const RM = () => state.reduce || mqReduce.matches;

  /* ── View lifecycle ────────────────────────────────────────────────── */
  let life = [];
  let redraws = [];
  const onLeave = (fn) => life.push(fn);
  const onRedraw = (fn) => { redraws.push(fn); fn(); };
  function loop(fn) { let alive = true, id = 0; const tick = (t) => { if (!alive) return; fn(t); id = requestAnimationFrame(tick); }; id = requestAnimationFrame(tick); onLeave(() => { alive = false; cancelAnimationFrame(id); }); }
  function after(ms, fn) { const id = setTimeout(fn, ms); onLeave(() => clearTimeout(id)); return id; }
  function leave() { life.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); life = []; redraws = []; }
  let resizeT = 0;
  window.addEventListener("resize", () => { clearTimeout(resizeT); resizeT = setTimeout(() => { redraws.forEach((f) => f()); placeSegs(); }, 80); });

  /* ── Art: canvases drawn in the current theme's ink ────────────────── */
  function fit(c) {
    const r = c.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const x = c.getContext("2d"); x.setTransform(d, 0, 0, d, 0, 0);
    return { x, w: r.width, h: r.height };
  }
  function rr(x, a, y, w, h, r) { if (x.roundRect) { x.beginPath(); x.roundRect(a, y, w, h, r); x.fill(); } else x.fillRect(a, y, w, h); }

  /* Sweep and converge bars: ink pills, a dither trail ahead of each head, dots for what is left. */
  function drawBar(c, p, o = {}) {
    if (!c || !c.isConnected) return;
    const { x, w, h } = fit(c);
    x.clearRect(0, 0, w, h);
    const ink = o.color || cv("ink"), dot = o.track || cv("rule");
    const cy = h / 2, th = Math.min(o.thick ? 8 : 6, h * 0.6), r = th / 2;
    const frame = Math.floor((o.t || 0) / 110);
    x.fillStyle = dot;
    for (let px = 2; px < w - 1; px += 6) { x.beginPath(); x.arc(px, cy, 0.95, 0, 6.283); x.fill(); }
    x.fillStyle = ink;
    const trail = (hx, dir) => {
      const R = rng(frame * 31 + (dir > 0 ? 7 : 13)), len = 24;
      for (let i = 0; i < len; i += 1.5) for (let j = -r - 1.5; j <= r + 1.5; j += 1.5) {
        const k = 1 - i / len; if (R() < k * k * 0.9) x.fillRect(hx + dir * i, cy + j, 1.2, 1.2);
      }
    };
    if (o.mode === "converge") {
      const half = w / 2;
      if (p >= 1) { rr(x, 0, cy - r, half - 4, th, r); rr(x, half + 4, cy - r, half - 4, th, r); x.beginPath(); x.arc(half, cy, 1.8, 0, 6.283); x.fill(); return; }
      const a = p * half;
      if (a > 0.5) { rr(x, 0, cy - r, a, th, r); rr(x, w - a, cy - r, a, th, r); }
      if (o.live !== false && p > 0) { trail(a, 1); trail(w - a, -1); }
    } else {
      const a = p * w;
      if (a > 0.5) rr(x, 0, cy - r, a, th, r);
      if (o.live !== false && p > 0 && p < 1) trail(a, 1);
    }
  }

  /* Dither fields: an edge that thickens toward one side, or an ink sphere lit from the top left. */
  function drawDither(c, kind, o = {}) {
    if (!c || !c.isConnected) return;
    const { x, w, h } = fit(c);
    x.clearRect(0, 0, w, h);
    x.fillStyle = o.color || cv("ink");
    const R = rng(o.seed || 3), s = o.cell || 2, k = o.k != null ? o.k : state.intensity / 100;
    const cx = w * 0.5, cy = h * 0.5, rad = Math.min(w, h) * 0.42, fill = o.fill != null ? o.fill : 1;
    for (let py = 0; py < h; py += s) for (let px = 0; px < w; px += s) {
      let d = 0;
      if (kind === "edge") { const u = px / w, v = py / h; d = Math.pow(Math.max(0, (u - 0.12) / 0.88), 1.5) * (0.8 + 0.2 * Math.sin(v * 3.1 + 0.6)); }
      else if (kind === "sphere") {
        const dx = (px - cx) / rad, dy = (py - cy) / rad, q = dx * dx + dy * dy;
        if (q > 1) { if (q < 1.04 && R() < 0.12) x.fillRect(px, py, 1, 1); continue; }
        const nz = Math.sqrt(1 - q), lit = -0.55 * dx - 0.6 * dy + 0.58 * nz;
        d = Math.pow(Math.max(0, 1 - lit), 1.45) * 0.95;
        if (py < cy + rad - fill * 2 * rad) d *= 0.05;
      } else if (kind === "ramp") d = Math.pow(px / w, 1.2);
      if (R() < d * k) x.fillRect(px, py, s * 0.78, s * 0.78);
    }
  }

  /* Image generation: dots cover the picture and clear from left to right as the engine draws. */
  function drawResolve(c, p, t) {
    if (!c || !c.isConnected) return;
    const { x, w, h } = fit(c);
    x.clearRect(0, 0, w, h);
    if (p >= 1) return;
    const s = 4, cols = Math.ceil(w / s), rows = Math.ceil(h / s);
    if (!c._n || c._n.length !== cols * rows) { const R = rng(11); c._n = new Float32Array(cols * rows).map(() => R()); }
    const N = c._n, paper = cv("panel"), ink = cv("ink"), frame = Math.floor(t / 90);
    const R = rng(frame * 97 + 5);
    x.fillStyle = paper;
    const covered = [];
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const n = N[j * cols + i], thr = p * 1.8 - (i / cols) * 0.8;
      if (n > thr) { x.fillRect(i * s, j * s, s, s); covered.push(i, j, n - thr); }
    }
    x.fillStyle = ink;
    for (let q = 0; q < covered.length; q += 3) {
      const dist = covered[q + 2];
      if (R() < 0.1 + 0.8 * Math.exp(-dist * 7)) x.fillRect(covered[q] * s + 1, covered[q + 1] * s + 1, s - 1.6, s - 1.6);
    }
  }

  /* Progress dial: a stippled orange arc fills clockwise over a quiet ring. */
  function dialHTML(id) {
    const N = 220, R = rng(5); let dots = "";
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 - Math.PI / 2 + (R() - 0.5) * 0.03, rad = 40 + (R() - 0.5) * 8, s = 0.6 + R() * 1.2;
      dots += `<circle cx="${(50 + Math.cos(a) * rad).toFixed(2)}" cy="${(50 + Math.sin(a) * rad).toFixed(2)}" r="${s.toFixed(2)}" class="f-acc"/>`;
    }
    return `<div class="dial-wrap"><div class="dial" id="${id}" role="img" aria-label="Progress"><svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="40" class="s-seg" stroke-width="9"/><g class="dd">${dots}</g></svg><div class="readout"><b class="tnum">0%</b></div></div><span class="mono dial-cap">Estimating</span></div>`;
  }
  function setDial(el, p, label, mid) {
    if (!el) return;
    const ds = el._d || (el._d = $$(".dd circle", el)), n = Math.round(clamp(p) * ds.length);
    if (el._n !== n) { ds.forEach((d, i) => { d.style.display = i < n ? "" : "none"; }); el._n = n; }
    $(".readout b", el).textContent = mid != null ? mid : Math.round(p * 100) + "%";
    const cap = el.parentElement && $(".dial-cap", el.parentElement); if (cap) cap.textContent = label;
    el.setAttribute("aria-label", `Progress ${Math.round(p * 100)} percent, ${label}`);
  }
  const stepped = (n, on, live = -1, h0 = 6, dh = 2) => `<span class="stepped" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i === live ? "live" : i < on ? "" : "off"}" style="height:${h0 + i * dh}px"></i>`).join("")}</span>`;
  const meter = (v) => `<span class="meter" aria-label="${v} of 5">${[6, 8, 10, 12, 14].map((hh, i) => `<i class="${i < v ? "on" : ""}" style="height:${hh}px"></i>`).join("")}</span>`;
  const orb = (mode = "run") => `<span class="orb ${mode}" aria-hidden="true"><i></i><i></i><i></i></span>`;
  function eta(sec) {
    if (sec == null) return "Estimating";
    if (sec > 60) return `About ${Math.round(sec / 60)} min left`;
    if (sec >= 10) return `About ${Math.round(sec / 5) * 5} sec left`;
    return "Almost done";
  }
  const etaShort = (sec) => sec > 60 ? `${Math.round(sec / 60)} min left` : sec >= 10 ? `${Math.round(sec / 5) * 5} s left` : "Almost";
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

  /* ── Small drawings that follow the theme ──────────────────────────── */
  function outPreview(id) {
    if (id === "image") return SP.comp(Object.assign({}, state.studio.p, { shot: "medium" }), { size: "t", w: 200, ratio: 1.9 });
    const v = 'viewBox="0 0 200 104" preserveAspectRatio="xMidYMid meet"';
    if (id === "report") return `<svg ${v}><rect x="74" y="8" width="70" height="88" rx="6" class="f-card s-stroke" opacity=".7"/><rect x="62" y="14" width="74" height="86" rx="6" class="f-card"/><rect x="72" y="26" width="36" height="6" rx="3" class="f-ink"/><rect x="72" y="38" width="54" height="3" rx="1.5" class="f-seg"/><rect x="72" y="45" width="48" height="3" rx="1.5" class="f-seg"/>${[10, 15, 19, 24].map((hh, i) => `<rect x="${74 + i * 12}" y="${88 - hh}" width="8" height="${hh}" rx="2" class="${i === 3 ? "f-ink" : "f-rule"}"/>`).join("")}</svg>`;
    if (id === "deck") return `<svg ${v}><rect x="62" y="12" width="92" height="52" rx="6" class="f-card" opacity=".55"/><rect x="54" y="22" width="92" height="52" rx="6" class="f-card" opacity=".8"/><rect x="46" y="32" width="92" height="56" rx="6" class="f-card"/><rect x="56" y="44" width="42" height="7" rx="3.5" class="f-ink"/><rect x="56" y="56" width="30" height="3" rx="1.5" class="f-seg"/>${[0, 1, 2, 3, 4].map((i) => `<circle cx="${112 + (i % 3) * 7}" cy="${58 + Math.floor(i / 3) * 7 + (i % 2) * 2}" r="${1.6 + i * 0.5}" class="f-ink"/>`).join("")}<rect x="56" y="70" width="70" height="3" rx="1.5" class="f-seg"/></svg>`;
    if (id === "sheet") { let g = ""; for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) g += `<rect x="${44 + c * 19}" y="${14 + r * 16}" width="17" height="14" rx="2" class="${r === 0 ? "f-rule" : c === 4 ? "f-ink" : "f-card"}" ${r && c === 4 ? `opacity="${0.35 + r * 0.15}"` : ""}/>`; return `<svg ${v}>${g}</svg>`; }
    if (id === "brief") return `<svg ${v}><rect x="64" y="8" width="72" height="92" rx="6" class="f-card"/><rect x="74" y="20" width="50" height="8" rx="3" class="f-ink"/><rect x="74" y="32" width="38" height="8" rx="3" class="f-ink"/><rect x="74" y="48" width="52" height="3" rx="1.5" class="f-seg"/><rect x="74" y="55" width="46" height="3" rx="1.5" class="f-seg"/><rect x="74" y="70" width="23" height="18" rx="4" class="f-panel"/><rect x="101" y="70" width="23" height="18" rx="4" class="f-panel"/><rect x="78" y="76" width="12" height="3" rx="1.5" class="f-ink"/><rect x="105" y="76" width="12" height="3" rx="1.5" class="f-ink"/></svg>`;
    if (id === "monitor") return `<svg ${v}><path d="M30 70 L58 62 L82 66 L106 50 L130 56 L154 36 L172 40" class="s-ink" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/><circle cx="154" cy="36" r="5" class="f-acc"/>${[0, 1, 2, 3, 4, 5].map((i) => `<rect x="${30 + i * 28}" y="84" width="2" height="8" rx="1" class="f-rule"/>`).join("")}<rect x="30" y="20" width="44" height="6" rx="3" class="f-seg"/></svg>`;
    return "";
  }
  function filePreview(f) {
    if (f.t === "image") return SP.comp(Object.assign({}, SC.DEFAULT, f.p || {}), { size: "t", w: 300, name: f.photo, ratio: 2.1 });
    return outPreview(f.t);
  }

  /* ── Router ────────────────────────────────────────────────────────── */
  const CHAT_VIEWS = ["home", "answer"], AGENT_VIEWS = ["agent", "studio", "image", "session", "done"];
  const TITLES = { files: "Files", settings: "Settings" };
  let cur = "";
  const main = () => $("#main");
  function go(v) { if (location.hash.slice(1) === v) renderView(); else location.hash = v; }
  function route() {
    let v = location.hash.slice(1) || "home";
    if (!VIEWS[v]) v = "home";
    if (v === "image" && !state.img.p) v = "studio";
    if (v === "done" && state.session.status !== "done") { /* the sample report always exists */ }
    cur = v;
    closeNav(true);
    renderView(true);
  }
  function renderView(scrollTop) {
    leave();
    const m = main();
    m.innerHTML = VIEWS[cur].html();
    if (scrollTop) window.scrollTo(0, 0);
    VIEWS[cur].mount && VIEWS[cur].mount(m);
    updateTop();
    renderNav();
  }

  /* ── Top bar and nav ───────────────────────────────────────────────── */
  function updateTop() {
    const mid = $("#topMid");
    const isChat = CHAT_VIEWS.includes(cur), isAgent = AGENT_VIEWS.includes(cur);
    if (isChat || isAgent) {
      if (!$(".seg", mid)) mid.innerHTML = `<div class="seg" role="group" aria-label="Mode" id="modeSeg"><span class="thumb"></span><button type="button" data-go="home">Chat</button><button type="button" data-go="agent">Agent</button></div>`;
      const [c, a] = $$("#modeSeg button");
      c.setAttribute("aria-pressed", String(isChat)); a.setAttribute("aria-pressed", String(isAgent));
      placeSegs();
    } else mid.innerHTML = `<span class="top-title">${TITLES[cur] || ""}</span>`;
    const s = state.session, st = $("#topStatus");
    st.innerHTML = s.status === "running" ? `<span class="live-dot pulse"></span><span class="mono ink">1 running · ${Math.round(s.p * 100)}%</span>` : `<span class="mono">Kemma · ready</span>`;
  }
  function placeSegs() {
    $$(".seg").forEach((seg) => {
      const on = $('button[aria-pressed="true"]', seg), th = $(".thumb", seg);
      if (!th) return;
      if (!on) { th.style.opacity = "0"; return; }
      th.style.opacity = "1"; th.style.width = on.offsetWidth + "px"; th.style.transform = `translateX(${on.offsetLeft - 2}px)`;
    });
  }
  function renderNav() {
    const s = state.session, k = KINDS[s.type];
    const item = (v, ic, label, extra = "") => `<button class="nav-item" data-go="${v}" ${cur === v || (v === "home" && cur === "answer") || (v === "agent" && ["session", "done"].includes(cur)) || (v === "studio" && cur === "image") ? 'aria-current="page"' : ""}>${icon(ic, { signal: cur === v })}<span>${label}</span>${extra}</button>`;
    const soon = (ic, label) => `<button class="nav-item soon" data-act="soon" data-name="${label}">${icon(ic)}<span>${label}</span><span class="meta mono">Full app</span></button>`;
    const runRow = s.status === "running"
      ? `<button class="nav-run" data-go="session"><b>${esc(k.title)}</b><span class="tag"><span class="live-dot pulse"></span>${Math.round(s.p * 100)}%</span><span class="bar-holder"><canvas class="bar" id="navBar" style="height:10px"></canvas></span></button>`
      : s.status === "done" ? `<button class="nav-run" data-go="done"><b>${esc(k.title)}</b><span class="tag">Done</span></button>`
      : `<button class="nav-run" data-go="session"><b>${esc(k.title)}</b><span class="tag alert">Stopped</span></button>`;
    $("#nav").innerHTML = `
      <div class="nav-head"><div class="nav-brand">${GLYPH()}<span>Sutaeru</span>${SB.seal({ cls: "seal", rough: false })}</div><button class="icon-btn flat" data-act="nav-close" aria-label="Close menu">${icon("close")}</button></div>
      <div class="nav-new"><button class="btn ink" data-act="new-chat">${icon("ask")}New chat</button><button class="btn" data-go="agent">${icon("agent")}New task</button></div>
      <div class="nav-sec"><span class="mono">Workspace</span>${item("home", "ask", "Chat")}${item("agent", "agent", "Agent")}${item("studio", "image", "Images")}${item("files", "files", "Files")}</div>
      <div class="nav-sec"><span class="mono">Working for you</span>${runRow}
        <button class="nav-run" data-act="open-answer"><b>Rooftop solar payback</b><span class="tag quiet">Chat</span></button></div>
      <div class="nav-sec"><span class="mono">Yours</span>${soon("memory", "Memories")}${soon("models", "Skills")}${soon("schedule", "Monitors")}${soon("connections", "Connections")}${item("settings", "settings", "Settings")}</div>
      <div class="nav-foot"><span class="avatar" aria-hidden="true">R</span><div class="who"><b>Remy</b><span class="mono">Free plan · 38 of 50 credits</span><div class="credits" aria-hidden="true">${Array.from({ length: 10 }, (_, i) => `<i class="${i < 8 ? "" : "off"}"></i>`).join("")}</div></div><button class="icon-btn flat" data-go="settings" aria-label="Settings">${icon("settings")}</button></div>`;
    const nb = $("#navBar"); if (nb && state.navOpen) drawBar(nb, s.p, { mode: "converge", t: performance.now() });
  }
  function openNav() {
    state.navOpen = true; document.body.classList.add("nav-open");
    $("#logoBtn").setAttribute("aria-expanded", "true"); $("#nav").removeAttribute("inert"); $("#nav").setAttribute("aria-hidden", "false");
    renderNav(); setTimeout(() => { const f = $("#nav [aria-current]") || $("#nav button"); f && f.focus({ preventScroll: true }); }, 60);
  }
  function closeNav(silent) {
    if (!state.navOpen) return;
    state.navOpen = false; document.body.classList.remove("nav-open");
    $("#logoBtn").setAttribute("aria-expanded", "false"); $("#nav").setAttribute("inert", ""); $("#nav").setAttribute("aria-hidden", "true");
    if (!silent) $("#logoBtn").focus({ preventScroll: true });
  }

  /* ── Toast ─────────────────────────────────────────────────────────── */
  let toastT = 0;
  function toast(msg, ic = "check") {
    const t = $("#toast");
    t.innerHTML = `${icon(ic)}<span>${esc(msg)}</span>`;
    t.classList.add("show"); clearTimeout(toastT);
    toastT = setTimeout(() => t.classList.remove("show"), 2600);
  }

  /* ── Background session ticker (runs whichever view is open) ───────── */
  const SESSION_SEC = 90;
  setInterval(() => {
    const s = state.session;
    if (s.status !== "running") return;
    s.p = Math.min(1, s.p + 0.25 / SESSION_SEC * (s.boost || 1));
    if (s.p >= 1) {
      s.status = "done"; s.boost = 1;
      toast(`${KINDS[s.type].result.kind} ready: ${KINDS[s.type].result.title}`);
      if (cur === "session" || cur === "home") renderView();
    }
    updateTop();
    if (state.navOpen) { const t = $("#nav .nav-run .tag"); if (t && s.status === "running") t.lastChild.textContent = Math.round(s.p * 100) + "%"; }
  }, 250);
  setInterval(() => { if (state.navOpen) { const nb = $("#navBar"); nb && drawBar(nb, state.session.p, { mode: "converge", t: performance.now() }); } }, 120);

  /* ═════════════════════════ VIEWS ═════════════════════════ */
  const VIEWS = {};

  /* ── Home ──────────────────────────────────────────────────────────── */
  const RAMP = [1.2, 1.8, 2.4, 3, 3.6, 4.2, 4.8, 5.4, 5.4, 4.8, 4.2, 3.6, 3, 2.4, 1.8, 1.2];
  VIEWS.home = {
    html() {
      const s = state.session, k = KINDS[s.type], ch = state.chat;
      const srcN = Object.values(ch.srcs).filter(Boolean).length;
      const srcLabel = ch.srcs.web ? (srcN > 1 ? `Web +${srcN - 1}` : "Web") : srcN ? `${srcN} sources` : "No sources";
      const runRow = s.status === "running"
        ? `<button class="recent-row" data-go="session"><span class="st">${orb("run")}</span><span class="tx"><b>${esc(k.title)}</b><span class="sub"><canvas class="bar" id="homeBar"></canvas><span class="mono ink tnum" id="homePct">${Math.round(s.p * 100)}%</span></span></span><span class="when">Now</span></button>`
        : `<button class="recent-row" data-go="${s.status === "done" ? "done" : "session"}"><span class="st">${s.status === "done" ? icon("check") : icon("pause")}</span><span class="tx"><b>${esc(s.status === "done" ? k.result.title : k.title)}</b><span class="sub"><span class="tag ${s.status === "done" ? "" : "alert"}">${s.status === "done" ? "Done" : "Stopped"}</span></span></span><span class="when">${s.status === "done" ? "Just now" : "Today"}</span></button>`;
      return `<section class="view home view-enter ${ch.priv ? "private-on" : ""}" id="view-home">
        <div class="home-hero lockup ${state.introDone || RM() ? "no-intro" : "intro"}">
          ${GLYPH("mark glyph", "full")}
          <div class="word-row"><h1 class="word">Sutaeru</h1>${SB.seal({ cls: "seal hero-seal" })}</div>
          <p class="mono tagline">Ask once. We do the rest.</p>
          <div class="ramp art-deco" id="ramp" aria-hidden="true">${RAMP.map((d) => `<i style="--d:${d}px"></i>`).join("")}</div>
        </div>
        <div class="home-dock">
          <p class="private-note mono" id="privNote">${icon("eyeoff", { cls: "s" })}Private · not saved to history or memory</p>
          <div class="composer-wrap is-on" id="cw">
            ${BRK()}
            <form class="composer dock" id="composer" autocomplete="off">
              <div class="attachments" id="atts"></div>
              <label class="sr" for="q">Ask Sutaeru</label>
              <textarea id="q" rows="1" placeholder="Ask anything…" enterkeyhint="send"></textarea>
              <div class="ctrls">
                <button type="button" class="icon-btn flat" id="attachBtn" aria-label="Add photos or files" aria-expanded="false">${icon("plus")}</button>
                <button type="button" class="pill mode-pill" id="thinkBtn" aria-pressed="${ch.thinking}">${icon("make")}Thinking</button>
                <button type="button" class="pill" id="srcBtn" aria-expanded="false" aria-label="Choose sources">${icon("web")}<span class="src-text" id="srcLabel">${srcLabel}</span></button>
                <span class="spacer"></span>
                <button type="button" class="icon-btn flat" id="privBtn" aria-pressed="${ch.priv}" aria-label="Private chat">${icon("eyeoff")}</button>
                <button type="submit" class="icon-btn ink send" id="sendBtn" aria-label="Talk to Sutaeru"><span class="mic-ico" id="sendIco">${icon("wave")}</span><span class="voice-meter"><i></i><i></i><i></i><i></i></span></button>
              </div>
            </form>
          </div>
        </div>
        <div class="home-lists">
          <div class="sec-label" style="margin-top:6px"><span class="mono">Recently updated</span></div>
          <div class="recent">
            ${runRow}
            <button class="recent-row" data-act="open-answer"><span class="st">${icon("check")}</span><span class="tx"><b>${esc(SAMPLE_Q)}</b></span><span class="when">Yesterday</span></button>
            <button class="recent-row" data-act="open-file" data-i="3"><span class="st thumb-ph" style="position:relative">${SP.comp({ light: "window", shot: "close" }, { size: "t", w: 40 })}</span><span class="tx"><b>Ceramic mug, morning light</b></span><span class="when">2 days ago</span></button>
          </div>
          <button class="handoff" data-go="agent">
            <span class="hi">${icon("make")}</span>
            <span class="tx"><b>Hand off a project</b><small>Works while you are away</small></span>
            <span class="cols art-deco" aria-hidden="true">${[1.6, 2.8, 4].map((d) => `<span>${Array.from({ length: 5 }, () => `<i style="width:${d}px;height:${d}px"></i>`).join("")}</span>`).join("")}</span>
            <span class="go">${icon("upright")}</span>
          </button>
        </div>
      </section>`;
    },
    mount(m) {
      const ch = state.chat, q = $("#q", m), send = $("#sendBtn", m), form = $("#composer", m);
      state.introDone = true;
      const ramp = $$("#ramp i", m);
      let energy = 0, phase = 0;
      const syncSend = () => {
        const has = q.value.trim().length > 0 || ch.atts.length > 0;
        $("#sendIco", m).innerHTML = has ? icon("up") : icon("wave");
        send.setAttribute("aria-label", has ? "Send" : "Talk to Sutaeru");
      };
      const grow = () => { q.style.height = "auto"; q.style.height = Math.min(q.scrollHeight, 220) + "px"; };
      q.addEventListener("input", () => { grow(); syncSend(); energy = 1; });
      q.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); } });
      // The ramp breathes while someone types, then settles: it shows Sutaeru is listening.
      if (!RM()) loop(() => {
        if (energy < 0.01 && !ch.listening) return;
        phase += 0.16; energy *= 0.97;
        const e = ch.listening ? 1 : energy;
        ramp.forEach((d, i) => d.style.setProperty("--k", (1 + e * 0.7 * Math.sin(phase + i * 0.55)).toFixed(3)));
      });
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const text = q.value.trim();
        if (!text && !ch.atts.length) { startListening(); return; }
        state.q = text || "Summarise the attached file";
        state.answerPlayed = false; state.thread = [];
        go("answer");
      });
      function startListening() {
        if (ch.listening) return;
        ch.listening = true; $("#cw", m).classList.add("listening"); send.setAttribute("aria-label", "Listening");
        q.placeholder = "Listening…";
        after(RM() ? 300 : 2200, () => {
          ch.listening = false; $("#cw", m).classList.remove("listening");
          ramp.forEach((d) => d.style.setProperty("--k", "1"));
          q.placeholder = "Ask anything…"; q.value = SAMPLE_Q; grow(); syncSend(); q.focus();
        });
      }
      $("#thinkBtn", m).addEventListener("click", (e) => { ch.thinking = !ch.thinking; e.currentTarget.setAttribute("aria-pressed", ch.thinking); toast(ch.thinking ? "Thinking on: slower, more careful answers" : "Thinking off", ch.thinking ? "make" : "check"); });
      $("#privBtn", m).addEventListener("click", (e) => { ch.priv = !ch.priv; e.currentTarget.setAttribute("aria-pressed", ch.priv); $("#view-home").classList.toggle("private-on", ch.priv); });
      $("#attachBtn", m).addEventListener("click", (e) => popover(e.currentTarget, "attach"));
      $("#srcBtn", m).addEventListener("click", (e) => popover(e.currentTarget, "sources"));
      renderAtts();
      syncSend();
      const hb = $("#homeBar", m);
      if (hb) loop((t) => { drawBar(hb, state.session.p, { mode: "converge", t }); const pc = $("#homePct", m); if (pc) pc.textContent = Math.round(state.session.p * 100) + "%"; });

      function popover(anchor, kind) {
        const wrap = $("#cw", m);
        const open = $(".popover", wrap);
        if (open) { const was = open.dataset.kind; open.remove(); $$("[aria-expanded]", wrap).forEach((b) => b.setAttribute("aria-expanded", "false")); if (was === kind) return; }
        const pop = document.createElement("div");
        pop.className = "popover"; pop.dataset.kind = kind; pop.setAttribute("role", "dialog");
        if (kind === "attach") {
          pop.setAttribute("aria-label", "Add to this chat");
          pop.innerHTML = `<p class="mono">Add to this chat</p>
            <button class="pop-item" data-add="file"><span class="pi">${icon("files")}</span><span><b>Photos and files</b><small>PDF, images, sheets up to 50 MB</small></span></button>
            <button class="pop-item" data-add="camera"><span class="pi">${icon("camera")}</span><span><b>Take a photo</b><small>Snap a page, a receipt, a whiteboard</small></span></button>
            <button class="pop-item" data-add="drive"><span class="pi"><span style="font:700 13px/1 var(--disp)">G</span></span><span><b>From Google Drive</b><small>Connected as remy@sutaeru.com</small></span></button>`;
        } else {
          pop.setAttribute("aria-label", "Sources");
          pop.innerHTML = `<p class="mono">Search in</p><div class="pop-toggles">${[["web", "Web", "News, papers and public sites"], ["files", "My files", "Everything in Files"], ["memory", "Memory", "What Sutaeru knows about you"]].map(([key, lb, sub]) => `<div class="toggle-row"><div class="tx"><b>${lb}</b><small>${sub}</small></div><button class="toggle" role="switch" aria-checked="${ch.srcs[key]}" aria-label="${lb}" data-src="${key}"></button></div>`).join("")}</div>`;
        }
        wrap.appendChild(pop);
        anchor.setAttribute("aria-expanded", "true");
        pop.addEventListener("click", (e) => {
          const add = e.target.closest("[data-add]"), sw = e.target.closest("[data-src]");
          if (add) { addAtt(add.dataset.add); pop.remove(); anchor.setAttribute("aria-expanded", "false"); }
          if (sw) {
            const key = sw.dataset.src; ch.srcs[key] = !ch.srcs[key]; sw.setAttribute("aria-checked", ch.srcs[key]);
            const n = Object.values(ch.srcs).filter(Boolean).length;
            $("#srcLabel", m).textContent = ch.srcs.web ? (n > 1 ? `Web +${n - 1}` : "Web") : n ? `${n} sources` : "No sources";
          }
        });
        const off = (e) => { if (!pop.contains(e.target) && e.target !== anchor && !anchor.contains(e.target)) { pop.remove(); anchor.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", off); } };
        setTimeout(() => document.addEventListener("pointerdown", off), 0);
        onLeave(() => document.removeEventListener("pointerdown", off));
      }
      function addAtt(kind) {
        const names = { file: ["supplier_quotes.pdf", "2.4 MB", "report"], camera: ["Photo, whiteboard", "1.1 MB", "camera"], drive: ["Q3 ledger.xlsx", "Google Drive", "plan"] };
        const [name, size, ic] = names[kind];
        ch.atts.push({ id: Date.now(), name, size, ic, p: 0 });
        renderAtts(); syncSend();
      }
      function renderAtts() {
        const box = $("#atts", m);
        box.innerHTML = ch.atts.map((a) => `<div class="att" data-id="${a.id}"><span class="att-thumb">${icon(a.ic)}</span><span class="att-meta"><b>${esc(a.name)}</b><span class="mono">${a.p >= 1 ? esc(a.size) : "Uploading"}</span>${a.p < 1 ? '<canvas class="bar"></canvas>' : ""}</span><button type="button" class="icon-btn" aria-label="Remove ${esc(a.name)}" data-rm="${a.id}">${icon("close", { cls: "s" })}</button></div>`).join("");
        $$("[data-rm]", box).forEach((b) => b.addEventListener("click", () => { ch.atts = ch.atts.filter((a) => String(a.id) !== b.dataset.rm); renderAtts(); syncSend(); }));
        ch.atts.filter((a) => a.p < 1 && !a.live).forEach((a) => {
          a.live = true;
          const t0 = performance.now();
          loop((t) => {
            if (a.p >= 1) return;
            a.p = RM() ? 1 : clamp((t - t0) / 1400);
            drawBar($(`.att[data-id="${a.id}"] canvas`, box), a.p, { t });
            if (a.p >= 1) renderAtts();
          });
        });
      }
    },
  };

  /* ── Answer ────────────────────────────────────────────────────────── */
  const ANSWER = [
    "Most commercial rooftop systems in Indonesia pay back in 4 to 6 years, depending on size and the PLN tariff class.", { c: 1 }, { c: 2 },
    "Larger systems recover faster because installation cost per watt falls with scale.", { c: 3 },
  ];
  const PAYBACK = [["100 kWp", 5.9], ["250 kWp", 5.1], ["500 kWp", 4.6], ["1 MWp", 4.2]];
  VIEWS.answer = {
    html() {
      const played = state.answerPlayed || RM();
      const para = ANSWER.map((seg) => typeof seg === "string" ? seg.split(" ").map((w) => `<span class="stream-word${played ? " in" : ""}">${esc(w)} </span>`).join("") : `<button class="cite" data-cite="${seg.c}" aria-label="Source ${seg.c}: ${esc(SOURCES[seg.c - 1][2])}">${seg.c}</button> `).join("");
      return `<section class="view view-enter" id="view-answer">
        <div class="answer-grid">
          <div class="answer-main">
            <p class="mono">Chat · ${state.chat.thinking ? "Thinking" : "Example answer"}</p>
            <h1 class="title q-title">${esc(state.q)}</h1>
            <div class="search-line" id="searchLine">${played ? `${stepped(4, 4, -1, 8, 4)}<span class="mono">Searched 14 sources · 6 s</span>` : `${orb("run")}<span class="mono" id="searchTxt">Searching the web · 0 of 14</span>`}</div>
            <div class="sources" id="sources">${SOURCES.map(([l, d, t], i) => `<button class="src${played ? "" : " pending"}${i === 0 ? " is-on" : ""}" data-src-i="${i}">${BRK("tight")}<span class="src-head"><span class="letter">${l}</span><span class="mono">${d}</span></span><b>${esc(t)}</b></button>`).join("")}</div>
            <article class="card answer-card" id="answerCard" ${played ? "" : 'style="opacity:0;transform:translateY(8px);transition:opacity 500ms var(--ease),transform 600ms var(--ease)"'}>
              <p>${para}</p>
              <div class="fig">
                <div>
                  <p class="mono" style="margin-bottom:6px">Payback by system size</p>
                  <div class="chart${played ? " drawn" : ""}" id="chart" role="img" aria-label="Payback years: ${PAYBACK.map(([a, b]) => `${a} ${b} years`).join(", ")}">${PAYBACK.map(([lb, v], i) => `<div class="col"><span class="mono tnum">${v} y</span><span class="bar-v${i === 3 ? " hl" : ""}" style="height:${v * 14}px;transition-delay:${i * 140}ms"></span></div>`).join("")}</div>
                  <div class="chart-x">${PAYBACK.map(([lb]) => `<span class="mono">${lb}</span>`).join("")}</div>
                </div>
                <div class="kv">
                  <div><span class="mono">Tariff class</span><b>I-3 / TM</b></div>
                  <div><span class="mono">Capex</span><b class="tnum">IDR 9.5 to 11m per kWp</b></div>
                  <div><span class="mono">Typical IRR</span><b class="tnum">14 to 18%</b></div>
                </div>
              </div>
              <p class="lede" style="font-size:15px">Net metering rules and the cap on export decide the upper end of the range. <button class="cite" data-cite="4" aria-label="Source 4">4</button> <button class="cite" data-cite="5" aria-label="Source 5">5</button></p>
              <div class="answer-tools">
                <button class="icon-btn flat" data-act="copy-answer" aria-label="Copy answer">${icon("copy")}</button>
                <button class="icon-btn flat" data-act="toast" data-msg="Saved to Files" aria-label="Save to Files">${icon("files")}</button>
                <button class="icon-btn flat" data-act="toast" data-msg="Share link copied" aria-label="Share">${icon("share")}</button>
              </div>
            </article>
            <div class="thread" id="thread">${state.thread.map((t) => `<div class="user-bubble">${esc(t)}</div><p class="note-line">${icon("lock", { cls: "s" })}This prototype answers with samples only. In the app, Sutaeru replies here.</p>`).join("")}</div>
          </div>
          <aside class="rail">
            <div>
              <p class="mono" style="margin-bottom:8px">Related</p>
              <div class="related">${["What affects the payback period most?", "Compare rooftop vs ground mount", "Show a 500 kWp cash flow"].map((r) => `<button data-related="${esc(r)}">${esc(r)}${icon("arrow")}</button>`).join("")}</div>
            </div>
            <div class="card turn">
              <p class="mono">Turn this into</p>
              <div class="turn-opts" role="radiogroup" aria-label="Output">${["report", "deck", "sheet"].map((id) => `<button class="turn-opt" role="radio" aria-checked="${state.turnTo === id}" data-turn="${id}"><span class="tt">${outPreview(id)}</span><span>${OUTS.find((o) => o.id === id).name}</span></button>`).join("")}</div>
              <button class="btn ink big" style="width:100%" data-act="hand-to-agent">Hand to Agent ${icon("arrow")}</button>
            </div>
          </aside>
        </div>
        <div class="follow"><form id="followForm" autocomplete="off"><label class="sr" for="fu">Ask a follow up</label><input id="fu" placeholder="Ask a follow up" enterkeyhint="send"><button class="icon-btn ink" aria-label="Send">${icon("up")}</button></form></div>
      </section>`;
    },
    mount(m) {
      const played = state.answerPlayed || RM();
      const srcs = $$(".src", m);
      const focusSrc = (i) => { srcs.forEach((s, j) => s.classList.toggle("is-on", j === i)); $$(".cite", m).forEach((c) => c.classList.toggle("on", +c.dataset.cite === i + 1)); const el = srcs[i]; const box = $("#sources", m); if (box.scrollWidth > box.clientWidth) box.scrollTo({ left: el.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft - 20, behavior: RM() ? "auto" : "smooth" }); };
      m.addEventListener("click", (e) => {
        const c = e.target.closest(".cite"); if (c) focusSrc(+c.dataset.cite - 1);
        const s = e.target.closest(".src"); if (s) { focusSrc(+s.dataset.srcI); toast(`Source ${+s.dataset.srcI + 1}: ${SOURCES[+s.dataset.srcI][1]}`, "web"); }
        const r = e.target.closest("[data-related]"); if (r) { const fu = $("#fu", m); fu.value = r.dataset.related; fu.focus(); }
        const t = e.target.closest("[data-turn]"); if (t) { state.turnTo = t.dataset.turn; $$("[data-turn]", m).forEach((b) => b.setAttribute("aria-checked", b === t)); }
      });
      $("#followForm", m).addEventListener("submit", (e) => { e.preventDefault(); const v = $("#fu", m).value.trim(); if (!v) return; state.thread.push(v); $("#fu", m).value = ""; const th = $("#thread", m); th.insertAdjacentHTML("beforeend", `<div class="user-bubble">${esc(v)}</div><p class="note-line">${icon("lock", { cls: "s" })}This prototype answers with samples only. In the app, Sutaeru replies here.</p>`); th.lastElementChild.scrollIntoView({ behavior: RM() ? "auto" : "smooth", block: "center" }); });
      if (played) return;
      // Orchestrated arrival: sources land one by one, the answer streams, then the chart draws in.
      let n = 0;
      const tick = () => {
        if (n < srcs.length) { srcs[n].classList.remove("pending"); focusSrc(n); }
        n++;
        const st = $("#searchTxt", m); if (st) st.textContent = `Searching the web · ${Math.min(14, Math.round(n * 2.8))} of 14`;
        if (n <= srcs.length) after(300, tick);
        else after(260, answer);
      };
      after(380, tick);
      function answer() {
        $("#searchLine", m).innerHTML = `${stepped(4, 4, -1, 8, 4)}<span class="mono">Searched 14 sources · 6 s</span>`;
        focusSrc(0);
        const card = $("#answerCard", m); card.style.opacity = "1"; card.style.transform = "none";
        const words = $$(".stream-word", m);
        words.forEach((w, i) => after(160 + i * 28, () => w.classList.add("in")));
        after(260 + words.length * 28, () => { $("#chart", m).classList.add("drawn"); state.answerPlayed = true; });
      }
    },
  };

  /* ── Agent task builder ────────────────────────────────────────────── */
  function planFor(type, depth) {
    const D = DEPTH[depth], k = KINDS[type];
    if (type === "image") return { steps: [["You set up the shot", "Shot, lens, light and look", "Next"], ["Sutaeru draws it", "With the engine you pick", "15 s"], ["Saved to Files", "Original size, ready to share", "1 s"]], total: "About 15 s", credits: 2 };
    const scale = depth === "quick" ? 0.45 : depth === "deep" ? 2.6 : 1;
    const steps = k.steps.map((s) => {
      const min = s.m * (s.k === "search" || s.k === "read" ? scale : 1);
      return [s.name, (s.done || (s.file ? `Starts with ${s.file}` : "Formatted, cited, ready to send")).replace("SRC", D.src), min < 1 ? `${Math.round(min * 60)} s` : `${Math.round(min)} min`];
    });
    const tot = k.steps.reduce((a, s) => a + s.m * (s.k === "search" || s.k === "read" ? scale : 1), 0);
    return { steps, total: type === "monitor" ? "Then every 6 h" : `About ${Math.max(1, Math.round(tot))} min`, credits: D.credits };
  }
  VIEWS.agent = {
    html() {
      const a = state.agent;
      return `<section class="view view-enter" id="view-agent">
        <div class="agent-head">
          ${stepsHTML(0)}
          <h1 class="title">What should Sutaeru make?</h1>
          <p class="lede" style="margin-top:12px">Describe the outcome. Sutaeru plans it, works on it and hands back a finished file. You can close the app while it works.</p>
        </div>
        <div class="agent-grid">
          <div>
            <div class="outputs" role="radiogroup" aria-label="What to make">${OUTS.map((o) => `<button class="out${a.out === o.id ? " is-on" : ""}" role="radio" aria-checked="${a.out === o.id}" data-out="${o.id}">${BRK()}<span class="prev">${outPreview(o.id)}</span><span class="nm"><b>${o.name}</b><small>${o.blurb}</small></span><span class="check-badge">${icon("check")}</span></button>`).join("")}</div>
            <div class="field brief"><label class="mono" for="brief">Your brief</label><textarea id="brief" rows="3">${esc(a.brief)}</textarea></div>
            <div class="field" id="depthField" ${a.out === "image" || a.out === "monitor" ? "hidden" : ""}><span class="mono">How deep</span>
              <div class="depths" role="radiogroup" aria-label="How deep">${Object.entries(DEPTH).map(([id, d]) => `<button class="depth${a.depth === id ? " is-on" : ""}" role="radio" aria-checked="${a.depth === id}" data-depth="${id}">${BRK("tight")}<b>${d.label}</b><span class="dots-field" aria-hidden="true">${Array.from({ length: 30 }, (_, i) => `<i class="${i < d.dots ? "on" : ""}"></i>`).join("")}</span><span class="mono">${d.src}${id === "deep" ? "+" : ""} sources · ${d.min} min</span></button>`).join("")}</div>
            </div>
            <div class="field"><span class="mono">Sources</span>
              <div class="src-toggles">${[["web", "W", "Web"], ["files", "F", "My files"], ["drive", "G", "Google Drive"], ["notion", "N", "Notion"]].map(([k, l, n]) => `<button class="pill" aria-pressed="${a.srcs[k]}" data-asrc="${k}"><span class="letter">${l}</span>${n}</button>`).join("")}</div>
            </div>
            <div class="field">
              <div class="toggle-row"><div class="tx"><b>Tell me on Telegram when it is done</b><small>One message with the file attached</small></div><button class="toggle" role="switch" aria-checked="${a.notify}" aria-label="Telegram when done" id="notifyT"></button></div>
            </div>
          </div>
          <aside class="agent-side"><div class="card plan-card" id="planCard"></div></aside>
        </div>
        <div class="go-bar" id="agentGo"></div>
      </section>`;
    },
    mount(m) {
      const a = state.agent;
      const draw = () => {
        const p = planFor(a.out, a.depth);
        $("#planCard", m).innerHTML = `<p class="mono">Sutaeru will</p>
          <div class="plan-flow">${p.steps.map(([n, sub, t]) => `<div class="pf"><span class="nd"></span><span><b>${esc(n)}</b><small>${esc(sub)}</small></span><span class="mono tnum">${t}</span></div>`).join("")}</div>
          <div class="plan-total"><div class="tx"><span class="mono">Total</span><b class="tnum" style="display:block;margin-top:6px">${p.total}</b></div><div style="text-align:right"><span class="mono">Cost</span><b class="tnum" style="display:block;margin-top:6px">${p.credits} cr</b></div></div>`;
        const srcNames = [["web", "Web"], ["files", "My files"], ["drive", "Drive"], ["notion", "Notion"]].filter(([k]) => a.srcs[k]).map(([, n]) => n).join(", ") || "No sources";
        const o = OUTS.find((x) => x.id === a.out);
        $("#agentGo", m).innerHTML = `<div class="sum"><span class="mono">${o.name}${a.out === "image" || a.out === "monitor" ? "" : " · " + DEPTH[a.depth].label} · ${esc(srcNames)}</span><b class="tnum">${p.total} · ${p.credits} credits</b></div>
          <button class="btn ink big" data-act="agent-start">${a.out === "image" ? "Set up the shot" : a.out === "monitor" ? "Start watching" : "Start"} ${icon("arrow")}</button>`;
      };
      draw();
      m.addEventListener("click", (e) => {
        const o = e.target.closest("[data-out]");
        if (o) {
          const before = a.out; a.out = o.dataset.out;
          $$("[data-out]", m).forEach((b) => { const on = b === o; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on); });
          const br = $("#brief", m);
          if (before !== "image" && (br.value === KINDS[before]?.brief || !br.value.trim())) br.value = a.out === "image" ? state.studio.prompt : KINDS[a.out].brief;
          else if (before === "image" && br.value === state.studio.prompt) br.value = a.out === "image" ? br.value : KINDS[a.out].brief;
          a.brief = br.value;
          $("#depthField", m).hidden = a.out === "image" || a.out === "monitor";
          draw();
        }
        const d = e.target.closest("[data-depth]");
        if (d) { a.depth = d.dataset.depth; $$("[data-depth]", m).forEach((b) => { const on = b === d; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on); }); draw(); }
        const s = e.target.closest("[data-asrc]");
        if (s) { a.srcs[s.dataset.asrc] = !a.srcs[s.dataset.asrc]; s.setAttribute("aria-pressed", a.srcs[s.dataset.asrc]); draw(); }
      });
      $("#brief", m).addEventListener("input", (e) => { a.brief = e.target.value; });
      $("#notifyT", m).addEventListener("click", (e) => { a.notify = !a.notify; e.currentTarget.setAttribute("aria-checked", a.notify); });
    },
  };
  function stepsHTML(curStep) {
    const names = ["Brief", "Look", "Build", "Done"];
    return `<div class="steps" aria-label="Step ${curStep + 1} of 4">${names.map((n, i) => `${i ? `<span class="ln${i <= curStep ? " done" : ""}"></span>` : ""}<span class="st${i === curStep ? " cur" : i < curStep ? " done" : ""}"><span class="mono"><span class="num">${String(i + 1).padStart(2, "0")} </span>${n}</span></span>`).join("")}</div>`;
  }

  /* ── Image studio: every option shows what it does ─────────────────── */
  const GROUPS = [["shot", "Shot"], ["angle", "Camera angle"], ["lens", "Lens"], ["light", "Light"], ["look", "Look"], ["ratio", "Shape"]];
  function suggestEngine() {
    const st = state.studio, p = st.p;
    if (p.label) return ["gemini", "Your prompt has words in quotes. Gemini sets type cleanly."];
    if (p.look === "film" || ["golden", "night", "backlit"].includes(p.light)) return ["openai", "Moody light and film looks read best with OpenAI."];
    if (p.look === "illustration" || p.look === "ink" || p.look === "clay") return ["gemini", "Clean shapes and flat colour suit Gemini."];
    return ["wan", "Natural detail and texture is where Wan is strongest."];
  }
  const engineOf = () => state.studio.engine || suggestEngine()[0];
  function costOf() {
    const st = state.studio, e = SC.ENGINES.find((x) => x.id === engineOf());
    const credits = e.cost * (st.quality === "high" ? 2 : 1) * st.count;
    const base = { gemini: 13, openai: 16, wan: 18 }[e.id];
    const secs = Math.round(base * (st.quality === "high" ? 1.6 : 1) + (st.count - 1) * 4);
    return { e, credits, secs };
  }
  function labelFromPrompt(s) { const m = s.match(/["“”'‘’]([^"“”'‘’]{1,14})["“”'‘’]/); return m ? m[1].toUpperCase() : ""; }
  /* Every tile is your picture with that one choice changed. */
  function optThumb(g, o) {
    const p = Object.assign({}, state.studio.p, { [g]: o.id });
    if (g === "ratio") {
      const W = 92, H = 70; let w = o.r >= W / H ? W : H * o.r, h = w / o.r;
      return `<span class="sh" style="width:${w.toFixed(1)}px;height:${h.toFixed(1)}px">${SP.comp(p, { size: "auto", w, ratio: o.r })}</span>`;
    }
    return SP.comp(p, { size: "auto", w: 128, ratio: 4 / 3 });
  }
  const vfInner = (w) => state.studio.vf === "sketch" ? SC.render(state.studio.p) : SP.comp(state.studio.p, { size: "l", w: w || 460 });
  function vfCredit() {
    const p = state.studio.p;
    if (state.studio.vf === "sketch" || p.look === "illustration" || p.look === "clay") return p.look === "illustration" || p.look === "clay" ? "Drawn preview" : "Composition sketch";
    const b = SP.base(p); return `Photo · ${SP.PHOTOS[b.name].by} · Unsplash`;
  }
  VIEWS.studio = {
    html() {
      const st = state.studio;
      const [sug, why] = suggestEngine(), eng = engineOf();
      return `<section class="view view-enter" id="view-studio">
        <div class="studio-head">${stepsHTML(1)}<h1 class="title">Set up the shot.</h1><p class="lede" style="margin-top:10px">Each tile is your picture with that one choice changed. Pick what you see, and Sutaeru draws it.</p></div>
        <div class="studio-grid">
          <div class="vf-col">
            <div class="vf" id="vf">
              <span class="tag vf-tag"><span class="live-dot"></span>Live preview</span>
              <div class="vf-tools"><div class="seg small vf-mode" role="group" aria-label="Preview style"><span class="thumb"></span><button type="button" data-vf="photo" aria-pressed="${st.vf !== "sketch"}">Photo</button><button type="button" data-vf="sketch" aria-pressed="${st.vf === "sketch"}">Sketch</button></div><button class="icon-btn" id="gridBtn" aria-pressed="${st.grid}" aria-label="Thirds grid">${icon("grid")}</button></div>
              <div class="vf-frame" id="vff"><div class="scene">${vfInner()}</div><div class="thirds" style="opacity:${st.grid ? 0.5 : 0}"><i></i><i></i><i></i><i></i></div><div class="af"><i></i><i></i><i></i><i></i></div></div>
              <span class="mono ph-credit" id="vfCredit">${vfCredit()}</span>
            </div>
            <div class="readout" id="readout"></div>
            <p class="vf-note">Sample photos show framing, light and look. The engine draws your final picture.</p>
          </div>
          <div class="opt-col">
            <div class="card prompt-card">
              <label class="mono" for="prompt">Your prompt</label>
              <textarea id="prompt" rows="2">${esc(st.prompt)}</textarea>
              <div class="row"><button class="pill" id="refBtn" aria-pressed="${st.ref}">${st.ref ? `<span class="ref-thumb" style="width:26px;height:26px;border-radius:8px"><img src="img/t/ref.webp" alt="" style="width:100%;height:100%;object-fit:cover"></span>Reference added` : `${icon("plus")}Reference photo`}</button><span class="mono" style="margin-left:auto">Put words in quotes to print them</span></div>
            </div>
            ${GROUPS.map(([g, title]) => { const sel = SC.byId(g, st.p[g]); return `<div class="opt-group" data-group="${g}"><div class="between"><span class="mono ink">${title}</span><span class="why" data-why="${g}">${sel.label} · ${sel.sub}</span></div><div class="opts" role="radiogroup" aria-label="${title}" style="--n:${SC.OPTIONS[g].length}">${SC.OPTIONS[g].map((o) => `<button class="opt${g === "ratio" ? " shape" : ""}" role="radio" aria-checked="${st.p[g] === o.id}" data-g="${g}" data-v="${o.id}"><span class="ot">${optThumb(g, o)}<span class="tick">${icon("check")}</span></span><span class="cap"><b>${o.label}</b><small>${o.sub}</small></span></button>`).join("")}</div></div>`; }).join("")}
            <div class="opt-group"><div class="between"><span class="mono ink">Engine</span><span class="why" id="engWhy">${why}</span></div>
              <div class="engines" role="radiogroup" aria-label="Engine">${SC.ENGINES.map((e) => `<button class="engine${eng === e.id ? " is-on" : ""}" role="radio" aria-checked="${eng === e.id}" data-engine="${e.id}">${BRK()}<span class="ep"><img src="img/t/eng-${e.id}.webp" alt="" loading="lazy" decoding="async"><span class="badge">${ENGINE_MARK[e.id]}</span><span class="sugg" ${sug === e.id ? "" : "hidden"}>Suggested</span><span class="check-badge">${icon("check")}</span></span><span class="en-body"><span class="en-name"><b>${e.name}</b><span class="mono">${e.time}</span></span><p>${e.line}</p><span class="meters">${Object.entries(e.meters).map(([k, v]) => `<span>${meter(v)}<span class="mono">${k}</span></span>`).join("")}</span><span class="mono">${e.cost} credits each</span></span></button>`).join("")}</div>
            </div>
            <div class="opt-group"><div class="between"><span class="mono ink">Quality and count</span><span class="why">High takes longer and costs double</span></div>
              <div class="qty">
                <div class="seg small" role="group" aria-label="Quality"><span class="thumb"></span><button type="button" data-q="standard" aria-pressed="${st.quality === "standard"}">Standard</button><button type="button" data-q="high" aria-pressed="${st.quality === "high"}">High</button></div>
                <div class="row" role="radiogroup" aria-label="How many pictures">${[1, 2, 3, 4].map((n) => `<button class="count-opt" role="radio" aria-checked="${st.count === n}" data-count="${n}" aria-label="${n} picture${n > 1 ? "s" : ""}"><span class="stackf">${Array.from({ length: n }, (_, i) => `<i style="left:${i * 3}px;top:${6 - i * 3}px"></i>`).join("")}</span><span>${n}</span></button>`).join("")}</div>
              </div>
            </div>
            <details class="credits-line"><summary class="mono">Sample photos · Unsplash</summary><p>${SP.credits().join(", ")}. Free to use under the Unsplash License.</p></details>
          </div>
        </div>
        <div class="go-bar" id="studioGo"></div>
      </section>`;
    },
    mount(m) {
      const st = state.studio;
      const sizeFrame = () => {
        const vf = $("#vf", m), fr = $("#vff", m); if (!vf || !fr) return;
        const r = SC.byId("ratio", st.p.ratio).r, W = vf.clientWidth - 48, H = vf.clientHeight - 72;
        const w = Math.min(W, H * r); fr.style.width = w + "px"; fr.style.height = w / r + "px"; fr.style.marginTop = "18px"; st.frameW = w;
      };
      onRedraw(sizeFrame);
      const readout = () => {
        $("#readout", m).innerHTML = GROUPS.map(([g]) => { const o = SC.byId(g, st.p[g]); return `<span class="mono">${g === "ratio" ? "" : (g === "angle" ? "Angle" : g[0].toUpperCase() + g.slice(1)) + " "}<b>${g === "ratio" ? o.id : o.label}</b></span>`; }).join("");
      };
      const goBar = () => {
        const { e, credits, secs } = costOf();
        $("#studioGo", m).innerHTML = `<div class="sum"><span class="mono">${e.name} · ${st.quality === "high" ? "High" : "Standard"} · ${st.count} picture${st.count > 1 ? "s" : ""}</span><b class="tnum">${credits} credits · about ${secs} s</b></div><button class="btn ink big" data-act="studio-begin">Begin ${icon("arrow")}</button>`;
      };
      const engines = () => {
        const [sug, why] = suggestEngine(), eng = engineOf();
        $("#engWhy", m).textContent = why;
        $$("[data-engine]", m).forEach((b) => { const on = b.dataset.engine === eng; b.classList.toggle("is-on", on); b.setAttribute("aria-checked", on); $(".sugg", b).hidden = b.dataset.engine !== sug; });
      };
      const updateVF = () => {
        const fr = $("#vff", m), n = document.createElement("div");
        sizeFrame();
        n.className = "scene"; n.innerHTML = vfInner(st.frameW);
        $("#vfCredit", m).textContent = vfCredit();
        const olds = $$(".scene", fr);
        if (RM()) { olds.forEach((o) => o.remove()); fr.prepend(n); }
        else { n.style.opacity = "0"; olds[olds.length - 1].after(n); requestAnimationFrame(() => requestAnimationFrame(() => { n.style.opacity = "1"; })); setTimeout(() => olds.forEach((o) => o.remove()), 300); }
        const af = $(".af", fr), f = st.vf === "sketch" || st.p.look === "illustration" || st.p.look === "clay" ? [50, 54] : SP.focus(st.p);
        af.style.left = f[0] + "%"; af.style.top = f[1] + "%";
        af.classList.remove("lock"); void af.offsetWidth; af.classList.add("lock");
        sizeFrame();
      };
      const refreshThumbs = (skip) => {
        GROUPS.forEach(([g]) => {
          if (g === skip) return;
          $$(`.opt[data-g="${g}"]`, m).forEach((b) => {
            const o = SC.byId(g, b.dataset.v), ot = $(".ot", b), tick = $(".tick", ot);
            ot.innerHTML = optThumb(g, o); ot.appendChild(tick);
          });
        });
      };
      const all = (skip) => { readout(); updateVF(); refreshThumbs(skip); engines(); goBar(); };
      readout(); engines(); goBar(); placeSegs();
      { const f = SP.focus(st.p), af = $("#vff .af", m); if (st.vf !== "sketch" && af) { af.style.left = f[0] + "%"; af.style.top = f[1] + "%"; } }
      m.addEventListener("click", (e) => {
        const o = e.target.closest(".opt");
        if (o) {
          const g = o.dataset.g; st.p[g] = o.dataset.v;
          $$(`.opt[data-g="${g}"]`, m).forEach((b) => b.setAttribute("aria-checked", b === o));
          const sel = SC.byId(g, st.p[g]); $(`[data-why="${g}"]`, m).textContent = `${sel.label} · ${sel.sub}`;
          all(g); return;
        }
        const en = e.target.closest("[data-engine]"); if (en) { st.engine = en.dataset.engine; engines(); goBar(); return; }
        const q = e.target.closest("[data-q]"); if (q) { st.quality = q.dataset.q; $$("[data-q]", m).forEach((b) => b.setAttribute("aria-pressed", b === q)); placeSegs(); goBar(); return; }
        const c = e.target.closest("[data-count]"); if (c) { st.count = +c.dataset.count; $$("[data-count]", m).forEach((b) => b.setAttribute("aria-checked", b === c)); goBar(); return; }
      });
      $$("[data-vf]", m).forEach((b) => b.addEventListener("click", () => { st.vf = b.dataset.vf; $$("[data-vf]", m).forEach((x) => x.setAttribute("aria-pressed", x === b)); placeSegs(); updateVF(); }));
      $("#gridBtn", m).addEventListener("click", (e) => { st.grid = !st.grid; e.currentTarget.setAttribute("aria-pressed", st.grid); $("#vff .thirds", m).style.opacity = st.grid ? 0.5 : 0; });
      $("#refBtn", m).addEventListener("click", (e) => {
        st.ref = !st.ref; const b = e.currentTarget; b.setAttribute("aria-pressed", st.ref);
        b.innerHTML = st.ref ? `<span class="ref-thumb" style="width:26px;height:26px;border-radius:8px"><img src="img/t/ref.webp" alt="" style="width:100%;height:100%;object-fit:cover"></span>Reference added` : `${icon("plus")}Reference photo`;
        if (st.ref) toast("Reference added. The engine will match its light and colour.", "image");
      });
      let pt = 0;
      $("#prompt", m).addEventListener("input", (e) => {
        st.prompt = e.target.value; clearTimeout(pt);
        pt = setTimeout(() => { const lb = labelFromPrompt(st.prompt); if (lb !== st.p.label) { st.p.label = lb; all(); } }, 260);
      });
    },
  };

  /* ── Image run: queued, drawing, saving, done or stopped ───────────── */
  VIEWS.image = {
    html() {
      const im = state.img, e = SC.ENGINES.find((x) => x.id === im.engine), vs = SP.variants(im.p), v = vs[im.pick] || vs[0];
      const done = im.status === "done", stopped = im.status === "stopped";
      const title = done ? "Your picture is ready." : stopped ? "Stopped before it finished." : `${e.name} is drawing your picture.`;
      const lede = done ? `Took ${im.took} s. Saved to My Files.` : stopped ? "Your prompt and every setting are saved. Try again or hand it to another engine." : "You can leave this screen. Sutaeru keeps drawing and saves it to Files.";
      const others = SC.ENGINES.filter((x) => x.id !== im.engine);
      return `<section class="view view-enter" id="view-image">
        <div class="studio-head">${stepsHTML(done ? 3 : 2)}<h1 class="title">${title}</h1><p class="lede" style="margin-top:10px">${lede}</p></div>
        <div class="run-grid">
          <div>
            <div class="run-stage"><div class="run-frame" id="rf"><div class="scene">${SP.comp(v.p, { size: "l", w: 560, name: v.name })}</div><canvas id="rc" aria-hidden="true"></canvas><span class="tag chip-on" id="rchip">${done ? `Done · took ${im.took} s` : stopped ? "Stopped" : `${e.name} · ${im.quality === "high" ? "High" : "Standard"}`}</span></div></div>
            ${done && im.count > 1 ? `<div class="variants" role="radiogroup" aria-label="Pictures" style="grid-template-columns:repeat(${im.count}, minmax(0, 120px))">${Array.from({ length: im.count }, (_, i) => `<button class="variant" role="radio" aria-checked="${im.pick === i}" data-pick="${i}" aria-label="Picture ${i + 1}">${SP.comp(vs[i].p, { size: "t", w: 120, name: vs[i].name })}</button>`).join("")}</div>` : ""}
          </div>
          <div class="stack">
            <div class="card status-card${stopped ? " stop-confirm" : ""}">
              <div class="between"><span class="mono${stopped ? "" : " ink"}" id="rstate" ${stopped ? 'style="color:var(--alert)"' : ""}>${done ? "Done" : stopped ? "Stopped" : "Estimating"}</span><span class="mono tnum" id="reta">${done ? `Took ${im.took} s` : stopped ? `At ${Math.round(im.p0 * 100)}%` : ""}</span></div>
              <div class="row" style="margin-top:12px;align-items:flex-end;justify-content:space-between"><span class="big-pct tnum" id="rpct">${done ? "100%" : stopped ? Math.round(im.p0 * 100) + "%" : "0%"}</span>${done ? SB.stamp({ cls: "stamp mini-stamp" }) : stopped ? "" : orb("run")}</div>
              <canvas class="bar thick" id="rbar" style="margin-top:16px"></canvas>
              <div class="phase-row"><span class="mono" data-ph="0">Queued</span><span class="mono" data-ph="1">Drawing</span><span class="mono" data-ph="2">Saving</span></div>
            </div>
            <div class="card" style="padding:18px 20px"><span class="mono">Prompt</span><p style="margin:8px 0 12px;font-size:16px;line-height:1.5">${esc(im.prompt)}</p><div class="row" style="flex-wrap:wrap;gap:6px">${GROUPS.map(([g]) => `<span class="tag quiet">${SC.byId(g, im.p[g]).label}</span>`).join("")}</div></div>
            ${done ? `<div class="act-grid"><button class="btn ink big" data-act="toast" data-msg="Downloaded ceramic-mug.png">${icon("download")}Download</button><button class="btn big" data-act="img-variations">${icon("refresh")}Variations</button><button class="btn big" data-act="toast" data-msg="Opening in Documents">${icon("edit")}Edit</button></div>`
              : stopped ? `<div class="row" style="flex-wrap:wrap"><button class="btn ink big" data-act="img-retry">${icon("refresh")}Try again</button><button class="btn big" data-go="studio">${icon("back")}Change settings</button></div>`
              : `<div class="row"><button class="btn alert" data-act="img-cancel">${icon("stop")}Cancel</button><button class="btn ghost" data-go="studio">Back to settings</button></div>`}
            ${done || stopped ? `<div><p class="mono" style="margin:8px 0 10px">${stopped ? "Or try with" : "Try another engine"}</p><div class="row" style="flex-wrap:wrap">${others.map((o) => `<button class="pill" data-act="img-engine" data-engine="${o.id}">${o.name} · ${o.cost} cr</button>`).join("")}</div></div>` : ""}
          </div>
        </div>
      </section>`;
    },
    mount(m) {
      const im = state.img, r = SC.byId("ratio", im.p.ratio).r;
      const rf = $("#rf", m), stage = $(".run-stage", m);
      const size = () => { const W = Math.min(stage.clientWidth - 44, 620), H = window.innerWidth >= 1100 ? 560 : 460; const w = Math.min(W, H * r); rf.style.width = w + "px"; rf.style.height = w / r + "px"; };
      const phases = (i) => $$("[data-ph]", m).forEach((s) => s.classList.toggle("cur", +s.dataset.ph === i));
      const bar = $("#rbar", m), rc = $("#rc", m);
      if (im.status === "done") { onRedraw(() => { size(); drawBar(bar, 1, { mode: "converge" }); }); phases(2); }
      else if (im.status === "stopped") { onRedraw(() => { size(); drawBar(bar, im.p0, { mode: "converge", live: false }); drawResolve(rc, im.p0, 0); }); }
      else {
        onRedraw(size);
        const dur = RM() ? 2600 : Math.max(9000, (im.secs || 15) * 1000), est = 900;
        loop((t) => {
          const el = performance.now() - im.t0;
          const p = clamp((el - est) / dur);
          im.p0 = p;
          drawBar(bar, p, { mode: "converge", t });
          drawResolve(rc, p, t);
          $("#rpct", m).textContent = Math.round(p * 100) + "%";
          $("#rstate", m).textContent = el < est ? "Estimating" : p < 0.92 ? "Drawing" : "Saving";
          $("#reta", m).textContent = el < est ? "" : eta(((1 - p) * dur) / 1000);
          phases(el < est ? 0 : p < 0.92 ? 1 : 2);
          if (p >= 1 && im.status === "running") {
            im.status = "done"; im.took = Math.max(1, Math.round(el / 1000)); im.pick = 0;
            FILES.unshift({ t: "image", name: im.prompt.replace(/\.$/, "").slice(0, 40), meta: `${SC.ENGINES.find((x) => x.id === im.engine).name} · ${im.p.ratio} · just now`, p: Object.assign({}, im.p), photo: SP.variants(im.p)[0].name, fresh: true });
            toast("Saved to My Files", "check");
            after(0, () => renderView());
          }
        });
      }
      m.addEventListener("click", (e) => { const v = e.target.closest("[data-pick]"); if (v) { im.pick = +v.dataset.pick; renderView(); } });
    },
  };
  function startImage(engine) {
    const st = state.studio;
    const eng = engine || engineOf(), base = { gemini: 13, openai: 16, wan: 18 }[eng];
    const secs = Math.round(base * (st.quality === "high" ? 1.6 : 1) + (st.count - 1) * 4);
    Object.assign(state.img, { status: "running", p: Object.assign({}, st.p), prompt: st.prompt, engine: eng, quality: st.quality, count: st.count, secs, t0: performance.now(), p0: 0, pick: 0 });
    go("image");
  }

  /* ── Agent session: working, stopped, done ─────────────────────────── */
  function sessionSteps() {
    const s = state.session, k = KINDS[s.type], D = DEPTH[s.depth];
    const scale = s.depth === "quick" ? 0.45 : s.depth === "deep" ? 2.6 : 1;
    const ws = k.steps.map((x) => x.m * (x.k === "search" || x.k === "read" ? scale : 1)), tot = ws.reduce((a, b) => a + b, 0);
    let acc = 0;
    return k.steps.map((x, i) => { const a = acc / tot; acc += ws[i]; return Object.assign({}, x, { a, b: acc / tot, src: D.src }); });
  }
  VIEWS.session = {
    html() {
      const s = state.session, k = KINDS[s.type];
      const stopped = s.status === "stopped", done = s.status === "done";
      return `<section class="view view-enter" id="view-session">
        <div class="sess-head">
          <div class="tx">
            <button class="btn ghost" data-go="home" style="margin-left:-16px">${icon("back")}Chats</button>
            <h1 class="title" style="margin-top:6px">${esc(k.title)}</h1>
            <div class="sess-meta" id="sessMeta"></div>
          </div>
          ${dialHTML("sessDial")}
        </div>
        <div id="stopArea"></div>
        <div class="sess-grid">
          <div class="panel prog"><div class="between"><span class="mono">Progress</span><span class="mono ink" id="stepOf"></span></div><div class="flow" id="flow"></div></div>
          <div class="stack">
            <div class="card draft" id="draft"></div>
            <div class="hero-card next-card"><canvas id="sphere" aria-hidden="true" class="art-deco"></canvas><span class="mono">${done ? "Sent" : "What happens next"}</span><b>${done ? "The file is on Telegram and in Files." : "Sutaeru finishes the file, then pings you on Telegram. You can close the app."}</b></div>
          </div>
        </div>
        ${done ? "" : `<p style="margin:14px 0 0"><button class="demo-link mono" data-act="skip">Demo · skip ahead</button></p>`}
        <div class="follow"><form id="sessMsg" autocomplete="off"><label class="sr" for="sm">Message Sutaeru</label><input id="sm" placeholder="Message Sutaeru while it works" enterkeyhint="send"><button class="icon-btn ink" aria-label="Send">${icon("up")}</button></form></div>
      </section>`;
    },
    mount(m) {
      const s = state.session, k = KINDS[s.type];
      const steps = sessionSteps();
      let lastSig = "";
      const render = (t) => {
        const p = s.p, stopped = s.status === "stopped", done = s.status === "done";
        const elapsed = (stopped ? s.stoppedAt : done ? (s.doneAt || Date.now()) : Date.now()) - s.t0;
        const left = (1 - p) * SESSION_SEC;
        $("#sessMeta", m).innerHTML = `${done ? `<span class="tag">Done</span>` : stopped ? `<span class="tag alert">Stopped</span>` : `<span class="tag"><span class="live-dot pulse"></span>Working</span>`}<span class="mono tnum">Elapsed ${mmss(elapsed / 1000)}</span>`;
        setDial($("#sessDial", m), p, done ? "Done" : stopped ? "Stopped" : etaShort(left));
        const ci = steps.findIndex((x) => p < x.b);
        const curI = done ? steps.length : ci === -1 ? steps.length : ci;
        $("#stepOf", m).textContent = done ? `${steps.length} of ${steps.length}` : `Step ${Math.min(curI + 1, steps.length)} of ${steps.length}`;
        // Flow: rebuild only when the structure changes, then update the live parts
        const sig = `${curI}|${s.status}`;
        if (sig !== lastSig) {
          lastSig = sig;
          $("#flow", m).innerHTML = steps.map((x, i) => {
            const st = i < curI ? "done" : i === curI ? (stopped ? "stop" : "cur") : "next";
            const side = st === "done" ? "Done" : st === "cur" ? "In progress" : st === "stop" ? "Stopped" : "Queued";
            let detail = "";
            if (st === "done" && x.done) detail = `<small>${esc(x.done.replace("SRC", x.src))}</small>`;
            if ((st === "cur" || st === "stop") && x.k === "search") detail = `<div class="detail"><div class="row">${stepped(10, 0, -1, 6, 2).replace('class="stepped"', 'class="stepped" id="srcBars"')}<span class="mono tnum" id="srcN">0 of ${x.src}</span></div></div>`;
            if ((st === "cur" || st === "stop") && x.k === "read") detail = `<div class="detail"><span class="file-chip is-on">${BRK(`tight${st === "stop" ? " alert" : ""}`)}${icon("report", { cls: "s" })}${esc(x.file)}</span><div class="pages" id="pages">${Array.from({ length: x.pages }, () => "<i></i>").join("")}</div><span class="mono tnum" id="pageN"></span></div>`;
            if ((st === "cur" || st === "stop") && (x.k === "write" || x.k === "plan")) detail = `<div class="detail"><canvas class="bar" id="stepBar"></canvas></div>`;
            const nd = st === "cur" ? orb("run") : st === "stop" ? `<span class="dot" style="background:var(--alert)"></span>` : `<span class="dot"></span>`;
            return `<div class="fl ${st === "stop" ? "cur" : st}"><span class="nd">${nd}</span><b>${esc(x.name)}</b><span class="mono side" ${st === "stop" ? 'style="color:var(--alert)"' : st === "cur" ? 'style="color:var(--ink)"' : ""}>${side}</span>${detail}</div>`;
          }).join("");
          $("#draft", m).innerHTML = `<span class="mono">${k.draft.eyebrow}</span><h3>${esc(k.draft.title)}</h3><p>${esc(k.draft.lede)}</p>${k.draft.rows.map(([a, b], i) => `<div class="sup" data-row="${i}"><b>${esc(a)}</b><span class="mono">${esc(b)}</span></div>`).join("")}${done ? `<button class="btn ink big" style="width:100%;margin-top:16px" data-go="done">Open the ${k.result.kind.toLowerCase()} ${icon("arrow")}</button>` : ""}`;
          $("#stopArea", m).innerHTML = done ? `<div class="card banner">${SB.stamp({ cls: "stamp mini-stamp" })}<div class="tx"><b>${k.result.kind} ready.</b><span class="mono">Telegram notified · saved to Files</span></div><button class="btn ink" data-go="done">Open ${icon("arrow")}</button></div>`
            : stopped ? `<div class="card banner stop-confirm"><div class="tx"><b>Stopped at ${Math.round(p * 100)}%.</b><span class="mono">What Sutaeru found so far is kept</span></div><button class="btn ink" data-act="resume">${icon("refresh")}Resume</button></div>`
            : s.confirm ? `<div class="card banner stop-confirm"><div class="tx"><b>Stop this session?</b><span class="mono">Sutaeru keeps what it found so far</span></div><button class="btn" data-act="keep">Keep working</button><button class="btn alert" data-act="stop">${icon("stop")}Stop</button></div>`
            : `<div class="row" style="margin-top:14px"><button class="btn" data-act="ask-stop">${icon("stop")}Stop</button><span class="mono">You can close the app. It keeps going.</span></div>`;
        }
        const x = steps[Math.min(curI, steps.length - 1)], sp = done ? 1 : clamp((p - x.a) / (x.b - x.a));
        const bars = $("#srcBars", m);
        if (bars) { const n = Math.floor(sp * 10); $$("i", bars).forEach((b, i) => { b.className = i < n ? "" : i === n && !stopped ? "live" : "off"; }); $("#srcN", m).textContent = `${Math.round(sp * x.src)} of ${x.src}`; }
        const pg = $("#pages", m);
        if (pg) { const n = Math.floor(sp * x.pages); $$("i", pg).forEach((b, i) => { b.className = i < n ? "on" : i === n && !stopped ? "live" : ""; }); $("#pageN", m).textContent = `Page ${Math.min(x.pages, n + 1)} of ${x.pages}`; }
        const sb = $("#stepBar", m); if (sb) drawBar(sb, sp, { t, live: !stopped });
        $$(".sup", m).forEach((row, i) => row.classList.toggle("pending", !done && p < 0.5 + i * 0.16));
      };
      loop(render);
      const sphere = $("#sphere", m);
      let lastFill = -1;
      onRedraw(() => { lastFill = -1; });
      loop(() => { const f = state.session.p; if (Math.abs(f - lastFill) > 0.01) { lastFill = f; drawDither(sphere, "sphere", { color: cv("hero-ink"), fill: f, seed: 9, k: 0.9 }); } });
      m.addEventListener("click", (e) => {
        const a = e.target.closest("[data-act]"); if (!a) return;
        const act = a.dataset.act;
        if (act === "ask-stop") { s.confirm = true; lastSig = ""; }
        if (act === "keep") { s.confirm = false; lastSig = ""; }
        if (act === "stop") { s.confirm = false; s.status = "stopped"; s.stoppedAt = Date.now(); lastSig = ""; updateTop(); toast("Stopped. What it found is kept.", "pause"); }
        if (act === "resume") { s.status = "running"; s.t0 += Date.now() - s.stoppedAt; lastSig = ""; updateTop(); }
        if (act === "skip") { s.p = Math.max(s.p, 0.94); }
      });
      $("#sessMsg", m).addEventListener("submit", (e) => { e.preventDefault(); const i = $("#sm", m); if (!i.value.trim()) return; i.value = ""; toast("Sutaeru got your note and will use it in this run", "send"); });
    },
  };

  VIEWS.done = {
    html() {
      const s = state.session, k = KINDS[s.type], r = k.result;
      return `<section class="view view-enter" id="view-done">
        <button class="btn ghost" data-go="session" style="margin-left:-16px">${icon("back")}${esc(k.title)}</button>
        <div class="hero-card result" style="margin-top:12px">
          <span class="done-stamp${state.stamped ? "" : " pressing"}">${SB.stamp()}</span>
          <canvas class="edge art-deco" id="edge" aria-hidden="true"></canvas>
          <span class="mono" style="position:relative">Result · ${r.kind}</span>
          <h1 class="title">${esc(r.title)}</h1>
          <p>${esc(r.summary)}</p>
          <div class="figs">${r.figs.map(([a, b]) => `<div><span class="mono">${a}</span><b class="tnum">${b}</b></div>`).join("")}</div>
          <span class="mono" style="position:relative">${r.meta}</span>
        </div>
        <div class="done-actions"><button class="btn ink big" data-act="toast" data-msg="Downloaded ${esc(r.title)}">${icon("download")}Download</button><button class="btn big" data-act="toast" data-msg="Opening in Documents">${icon("edit")}Documents</button><button class="btn big" data-act="toast" data-msg="Share link copied">${icon("share")}Share</button></div>
        <p class="sent-line">${icon("check", { cls: "s" })}Telegram notified · saved to Files</p>
        <div class="card cmp" style="margin-top:20px"><table><thead><tr>${r.head.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${r.rows.map((row, i) => `<tr class="${i === r.best ? "best" : ""}">${row.map((c, j) => `<td>${esc(c)}${j === 0 && i === r.best ? `<span class="tag bestmark">Pick</span>` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table></div>
        <div class="follow"><form data-act-form="toast" autocomplete="off" id="doneFollow"><label class="sr" for="df">Ask a follow up</label><input id="df" placeholder="Ask a follow up" enterkeyhint="send"><button class="icon-btn ink" aria-label="Send">${icon("up")}</button></form></div>
      </section>`;
    },
    mount(m) {
      state.stamped = true;
      onRedraw(() => drawDither($("#edge", m), "edge", { color: cv("hero-ink"), seed: 4, k: state.intensity / 100 }));
      $("#doneFollow", m).addEventListener("submit", (e) => { e.preventDefault(); const i = $("#df", m); if (!i.value.trim()) return; state.q = i.value.trim(); state.answerPlayed = false; go("answer"); });
    },
  };

  /* ── Files ─────────────────────────────────────────────────────────── */
  const FILTERS = [["all", "All"], ["report", "Reports"], ["deck", "Decks"], ["sheet", "Sheets"], ["image", "Images"], ["video", "Videos"]];
  VIEWS.files = {
    html() {
      return `<section class="view view-enter" id="view-files">
        <div class="files-head"><h1 class="title">Files</h1><button class="btn ink" data-act="toast" data-msg="Choose files to upload">${icon("plus")}Upload</button></div>
        <p class="lede" style="margin-top:8px">Everything Sutaeru made for you, and everything you gave it.</p>
        <div class="card storage"><div class="between"><span class="mono">Storage</span><span class="mono ink tnum">2.4 of 10 GB</span></div><div class="segs" aria-hidden="true">${Array.from({ length: 24 }, (_, i) => `<i class="${i < 6 ? "on" : ""}"></i>`).join("")}</div></div>
        <label class="search"><span class="sr">Search files</span>${icon("search")}<input id="fq" placeholder="Search files" value="${esc(state.files.q)}"></label>
        <div class="hscroll filters" role="group" aria-label="Filter">${FILTERS.map(([id, n]) => `<button class="pill" aria-pressed="${state.files.filter === id}" data-filter="${id}">${n}</button>`).join("")}</div>
        <div id="fileGrid"></div>
      </section>`;
    },
    mount(m) {
      const draw = () => {
        const f = state.files, q = f.q.trim().toLowerCase();
        const list = FILES.filter((x) => (f.filter === "all" || x.t === f.filter) && (!q || x.name.toLowerCase().includes(q)));
        const g = $("#fileGrid", m);
        if (!list.length) {
          const video = f.filter === "video" && !q;
          g.innerHTML = `<div class="panel empty">${BRK("show")}<canvas id="emptySphere" aria-hidden="true"></canvas><b>${video ? "Nothing here yet." : "No files match."}</b><p>${video ? "Videos Sutaeru makes will land here." : `Nothing called “${esc(f.q)}” in ${FILTERS.find((x) => x[0] === f.filter)?.[1] || "All"}. Try fewer words or another filter.`}</p>${video ? `<button class="btn ink big" data-go="agent">Ask Sutaeru to make one</button>` : `<button class="btn" data-act="clear-files">Clear search</button>`}</div>`;
          onRedraw(() => drawDither($("#emptySphere", m), "sphere", { seed: 2, fill: 0.62, k: 0.9 }));
          return;
        }
        g.innerHTML = `<div class="file-grid">${list.map((x) => `<button class="file" data-file="${FILES.indexOf(x)}">${x.fresh ? BRK("show") : ""}<span class="fp">${filePreview(x)}</span><span class="fm"><span class="mono">${x.live ? '<span class="live-dot pulse" style="margin-right:6px"></span>Writing' : x.t}</span><b>${esc(x.name)}</b><small>${esc(x.meta)}</small>${x.live ? '<span class="bar-holder"><canvas class="bar" id="liveFile"></canvas></span><span class="mono tnum" id="liveEta">About 40 sec left</span>' : ""}</span></button>`).join("")}</div>`;
        const lf = $("#liveFile", m);
        if (lf) { const t0 = performance.now(); loop((t) => { const p = 0.55 + 0.4 * (((t - t0) / 40000) % 1); drawBar(lf, p, { t }); const le = $("#liveEta", m); if (le) le.textContent = eta((1 - p) * 90); }); }
      };
      draw();
      $("#fq", m).addEventListener("input", (e) => { state.files.q = e.target.value; leaveLoopsAndDraw(); });
      m.addEventListener("click", (e) => {
        const fb = e.target.closest("[data-filter]");
        if (fb) { state.files.filter = fb.dataset.filter; $$("[data-filter]", m).forEach((b) => b.setAttribute("aria-pressed", b === fb)); leaveLoopsAndDraw(); }
        if (e.target.closest('[data-act="clear-files"]')) { state.files.q = ""; state.files.filter = "all"; renderView(); }
      });
      function leaveLoopsAndDraw() { leave(); draw(); }
    },
  };

  /* ── Settings ──────────────────────────────────────────────────────── */
  const VOICE = {
    concise: { formal: "Payback is 4 to 6 years. Larger systems recover faster.", neutral: "Most systems pay back in 4 to 6 years. Bigger ones are quicker.", casual: "Think 4 to 6 years. Go bigger and it pays back sooner." },
    balanced: { formal: "Most commercial rooftop systems pay back in 4 to 6 years. Larger systems recover faster because cost per watt falls with scale.", neutral: "Most rooftop systems pay back in 4 to 6 years. Bigger systems get there faster since each watt costs less to install.", casual: "You are looking at roughly 4 to 6 years. Bigger systems win here, because each watt gets cheaper to put up." },
    detailed: { formal: "Most commercial rooftop systems in Indonesia pay back in 4 to 6 years, depending on size and PLN tariff class. A 1 MWp system reaches payback in about 4.2 years, against 5.9 years for 100 kWp, because installation cost per watt falls with scale. Export caps under net metering set the upper end of the range.", neutral: "Most rooftop systems in Indonesia pay back in 4 to 6 years. A 1 MWp system takes about 4.2 years and a 100 kWp one about 5.9, since installing each watt gets cheaper at scale. Net metering export caps decide the slow end.", casual: "Roughly 4 to 6 years. A big 1 MWp setup gets there in about 4.2 years, a small 100 kWp one closer to 6, because each watt gets cheaper the more you install. The export cap is what drags the slow cases out." },
  };
  function themePreview(kind) {
    const L = { bg: "#F7F6F2", card: "#FFFFFF", ink: "#242320", seg: "#DAD7CF" }, D = { bg: "#1C1B19", card: "#252421", ink: "#F4F2EC", seg: "#403F3A" };
    const pane = (c, x, w) => `<rect x="${x}" y="0" width="${w}" height="92" fill="${c.bg}"/><rect x="${x + 12}" y="14" width="${Math.min(70, w - 24)}" height="8" rx="4" fill="${c.ink}"/><rect x="${x + 12}" y="30" width="${w - 24}" height="34" rx="8" fill="${c.card}"/><rect x="${x + 20}" y="40" width="${Math.min(50, w - 40)}" height="4" rx="2" fill="${c.seg}"/><circle cx="${x + w - 24}" cy="76" r="8" fill="${c.ink}"/><circle cx="${x + 18}" cy="76" r="3" fill="#F4511E"/>`;
    if (kind === "system") return `<svg viewBox="0 0 160 92" preserveAspectRatio="xMidYMid slice"><defs><clipPath id="tpL"><path d="M0 0H100L60 92H0Z"/></clipPath><clipPath id="tpD"><path d="M100 0H160V92H60Z"/></clipPath></defs><g clip-path="url(#tpL)">${pane(L, 0, 160)}</g><g clip-path="url(#tpD)">${pane(D, 0, 160)}</g></svg>`;
    return `<svg viewBox="0 0 160 92" preserveAspectRatio="xMidYMid slice">${pane(kind === "dark" ? D : L, 0, 160)}</svg>`;
  }
  VIEWS.settings = {
    html() {
      const v = state.voice;
      const sw = (id, on, label) => `<button class="toggle" role="switch" aria-checked="${on}" aria-label="${label}" id="${id}"></button>`;
      return `<section class="view view-enter" id="view-settings">
        <h1 class="title" style="font-size:clamp(40px,7vw,56px)">Settings</h1>
        <p class="lede" style="margin-top:8px">Make Sutaeru feel like yours. Changes apply as you make them.</p>
        <div class="set-grid">
          <div class="card set-card">
            <span class="mono">Theme</span>
            <div class="themes" role="radiogroup" aria-label="Theme">${[["light", "Light"], ["dark", "Dark"], ["system", "System"]].map(([id, n]) => `<button class="theme-opt" role="radio" aria-checked="${state.theme === id}" data-theme-opt="${id}"><span class="tp">${themePreview(id)}</span><span>${n}</span></button>`).join("")}</div>
            <div style="margin-top:18px">
              <div class="toggle-row"><div class="tx"><b>Background art</b><small>Registration marks, halftones and dither edges</small></div>${sw("artT", state.art, "Background art")}</div>
              <div class="toggle-row"><div class="tx"><b>Reduce motion</b><small>Bars and dials jump to their state instead of moving</small></div>${sw("rmT", state.reduce, "Reduce motion")}</div>
            </div>
            <div class="slider"><div class="between"><span class="mono ink">Art intensity</span><span class="mono tnum" id="intVal">${state.intensity}%</span></div><input type="range" id="intR" min="20" max="100" value="${state.intensity}" style="--p:${((state.intensity - 20) / 80) * 100}%" aria-label="Art intensity"></div>
            <div class="intensity-demo"><canvas id="intDemo" aria-hidden="true"></canvas></div>
          </div>
          <div class="card set-card">
            <span class="mono">How Sutaeru talks</span>
            <div class="slider"><div class="between"><span class="mono">Concise</span><span class="mono">Detailed</span></div><input type="range" id="vDetail" min="0" max="100" value="${v.detail}" style="--p:${v.detail}%" aria-label="Concise to detailed"></div>
            <div class="slider"><div class="between"><span class="mono">Formal</span><span class="mono">Casual</span></div><input type="range" id="vTone" min="0" max="100" value="${v.tone}" style="--p:${v.tone}%" aria-label="Formal to casual"></div>
            <div class="voice-sample">${BRK("show tight")}<span class="mono">Preview · rooftop solar payback</span><p id="vSample"></p></div>
          </div>
          <div class="card set-card">
            <span class="mono">Notifications</span>
            <div style="margin-top:8px">
              <div class="toggle-row"><div class="tx"><b>Telegram</b><small>@remyzard · when a task finishes</small></div>${sw("tgT", true, "Telegram")}</div>
              <div class="toggle-row"><div class="tx"><b>Monitor alerts</b><small>Only when something changes</small></div>${sw("monT", true, "Monitor alerts")}</div>
              <div class="toggle-row"><div class="tx"><b>Weekly digest</b><small>Monday 08:00, by email</small></div>${sw("digT", false, "Weekly digest")}</div>
            </div>
          </div>
          <div class="card set-card">
            <div class="between"><span class="mono">Plan</span><span class="tag">Free</span></div>
            <p style="font:800 34px/1 var(--disp);letter-spacing:-.03em;margin:14px 0 4px" class="tnum">38 <span style="color:var(--quiet);font-size:22px">of 50 credits</span></p>
            <div class="storage" style="padding:0;margin:12px 0 0"><div class="segs" aria-hidden="true">${Array.from({ length: 25 }, (_, i) => `<i class="${i < 19 ? "on" : ""}"></i>`).join("")}</div></div>
            <p class="lede" style="font-size:14px;margin-top:12px">Credits refill on the 1st. A standard report uses 4, a picture uses 2.</p>
            <button class="btn" style="margin-top:14px" data-act="toast" data-msg="Plans open in the full app">See plans ${icon("arrow")}</button>
          </div>
        </div>
      </section>`;
    },
    mount(m) {
      const sample = () => {
        const v = state.voice, len = v.detail < 34 ? "concise" : v.detail > 66 ? "detailed" : "balanced", tone = v.tone < 34 ? "formal" : v.tone > 66 ? "casual" : "neutral";
        const el = $("#vSample", m), txt = VOICE[len][tone];
        if (el.textContent !== txt) { el.style.opacity = "0"; setTimeout(() => { el.textContent = txt; el.style.opacity = "1"; }, RM() ? 0 : 140); }
      };
      sample();
      const demo = () => drawDither($("#intDemo", m), "ramp", { seed: 6, k: state.intensity / 100, cell: 2.4 });
      onRedraw(demo);
      m.addEventListener("click", (e) => {
        const t = e.target.closest("[data-theme-opt]");
        if (t) { state.theme = t.dataset.themeOpt; store.set("theme", state.theme); applyPrefs(); $$("[data-theme-opt]", m).forEach((b) => b.setAttribute("aria-checked", b === t)); redraws.forEach((f) => f()); }
      });
      const bindT = (id, fn) => $(id, m).addEventListener("click", (e) => { const on = e.currentTarget.getAttribute("aria-checked") !== "true"; e.currentTarget.setAttribute("aria-checked", on); fn(on); });
      bindT("#artT", (on) => { state.art = on; store.set("art", on); applyPrefs(); });
      bindT("#rmT", (on) => { state.reduce = on; store.set("reduce", on); applyPrefs(); });
      bindT("#tgT", () => {}); bindT("#monT", () => {}); bindT("#digT", () => {});
      const range = (id, fn) => $(id, m).addEventListener("input", (e) => { const el = e.currentTarget; const pct = ((el.value - el.min) / (el.max - el.min)) * 100; el.style.setProperty("--p", pct + "%"); fn(+el.value); });
      range("#intR", (v) => { state.intensity = v; store.set("intensity", v); $("#intVal", m).textContent = v + "%"; demo(); });
      range("#vDetail", (v) => { state.voice.detail = v; store.set("voice", state.voice); sample(); });
      range("#vTone", (v) => { state.voice.tone = v; store.set("voice", state.voice); sample(); });
    },
  };

  /* ── Global actions ────────────────────────────────────────────────── */
  document.addEventListener("click", (e) => {
    const g = e.target.closest("[data-go]");
    if (g && !g.closest(".popover")) { e.preventDefault(); go(g.dataset.go); return; }
    const a = e.target.closest("[data-act]");
    if (!a) return;
    const act = a.dataset.act;
    if (act === "nav-close") closeNav();
    if (act === "new-chat") { state.chat.atts = []; go("home"); }
    if (act === "toast") toast(a.dataset.msg || "Done");
    if (act === "soon") toast(`${a.dataset.name} is in the full app. This prototype covers chat, agent, images, files and settings.`, "lock");
    if (act === "open-answer") { state.q = SAMPLE_Q; go("answer"); }
    if (act === "open-file") openFile(+a.dataset.i);
    if (act === "copy-answer") { const txt = ANSWER.filter((x) => typeof x === "string").join(" "); const ok = () => toast("Answer copied"); try { navigator.clipboard.writeText(txt).then(ok, () => toast("Select the text to copy it", "copy")); } catch (err) { toast("Select the text to copy it", "copy"); } }
    if (act === "hand-to-agent") { const kind = state.turnTo; state.agent.out = kind; state.agent.brief = `Turn the rooftop solar payback answer into a ${kind === "deck" ? "short deck" : kind === "sheet" ? "payback sheet by system size" : "cited report"}. Keep the four system sizes and the tariff notes.`; go("agent"); }
    if (act === "agent-start") startAgent();
    if (act === "studio-begin") startImage();
    if (act === "img-cancel") { state.img.status = "stopped"; renderView(); toast("Stopped. Your settings are saved.", "pause"); }
    if (act === "img-retry") startImage(state.img.engine);
    if (act === "img-engine") startImage(a.dataset.engine);
    if (act === "img-variations") { state.studio.count = 4; startImage(state.img.engine); }
  });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-file]")) openFile(+e.target.closest("[data-file]").dataset.file); });
  function openFile(i) {
    const f = FILES[i]; if (!f) return;
    if (f.t === "image") { Object.assign(state.studio.p, SC.DEFAULT, f.p || {}); state.studio.engine = null; go("studio"); return; }
    if (f.go === "done") { state.session.type = "report"; if (state.session.status !== "done") { state.session.p = 1; state.session.status = "done"; state.session.doneAt = Date.now(); } go("done"); return; }
    if (f.live) { toast("Weekly market brief is still being written", "report"); return; }
    toast(`${f.name} opens in Documents in the full app`, "report");
  }
  function startAgent() {
    const a = state.agent;
    if (a.out === "image") { if (a.brief.trim()) state.studio.prompt = a.brief.trim(); go("studio"); return; }
    Object.assign(state.session, { type: a.out, depth: a.depth, p: 0, status: "running", t0: Date.now(), confirm: false, boost: 1 });
    toast(a.notify ? "Started. You will get a Telegram message when it is done." : "Started. You can close the app.", "agent");
    go("session");
  }

  /* ── Prefs, theme, boot ────────────────────────────────────────────── */
  function applyPrefs() {
    const r = document.documentElement;
    if (state.theme === "system") r.removeAttribute("data-theme"); else r.setAttribute("data-theme", state.theme);
    r.setAttribute("data-reduce-motion", String(state.reduce));
    r.setAttribute("data-art", state.art ? "on" : "off");
    const meta = $('meta[name="theme-color"]'); if (meta) meta.setAttribute("content", cv("paper") || "#F7F6F2");
  }
  if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => { applyPrefs(); redraws.forEach((f) => f()); });

  function boot() {
    applyPrefs();
    $("#logoBtn").innerHTML = `${GLYPH()}${icon("chev", { cls: "chev" })}<span class="sr">Open menu</span>`;
    $("#avatarBtn").addEventListener("click", () => go("settings"));
    $("#logoBtn").addEventListener("click", () => (state.navOpen ? closeNav() : openNav()));
    $("#scrim").addEventListener("click", () => closeNav());
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (state.navOpen) closeNav(); const pop = $(".popover"); if (pop) pop.remove(); } });
    $("#nav").setAttribute("inert", ""); $("#nav").setAttribute("aria-hidden", "true");
    let hyd = 0;
    new MutationObserver(() => { if (!hyd) hyd = requestAnimationFrame(() => { hyd = 0; SP.hydrate(document); }); }).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("hashchange", route);
    route();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { placeSegs(); redraws.forEach((f) => f()); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();

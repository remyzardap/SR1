/* Sutaeru document previews.
   Finished files are shown as real miniature documents (real type, real figures, cover photography)
   instead of icons. Each preview is composed on a 560 x 340 stage and scaled to fit its box. */
(function () {
  "use strict";
  const W = 560, H = 340;
  const C = (n) => `img/c/${n}.webp`;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  const DEFAULTS = {
    report: { title: "PV module supplier comparison", kicker: "Research report", cover: "cov-solar", figs: [["Suppliers", "3"], ["Best / Wp", "0.11"], ["Fastest", "4 wk"]], bars: [0.62, 0.7, 0.55, 0.86], meta: "Oct 2026 · 12 pages" },
    deck: { title: "Q3 investor update", kicker: "TGWI · October 2026", cover: "cov-jakarta-bw", meta: "01 / 10" },
    sheet: { title: "Villa BOQ and budget", kicker: "Site · Seminyak", cover: "cov-villa" },
    brief: { title: "Off grid solar for remote villages", kicker: "Board brief", cover: "cov-village" },
    monitor: { title: "PLN tariff watch", kicker: "Every 6 hours", cover: "cov-pylons" },
  };

  function report(d) {
    const rows = [["Jinko Tiger Neo", "0.11", "6 wk", "30 y"], ["LONGi Hi-MO 6", "0.12", "4 wk", "25 y"], ["Trina Vertex", "0.11", "8 wk", "30 y"], ["JA Solar DeepBlue", "0.12", "7 wk", "25 y"], ["Canadian TOPHiKu", "0.13", "5 wk", "25 y"]];
    return `<div class="dp page back" style="left:292px;top:30px;width:190px;height:268px;transform:rotate(6deg)">
        <div class="dp-k">2 · Shortlist</div><div class="dp-h3">Price, lead time and warranty</div>
        <div class="dp-table">${["Supplier", "USD/Wp", "Lead", "Warr."].map((h) => `<b>${h}</b>`).join("")}${rows.map((r) => r.map((c) => `<span>${c}</span>`).join("")).join("")}</div>
        <div class="dp-lines"><i style="width:92%"></i><i style="width:84%"></i><i style="width:88%"></i><i style="width:60%"></i></div>
        <div class="dp-foot"><span>Sutaeru</span><span>2</span></div>
      </div>
      <div class="dp page front" style="left:132px;top:20px;width:200px;height:282px;transform:rotate(-3.5deg)">
        <div class="dp-photo" style="height:118px;background-image:url(${C(d.cover)})"></div>
        <div class="dp-pad">
          <div class="dp-k">${esc(d.kicker)}</div>
          <div class="dp-title">${esc(d.title)}</div>
          <div class="dp-figs">${d.figs.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("")}</div>
          <div class="dp-bars">${d.bars.map((b, i) => `<i style="height:${Math.round(b * 26)}px" class="${i === d.bars.length - 1 ? "hl" : ""}"></i>`).join("")}</div>
          <div class="dp-foot"><span>${esc(d.meta)}</span><span>1</span></div>
        </div>
      </div>`;
  }

  function deck(d) {
    return `<div class="dp slide s3" style="left:186px;top:22px;width:300px;height:169px"><div class="dp-k">03</div><div class="dp-h3">Three risks, three owners</div><div class="dp-lines"><i style="width:70%"></i><i style="width:58%"></i></div></div>
      <div class="dp slide s2" style="left:158px;top:46px;width:310px;height:174px"><div class="dp-k">02 · Revenue</div><div class="dp-bigfig">+12%</div><div class="dp-bars wide">${[0.44, 0.52, 0.61, 0.58, 0.72, 0.86].map((b, i) => `<i style="height:${Math.round(b * 44)}px" class="${i === 5 ? "hl" : ""}"></i>`).join("")}</div></div>
      <div class="dp slide front cover" style="left:108px;top:96px;width:344px;height:194px;background-image:linear-gradient(180deg,rgba(14,13,12,.05),rgba(14,13,12,.78)),url(${C(d.cover)})">
        <div class="dp-k light">${esc(d.kicker)}</div>
        <div class="dp-title light">${esc(d.title)}</div>
        <div class="dp-slide-foot"><span>Revenue +12% · Margin 21%</span><span>${esc(d.meta)}</span></div>
      </div>`;
  }

  function sheet(d) {
    const rows = [["1", "Foundations", "84", "m³", "1.92m", "161.3m"], ["2", "Columns and beams", "46", "m³", "2.40m", "110.4m"], ["3", "Brick walls", "612", "m²", "185k", "113.2m"], ["4", "Roof structure", "238", "m²", "640k", "152.3m"], ["5", "Floor tiles", "420", "m²", "310k", "130.2m"], ["6", "Plumbing", "1", "ls", "186m", "186.0m"], ["7", "Electrical", "1", "ls", "214m", "214.0m"]];
    return `<div class="dp window" style="left:56px;top:34px;width:430px;height:262px">
        <div class="dp-bar"><i></i><i></i><i></i><span>${esc(d.title)}.xlsx</span></div>
        <div class="dp-fx"><b>F9</b><span>=SUM(F2:F8)</span></div>
        <div class="dp-grid">
          <div class="hdr"><span></span>${["A", "B", "C", "D", "E", "F"].map((c) => `<span>${c}</span>`).join("")}</div>
          <div class="row th"><span>1</span><span>No</span><span>Item</span><span>Qty</span><span>Unit</span><span>Rate</span><span>Amount</span></div>
          ${rows.map((r, i) => `<div class="row"><span>${i + 2}</span>${r.map((c, j) => `<span class="${j >= 4 ? "num" : j === 2 ? "num" : ""}">${c}</span>`).join("")}</div>`).join("")}
          <div class="row total"><span>9</span><span></span><span>Total</span><span></span><span></span><span></span><span class="num sel">1,067.4m</span></div>
        </div>
        <div class="dp-tabs"><span class="on">Structure</span><span>Finishes</span><span>MEP</span><span>Summary</span></div>
      </div>
      <div class="dp polaroid" style="left:392px;top:186px;width:128px;height:112px;transform:rotate(5deg)"><div class="dp-photo" style="height:82px;background-image:url(${C(d.cover)})"></div><span>${esc(d.kicker)}</span></div>`;
  }

  function brief(d) {
    return `<div class="dp page back" style="left:268px;top:34px;width:180px;height:256px;transform:rotate(5deg)"><div class="dp-k">Appendix</div><div class="dp-lines"><i style="width:90%"></i><i style="width:82%"></i><i style="width:86%"></i><i style="width:74%"></i><i style="width:88%"></i><i style="width:52%"></i></div></div>
      <div class="dp page front" style="left:150px;top:18px;width:206px;height:290px;transform:rotate(-2deg)">
        <div class="dp-photo" style="height:74px;background-image:url(${C(d.cover)})"></div>
        <div class="dp-pad">
          <div class="dp-k">${esc(d.kicker)} · One page</div>
          <div class="dp-title sm">${esc(d.title)}</div>
          <p class="dp-p">A 120 kWp array with storage delivers power at USD 0.28 to 0.45 per kWh. The case rests on capital grants rather than tariff revenue.</p>
          <div class="dp-dec"><div><span>Decision 1</span><b>Approve a pilot in one village</b></div><div><span>Decision 2</span><b>Apply for the capital grant</b></div></div>
          <div class="dp-sign"><span>Prepared by Sutaeru</span>${window.SutaeruBrand ? window.SutaeruBrand.seal({ cls: "seal dp-seal", rough: false }) : ""}</div>
        </div>
      </div>`;
  }

  function monitor(d) {
    const pts = [62, 60, 61, 58, 59, 52, 54, 50, 51, 44, 46, 40];
    const path = pts.map((y, i) => `${i ? "L" : "M"}${(18 + i * 31.5).toFixed(1)} ${y}`).join(" ");
    return `<div class="dp card-m" style="left:80px;top:36px;width:400px;height:266px">
        <div class="dp-photo band" style="height:92px;background-image:linear-gradient(90deg,rgba(14,13,12,.72),rgba(14,13,12,.1)),url(${C(d.cover)})"><div class="dp-k light">${esc(d.kicker)}</div><div class="dp-title light sm">${esc(d.title)}</div></div>
        <div class="dp-pad row2">
          <div><span class="dp-k">I-3 industry · IDR / kWh</span><b class="dp-bigfig sm">1,114.74</b></div>
          <div class="dp-live"><i></i>Watching</div>
        </div>
        <svg class="dp-chart" viewBox="0 0 380 80" preserveAspectRatio="none"><path d="${path} L364.5 80 L18 80Z" class="area"/><path d="${path}" class="line"/>${[0, 1, 2, 3].map((i) => `<line x1="0" x2="380" y1="${20 + i * 18}" y2="${20 + i * 18}" class="grid"/>`).join("")}<circle cx="364.5" cy="40" r="4" class="end"/></svg>
        <div class="dp-foot pad"><span>Jul</span><span>Aug</span><span>Sep</span><span>Oct</span></div>
      </div>`;
  }

  const MAKERS = { report, deck, sheet, brief, monitor };

  function html(kind, data) {
    const make = MAKERS[kind];
    if (!make) return "";
    const d = Object.assign({}, DEFAULTS[kind], data || {});
    return `<div class="docbox" aria-hidden="true"><div class="doc-stage doc-${kind}" style="width:${W}px;height:${H}px">${make(d)}</div></div>`;
  }

  /* Scale every stage to fill its box; keeps working as boxes resize. */
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver((es) => es.forEach((e) => place(e.target))) : null;
  function place(box) {
    const st = box.firstElementChild; if (!st) return;
    const w = box.clientWidth, h = box.clientHeight; if (!w || !h) return;
    const k = Math.min(w / W, h / H) * (box.dataset.fill ? +box.dataset.fill : h < 200 ? 1.3 : 1.04);
    st.style.transform = `translate(-50%, -50%) scale(${k.toFixed(4)})`;
  }
  function fit(root) {
    (root || document).querySelectorAll(".docbox").forEach((box) => {
      place(box);
      if (ro && !box._ro) { box._ro = true; ro.observe(box); }
    });
  }

  window.SutaeruDocs = { html, fit, DEFAULTS };
})();

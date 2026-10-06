/* Sutaeru as an installed phone app.
   - registers the service worker (offline app shell)
   - install: Android's real prompt, or a short Add to Home Screen guide in iPhone Safari
   - online and offline state
   - keeps docked composers above the on-screen keyboard (visualViewport)
   - swipe from the left edge to go back in an installed iPhone app (no browser back button there)
   Everything is feature-detected, so inside an iframe or a desktop browser it simply stays quiet. */
(function () {
  "use strict";
  const A = () => window.SutaeruApp;
  const root = document.documentElement;
  const standalone = () => (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  const topLevel = (() => { try { return window.top === window; } catch (e) { return false; } })();
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|GSA|Instagram|FBAN|FBAV|Line\//.test(ua);
  const store = { get(k) { try { return localStorage.getItem("sutaeru." + k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem("sutaeru." + k, v); } catch (e) { /* blocked */ } } };

  root.classList.toggle("standalone", standalone());

  /* Install */
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferred = e;
    const app = A(); if (app && app.cur() === "home") app.renderView();
  });
  window.addEventListener("appinstalled", () => { deferred = null; const app = A(); if (app) { app.toast("Sutaeru is on your home screen"); if (app.cur() === "home") app.renderView(); } });
  function state() {
    if (!topLevel || standalone() || store.get("installDismissed") === "1") return null;
    if (deferred) return "prompt";
    if (isIOS && isSafari) return "ios";
    return null;
  }
  async function install() {
    if (!deferred) return null;
    deferred.prompt();
    const choice = await deferred.userChoice.catch(() => null);
    deferred = null;
    return choice;
  }
  const dismiss = () => store.set("installDismissed", "1");

  /* Offline app shell */
  if ("serviceWorker" in navigator && topLevel && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => { /* not available here */ }); });
  }

  /* Online and offline */
  const sync = () => { const app = A(); if (app) app.setOffline(navigator.onLine === false); };
  window.addEventListener("online", sync);
  window.addEventListener("offline", sync);

  /* On-screen keyboard: lift docked composers by the keyboard's height */
  const vv = window.visualViewport;
  if (vv) {
    const upd = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const open = kb > 80;
      root.style.setProperty("--kb", (open ? Math.round(kb) : 0) + "px");
      root.classList.toggle("kb-open", open);
    };
    vv.addEventListener("resize", upd); vv.addEventListener("scroll", upd);
  }

  /* Edge swipe back, only where the OS gives no back gesture of its own (installed iPhone app) */
  if (isIOS && standalone()) {
    const pill = document.createElement("div");
    pill.className = "edge-back"; pill.setAttribute("aria-hidden", "true");
    pill.innerHTML = '<svg viewBox="0 0 96 96"><path d="M58 26 36 48l22 22" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    document.body.appendChild(pill);
    let x0 = null, y0 = 0, dx = 0;
    document.addEventListener("touchstart", (e) => { const t = e.touches[0]; if (t.clientX < 22 && !document.body.classList.contains("nav-open")) { x0 = t.clientX; y0 = t.clientY; dx = 0; } }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (x0 == null) return;
      const t = e.touches[0]; dx = t.clientX - x0;
      if (Math.abs(t.clientY - y0) > 60 && dx < 30) { x0 = null; pill.style.opacity = 0; return; }
      const k = Math.min(1, dx / 90);
      pill.style.opacity = k; pill.style.transform = `translate(${Math.min(dx, 90) - 44}px, ${t.clientY - 22}px) scale(${0.7 + k * 0.3})`;
      pill.classList.toggle("armed", dx > 80);
    }, { passive: true });
    document.addEventListener("touchend", () => {
      if (x0 == null) return;
      x0 = null; pill.style.opacity = 0;
      if (dx > 80) { const app = A(); if (history.length > 1) history.back(); else if (app) app.go("home"); }
    });
  }

  window.SutaeruPWA = { state, install, dismiss, standalone };
})();

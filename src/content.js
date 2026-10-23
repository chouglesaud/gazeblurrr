// content.js — runs in every frame at document_start.
//
// Plain script, not a module: MV3 content scripts can't use import. Everything
// it needs arrives from the background over messages. On a website the user
// has not switched on, it asks once, hears "not active", and does nothing.
//
// Two rules shape everything below:
//  1. Cover first, ask later. A picture is blurred the moment it is seen and
//     only uncovered once the detector says it is fine. No flash of the original.
//  2. Fail closed. If something we decided to watch cannot be checked, it stays
//     covered. The person can always uncover it, or say it was a mistake.

(() => {
  if (window.__fbInstalled) return;
  window.__fbInstalled = true;

  const ATTR = "data-fb";
  const MIN_SIZE = 64; // CSS px; anything smaller is an icon or avatar
  const SNAPSHOT_MAX = 640;
  const VIDEO_INTERVAL = 1500;
  const MAX_RETRIES = 6;
  const LAZY_ATTRS = ["data-src", "data-original", "data-lazy-src", "data-lazy", "data-url"];
  const WATCHED_ATTRS = ["src", "srcset", "poster", "style", "class", ...LAZY_ATTRS];

  let cfg = null; // { allowReveal, revealSeconds }
  let paused = true;
  let blurred = 0;
  let safe = new Set();
  let blocked = new Set(); // things the person blurred by hand

  /** element -> { key, kind, status, attempts, revealed, revealEnd, timer, visible, counted } */
  let records = new WeakMap();
  let noBg = new WeakSet(); // elements already checked and found to have no background picture
  const covered = new Set(); // elements currently blurred or temporarily revealed
  let observedRoots = new WeakSet();
  const pendingShadows = [];
  const bgQueue = new Set();
  let bgTimer = 0;

  // ------------------------------------------------------------- bootstrap

  send({ op: "config" }).then((res) => applyConfig(res, true));

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.op === "settings-changed") send({ op: "config" }).then((res) => applyConfig(res, false));
  });

  // Fired by page-hook.js whenever a page attaches a shadow root.
  document.addEventListener(
    "fb-shadow",
    (ev) => {
      if (!cfg) pendingShadows.push(ev.target);
      else if (!paused) takeShadow(ev.target);
    },
    true
  );

  function applyConfig(res, first) {
    if (!res?.ok) return;
    const wasPaused = paused;
    cfg = { allowReveal: res.allowReveal, revealSeconds: res.revealSeconds };
    safe = new Set(res.safe);
    blocked = new Set(res.blocked ?? []);
    paused = !res.active;

    if (!first) teardown();
    if (paused) return;
    if (wasPaused || !first) start();
  }

  /** Forget everything and uncover the page. Used when settings change. */
  function teardown() {
    io.disconnect();
    mo.disconnect();
    clearTimeout(bgTimer);
    bgQueue.clear();
    for (const el of covered) {
      const rec = records.get(el);
      if (rec) clearTimeout(rec.timer);
    }
    records = new WeakMap();
    noBg = new WeakSet();
    observedRoots = new WeakSet();
    covered.clear();
    removeMarks(document);
    hidePill();
    blurred = 0;
    report();
  }

  function removeMarks(root) {
    if (!root?.querySelectorAll) return;
    for (const el of root.querySelectorAll(`[${ATTR}], .fb-bg-cover`)) {
      if (el.classList.contains("fb-bg-cover")) el.remove();
      else el.removeAttribute(ATTR);
    }
    for (const el of root.querySelectorAll("*")) {
      const sr = shadowOf(el);
      if (sr) removeMarks(sr);
    }
  }

  function start() {
    observeRoot(document);
    for (const host of pendingShadows) takeShadow(host);
    pendingShadows.length = 0;
    sweep(document);

    document.addEventListener("click", onClick, true);
    document.addEventListener("mousemove", onMove, { capture: true, passive: true });
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("visibilitychange", onVisibility);
    addEventListener("scroll", onScroll, { passive: true, capture: true });
    addEventListener("load", () => sweep(document), { once: true });

    send({ op: "warmup" });
  }

  // ------------------------------------------------------------- observers

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const rec = records.get(e.target);
        if (!rec) continue;
        rec.visible = e.isIntersecting;
        if (!e.isIntersecting) continue;
        if (rec.status === "new" || rec.status === "pending") classify(e.target);
        else if (isVideo(e.target) && rec.status !== "safe") scheduleVideoRecheck(e.target);
      }
    },
    { rootMargin: "400px" }
  );

  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === "attributes") {
        attributeChanged(m.target, m.attributeName);
        continue;
      }
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        sweep(node);
        requestAnimationFrame(() => sweep(node)); // late-set src / classes
      }
    }
  });

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) return;
    observedRoots.add(root);
    mo.observe(root instanceof Document ? root.documentElement : root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: WATCHED_ATTRS,
    });
  }

  function attributeChanged(el, name) {
    if (el.localName === "source") {
      const img = el.parentElement?.querySelector?.("img");
      if (img) attributeChanged(img, "src");
      return;
    }
    const rec = records.get(el);
    if (rec?.kind === "media") {
      if (rec.key !== keyOf(el)) {
        release(el);
        consider(el);
      }
      return;
    }
    if (name === "style" || name === "class" || rec?.kind === "background") {
      noBg.delete(el);
      bgQueue.add(el); // batched: animated pages change style every frame
      if (!bgTimer) bgTimer = setTimeout(flushBgQueue, 300);
    }
  }

  function flushBgQueue() {
    bgTimer = 0;
    if (paused) return;
    let budget = 150;
    for (const el of bgQueue) {
      bgQueue.delete(el);
      if (!el.isConnected) continue;
      const rec = records.get(el);
      if (rec?.kind === "background" && rec.key !== bgUrlOf(el)) release(el);
      considerBackground(el);
      if (--budget <= 0) break;
    }
    if (bgQueue.size) bgTimer = setTimeout(flushBgQueue, 300);
  }

  function takeShadow(host) {
    const sr = shadowOf(host);
    if (!sr) return;
    observeRoot(sr);
    sweep(sr);
  }

  function shadowOf(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.shadowRoot) return el.shadowRoot;
    try {
      return chrome.dom?.openOrClosedShadowRoot?.(el) ?? null; // sees closed roots too
    } catch {
      return null;
    }
  }

  function sweep(root) {
    if (paused || !root) return;
    if (root.nodeType === 11) observeRoot(root);
    if (root.nodeType === 1) visit(root);
    const all = root.querySelectorAll?.("*");
    if (all) for (const el of all) visit(el);
  }

  function visit(el) {
    const tag = el.localName;
    if (tag === "fb-ui") return;
    if (tag === "img" || tag === "video") consider(el);
    else considerBackground(el);
    const sr = shadowOf(el);
    if (sr) sweep(sr);
  }

  let scrollTimer = 0;
  function onScroll() {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => sweep(document), 500); // catches lazy content that never fired a mutation we saw
    if (pillTarget) placePill();
  }

  // ------------------------------------------------------------- per element

  function consider(el) {
    if (paused || records.has(el)) return;

    const size = measure(el);
    if (size === "small") {
      watchUntilLarge(el);
      return;
    }

    const key = keyOf(el);
    if (key && isSafe(key)) return;

    if (key && blocked.has(storeKey(key))) {
      records.set(el, { key, kind: "media", status: "blocked", manual: true, attempts: 0, visible: false });
      covered.add(el);
      cover(el, "blocked");
      return;
    }

    records.set(el, { key, kind: "media", status: "new", attempts: 0, visible: false });
    cover(el, "pending");

    if (size === "unknown") {
      el.addEventListener(
        isVideo(el) ? "loadeddata" : "load",
        () => {
          if (measure(el) === "small") release(el);
        },
        { once: true }
      );
    }
    if (isVideo(el) && !el.__fbVideo) {
      el.__fbVideo = true;
      const again = () => {
        const rec = records.get(el);
        if (!rec || rec.status === "safe") return;
        rec.attempts = 0;
        scheduleVideoRecheck(el);
      };
      el.addEventListener("play", again);
      el.addEventListener("seeked", again);
    }
    io.observe(el);
  }

  function watchUntilLarge(el) {
    if (el.__fbWatching) return;
    el.__fbWatching = true;
    const retry = () => {
      if (records.has(el) || !el.isConnected) return;
      if (measure(el) === "ok") consider(el);
    };
    el.addEventListener("load", retry, { once: true });
    el.addEventListener("loadeddata", retry, { once: true });
    if (typeof ResizeObserver === "function") {
      const ro = new ResizeObserver(() => {
        retry();
        if (records.has(el)) ro.disconnect();
      });
      ro.observe(el);
    }
  }

  function considerBackground(el) {
    if (paused || !el || el.nodeType !== 1) return;
    if (records.has(el) || noBg.has(el)) return;
    const tag = el.localName;
    if (tag === "img" || tag === "video" || tag === "html" || tag === "body") return;
    if (el.classList?.contains("fb-bg-cover")) return;

    const url = bgUrlOf(el);
    if (!url) {
      noBg.add(el);
      return;
    }
    if (measure(el) !== "ok") return;
    if (isSafe(url)) return;

    records.set(el, { key: url, kind: "background", status: "new", attempts: 0, visible: false });
    cover(el, "pending");
    io.observe(el);
  }

  function bgUrlOf(el) {
    try {
      const cs = getComputedStyle(el);
      const bg = cs.backgroundImage;
      if (!bg || bg === "none" || !bg.includes("url(")) return "";
      if (isTiled(cs)) return "";
      const match = /url\(\s*(['"]?)(.*?)\1\s*\)/.exec(bg);
      if (!match || !match[2].trim()) return "";
      const url = new URL(match[2].trim(), document.baseURI).href;
      if (!/^(https?|data):/.test(url)) return "";
      if (url.startsWith("data:") && url.length < 4000) return ""; // inline icons
      return url;
    } catch {
      return "";
    }
  }

  function isTiled(cs) {
    const size = (cs.backgroundSize || "").toLowerCase();
    if (size.includes("cover") || size.includes("contain") || size.includes("%")) return false;
    const repeat = cs.backgroundRepeat || "";
    if (repeat.startsWith("no-repeat")) return false;
    return repeat.includes("repeat");
  }

  function measure(el) {
    const r = el.getBoundingClientRect();
    const w = r.width || el.naturalWidth || el.videoWidth || 0;
    const h = r.height || el.naturalHeight || el.videoHeight || 0;
    if (!w || !h) return "unknown";
    return w < MIN_SIZE || h < MIN_SIZE ? "small" : "ok";
  }

  function release(el) {
    const rec = records.get(el);
    if (rec) clearTimeout(rec.timer);
    uncover(el);
    records.delete(el);
    covered.delete(el);
    io.unobserve(el);
  }

  const isVideo = (el) => el.localName === "video";

  /** Identity of a picture or video: what we classify, and what "this is fine" is remembered by. */
  function keyOf(el) {
    if (isVideo(el)) {
      const src = el.currentSrc || el.src;
      if (src && !src.startsWith("blob:")) return src;
      return el.poster || lazySrc(el) || "page:" + location.origin + location.pathname + location.search;
    }
    return el.currentSrc || el.src || firstSrcset(el.getAttribute("srcset")) || lazySrc(el) || "";
  }

  function lazySrc(el) {
    for (const name of LAZY_ATTRS) {
      const v = el.getAttribute(name);
      if (v) return absolutize(v);
    }
    return "";
  }

  function firstSrcset(srcset) {
    if (!srcset) return "";
    const first = srcset.split(",")[0]?.trim().split(/\s+/)[0];
    return first ? absolutize(first) : "";
  }

  function absolutize(src) {
    try {
      return new URL(src, document.baseURI).href;
    } catch {
      return src;
    }
  }

  // Long inline images are stored by a short fingerprint instead of in full.
  function storeKey(key) {
    if (!key.startsWith("data:")) return key;
    let h = 5381;
    for (let i = 0; i < key.length; i++) h = ((h * 33) ^ key.charCodeAt(i)) >>> 0;
    return `data:${key.length}:${h.toString(36)}`;
  }

  const isSafe = (key) => safe.has(storeKey(key));

  // ------------------------------------------------------------- classify

  async function classify(el) {
    const rec = records.get(el);
    if (!rec || rec.status === "working" || rec.status === "safe") return;
    rec.status = "working";

    let payload;
    try {
      payload = await payloadFor(el, rec);
    } catch {
      payload = null;
    }

    if (!payload) {
      // Lazy image that has no source yet: wait for one rather than judge it.
      if (!rec.key && rec.kind === "media" && !isVideo(el)) {
        rec.status = "pending";
        return;
      }
      hold(el, rec);
      if (isVideo(el) && rec.attempts < 4) {
        rec.attempts++;
        scheduleVideoRecheck(el);
      }
      return;
    }

    const res = await send({ op: "classify", ...payload });
    if (records.get(el) !== rec || rec.status === "safe") return;

    if (!res?.ok) {
      rec.attempts++;
      if (rec.attempts < MAX_RETRIES) {
        rec.status = "pending";
        setTimeout(() => records.get(el) === rec && classify(el), 400 * rec.attempts);
      } else {
        hold(el, rec);
      }
      return;
    }

    if (res.blur && res.reasons?.[0] === "unreadable") {
      hold(el, rec);
      if (++rec.attempts < 4) {
        setTimeout(() => {
          if (records.get(el) !== rec || paused || !el.isConnected) return;
          rec.status = "pending";
          classify(el);
        }, 600 * rec.attempts);
      }
      return;
    }

    if (res.blur) block(el, rec);
    else clear(el, rec);
  }

  async function payloadFor(el, rec) {
    if (rec.kind === "background") return { src: rec.key };

    if (isVideo(el)) {
      const dataUrl = snapshot(el, el.videoWidth, el.videoHeight);
      if (dataUrl) return { src: null, dataUrl };
      const poster = el.poster || lazySrc(el);
      return poster && /^(https?|data):/.test(poster) ? { src: poster } : null;
    }

    const src = keyOf(el);
    if (!src) return null;
    if (src.startsWith("blob:")) {
      const dataUrl = snapshot(el, el.naturalWidth, el.naturalHeight);
      return dataUrl ? { src: null, dataUrl } : null;
    }
    return /^(https?|data):/.test(src) ? { src } : null;
  }

  function snapshot(el, w, h) {
    if (!w || !h) return null;
    const scale = Math.min(1, SNAPSHOT_MAX / Math.max(w, h));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    try {
      c.getContext("2d").drawImage(el, 0, 0, c.width, c.height);
      return c.toDataURL("image/jpeg", 0.75);
    } catch {
      return null; // cross-origin frame: the canvas is tainted and cannot be read
    }
  }

  function scheduleVideoRecheck(el) {
    const rec = records.get(el);
    if (!rec || rec.recheck || rec.status === "safe" || rec.manual) return;
    rec.recheck = setTimeout(() => {
      rec.recheck = 0;
      if (records.get(el) !== rec || paused || !el.isConnected || !rec.visible) return;
      if (rec.status === "safe" || rec.status === "working") return;
      if (el.paused && rec.status !== "pending") return; // nothing is changing
      rec.status = "pending";
      classify(el);
    }, VIDEO_INTERVAL);
  }

  // ------------------------------------------------------------- verdicts

  function block(el, rec) {
    rec.status = "blocked";
    if (!rec.counted) {
      rec.counted = true;
      blurred++;
      report();
    }
    covered.add(el);
    if (!rec.revealed) cover(el, "blocked");
    if (isVideo(el)) scheduleVideoRecheck(el);
  }

  /** Could not be checked — stay covered. */
  function hold(el, rec) {
    rec.status = "blocked";
    covered.add(el);
    if (!rec.revealed) cover(el, "blocked");
  }

  function clear(el, rec) {
    if (rec.manual) return; // the person blurred this themselves; the detector doesn't get a say
    rec.status = "clear";
    if (rec.revealed) endReveal(el, rec);
    covered.delete(el);
    uncover(el);
    if (isVideo(el)) scheduleVideoRecheck(el);
  }

  // ------------------------------------------------------------- covering

  function isMediaBox(el) {
    return el.childElementCount === 0 || !el.textContent?.trim();
  }

  function cover(el, state) {
    const rec = records.get(el);
    if (!rec) return;
    if (rec.kind === "background" && !isMediaBox(el)) {
      // The element also holds text: blur a layer behind it, not the words.
      let layer = rec.layer;
      if (!layer?.isConnected) {
        layer = document.createElement("div");
        layer.className = "fb-bg-cover";
        rec.layer = layer;
        if (getComputedStyle(el).position === "static") el.style.setProperty("position", "relative", "important");
        el.prepend(layer);
      }
      layer.dataset.state = state;
      return;
    }
    el.setAttribute(ATTR, state);
  }

  function uncover(el) {
    el.removeAttribute(ATTR);
    const rec = records.get(el);
    if (rec?.layer) {
      rec.layer.remove();
      rec.layer = null;
    }
  }

  // ------------------------------------------------------------- reveal / mistakes

  /** The blurred element under the pointer (or inside a shadow tree), if any. */
  function coveredAt(ev) {
    for (const n of ev.composedPath?.() ?? []) {
      const el = asCovered(n);
      if (el) return el;
    }
    if (!covered.size) return null;
    for (const n of document.elementsFromPoint(ev.clientX, ev.clientY)) {
      const el = asCovered(n);
      if (el) return el;
    }
    return null;
  }

  function asCovered(n) {
    if (!n || n.nodeType !== 1) return null;
    const el = n.classList?.contains("fb-bg-cover") ? n.parentElement : n;
    const rec = el && records.get(el);
    return rec && covered.has(el) && rec.status === "blocked" ? el : null;
  }

  function onClick(ev) {
    if (!cfg?.allowReveal || ev.target === uiHost) return;
    const el = coveredAt(ev);
    if (!el || records.get(el).revealed) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    reveal(el);
  }

  let lastMove = 0;
  let cleanTimer = 0;
  function onMove(ev) {
    if (ev.target === uiHost) return;
    const now = performance.now();
    if (now - lastMove < 60) return;
    lastMove = now;

    const el = covered.size ? coveredAt(ev) : null;
    if (el) {
      clearTimeout(hideTimer);
      clearTimeout(cleanTimer);
      if (pillTarget !== el || pillMode === "clean") showPill(el);
      return;
    }

    const clean = cleanAt(ev);
    if (clean) {
      clearTimeout(hideTimer);
      if (pillTarget === clean) return;
      clearTimeout(cleanTimer);
      cleanTimer = setTimeout(() => showPill(clean, "clean"), 350); // not on a drive-by
      return;
    }

    clearTimeout(cleanTimer);
    if (pillTarget && !pillHover && pillMode !== "revealed" && pillMode !== "done") {
      clearTimeout(hideTimer);
      hideTimer = setTimeout(hidePill, 250);
    }
  }

  /** A picture or video that was checked and shown, under the pointer. */
  function cleanAt(ev) {
    const stack = [...(ev.composedPath?.() ?? []), ...document.elementsFromPoint(ev.clientX, ev.clientY)];
    for (const n of stack) {
      if (!n || n.nodeType !== 1) continue;
      const el = n.classList?.contains("fb-bg-cover") ? n.parentElement : n;
      const rec = el && records.get(el);
      if (!rec) continue;
      return rec.status === "clear" ? el : null;
    }
    return null;
  }

  function onKey(ev) {
    if (ev.key !== "Escape") return;
    for (const el of covered) rehide(el);
  }

  function onVisibility() {
    if (document.visibilityState === "hidden") for (const el of covered) rehide(el);
  }

  function reveal(el) {
    const rec = records.get(el);
    if (!rec || !cfg.allowReveal) return;
    clearTimeout(rec.timer);
    rec.revealed = true;
    cover(el, "revealed");
    if (cfg.revealSeconds > 0) {
      rec.revealEnd = Date.now() + cfg.revealSeconds * 1000;
      rec.timer = setTimeout(() => rehide(el), cfg.revealSeconds * 1000);
    } else {
      rec.revealEnd = 0;
    }
    showPill(el);
  }

  /** Cover again. */
  function rehide(el) {
    const rec = records.get(el);
    if (!rec || !rec.revealed) return;
    endReveal(el, rec);
    if (rec.status === "blocked") cover(el, "blocked");
    if (pillTarget === el) hidePill();
  }

  function endReveal(el, rec) {
    clearTimeout(rec.timer);
    rec.revealed = false;
    rec.revealEnd = 0;
    if (pillTarget === el) hidePill();
  }

  /** "This was blurred by mistake." Remembered for good, and for identical pictures on this page. */
  function markSafe(el) {
    const rec = records.get(el);
    if (!rec) return;
    const key = rec.key;
    if (key) {
      safe.add(storeKey(key));
      blocked.delete(storeKey(key));
      send({ op: "mark-safe", key: storeKey(key) });
    }
    for (const other of [...covered]) {
      const r = records.get(other);
      if (r && (other === el || (key && r.key === key))) forgive(other, r);
    }
    flashPill(el, "Marked safe");
  }

  function forgive(el, rec) {
    clearTimeout(rec.timer);
    clearTimeout(rec.recheck);
    rec.revealed = false;
    rec.manual = false;
    rec.status = "safe";
    if (rec.counted) {
      rec.counted = false;
      blurred = Math.max(0, blurred - 1);
      report();
    }
    covered.delete(el);
    uncover(el);
    io.unobserve(el);
  }

  /** "Blur this": it slipped through, so cover it and keep it covered. */
  function blurNow(el) {
    const rec = records.get(el);
    if (!rec) return;
    if (rec.key) {
      const k = storeKey(rec.key);
      blocked.add(k);
      safe.delete(k);
      send({ op: "mark-blocked", key: k });
    }
    clearTimeout(rec.timer);
    clearTimeout(rec.recheck);
    rec.recheck = 0;
    rec.revealed = false;
    rec.manual = true;
    rec.status = "blocked";
    covered.add(el);
    cover(el, "blocked");
    flashPill(el, "Blurred");
  }

  // ------------------------------------------------------------- the little control

  // Looks like a native player control: translucent glass, icon buttons, in the corner of the picture.
  const BAR_CSS = `
    :host { all: initial; }
    [hidden] { display: none !important; }
    .bar {
      position: fixed; z-index: 2147483647; display: flex; align-items: center; gap: 2px; padding: 3px;
      border-radius: 10px; color: #fff; background: rgba(18, 18, 18, .74);
      -webkit-backdrop-filter: blur(12px) saturate(1.4); backdrop-filter: blur(12px) saturate(1.4);
      box-shadow: 0 0 0 1px rgba(255,255,255,.08), 0 4px 14px rgba(0,0,0,.3);
      font: 500 12.5px/1 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      max-width: calc(100vw - 16px);
    }
    button {
      all: unset; box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px;
      height: 28px; padding: 0 9px; border-radius: 7px; cursor: pointer; color: #fff; white-space: nowrap;
    }
    button.icon { width: 28px; padding: 0; justify-content: center; }
    button:hover { background: rgba(255,255,255,.16); }
    button:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
    svg { width: 16px; height: 16px; flex: none; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
    .sep { width: 1px; height: 16px; background: rgba(255,255,255,.22); margin: 0 2px; }
    .msg { display: inline-flex; align-items: center; gap: 6px; padding: 0 9px; height: 28px; }
    .ring { position: relative; width: 28px; height: 28px; display: grid; place-items: center; font-size: 11.5px; font-variant-numeric: tabular-nums; }
    .ring svg { position: absolute; inset: 3px; width: 22px; height: 22px; transform: rotate(-90deg); stroke-width: 2.5; }
    .ring .track { stroke: rgba(255,255,255,.25); }
  `;

  const ICONS = {
    eye: ["M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z", { c: [12, 12, 3] }],
    eyeOff: [
      "M10.73 5.08a10.74 10.74 0 0 1 11.2 6.57 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-1.44 2.49",
      "M14.08 14.16a3 3 0 0 1-4.24-4.24",
      "M17.48 17.5a10.75 10.75 0 0 1-15.42-5.15 1 1 0 0 1 0-.7 10.75 10.75 0 0 1 4.45-5.14",
      "m2 2 20 20",
    ],
    check: [{ c: [12, 12, 10] }, "m9 12 2 2 4-4"],
  };
  const SVG_NS = "http://www.w3.org/2000/svg";

  function icon(name) {
    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    for (const part of ICONS[name]) {
      const node = document.createElementNS(SVG_NS, part.c ? "circle" : "path");
      if (part.c) {
        node.setAttribute("cx", part.c[0]);
        node.setAttribute("cy", part.c[1]);
        node.setAttribute("r", part.c[2]);
      } else {
        node.setAttribute("d", part);
      }
      svg.append(node);
    }
    return svg;
  }

  const RING_LEN = 2 * Math.PI * 9;

  let uiHost = null;
  let barEl = null;
  let parts = null;
  let pillTarget = null;
  let pillMode = ""; // "hover" | "revealed" | "clean" | "done"
  let pillHover = false;
  let hideTimer = 0;
  let ticker = 0;

  function ensureUi() {
    if (uiHost?.isConnected) return;
    uiHost = document.createElement("fb-ui");
    const root = uiHost.attachShadow({ mode: "closed" });
    const sheet = new CSSStyleSheet(); // constructable sheets are not blocked by a page's CSP
    sheet.replaceSync(BAR_CSS);
    root.adoptedStyleSheets = [sheet];

    const btn = (name, title, act) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "icon";
      b.title = title; // the only label: a tooltip
      b.setAttribute("aria-label", title);
      b.append(icon(name));
      b.addEventListener("click", (ev) => {
        ev.stopPropagation();
        act();
      });
      return b;
    };

    const ring = document.createElement("div");
    ring.className = "ring";
    const rsvg = document.createElementNS(SVG_NS, "svg");
    rsvg.setAttribute("viewBox", "0 0 24 24");
    const track = document.createElementNS(SVG_NS, "circle");
    const prog = document.createElementNS(SVG_NS, "circle");
    for (const c of [track, prog]) {
      c.setAttribute("cx", 12);
      c.setAttribute("cy", 12);
      c.setAttribute("r", 9);
    }
    track.setAttribute("class", "track");
    prog.setAttribute("stroke-dasharray", RING_LEN);
    rsvg.append(track, prog);
    const secs = document.createElement("span");
    ring.append(rsvg, secs);

    const msg = document.createElement("span");
    msg.className = "msg";
    const sep = document.createElement("span");
    sep.className = "sep";

    const show = btn("eye", "Show", () => pillTarget && reveal(pillTarget));
    const hide = btn("eyeOff", "Blur again", () => pillTarget && rehide(pillTarget));
    const blur = btn("eyeOff", "Inappropriate – blur it", () => pillTarget && blurNow(pillTarget));
    const fine = btn("check", "Safe – show it", () => pillTarget && markSafe(pillTarget));

    barEl = document.createElement("div");
    barEl.className = "bar";
    barEl.hidden = true;
    barEl.append(ring, msg, show, hide, blur, sep, fine);
    barEl.addEventListener("mouseenter", () => {
      pillHover = true;
      clearTimeout(hideTimer);
    });
    barEl.addEventListener("mouseleave", () => {
      pillHover = false;
      if (pillMode === "hover" || pillMode === "clean") hideTimer = setTimeout(hidePill, 250);
    });
    parts = { ring, secs, prog, msg, sep, show, hide, blur, fine };
    root.append(barEl);
    document.documentElement.append(uiHost);
  }

  function showPill(el, forced) {
    const rec = records.get(el);
    if (!rec) return;
    ensureUi();
    pillTarget = el;
    pillMode = forced ?? (rec.revealed ? "revealed" : "hover");
    renderPill();
    barEl.hidden = false;
    placePill();
    clearInterval(ticker);
    ticker = setInterval(tick, 200);
  }

  function flashPill(el, text) {
    ensureUi();
    pillTarget = el;
    pillMode = "done";
    for (const k of ["ring", "show", "hide", "blur", "sep", "fine"]) parts[k].hidden = true;
    parts.msg.replaceChildren(icon("check"), text);
    parts.msg.hidden = false;
    barEl.hidden = false;
    placePill();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hidePill, 2200);
  }

  function renderPill() {
    const rec = records.get(pillTarget);
    const m = pillMode;
    parts.msg.hidden = true;
    parts.ring.hidden = m !== "revealed";
    parts.show.hidden = m !== "hover" || !cfg.allowReveal;
    parts.hide.hidden = m !== "revealed";
    parts.blur.hidden = m !== "clean";
    parts.fine.hidden = m === "clean";
    parts.sep.hidden = m === "clean" || (m === "hover" && parts.show.hidden);
    if (m === "hover") {
      const tip = cfg.revealSeconds > 0 ? `Show for ${cfg.revealSeconds} seconds` : "Show";
      parts.show.title = tip;
      parts.show.setAttribute("aria-label", tip);
    }
    if (m === "revealed") tick();
    void rec;
  }

  function tick() {
    const rec = pillTarget && records.get(pillTarget);
    if (!rec || !pillTarget.isConnected) return hidePill();
    placePill();
    if (pillMode !== "revealed") return;
    if (!rec.revealEnd) {
      parts.secs.textContent = "";
      parts.prog.setAttribute("stroke-dashoffset", 0);
      return;
    }
    const total = cfg.revealSeconds * 1000;
    const left = Math.max(0, rec.revealEnd - Date.now());
    parts.secs.textContent = Math.ceil(left / 1000);
    parts.prog.setAttribute("stroke-dashoffset", RING_LEN * (1 - left / total));
    parts.prog.setAttribute("stroke", "#fff");
  }

  /** Top-right corner of the visible part of the picture, like a player's own controls. */
  function placePill() {
    if (!pillTarget || !barEl || barEl.hidden) return;
    const r = pillTarget.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) {
      barEl.style.visibility = "hidden";
      return;
    }
    barEl.style.visibility = "";
    const w = barEl.offsetWidth;
    const h = barEl.offsetHeight;
    const right = Math.min(r.right, innerWidth);
    const top = Math.max(r.top, 0) + 8;
    barEl.style.left = `${Math.max(8, Math.min(right - w - 8, innerWidth - w - 8))}px`;
    barEl.style.top = `${Math.max(8, Math.min(top, innerHeight - h - 8))}px`;
  }

  function hidePill() {
    clearInterval(ticker);
    clearTimeout(hideTimer);
    clearTimeout(cleanTimer);
    pillTarget = null;
    pillMode = "";
    pillHover = false;
    if (barEl) barEl.hidden = true;
  }

  // ------------------------------------------------------------- plumbing

  let reportTimer = 0;
  function report() {
    clearTimeout(reportTimer);
    reportTimer = setTimeout(() => send({ op: "count", count: blurred }), 250);
  }

  function send(msg) {
    try {
      return chrome.runtime.sendMessage(msg).catch(() => null);
    } catch {
      return Promise.resolve(null); // extension was reloaded under a running page
    }
  }
})();

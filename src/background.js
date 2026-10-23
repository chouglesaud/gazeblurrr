// background.js — broker between content scripts and the offscreen document.
// Content scripts cannot message an offscreen document directly, so everything
// hops through here. This is also where caching, queueing and the
// "is this site protected?" decision live.

import { decide, thresholdsFor } from "./policy.js";
import { effective, loadSettings, setFirstRunDefaults, SAFE_LIMIT } from "./settings.js";
import { entryFor } from "./sites.js";

const OFFSCREEN_PATH = "src/offscreen.html";
const MAX_CONCURRENT = 2;
const CACHE_LIMIT = 4000;

/** src -> detections. Detections are level-independent, so a level change re-uses them. */
const cache = new Map();
const inflight = new Map(); // src -> Promise, so ten copies of one image cost one inference
let active = 0;
const queue = [];

let settings = null;
let creatingOffscreen = null;

// ---------------------------------------------------------------- settings

async function settingsNow() {
  if (!settings) settings = await loadSettings();
  return settings;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  const relevant = Object.entries(changes).filter(([key, change]) => {
    // The running tally is written from here on every blur; reacting to it
    // would re-scan every open tab in a loop.
    if (key === "totalBlurred" || key === "welcomed") return false;
    // A page that marks something safe (or blurs it by hand) has already
    // updated itself. Clearing the lists asks for a refresh explicitly.
    if (key === "safe" || key === "blocked") return false;
    return true;
  });
  if (!relevant.length) return;

  settings = null;
  broadcast({ op: "settings-changed" });
});

async function broadcast(msg) {
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (tab.id != null) chrome.tabs.sendMessage(tab.id, msg).catch(() => {});
  }
}

// ---------------------------------------------------------------- offscreen

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  if (creatingOffscreen) return creatingOffscreen;

  creatingOffscreen = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_PATH,
      reasons: ["BLOBS", "WORKERS"],
      justification:
        "Decodes images and runs the on-device image-checking model; both need a DOM context that outlives the service worker.",
    })
    .catch((err) => {
      // Another event page may have won the race.
      if (!String(err).includes("Only a single offscreen")) throw err;
    })
    .finally(() => {
      creatingOffscreen = null;
    });

  return creatingOffscreen;
}

async function askOffscreen(payload) {
  await ensureOffscreen();
  return chrome.runtime.sendMessage({ target: "fb-offscreen", ...payload });
}

// ---------------------------------------------------------------- queue

function schedule(job) {
  return new Promise((resolve) => {
    queue.push({ job, resolve });
    pump();
  });
}

function pump() {
  while (active < MAX_CONCURRENT && queue.length) {
    const { job, resolve } = queue.shift();
    active++;
    job()
      .then(resolve, (err) => resolve({ ok: false, error: String(err?.message ?? err) }))
      .finally(() => {
        active--;
        pump();
      });
  }
}

// ---------------------------------------------------------------- detections

async function detectionsFor(src, dataUrl) {
  const cacheable = !dataUrl && !!src && !src.startsWith("data:");
  if (cacheable) {
    const hit = cache.get(src);
    if (hit) return hit;
    const pending = inflight.get(src);
    if (pending) return pending;
  }

  const run = schedule(() => askOffscreen({ op: "detect", src, dataUrl })).then((res) => {
    if (!res?.ok) throw new Error(res?.error ?? "inference failed");
    return res.detections;
  });

  if (cacheable) {
    inflight.set(src, run);
    run
      .then((detections) => {
        if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value); // oldest first
        cache.set(src, detections);
      })
      .catch(() => {})
      .finally(() => inflight.delete(src));
  }

  return run;
}

// ---------------------------------------------------------------- messaging

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.target === "fb-offscreen") return false; // not ours

  switch (msg?.op) {
    case "classify":
      handleClassify(msg, sender).then(sendResponse, (err) =>
        sendResponse({ ok: false, error: String(err?.message ?? err) })
      );
      return true;

    case "config":
      settingsNow().then((s) => {
        const entry = siteEntry(s, sender);
        const mine = effective(s, entry);
        sendResponse({
          ok: true,
          active: !!entry,
          allowReveal: mine.allowReveal,
          revealSeconds: mine.revealSeconds,
          safe: s.safe,
          blocked: s.blocked,
        });
      });
      return true;

    case "mark-safe":
      markSafe(msg.key).then(() => sendResponse({ ok: true }));
      return true;

    case "refresh-pages":
      settings = null;
      broadcast({ op: "settings-changed" });
      return false;

    case "mark-blocked":
      markBlocked(msg.key).then(() => sendResponse({ ok: true }));
      return true;

    case "count":
      if (sender.tab?.id != null) setBadge(sender.tab.id, msg.count);
      return false;

    case "warmup":
      askOffscreen({ op: "warmup" })
        .then(sendResponse)
        .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
      return true;

    default:
      return false;
  }
});

/** The protected website this page belongs to (by the tab's address, so embedded frames follow their page), or null. */
function siteEntry(s, sender) {
  const host = safeHost(sender.tab?.url ?? sender.url);
  return host ? entryFor(s.sites, host) : null;
}

async function handleClassify(msg, sender) {
  const s = await settingsNow();
  const entry = siteEntry(s, sender);
  if (!entry) return { ok: true, blur: false, reasons: [] };

  let detections;
  try {
    detections = await detectionsFor(msg.src, msg.dataUrl);
  } catch (err) {
    const text = String(err?.message ?? err);
    // The picture could not be read at all. Fail closed: keep it covered.
    if (/HTTP \d+|too large|not an image|decode|no source/.test(text)) {
      return { ok: true, blur: true, reasons: ["unreadable"] };
    }
    return { ok: false, error: text };
  }

  const verdict = decide(detections, thresholdsFor(effective(s, entry).level, s.mode));
  if (verdict.blur) countBlur();
  return { ok: true, ...verdict };
}

// "Not inappropriate" and "Blur this" move a picture between two lists.
// Serialised so two quick clicks cannot overwrite each other.
let listChain = Promise.resolve();
function moveKey(key, add, remove) {
  if (typeof key !== "string" || !key) return Promise.resolve();
  listChain = listChain.then(async () => {
    const lists = await chrome.storage.local.get({ safe: [], blocked: [] });
    const target = lists[add].filter((k) => k !== key).concat(key).slice(-SAFE_LIMIT);
    await chrome.storage.local.set({ [add]: target, [remove]: lists[remove].filter((k) => k !== key) });
    settings = null;
  });
  return listChain;
}
const markSafe = (key) => moveKey(key, "safe", "blocked");
const markBlocked = (key) => moveKey(key, "blocked", "safe");

let pendingBlurs = 0;
let flushTimer = null;
function countBlur() {
  pendingBlurs++;
  if (flushTimer) return;
  flushTimer = setTimeout(async () => {
    flushTimer = null;
    const n = pendingBlurs;
    pendingBlurs = 0;
    const { totalBlurred } = await chrome.storage.local.get({ totalBlurred: 0 });
    await chrome.storage.local.set({ totalBlurred: totalBlurred + n });
  }, 5000);
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function setBadge(tabId, count) {
  chrome.action.setBadgeText({ tabId, text: count > 0 ? String(count) : "" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#0E6B54" }).catch(() => {});
}

// ---------------------------------------------------------------- lifecycle

// Warm the model as soon as the browser starts so the first picture on the
// first page isn't waiting on a 12 MB load.
chrome.runtime.onStartup.addListener(() => void askOffscreen({ op: "warmup" }).catch(() => {}));

chrome.runtime.onInstalled.addListener(async (details) => {
  askOffscreen({ op: "warmup" }).catch(() => {});
  if (details.reason !== "install") return;
  // New installs start with the popular sites switched on, so protection
  // works straight away. Everything is editable on the welcome page.
  if (await setFirstRunDefaults()) {
    chrome.tabs.create({ url: chrome.runtime.getURL("ui/options.html#welcome") });
  }
});

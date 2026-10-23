// offscreen.js — the only place that touches image pixels and the model.
//
// It lives in an offscreen document rather than the service worker for two
// reasons: service workers are killed after ~30s idle (which would mean
// re-loading a 12 MB model constantly), and they cannot spawn the workers or
// hold the GPU context that ORT wants.

import { detect, ready, backendInUse } from "./detector.js";

const MAX_BYTES = 12 * 1024 * 1024; // don't decode absurd images

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.target !== "fb-offscreen") return false;

  handle(msg)
    .then(sendResponse)
    .catch((err) => sendResponse({ ok: false, error: String(err?.message ?? err) }));
  return true; // async
});

async function handle(msg) {
  switch (msg.op) {
    case "warmup": {
      const backend = await ready();
      return { ok: true, backend };
    }
    case "status":
      return { ok: true, backend: backendInUse() };
    case "detect":
      return runDetect(msg);
    default:
      return { ok: false, error: `unknown op ${msg.op}` };
  }
}

async function runDetect({ src, dataUrl }) {
  await ready();
  const started = performance.now();

  let bitmap;
  try {
    bitmap = await toBitmap(src, dataUrl);
  } catch (err) {
    return { ok: false, error: `decode: ${err?.message ?? err}` };
  }

  try {
    const detections = await detect(bitmap);
    return { ok: true, detections, ms: Math.round(performance.now() - started) };
  } finally {
    bitmap.close?.();
  }
}

async function toBitmap(src, dataUrl) {
  // The content script hands us a data URL only when it could not give us a
  // fetchable one: blob: URLs belong to the page's origin, and video frames
  // have no URL at all.
  const url = dataUrl || src;
  if (!url) throw new Error("no source");

  // Fetching from the extension origin with host_permissions sidesteps CORS
  // entirely, which is why we re-fetch instead of reading the page's <img>.
  const res = await fetch(url, { credentials: "omit", cache: "force-cache" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new Error("too large");

  const blob = await res.blob();
  if (blob.size > MAX_BYTES) throw new Error("too large");
  if (blob.type && !blob.type.startsWith("image/") && !dataUrl) {
    throw new Error(`not an image (${blob.type})`);
  }

  return createImageBitmap(blob);
}

// detector.js — wraps the ONNX model. Runs inside the offscreen document.
//
// The model is a YOLOv8-style detector:
//   input  "images"  float32 [1, 3, 320, 320]  RGB, 0..1, NCHW
//   output "output0" float32 [1, 22, 2100]     22 = 4 box coords + 18 class scores
//
// Preprocessing has to match how the model was trained: pad the image to a
// square by adding black on the right and bottom (never centred), then resize.

import * as ort from "../vendor/ort/ort.wasm.min.mjs";
import { LABELS } from "./policy.js";

const SIZE = 320;
const NUM_CLASSES = LABELS.length; // 18
const RAW_SCORE_FLOOR = 0.15; // below this nothing is worth keeping, whatever the policy says
const IOU_THRESHOLD = 0.45;

let session = null;
let loading = null;
let activeBackend = null;

const canvas = new OffscreenCanvas(SIZE, SIZE);
const ctx = canvas.getContext("2d", { willReadFrequently: true });

export function backendInUse() {
  return activeBackend;
}

export async function ready() {
  if (session) return activeBackend;
  if (loading) return loading;

  loading = (async () => {
    ort.env.wasm.wasmPaths = chrome.runtime.getURL("vendor/ort/");
    // One thread. Multi-threaded ORT needs SharedArrayBuffer, which needs
    // cross-origin isolation, which extension pages cannot opt into.
    ort.env.wasm.numThreads = 1;
    ort.env.logLevel = "error";

    const modelUrl = chrome.runtime.getURL("models/detector.onnx");
    const buf = await (await fetch(modelUrl)).arrayBuffer();

    // WASM on the CPU: works on every machine, no GPU drivers involved.
    session = await ort.InferenceSession.create(buf, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    activeBackend = "wasm";
    return activeBackend;
  })();

  try {
    return await loading;
  } finally {
    loading = null;
  }
}

/**
 * @param {ImageBitmap} bitmap
 * @returns {Promise<{label:string, score:number, box:number[]}[]>} box is [x,y,w,h] normalised to the source image
 */
export async function detect(bitmap) {
  await ready();

  const { width: w, height: h } = bitmap;
  if (!w || !h) return [];

  const square = Math.max(w, h);
  const scale = SIZE / square;

  ctx.clearRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, SIZE, SIZE);
  // Anchor at the top-left so the padding lands on the right and bottom.
  ctx.drawImage(bitmap, 0, 0, w, h, 0, 0, w * scale, h * scale);

  const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
  const plane = SIZE * SIZE;
  const input = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    input[i] = data[p] / 255;
    input[i + plane] = data[p + 1] / 255;
    input[i + 2 * plane] = data[p + 2] / 255;
  }

  const output = await session.run({
    images: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]),
  });
  const out = output.output0;
  const [, channels, anchors] = out.dims; // [1, 22, 2100]
  const v = out.data;

  // Candidates, still in 320-space.
  const boxes = [];
  const scores = [];
  const classIds = [];
  for (let a = 0; a < anchors; a++) {
    let best = -1;
    let bestScore = 0;
    for (let c = 0; c < NUM_CLASSES; c++) {
      const s = v[(4 + c) * anchors + a];
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (bestScore < RAW_SCORE_FLOOR) continue;

    const cx = v[0 * anchors + a];
    const cy = v[1 * anchors + a];
    const bw = v[2 * anchors + a];
    const bh = v[3 * anchors + a];
    boxes.push([cx - bw / 2, cy - bh / 2, bw, bh]);
    scores.push(bestScore);
    classIds.push(best);
  }

  const keep = nms(boxes, scores, IOU_THRESHOLD);

  // Back to source pixels, then to 0..1 so the content script can position
  // overlays without knowing the intrinsic size.
  const toSource = square / SIZE;
  return keep.map((i) => {
    const [x, y, bw, bh] = boxes[i];
    return {
      label: LABELS[classIds[i]],
      score: scores[i],
      box: [
        clamp01((x * toSource) / w),
        clamp01((y * toSource) / h),
        clamp01((bw * toSource) / w),
        clamp01((bh * toSource) / h),
      ],
    };
  });
}

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function nms(boxes, scores, iouThreshold) {
  const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]);
  const keep = [];
  const dead = new Uint8Array(order.length);

  for (let i = 0; i < order.length; i++) {
    if (dead[i]) continue;
    const a = order[i];
    keep.push(a);
    for (let j = i + 1; j < order.length; j++) {
      if (dead[j]) continue;
      if (iou(boxes[a], boxes[order[j]]) > iouThreshold) dead[j] = 1;
    }
  }
  return keep;
}

function iou(a, b) {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[0] + a[2], b[0] + b[2]);
  const y2 = Math.min(a[1] + a[3], b[1] + b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  if (inter <= 0) return 0;
  return inter / (a[2] * a[3] + b[2] * b[3] - inter);
}

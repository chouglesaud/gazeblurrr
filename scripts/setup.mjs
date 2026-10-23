// scripts/setup.mjs — fetches the detector model and copies the ONNX runtime
// into the extension folder. Run once: `npm install` (it runs automatically).
//
// Nothing here runs while browsing. Afterwards the extension is fully offline:
// the model and the runtime both live inside the folder.

import { createHash } from "node:crypto";
import { mkdir, copyFile, writeFile, readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// NudeNet v3, 320n (AGPL-3.0). Pinned by hash so a changed file is never loaded silently.
const MODEL_URL = "https://raw.githubusercontent.com/notAI-tech/NudeNet/v3/nudenet/320n.onnx";
const MODEL_SHA256 = "c15d8273adad2d0a92f014cc69ab2d6c311a06777a55545f2c4eb46f51911f0f";
const MODEL_PATH = join(root, "models", "detector.onnx");

const ORT_FILES = ["ort.wasm.min.mjs", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"];

const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const exists = (p) => stat(p).then(() => true, () => false);

async function fetchModel() {
  await mkdir(dirname(MODEL_PATH), { recursive: true });
  if ((await exists(MODEL_PATH)) && sha(await readFile(MODEL_PATH)) === MODEL_SHA256) {
    console.log("model: present and verified");
    return;
  }
  console.log(`model: downloading ${MODEL_URL}`);
  const res = await fetch(MODEL_URL);
  if (!res.ok) throw new Error(`model download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (sha(buf) !== MODEL_SHA256) {
    throw new Error(`model checksum mismatch (got ${sha(buf)}). Refusing to use it.`);
  }
  await writeFile(MODEL_PATH, buf);
  console.log(`model: ${(buf.length / 1e6).toFixed(1)} MB, checksum OK`);
}

async function copyRuntime() {
  const from = join(root, "node_modules", "onnxruntime-web", "dist");
  const to = join(root, "vendor", "ort");
  await mkdir(to, { recursive: true });
  for (const name of ORT_FILES) {
    if (!(await exists(join(from, name)))) throw new Error(`missing ${name} — run npm install first`);
    await copyFile(join(from, name), join(to, name));
  }
  console.log("runtime: copied");
}

await fetchModel();
await copyRuntime();
console.log("\nDone. Open chrome://extensions, turn on Developer mode, click “Load unpacked”, pick this folder.");

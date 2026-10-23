// scripts/build.mjs — builds the extension into dist/unpacked.
//   1. the React screens (popup + settings) with Vite
//   2. copies everything else the extension needs at runtime, as-is
// Load dist/unpacked in the browser, or zip it for the Web Store.

import { build } from "vite";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "unpacked");

for (const need of ["models/detector.onnx", "vendor/ort"]) {
  if (!existsSync(join(root, need))) {
    console.error(`Missing ${need}. Run "npm install" first so the model and runtime are downloaded.`);
    process.exit(1);
  }
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

await build({ configFile: join(root, "vite.config.ts"), logLevel: "warn" });

const keep = (src) => !src.endsWith(".DS_Store") && !src.endsWith("icon.svg");
for (const item of ["manifest.json", "LICENSE", "NOTICE.md", "src", "icons", "models/detector.onnx", "vendor/ort"]) {
  cpSync(join(root, item), join(out, item), { recursive: true, filter: keep });
}
console.log(`Built → ${out}`);

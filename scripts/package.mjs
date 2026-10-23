// scripts/package.mjs — zips dist/unpacked (run `npm run build` first, or just `npm run package`)
// into dist/gazeblurrr-<version>.zip for the Chrome Web Store and GitHub Releases.

import { zipSync } from "fflate";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "dist", "unpacked");
if (!existsSync(src)) throw new Error("dist/unpacked not found. Run `npm run build` first.");

const { version } = JSON.parse(readFileSync(join(src, "manifest.json"), "utf8"));
const files = {};
const add = (path) => {
  if (statSync(path).isDirectory()) for (const f of readdirSync(path)) add(join(path, f));
  else files[relative(src, path).split("\\").join("/")] = readFileSync(path);
};
add(src);

const out = join(root, "dist", `gazeblurrr-${version}.zip`);
writeFileSync(out, zipSync(files, { level: 9 }));
console.log(`${out} (${Object.keys(files).length} files, ${(statSync(out).size / 1e6).toFixed(1)} MB)`);

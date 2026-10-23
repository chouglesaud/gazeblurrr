// scripts/dev.mjs — build the latest extension and open it in a browser.
//
//   npm run dev                  auto-pick Brave / Chrome / Edge / Chromium
//   npm run dev -- --browser brave
//   npm run dev -- --browser chrome --profile ~/my-profile
//   npm run dev -- --list
//
// It stages a clean copy of exactly what ships to dist/unpacked, then starts the
// browser with its own throw-away profile (so your normal browsing is untouched)
// and the extension already loaded.
//
// Note: since Chrome 137, Google Chrome (branded) ignores --load-extension. If
// your browser does, the script falls back to opening the extensions page and
// showing the folder to pick with "Load unpacked" (one time; after that, press
// the reload ⟳ button on the extension card after each build).

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const os = platform();
const home = homedir();

const CANDIDATES = {
  darwin: {
    brave: ["/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"],
    chrome: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
    edge: ["/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"],
    chromium: ["/Applications/Chromium.app/Contents/MacOS/Chromium"],
  },
  linux: {
    brave: ["/usr/bin/brave-browser", "/usr/bin/brave"],
    chrome: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable"],
    edge: ["/usr/bin/microsoft-edge"],
    chromium: ["/usr/bin/chromium", "/usr/bin/chromium-browser"],
  },
  win32: {
    brave: [`${process.env.PROGRAMFILES}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`],
    chrome: [
      `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
      `${process.env["PROGRAMFILES(X86)"]}\\Google\\Chrome\\Application\\chrome.exe`,
    ],
    edge: [`${process.env["PROGRAMFILES(X86)"]}\\Microsoft\\Edge\\Application\\msedge.exe`],
    chromium: [],
  },
}[os] ?? {};

// Chrome for Testing (from Playwright) still honours --load-extension.
const pw = join(home, "Library/Caches/ms-playwright");
if (os === "darwin" && existsSync(pw)) {
  for (const d of readdirSync(pw).filter((n) => n.startsWith("chromium-"))) {
    CANDIDATES.chromium.push(
      join(pw, d, "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing")
    );
  }
}

const available = Object.entries(CANDIDATES)
  .map(([name, paths]) => [name, paths.find((p) => p && existsSync(p))])
  .filter(([, p]) => p);

// ---------------------------------------------------------------- args

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (args.includes("--list")) {
  console.log(available.length ? available.map(([n, p]) => `${n}\t${p}`).join("\n") : "No supported browser found.");
  process.exit(0);
}

const wanted = opt("browser");
const choice = wanted ? available.find(([n]) => n === wanted) : available[0];
if (!choice) {
  console.error(
    wanted
      ? `Browser "${wanted}" not found. Found: ${available.map(([n]) => n).join(", ") || "none"}.`
      : "No Brave, Chrome, Edge or Chromium found. Install one, or pass --browser."
  );
  process.exit(1);
}
const [browserName, browserPath] = choice;

// ---------------------------------------------------------------- build

function run(cmd, cmdArgs) {
  const r = spawnSync(cmd, cmdArgs, { cwd: root, stdio: "inherit", shell: os === "win32" });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!existsSync(join(root, "models/detector.onnx")) || !existsSync(join(root, "vendor/ort"))) {
  console.log("→ First run: downloading the model and runtime…");
  if (!existsSync(join(root, "node_modules"))) run("npm", ["install"]);
  else run("node", ["scripts/setup.mjs"]);
}

console.log("→ Checking code…");
run("npm", ["run", "--silent", "check"]);

console.log("→ Building…");
run("npm", ["run", "--silent", "build"]);

const out = join(root, "dist", "unpacked");
const { version } = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
console.log(`→ Built FilthBlurrr ${version} → ${out}`);

// ---------------------------------------------------------------- launch

const profile = resolve((opt("profile") ?? join(home, ".filthblurrr-dev-profile")).replace(/^~/, home));
mkdirSync(profile, { recursive: true });

const url = args.includes("--no-open") ? [] : ["https://www.google.com/search?q=test&tbm=isch"];
const child = spawn(
  browserPath,
  [
    `--user-data-dir=${profile}`,
    `--disable-extensions-except=${out}`,
    `--load-extension=${out}`,
    "--no-first-run",
    "--no-default-browser-check",
    ...url,
  ],
  { detached: true, stdio: "ignore" }
);
child.unref();

console.log(`→ Opened ${browserName} with a separate profile (${profile}).`);
console.log(`
If FilthBlurrr isn't in the toolbar (newer Chrome ignores the flag):
  1. open chrome://extensions   (brave://extensions in Brave)
  2. turn on Developer mode → Load unpacked → choose:
     ${out}
After later builds just press the reload ⟳ button on the FilthBlurrr card.
If this profile's browser was already running, close it first so the new build loads.`);

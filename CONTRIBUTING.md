# Contributing

Contributions are welcome — code, translations, bug reports, and testing on more websites.

## Run it locally
```bash
npm install
npm run dev     # builds and opens a browser with the extension loaded (dist/unpacked)
```
See [docs/GUIDE.md](docs/GUIDE.md#option-c--from-source-developers) for manual loading. After editing, run `npm run build` and press the reload ⟳ button on the extension card.

Stack: the toolbar popup and settings page are **React + TypeScript + Tailwind CSS v4** with Radix UI primitives, built by **Vite**. The page scripts (`src/`) are plain JavaScript — content scripts cannot be bundled modules — so they need no build.

## Map of the code
| File | Job |
|---|---|
| `src/content.js` | Runs on pages. Blurs first, asks for a verdict, handles reveal timer and “Not inappropriate”. |
| `src/background.js` | Is this site protected? Queue, cache, settings. |
| `src/offscreen.js`, `src/detector.js` | Runs the model (never touches the network). |
| `src/policy.js` | What each strength level blurs. Easiest place to tune behaviour. |
| `src/sites.js` | The list of popular sites and domain matching. |
| `ui/` | The two screens people see: `PopupView.tsx`, `OptionsView.tsx`, shared parts in `components/ui.tsx`. |
| `scripts/` | `setup` (model download), `build`, `package`, `dev`. |

## Principles
1. **Simple for non-technical people.** If a setting needs explaining, ask whether it needs to exist.
2. **Private.** No telemetry, no remote code, no network calls from the extension.
3. **Fail closed.** If something can’t be checked, it stays blurred.

## Before opening a pull request
`npm run check` (type-check + syntax) must pass, and please test on a real site with a protected-site toggle on and off. Releases: bump the version in `manifest.json` and `package.json`, tag `vX.Y.Z`; GitHub Actions builds the zip.

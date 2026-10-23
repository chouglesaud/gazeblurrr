<p align="center"><img src="icons/icon128.png" width="96" alt="FilthBlurrr logo"></p>

# FilthBlurrr

**Guard your gaze online.** A free, open-source Chrome extension that blurs inappropriate images and videos on the websites *you* choose — privately, on your own computer.

> “Tell the believing men to lower their gaze and guard their chastity. That is purer for them.” — Qur’an 24:30

Built to help the ummah protect their eyes, hearts and imaan.

## Features
- **Per-website on/off.** Not global. Switch each site from the toolbar button. 30 popular sites included (Google, YouTube, Instagram, X, Reddit, TikTok, Facebook, Pinterest…), any other site can be added.
- **Images, videos and background pictures.** Everything is covered first and revealed only once it’s checked.
- **Timed peek.** Need to see something? Show it for 3–60 seconds (you choose); it blurs itself again. Or turn peeking off.
- **Per-website settings.** Strength, “Show” and the timer are set for each website separately.
- **Fix mistakes in one tap.** One icon to mark a wrongly blurred picture safe, one to blur anything that slipped through. Both are remembered and reversible in settings.
- **Man or Woman mode.** Blurs women for men, or men for women. Three strengths: Standard · Strong · Maximum.
- **Private.** An on-device model ([NudeNet](https://github.com/notAI-tech/NudeNet)); no servers, no accounts, no tracking. See [PRIVACY.md](PRIVACY.md).
- **Safe by default.** If something can’t be checked, it stays blurred.

## Install
Full guide with steps: **[docs/GUIDE.md](docs/GUIDE.md)**

- **Chrome Web Store:** coming soon.
- **From a release zip:** download from Releases → unzip → `chrome://extensions` → Developer mode → *Load unpacked*.
- **From source:** `git clone … && cd filthblurrr && npm install && npm run build`, then *Load unpacked* → `dist/unpacked`. Or just `npm run dev`.

## How it works
```
content.js      every page: blur on sight → ask for verdict → uncover if clean
background.js   is this site protected? queue + cache
offscreen.js    runs the ONNX model (WASM, CPU) on the image — no network
ui/             popup + settings: React, TypeScript, Tailwind, Radix (built with Vite)
```
Images are re-fetched by the extension (so cross-origin pictures can be read) and videos are sampled as frames about every 1.5 s while playing.

## Limits
Not perfect: misses and false alarms happen, illustrations are weaker, DRM video can’t be inspected, and cross-origin video that browsers won’t expose stays blurred. It supports your discipline; it doesn’t replace it.

## Contributing
See [CONTRIBUTING.md](CONTRIBUTING.md). Ideas welcome: translations (Arabic, Urdu…), a PIN to protect settings, Firefox port, a better model.

## License
AGPL-3.0-or-later — see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md). (The bundled NudeNet model is AGPL-3.0, so the project is too.)

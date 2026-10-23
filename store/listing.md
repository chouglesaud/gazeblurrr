# Chrome Web Store listing

**Name:** GazeBlurrr
**Summary (≤132):** Guard your gaze. Blurs inappropriate images and videos on the websites you choose. Private, on-device, free and open source.

**Description**
Protect your eyes and your heart online. GazeBlurrr is for anyone. It blurs inappropriate pictures and videos *before* you see them — only on the websites you choose.

• Switch each website on or off with one tap — Google, YouTube, Instagram, X, Reddit, TikTok and 25+ more ready to go
• Man or Woman mode, and three simple strengths
• Need to look? Show it for a few seconds. It covers itself again automatically
• Blurred by mistake? One tap on ✓ and it never happens again. Missed something? One tap to blur it
• 100% private: pictures are checked on your computer. Nothing is uploaded, nothing is tracked
• Free and open source

No tool is perfect — it helps, it doesn’t replace your own care.

**Category:** Productivity (or Accessibility) · **Privacy policy:** link to PRIVACY.md on GitHub

**Permission justifications**
- `host_permissions <all_urls>`: user chooses which sites to protect from any site; needed to read page images/videos and fetch the image bytes for on-device checking. Does nothing on non-selected sites.
- `storage`: saves the user's settings locally.
- `offscreen`: keeps the on-device model loaded; service workers are stopped after ~30s.
- Remote code: none. All code and the model ship inside the package (`wasm-unsafe-eval` is for the bundled ONNX runtime).

**Single purpose:** Blur inappropriate images and videos on user-selected websites.
## Assets (all in `store/assets/`)
| Store field | File |
|---|---|
| Store icon 128×128 (96px art + 16px padding) | `store-icon-128.png` |
| Screenshots 1280×800 (upload in order) | `screenshots/screenshot-1.jpg` … `screenshot-5.jpg` |
| Small promo tile 440×280 | `promo-small-440x280.jpg` |
| Marquee promo 1400×560 | `promo-marquee-1400x560.jpg` |

Screenshots are real captures of the built extension on a demo gallery page of generated landscapes, composed with captions.
Captions: 1 Blurred before you see it · 2 Look only if you need to · 3 Man or Woman. Your websites. · 4 Your own settings for every site · 5 Simple settings. Nothing leaves your computer.

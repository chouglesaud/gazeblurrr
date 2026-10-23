# GazeBlurrr — Setup & Usage Guide

## Install

### Option A — From the Chrome Web Store (easiest)
Search **GazeBlurrr** in the Chrome Web Store → **Add to Chrome**. *(Link will be added here once published.)*

### Option B — From a downloaded zip (no technical tools needed)
1. Go to the project's **Releases** page and download `gazeblurrr-x.y.z.zip`.
2. Unzip it. You get a folder — put it somewhere permanent (Chrome reads from it every time it starts).
3. Open Chrome and type `chrome://extensions` in the address bar.
4. Turn on **Developer mode** (top-right).
5. Click **Load unpacked** and choose the unzipped folder.
6. Click the puzzle-piece icon in Chrome’s toolbar and **pin** GazeBlurrr.

### Option C — From source (developers)
Requires [Node.js](https://nodejs.org) 18+.
```bash
git clone https://github.com/saudchougle/gazeblurrr.git
cd gazeblurrr
npm install        # downloads the model (checksum-verified) and the runtime
npm run build      # builds the extension into dist/unpacked
```
Then steps 3–6 above, choosing the **`dist/unpacked`** folder. Shortcut: `npm run dev` builds and opens Brave/Chrome/Edge with it already loaded. To build the zip for the Web Store: `npm run package` → `dist/`.

Works in Chrome 116+ and other Chromium browsers (Edge, Brave).

## Using it

**Turn a website on or off:** click the GazeBlurrr button → flip the switch. That’s all. The settings page has a list of popular sites you can switch on in one tap, and you can add any other site.

**Mode** (Man blurs women, Woman blurs men) is set once, in the settings page, for every website.

**The rest is per website.** Open GazeBlurrr from the toolbar while you're on a site: strength (*Standard* · *Strong* · *Maximum*), whether “Show” is allowed, and how long before it covers again apply to **that site only**. Sites you haven't customised use the defaults on the settings page; “Reset to default” undoes a site's own choices.

Point at any picture or video and a small icon bar appears in its corner. Hover an icon to see what it does.

- **Blurred, need to look:** 👁 *Show* for a few seconds. A countdown ring shows when it covers again; 🚫👁 *Blur again* covers it immediately. **Esc** covers everything.
- **Blurred by mistake:** ✓ *Safe – show it*. It is never blurred again.
- **Showing, but it shouldn't be:** 🚫👁 *Inappropriate – blur it*. It stays blurred, including on your next visit.

Both kinds of correction are listed under *Corrections* in settings, where you can forget them.

## Troubleshooting
| Problem | Fix |
|---|---|
| Nothing is blurred | Is the website switched on? Reload the page. |
| A page flashes blurred briefly | Normal: everything is covered while it’s checked, then safe items appear. |
| Videos | Checked about every 1.5 seconds while playing, so a scene change can show for a moment. |
| Video from another domain stays blurred | The browser won’t let any extension read it. Use ✓ *Safe – show it* if it’s fine. |
| “Missing models/detector.onnx” | You cloned the source: run `npm install`. |

## Honest limits
No detector is perfect: it can miss things and blur innocent things, drawings/cartoons are caught less reliably, and protected (DRM) video can’t be checked. GazeBlurrr is a helper for anyone who wants to guard what they see. It makes that easier. It does not replace your own care.

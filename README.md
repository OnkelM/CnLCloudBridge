# CnL Cloud Bridge

A Manifest V3 Chrome extension that intercepts Click'n'Load requests on web pages and forwards them via the **MyJDownloader cloud API** to a chosen remote JDownloader instance — including a live device-status panel with speed, state and download counters per remote JDownloader.

> **Disclaimer:** Independent third-party project, **not affiliated** with the JDownloader / MyJDownloader team or AppWork GmbH. Names "JDownloader" and "MyJDownloader" are used only to describe compatibility.

## Features

- Click'n'Load interception (`/jdcheck.js`, `/flash/add`, `/flash/addcrypted2`) on every page (`<all_urls>`, MAIN-world `fetch`/`XHR` hook).
- Client-side decryption of `crypted` + `jk` payloads via Web Crypto.
- Cloud routing through `api.jdownloader.org` to the user-picked JDownloader instance.
- Per-device status cards in the popup: live speed, jdState, finished-counter, bytes-loaded/total — polled every 4 s while the popup is open.
- Play / Pause control per remote device.
- Device name links directly into the corresponding MyJDownloader web UI.
- Settings sub-page: account info, CnL toggle, logout.

## Install (Developer Mode)

1. Clone this repository.
2. Open `chrome://extensions/` → enable Developer Mode → "Load unpacked" → select this folder.
3. Click the extension icon → log in with your MyJDownloader account.
4. Try it on a site with a Click'n'Load button.

## Build a Web-Store ZIP

```powershell
./scripts/build-zip.ps1
```

Produces `dist/cnl-cloud-bridge-<version>.zip` containing only the runtime files (`manifest.json`, `background/`, `content/`, `popup/`, `shared/`, `icons/`).

## Architecture

- **Service Worker** (`background/`) holds the MyJDownloader session, runs the device-status poller, and routes messages between popup and content scripts.
- **Content Script** runs in two pieces: `content/cnl-hook.js` (MAIN world, `document_start`) patches `fetch` / `XMLHttpRequest`; `content/cnl-bridge.js` (ISOLATED world) forwards the captured link list to the service worker via `chrome.runtime.sendMessage`.
- **Popup** is a state machine (`loggedOut` / `idle` / `settings` / `picker`) communicating with the service worker via short-lived messages and a long-living port for live stats.

Design and plan documents live under [docs/superpowers/](docs/superpowers/).

## Privacy

Email and the derived authentication secrets are stored locally in `chrome.storage` only. No data is sent anywhere except to `https://api.jdownloader.org` (the official MyJDownloader cloud, operated by AppWork GmbH) for the purpose of relaying your Click'n'Load requests to your own JDownloader instance.

See [PRIVACY.md](PRIVACY.md) for the full privacy policy.

## Testing

See [docs/test-pages/manual-checklist.md](docs/test-pages/manual-checklist.md).

## License

MIT.

# Popup Refinements (Live-Status, Settings-Submenu, Geräte-Link) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erweitern des MV3-Popups um stacked Geräte-Cards mit Live-Status (Polling über `/polling/poll` solange Popup offen ist), Play/Pause-Steuerung pro Gerät, Geräte-Name als Deeplink in die MyJDownloader-Web-UI, und ein eigenes `settings`-Untermenü mit CnL-Toggle/Account-Anzeige/Logout.

**Architecture:** Service Worker hält einen Long-Living-Port `"popup"`; sobald das Popup connected, läuft alle 4 s ein Poller, der pro Gerät `pollDevice` aufruft und Stats per Port-Push (`DEVICE_STATS`) ans Popup schiebt. Das Popup bekommt einen popup-lokalen `settings`-State (nicht im SW-`buildState`), navigierbar über Zahnrad-Icon und Zurück-Pfeil. Play/Pause sind separate Message-Types, die vom SW per `withReconnectRetry` an `/downloadcontroller/start`/`pause` gehen.

**Tech Stack:** Plain ES-Module, Web Crypto, Chrome MV3 (`chrome.runtime.connect`/`onConnect` Long-Living-Port, `chrome.action`, `chrome.notifications`).

---

## File Structure

| Datei | Änderung | Verantwortung |
|---|---|---|
| `shared/format.js` | NEU | `formatBytes(n)`, `formatSpeed(bps)` — Anzeige-Helper |
| `shared/messages.js` | erweitern | + `START_DOWNLOADS`, `PAUSE_DOWNLOADS`, `DEVICE_STATS` Konstanten + `POPUP_PORT_NAME` |
| `background/myjd-api.js` | erweitern | + `pollDevice`, `startDownloads`, `pauseDownloads` |
| `background/service-worker.js` | erweitern | + Popup-Port + Poller + START/PAUSE-Cases |
| `popup/popup.html` | refactor | Idle-Header simplified; Card-Markup; neues `view-settings` |
| `popup/popup.css` | erweitern | Card-Styles + Settings-Styles + Gear-Icon |
| `popup/popup.js` | refactor + erweitern | Settings-Navigation + Port-Wiring + Stats-Updates + Play/Pause + Device-Link |

---

## Task 1: `shared/format.js` — Format-Helpers

**Files:**
- Create: `shared/format.js`

- [ ] **Step 1: Datei `shared/format.js` schreiben**

```javascript
const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const TB = GB * 1024;

export function formatBytes(n) {
  if (n == null || isNaN(n)) return "—";
  const v = Number(n);
  if (v < 0) return "—";
  if (v < KB) return `${v} B`;
  if (v < MB) return `${(v / KB).toFixed(1)} KB`;
  if (v < GB) return `${(v / MB).toFixed(1)} MB`;
  if (v < TB) return `${(v / GB).toFixed(2)} GB`;
  return `${(v / TB).toFixed(2)} TB`;
}

export function formatSpeed(bps) {
  if (bps == null || isNaN(bps)) return "—";
  const v = Number(bps);
  if (v <= 0) return "0 B/s";
  if (v < KB) return `${v} B/s`;
  if (v < MB) return `${(v / KB).toFixed(1)} KB/s`;
  if (v < GB) return `${(v / MB).toFixed(2)} MB/s`;
  return `${(v / GB).toFixed(2)} GB/s`;
}
```

- [ ] **Step 2: Statisch validieren**

```bash
node --check shared/format.js
```

Erwartung: kein Output, exit 0.

- [ ] **Step 3: Funktionaler Selftest in Node**

```bash
node -e "import('./shared/format.js').then(m => { console.assert(m.formatBytes(0) === '0 B', 'fb0'); console.assert(m.formatBytes(1023) === '1023 B', 'fb1023'); console.assert(m.formatBytes(1024) === '1.0 KB', 'fb1024'); console.assert(m.formatBytes(1500000) === '1.4 MB', 'fbMB'); console.assert(m.formatBytes(2_500_000_000) === '2.33 GB', 'fbGB'); console.assert(m.formatBytes(null) === '—', 'fbNull'); console.assert(m.formatSpeed(0) === '0 B/s', 'fs0'); console.assert(m.formatSpeed(1500) === '1.5 KB/s', 'fsKB'); console.assert(m.formatSpeed(1500000) === '1.43 MB/s', 'fsMB'); console.log('format selftest ok'); })"
```

Erwartung: `format selftest ok`, keine Assertion-Fehler.

- [ ] **Step 4: Commit**

```bash
git add shared/format.js
git commit -m "feat(shared): add formatBytes and formatSpeed helpers"
```

---

## Task 2: `shared/messages.js` — Neue Message-Konstanten

**Files:**
- Modify: `shared/messages.js`

- [ ] **Step 1: Datei vollständig ersetzen**

Aktueller Inhalt (vor der Änderung):
```javascript
export const MSG = Object.freeze({ ... });
export const POPUP_VIEW = Object.freeze({ ... });
```

Ersetze `shared/messages.js` durch:

```javascript
export const MSG = Object.freeze({
  GET_STATE: "GET_STATE",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  SET_CNL_ENABLED: "SET_CNL_ENABLED",
  REFRESH_DEVICES: "REFRESH_DEVICES",
  CNL_LINKS: "CNL_LINKS",
  GET_PENDING: "GET_PENDING",
  PICK_DEVICE: "PICK_DEVICE",
  CANCEL_PENDING: "CANCEL_PENDING",
  START_DOWNLOADS: "START_DOWNLOADS",
  PAUSE_DOWNLOADS: "PAUSE_DOWNLOADS",
  DEVICE_STATS: "DEVICE_STATS",
});

export const POPUP_VIEW = Object.freeze({
  LOGGED_OUT: "loggedOut",
  IDLE: "idle",
  PICKER: "picker",
});

export const POPUP_PORT_NAME = "popup";
```

- [ ] **Step 2: Statisch validieren**

```bash
node --check shared/messages.js
```

Erwartung: exit 0.

- [ ] **Step 3: Export-Smoke-Test**

```bash
node -e "import('./shared/messages.js').then(m => { console.assert(m.MSG.START_DOWNLOADS === 'START_DOWNLOADS', 'start'); console.assert(m.MSG.PAUSE_DOWNLOADS === 'PAUSE_DOWNLOADS', 'pause'); console.assert(m.MSG.DEVICE_STATS === 'DEVICE_STATS', 'stats'); console.assert(m.POPUP_PORT_NAME === 'popup', 'port'); console.log('messages ok'); })"
```

Erwartung: `messages ok`.

- [ ] **Step 4: Commit**

```bash
git add shared/messages.js
git commit -m "feat(shared): add START_DOWNLOADS/PAUSE_DOWNLOADS/DEVICE_STATS + POPUP_PORT_NAME"
```

---

## Task 3: API-Wrappers `pollDevice`, `startDownloads`, `pauseDownloads`

**Files:**
- Modify: `background/myjd-api.js` (append exports)

- [ ] **Step 1: Drei Wrapper an `background/myjd-api.js` ans Ende anhängen**

Direkt nach dem letzten Export (`addLinks`) anhängen:

```javascript

export async function pollDevice(session, deviceId) {
  const params = [{ jdState: true, aggregatedNumbers: true }];
  return deviceCall(session, deviceId, "/polling/poll", params);
}

export async function startDownloads(session, deviceId) {
  return deviceCall(session, deviceId, "/downloadcontroller/start", []);
}

export async function pauseDownloads(session, deviceId, paused) {
  return deviceCall(session, deviceId, "/downloadcontroller/pause", [!!paused]);
}
```

- [ ] **Step 2: Statisch validieren**

```bash
node --check background/myjd-api.js
```

Erwartung: exit 0.

- [ ] **Step 3: Verifizieren, dass die Datei jetzt 11 Exporte hat**

```bash
grep -E "^export " background/myjd-api.js
```

Erwartung — exakt diese 11 Zeilen in dieser Reihenfolge:
```
export class MyJdApiError extends Error {
export class MyJdSession {
export async function connect(session, email, password) {
export async function connectWithSecret(session) {
export async function reconnect(session) {
export async function disconnect(session) {
export async function listDevices(session) {
export async function deviceCall(session, deviceId, action, params = []) {
export async function addLinks(session, deviceId, { links, sourceUrl, autostart = false, packageName = null, passwords = "" }) {
export async function pollDevice(session, deviceId) {
export async function startDownloads(session, deviceId) {
export async function pauseDownloads(session, deviceId, paused) {
```

(12 Zeilen total — die `connectWithSecret`-Zeile aus dem Polish-Pass zählt mit.)

- [ ] **Step 4: Commit**

```bash
git add background/myjd-api.js
git commit -m "feat(api): add pollDevice/startDownloads/pauseDownloads wrappers"
```

- [ ] **Step 5: Pending manuelle Verifikation (User-Schritt)**

In SW-Konsole nach Login:
```javascript
// (ersetze DEVICE_ID mit einer echten ID aus der Geräteliste)
const sw = chrome.runtime.getURL ? globalThis : self;
chrome.runtime.sendMessage({ type: "REFRESH_DEVICES" }, console.log);
// Dann pollDevice direkt testen — dafür muss ein Smoke-Hook in den SW, das machen wir in Task 4.
```

Erwartung: pollDevice/startDownloads/pauseDownloads sind verfügbar — funktionaler Live-Test folgt mit Task 4.

---

## Task 4: Service Worker — Popup-Port + Poller-Infrastruktur

**Files:**
- Modify: `background/service-worker.js`

- [ ] **Step 1: Imports erweitern**

In `background/service-worker.js` die existierende `myjd-api.js`-Import-Zeile erweitern. Aktuell:

```javascript
import {
  MyJdSession,
  connect,
  connectWithSecret,
  reconnect,
  disconnect,
  listDevices,
  addLinks,
  MyJdApiError,
} from "./myjd-api.js";
```

Ersetzen durch:

```javascript
import {
  MyJdSession,
  connect,
  connectWithSecret,
  reconnect,
  disconnect,
  listDevices,
  addLinks,
  pollDevice,
  startDownloads,
  pauseDownloads,
  MyJdApiError,
} from "./myjd-api.js";
```

Und die existierende `messages.js`-Import-Zeile:

```javascript
import { MSG, POPUP_VIEW } from "../shared/messages.js";
```

ersetzen durch:

```javascript
import { MSG, POPUP_VIEW, POPUP_PORT_NAME } from "../shared/messages.js";
```

- [ ] **Step 2: Poller-State-Variablen oben im Modul ergänzen**

In `background/service-worker.js`, direkt **unter** der Zeile `const DEVICE_CACHE_MS = 60_000;` einfügen:

```javascript
const POLL_INTERVAL_MS = 4000;
const DEVICE_FAIL_THRESHOLD = 3;
const NOTIFY_FAIL_INTERVAL_MS = 60_000;
let popupPort = null;
let pollerTimer = null;
const deviceFailCounts = new Map();
let lastFailNotifyAt = 0;
```

- [ ] **Step 3: Poller-Funktionen direkt vor `chrome.runtime.onMessage.addListener` einfügen**

```javascript
async function tickPoll() {
  if (!popupPort) return;
  if (!session?.sessionToken) {
    try { await ensureSessionAlive(); } catch { return; }
  }
  let devices;
  try {
    devices = await getDevices();
  } catch {
    return;
  }
  await Promise.allSettled(
    devices.map((d) =>
      withReconnectRetry(() => pollDevice(session, d.id))
        .then((stats) => {
          deviceFailCounts.delete(d.id);
          popupPort?.postMessage({ type: MSG.DEVICE_STATS, deviceId: d.id, stats });
        })
        .catch((err) => {
          const n = (deviceFailCounts.get(d.id) ?? 0) + 1;
          deviceFailCounts.set(d.id, n);
          popupPort?.postMessage({
            type: MSG.DEVICE_STATS,
            deviceId: d.id,
            error: err.message ?? String(err),
            failCount: n,
          });
          if (n >= DEVICE_FAIL_THRESHOLD && Date.now() - lastFailNotifyAt > NOTIFY_FAIL_INTERVAL_MS) {
            lastFailNotifyAt = Date.now();
            notify(`Status für ${d.name ?? d.id} nicht abrufbar`);
          }
        }),
    ),
  );
}

function startPolling() {
  if (pollerTimer) return;
  tickPoll();
  pollerTimer = setInterval(tickPoll, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (pollerTimer) {
    clearInterval(pollerTimer);
    pollerTimer = null;
  }
  deviceFailCounts.clear();
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== POPUP_PORT_NAME) return;
  popupPort = port;
  startPolling();
  port.onDisconnect.addListener(() => {
    if (popupPort === port) {
      popupPort = null;
      stopPolling();
    }
  });
});
```

- [ ] **Step 4: Statisch validieren**

```bash
node --check background/service-worker.js
```

Erwartung: exit 0.

- [ ] **Step 5: Manueller Smoke-Test (User-Schritt)**

1. `chrome://extensions/` → Reload.
2. Eingeloggt sein (sonst erst per Popup einloggen).
3. SW-Konsole öffnen.
4. In einem zweiten Tab `chrome://extensions/` → Klick auf Extension-Icon, Popup geht auf.
5. Erwartung: in der SW-Konsole **kein** Fehler. Es kommen aber noch keine `DEVICE_STATS`-Pushes ans Popup, weil das Popup den Port noch nicht öffnet (Task 8). Der Smoke-Test reduziert sich auf "kein Crash, `chrome.runtime.onConnect`-Handler ist registriert".

Optional: in der SW-Konsole testen:
```javascript
chrome.runtime.connect({ name: "popup" });
```

Erwartung: SW-Log ggf. `DEVICE_STATS`-Iteration startet. (Sicht-Effekt: Geräte-Stats werden alle 4 s an den ad-hoc Port gepusht.) Wenn das ohne Crash läuft, ist Task 4 OK.

- [ ] **Step 6: Commit**

```bash
git add background/service-worker.js
git commit -m "feat(sw): add popup-port poller for /polling/poll device stats"
```

---

## Task 5: Service Worker — Play/Pause-Cases

**Files:**
- Modify: `background/service-worker.js`

- [ ] **Step 1: Zwei neue `case`-Branches im Message-Switch ergänzen**

In `background/service-worker.js`, im bestehenden `chrome.runtime.onMessage.addListener`-Block. Direkt **vor** dem `case MSG.GET_PENDING:` einfügen (also nach `case MSG.CNL_LINKS:`):

```javascript
        case MSG.START_DOWNLOADS:
          await ensureSessionAlive();
          await withReconnectRetry(() => startDownloads(session, msg.deviceId));
          sendResponse({ ok: true });
          break;
        case MSG.PAUSE_DOWNLOADS:
          await ensureSessionAlive();
          await withReconnectRetry(() => pauseDownloads(session, msg.deviceId, msg.paused));
          sendResponse({ ok: true });
          break;
```

Die Reihenfolge ist nicht semantisch wichtig, aber für Konsistenz: `GET_STATE`, `LOGIN`, `LOGOUT`, `SET_CNL_ENABLED`, `REFRESH_DEVICES`, `CNL_LINKS`, `START_DOWNLOADS`, `PAUSE_DOWNLOADS`, `GET_PENDING`, `PICK_DEVICE`, `CANCEL_PENDING`, `default`.

- [ ] **Step 2: Statisch validieren**

```bash
node --check background/service-worker.js
```

Erwartung: exit 0.

- [ ] **Step 3: Verify `case MSG.*`-Reihenfolge**

```bash
grep -nE "case MSG\." background/service-worker.js
```

Erwartung: 11 Zeilen in dieser Reihenfolge: `GET_STATE`, `LOGIN`, `LOGOUT`, `SET_CNL_ENABLED`, `REFRESH_DEVICES`, `CNL_LINKS`, `START_DOWNLOADS`, `PAUSE_DOWNLOADS`, `GET_PENDING`, `PICK_DEVICE`, `CANCEL_PENDING`.

- [ ] **Step 4: Commit**

```bash
git add background/service-worker.js
git commit -m "feat(sw): handle START_DOWNLOADS / PAUSE_DOWNLOADS messages"
```

---

## Task 6: Popup HTML/CSS Refactor

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.css`

- [ ] **Step 1: `popup/popup.html` komplett ersetzen**

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <div id="root">
      <section id="view-loggedOut" hidden>
        <header class="brand">MyJDownloader</header>
        <form id="login-form" autocomplete="on">
          <label>Email
            <input type="email" name="email" required autocomplete="username" />
          </label>
          <label>Passwort
            <input type="password" name="password" required autocomplete="current-password" />
          </label>
          <button type="submit" id="login-btn">Login</button>
          <p class="error" id="login-error" hidden></p>
        </form>
      </section>

      <section id="view-idle" hidden>
        <header class="bar">
          <span class="brand-line">MyJDownloader</span>
          <button class="icon-btn" id="settings-open" title="Einstellungen">⚙</button>
        </header>
        <div class="row">
          <div class="row-head">
            <span>Geräte</span>
            <button class="link-btn" id="refresh-devices-btn">Aktualisieren</button>
          </div>
          <ul class="device-cards" id="devices-list"></ul>
          <p class="empty" id="devices-empty" hidden>Keine Geräte verbunden.</p>
          <p class="error" id="devices-error" hidden></p>
        </div>
      </section>

      <section id="view-settings" hidden>
        <header class="bar">
          <span class="brand-line">MyJDownloader</span>
          <button class="icon-btn" id="settings-back" title="Zurück">←</button>
        </header>
        <div class="row">
          <div class="account">
            <span class="ico">👤</span>
            <span id="settings-email"></span>
          </div>
        </div>
        <div class="row">
          <label class="toggle">
            <input type="checkbox" id="cnl-toggle-settings" />
            <span>Click'n'Load via MyJDownloader</span>
          </label>
          <p class="hint">Fängt lokale Click'n'Load-Aufrufe ab und sendet sie über MyJDownloader an verbundene JDownloader.</p>
        </div>
        <div class="row">
          <button class="logout-btn" id="settings-logout">Logout</button>
        </div>
      </section>

      <section id="view-picker" hidden>
        <header class="bar">
          <span class="email" id="picker-email"></span>
          <button class="icon-btn" id="picker-cancel" title="Abbrechen">✕</button>
        </header>
        <div class="row">
          <div class="row-head"><span>Click'n'Load</span><span id="picker-count"></span></div>
          <ul class="urls" id="picker-urls"></ul>
        </div>
        <div class="row">
          <div class="row-head"><span>An welches Gerät?</span></div>
          <ul class="devices clickable" id="picker-devices"></ul>
          <p class="empty" id="picker-empty" hidden>Keine Geräte verbunden.</p>
        </div>
        <p class="error" id="picker-error" hidden></p>
      </section>

      <section id="view-loading">Lade…</section>
    </div>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: `popup/popup.css` ans Ende um Card- + Settings-Styles erweitern**

An das **Ende** der existierenden `popup/popup.css` (ohne bestehende Regeln zu ändern) anhängen:

```css
.brand-line { color: var(--accent); font-weight: 700; letter-spacing: 0.5px; }
.bar .brand-line { color: var(--accent); }

.device-cards { list-style: none; margin: 0; padding: 0; }
.device-card { background: #fff; border: 1px solid #b8d6d6; border-radius: 6px; margin-bottom: 8px; overflow: hidden; }
.device-card-head { display: flex; justify-content: space-between; align-items: center; padding: 8px 10px; border-bottom: 1px solid #e0eded; }
.device-name { color: var(--bg); font-weight: 600; text-decoration: none; font-size: 14px; }
.device-name:hover { text-decoration: underline; }
.device-name .ext-arrow { font-size: 11px; opacity: 0.7; margin-left: 2px; }
.play-pause { background: #e0eded; border: 0; border-radius: 4px; padding: 4px 10px; cursor: pointer; font-size: 14px; }
.play-pause:hover { background: #b8d6d6; }
.play-pause[disabled] { opacity: 0.5; cursor: progress; }

.device-card-stats { display: flex; gap: 12px; padding: 6px 10px; font-size: 12px; color: var(--muted); flex-wrap: wrap; }
.device-card-stats .stat { display: inline-flex; align-items: center; gap: 4px; }
.device-card-stats .stat.muted { opacity: 0.4; }
.device-card-stats .ico { font-size: 11px; }
.device-card-stats .val { color: var(--text); }
.device-card-stats .stat.state .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--gray); display: inline-block; }
.device-card-stats .stat.state .dot.running { background: var(--green); }
.device-card-stats .stat.state .dot.paused { background: var(--accent); }
.device-card-stats .stat.state .dot.idle { background: var(--gray); }
.device-card-stats .stat.state .dot.stopped { background: var(--gray); }

.account { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text); }
.account .ico { font-size: 16px; }
.logout-btn { width: 100%; padding: 10px; background: #b91c1c; color: #fff; border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
.logout-btn:hover { background: #991b1b; }
```

- [ ] **Step 3: HTML im Browser laden + visuell verifizieren (User-Schritt)**

Reload + Popup öffnen — Idle-View darf jetzt **leer** wirken (keine Email/Toggle/Logout mehr im Header), Geräte-Card-Liste ist leer (das JS-Wiring kommt in Task 7+8). Beim Klick auf Settings-Zahnrad oder Zurück-Pfeil passiert noch nichts (auch JS-Wiring fehlt).

Erwartung an dieser Stelle: kein Layout-Bruch, keine CSS-Fehler in DevTools-Konsole.

- [ ] **Step 4: Commit**

```bash
git add popup/popup.html popup/popup.css
git commit -m "feat(popup): refactor HTML for stacked device cards + settings sub-page"
```

---

## Task 7: Popup JS — Settings-Navigation + popup-lokaler State

**Files:**
- Modify: `popup/popup.js` (komplette Datei ersetzen — Patch-Listing wäre zu zerfasert)

- [ ] **Step 1: `popup/popup.js` komplett ersetzen**

Hinweis: Diese Version richtet bereits **alle** Event-Handler ein (Settings, Login, Logout, CnL-Toggle, Picker, Refresh) und einen `view`-Switch der den popup-lokalen `settings`-State kennt. Live-Stats und Play/Pause bleiben hier noch ohne Wirkung — das Wiring dafür ergänzt Task 8 und Task 9.

```javascript
import { MSG, POPUP_VIEW, POPUP_PORT_NAME } from "../shared/messages.js";
import { formatBytes, formatSpeed } from "../shared/format.js";

const VIEW_SETTINGS = "settings";

const views = {
  [POPUP_VIEW.LOGGED_OUT]: document.getElementById("view-loggedOut"),
  [POPUP_VIEW.IDLE]: document.getElementById("view-idle"),
  [POPUP_VIEW.PICKER]: document.getElementById("view-picker"),
  [VIEW_SETTINGS]: document.getElementById("view-settings"),
};
const loadingView = document.getElementById("view-loading");

let currentPendingId = null;
let currentEmail = "";
let currentCnlEnabled = true;
let lastIdleState = null;
let inSettings = false;

function showView(name) {
  loadingView.hidden = true;
  for (const v of Object.values(views)) v.hidden = true;
  views[name].hidden = false;
}

function showLoading() {
  for (const v of Object.values(views)) v.hidden = true;
  loadingView.hidden = false;
}

function send(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function refreshState() {
  showLoading();
  const state = await send({ type: MSG.GET_STATE });
  render(state);
}

function render(state) {
  if (!state) return;
  currentPendingId = state?.pending?.id ?? null;
  if (state.view === POPUP_VIEW.LOGGED_OUT) {
    inSettings = false;
    showView(POPUP_VIEW.LOGGED_OUT);
    const errEl = document.getElementById("login-error");
    if (state.error) {
      errEl.textContent = state.error;
      errEl.hidden = false;
    } else {
      errEl.hidden = true;
    }
  } else if (state.view === POPUP_VIEW.IDLE) {
    lastIdleState = state;
    currentEmail = state.email ?? "";
    currentCnlEnabled = state.cnlEnabled !== false;
    if (inSettings) {
      renderSettings();
    } else {
      renderIdle(state);
    }
  } else if (state.view === POPUP_VIEW.PICKER) {
    inSettings = false;
    renderPicker(state);
  }
}

function isDeviceOnline(d) {
  if (typeof d.status === "string") return !/offline/i.test(d.status);
  if (typeof d.online === "boolean") return d.online;
  if (typeof d.connected === "boolean") return d.connected;
  return true;
}

function deviceLink(deviceId) {
  return `https://my.jdownloader.org/?deviceId=${encodeURIComponent(deviceId)}#webinterface:downloads`;
}

function renderIdle(state) {
  showView(POPUP_VIEW.IDLE);
  const list = document.getElementById("devices-list");
  const empty = document.getElementById("devices-empty");
  const errEl = document.getElementById("devices-error");
  list.innerHTML = "";
  if (state.offline) {
    errEl.textContent = "Offline — keine Verbindung zur API.";
    errEl.hidden = false;
    empty.hidden = true;
    return;
  }
  errEl.hidden = true;
  if (!state.devices?.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const d of state.devices) {
    list.appendChild(buildDeviceCard(d));
  }
}

function buildDeviceCard(d) {
  const li = document.createElement("li");
  li.className = "device-card";
  li.dataset.deviceId = d.id;
  if (!isDeviceOnline(d)) li.dataset.offline = "true";

  const head = document.createElement("header");
  head.className = "device-card-head";
  const a = document.createElement("a");
  a.className = "device-name";
  a.href = deviceLink(d.id);
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = d.name ?? d.id;
  const arrow = document.createElement("span");
  arrow.className = "ext-arrow";
  arrow.textContent = "↗";
  a.appendChild(document.createTextNode(" "));
  a.appendChild(arrow);
  head.appendChild(a);
  const btn = document.createElement("button");
  btn.className = "play-pause";
  btn.dataset.state = "idle";
  btn.textContent = "▶";
  head.appendChild(btn);
  li.appendChild(head);

  const stats = document.createElement("div");
  stats.className = "device-card-stats muted-all";
  stats.innerHTML = `
    <span class="stat speed"><span class="ico">⏱</span><span class="val">—</span></span>
    <span class="stat state"><span class="dot idle"></span><span class="val">—</span></span>
    <span class="stat finished"><span class="ico">✓</span><span class="val">—</span></span>
    <span class="stat bytes"><span class="ico">📥</span><span class="val">—</span></span>
  `;
  li.appendChild(stats);

  return li;
}

function renderSettings() {
  inSettings = true;
  showView(VIEW_SETTINGS);
  document.getElementById("settings-email").textContent = currentEmail;
  document.getElementById("cnl-toggle-settings").checked = currentCnlEnabled;
}

function renderPicker(state) {
  showView(POPUP_VIEW.PICKER);
  document.getElementById("picker-email").textContent = state.email ?? "";
  const urls = state.pending?.urls ?? [];
  document.getElementById("picker-count").textContent = `${urls.length} Link${urls.length === 1 ? "" : "s"}`;
  const ulUrls = document.getElementById("picker-urls");
  ulUrls.innerHTML = "";
  for (const u of urls.slice(0, 3)) {
    const li = document.createElement("li");
    li.textContent = u;
    ulUrls.appendChild(li);
  }
  if (urls.length > 3) {
    const li = document.createElement("li");
    li.className = "more";
    li.textContent = `+${urls.length - 3} weitere`;
    ulUrls.appendChild(li);
  }
  const ulDev = document.getElementById("picker-devices");
  const empty = document.getElementById("picker-empty");
  const errEl = document.getElementById("picker-error");
  ulDev.innerHTML = "";
  errEl.hidden = true;
  if (!state.devices?.length) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  for (const d of state.devices) {
    const li = document.createElement("li");
    const isOnline = isDeviceOnline(d);
    li.className = "device " + (isOnline ? "online" : "offline");
    li.dataset.deviceId = d.id;
    const dot = document.createElement("span");
    dot.className = "dot " + (isOnline ? "online" : "offline");
    li.appendChild(dot);
    const nm = document.createElement("span");
    nm.className = "name";
    nm.textContent = d.name ?? d.id;
    li.appendChild(nm);
    ulDev.appendChild(li);
  }
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const btn = document.getElementById("login-btn");
  btn.disabled = true;
  const errEl = document.getElementById("login-error");
  errEl.hidden = true;
  const res = await send({ type: MSG.LOGIN, email: fd.get("email"), password: fd.get("password") });
  btn.disabled = false;
  if (res?.error) {
    errEl.textContent = `Login fehlgeschlagen: ${res.error}`;
    errEl.hidden = false;
    return;
  }
  render(res);
});

document.getElementById("settings-open").addEventListener("click", () => {
  inSettings = true;
  renderSettings();
});

document.getElementById("settings-back").addEventListener("click", () => {
  inSettings = false;
  if (lastIdleState) renderIdle(lastIdleState);
  else refreshState();
});

document.getElementById("settings-logout").addEventListener("click", async () => {
  inSettings = false;
  const res = await send({ type: MSG.LOGOUT });
  render(res);
});

document.getElementById("cnl-toggle-settings").addEventListener("change", async (e) => {
  currentCnlEnabled = e.target.checked;
  await send({ type: MSG.SET_CNL_ENABLED, enabled: e.target.checked });
});

document.getElementById("refresh-devices-btn").addEventListener("click", async () => {
  const btn = document.getElementById("refresh-devices-btn");
  btn.disabled = true;
  const res = await send({ type: MSG.REFRESH_DEVICES });
  btn.disabled = false;
  if (res?.error) {
    const errEl = document.getElementById("devices-error");
    errEl.textContent = res.error;
    errEl.hidden = false;
    return;
  }
  await refreshState();
});

document.getElementById("picker-devices").addEventListener("click", async (e) => {
  const li = e.target.closest("li.device");
  if (!li) return;
  if (li.classList.contains("offline")) return;
  const requestId = currentPendingId;
  const deviceId = li.dataset.deviceId;
  const errEl = document.getElementById("picker-error");
  errEl.hidden = true;
  li.classList.add("sending");
  const res = await send({ type: MSG.PICK_DEVICE, requestId, deviceId });
  if (res?.error) {
    li.classList.remove("sending");
    errEl.textContent = res.error;
    errEl.hidden = false;
    return;
  }
  window.close();
});

document.getElementById("picker-cancel").addEventListener("click", async () => {
  if (currentPendingId) await send({ type: MSG.CANCEL_PENDING, requestId: currentPendingId });
  window.close();
});

refreshState();
```

- [ ] **Step 2: Statisch validieren**

```bash
node --check popup/popup.js
```

Erwartung: exit 0.

- [ ] **Step 3: Manueller Smoke-Test (User-Schritt)**

1. `chrome://extensions/` → Reload + hide.cx-Tab schließen (Vorsicht: Content-Script-Cache).
2. Popup öffnen.
3. Eingeloggt: Idle-View zeigt Geräte-Card mit Name + Pfeil und ▶-Button. Klick auf den Geräte-Namen öffnet `my.jdownloader.org/?deviceId=...#webinterface:downloads` in neuem Tab.
4. Klick auf ⚙ → Settings-View; Email + CnL-Toggle + Logout sichtbar.
5. Klick "← Zurück" → wieder Idle.
6. Toggle umlegen → SW-Konsole zeigt `chrome.storage.local.cnlEnabled` flippt (verifizierbar mit `chrome.storage.local.get("cnlEnabled", console.log)`).
7. Klick auf Logout → Login-Form.
8. Stats in der Card bleiben "—" (Placeholder), Play/Pause-Knopf hat keine Wirkung — beides kommt in Tasks 8 + 9.

- [ ] **Step 4: Commit**

```bash
git add popup/popup.js
git commit -m "feat(popup): add settings sub-page navigation + device-card scaffold"
```

---

## Task 8: Popup JS — Live-Stats über Port empfangen

**Files:**
- Modify: `popup/popup.js`

- [ ] **Step 1: Port-Wiring + Stats-Render-Funktion ergänzen**

In `popup/popup.js`, **direkt vor** der finalen Zeile `refreshState();` (am Dateiende), folgenden Block einfügen:

```javascript
let port = null;
try {
  port = chrome.runtime.connect({ name: POPUP_PORT_NAME });
  port.onMessage.addListener((msg) => {
    if (msg?.type !== MSG.DEVICE_STATS) return;
    if (msg.error) {
      applyDeviceStatsError(msg.deviceId);
      return;
    }
    applyDeviceStats(msg.deviceId, msg.stats);
  });
  window.addEventListener("unload", () => {
    try { port.disconnect(); } catch {}
  });
} catch (e) {
  console.warn("Popup port connect failed:", e);
}

function findCard(deviceId) {
  return document.querySelector(`#devices-list li.device-card[data-device-id="${CSS.escape(deviceId)}"]`);
}

function applyDeviceStats(deviceId, raw) {
  const card = findCard(deviceId);
  if (!card) return;
  const stats = card.querySelector(".device-card-stats");
  if (!stats) return;
  stats.classList.remove("muted-all");

  const agg = raw?.aggregatedNumbers ?? raw ?? {};
  const jdState = raw?.jdState ?? raw?.state ?? "IDLE";

  const speed = agg.speed ?? 0;
  const finished = agg.finishedLinks ?? agg.finished ?? agg.linksFinished ?? 0;
  const loaded = agg.bytesLoaded ?? agg.loadedBytes ?? 0;
  const total = agg.bytesTotal ?? agg.totalBytes ?? 0;

  setStatVal(card, "speed", formatSpeed(speed));
  setStateDot(card, jdState);
  setStatVal(card, "finished", String(finished));
  setStatVal(card, "bytes", `${formatBytes(loaded)} / ${formatBytes(total)}`);

  const btn = card.querySelector(".play-pause");
  if (btn && !btn.disabled) {
    const running = String(jdState).toUpperCase() === "RUNNING";
    btn.dataset.state = running ? "running" : "paused";
    btn.textContent = running ? "⏸" : "▶";
  }
}

function applyDeviceStatsError(deviceId) {
  const card = findCard(deviceId);
  if (!card) return;
  const stats = card.querySelector(".device-card-stats");
  if (stats) stats.classList.add("muted-all");
}

function setStatVal(card, key, value) {
  const el = card.querySelector(`.stat.${key} .val`);
  if (el) el.textContent = value;
}

function setStateDot(card, jdState) {
  const dot = card.querySelector(".stat.state .dot");
  const val = card.querySelector(".stat.state .val");
  if (!dot || !val) return;
  const s = String(jdState).toUpperCase();
  dot.className = "dot " + (s === "RUNNING" ? "running" : s === "PAUSED" ? "paused" : "idle");
  val.textContent = s;
}
```

- [ ] **Step 2: CSS-Hilfsklasse `.muted-all` ergänzen**

In `popup/popup.css` ans Ende anhängen:

```css
.device-card-stats.muted-all .val,
.device-card-stats.muted-all .ico { opacity: 0.4; }
.device-card-stats.muted-all .stat.state .dot { opacity: 0.4; }
```

- [ ] **Step 3: Statisch validieren**

```bash
node --check popup/popup.js
```

Erwartung: exit 0.

- [ ] **Step 4: Manueller End-to-End-Test (User-Schritt)**

1. `chrome://extensions/` → Reload.
2. Popup öffnen → innerhalb von ~4 Sekunden zeigt die Card live:
   - Speed (in B/s/KB/s/MB/s)
   - State-Dot + Text (RUNNING/PAUSED/IDLE)
   - Finished-Counter
   - Bytes-Loaded / Bytes-Total
3. JDownloader auf dem Gerät tatsächlich beschäftigen (Download starten) → Speed + Bytes ändern sich live in der Card alle 4 s.
4. Popup schließen → in der SW-Konsole sollte das Polling-Log aufhören (in `chrome://serviceworker-internals` `Inspect` der Extension-SW: "stopPolling"-Verhalten — pollerTimer ist `null`).

Falls Felder als "—" bleiben oder unbekannt sind, in der SW-Konsole loggen:
```javascript
// (in SW-Konsole, nach Reload, mit offenem Popup:)
// — schauen welche Felder die API tatsächlich liefert; die Mapping-Liste in applyDeviceStats kommentieren
```

- [ ] **Step 5: Commit**

```bash
git add popup/popup.js popup/popup.css
git commit -m "feat(popup): live device stats via port-pushed DEVICE_STATS messages"
```

---

## Task 9: Popup JS — Play/Pause-Steuerung

**Files:**
- Modify: `popup/popup.js`

- [ ] **Step 1: Click-Handler für `.play-pause`-Button via Event-Delegation einfügen**

In `popup/popup.js`, **direkt nach** dem `refresh-devices-btn`-Handler (vor `picker-devices`-Handler), folgenden Block einfügen:

```javascript
document.getElementById("devices-list").addEventListener("click", async (e) => {
  const btn = e.target.closest("button.play-pause");
  if (!btn) return;
  const card = btn.closest("li.device-card");
  if (!card) return;
  const deviceId = card.dataset.deviceId;
  const wasRunning = btn.dataset.state === "running";
  btn.disabled = true;
  const prevText = btn.textContent;
  btn.textContent = wasRunning ? "▶" : "⏸";
  const msgType = wasRunning ? MSG.PAUSE_DOWNLOADS : MSG.START_DOWNLOADS;
  const payload = wasRunning
    ? { type: msgType, deviceId, paused: true }
    : { type: msgType, deviceId };
  const res = await send(payload);
  btn.disabled = false;
  if (res?.error) {
    btn.textContent = prevText;
    chrome.runtime.sendMessage({ type: "_NOOP" });
    console.error("play/pause failed:", res.error);
  }
});
```

- [ ] **Step 2: Statisch validieren**

```bash
node --check popup/popup.js
```

Erwartung: exit 0.

- [ ] **Step 3: Manueller Test (User-Schritt)**

1. Reload, Popup öffnen.
2. Im JDownloader auf dem Gerät einen aktiven Download bereitlegen.
3. Auf der Card ⏸ klicken (während RUNNING) → JD pausiert; State-Dot wechselt nach gelb (paused) im nächsten 4-s-Tick.
4. Auf der Card ▶ klicken (während PAUSED) → JD nimmt Downloads wieder auf; State-Dot wechselt nach grün (running) im nächsten Tick.
5. Bei API-Fehler (z. B. Gerät temporär offline): Button revertet visuell, Console zeigt Fehler.

- [ ] **Step 4: Commit**

```bash
git add popup/popup.js
git commit -m "feat(popup): wire play/pause buttons to START/PAUSE_DOWNLOADS"
```

---

## Self-Review (vor Implementation)

**Spec-Coverage:**

- ✅ Stacked Geräte-Cards mit Live-Status: Tasks 6 + 7 (Card-Markup) + 8 (Stats-Updates).
- ✅ Polling alle 4 s nur bei offenem Popup: Task 4 (`onConnect`/`onDisconnect`).
- ✅ Play/Pause-Button: Tasks 5 (SW-Endpoints) + 9 (Popup-Handler).
- ✅ Geräte-Name als Deeplink: Task 7 (`deviceLink()` + `<a>`).
- ✅ Settings-Subpage über Zahnrad: Task 6 (HTML) + 7 (Navigation + Logout/Toggle/Email).
- ✅ Header-Vereinfachung in Idle (nur Brand + Zahnrad): Task 6.
- ✅ Email/Logout/CnL-Toggle wandern aus Idle in Settings: Task 7 (Idle-Render zeigt sie nicht mehr).

**Placeholder-Scan:** keine "TBD"/"TODO"/"später"-Marker. Alle Code-Blöcke vollständig, alle Schritte testbar.

**Type-Konsistenz:**
- `MSG.DEVICE_STATS` einheitlich SW (Task 4) ↔ Popup (Task 8).
- `MSG.START_DOWNLOADS`/`PAUSE_DOWNLOADS` SW-Cases (Task 5) ↔ Popup-Handler (Task 9).
- `POPUP_PORT_NAME = "popup"`: SW-`onConnect`-Filter (Task 4) ↔ Popup-`runtime.connect`-Param (Task 8).
- `formatBytes`/`formatSpeed`: definiert in `shared/format.js` (Task 1), importiert in Popup (Task 7) — `formatSpeed` aktiv genutzt erst in Task 8.
- `data-device-id`-Attribut: gesetzt in Card-Build (Task 7) ↔ gelesen in `findCard` (Task 8) und im Click-Handler (Task 9).
- `pollDevice`/`startDownloads`/`pauseDownloads`: Signaturen Task 3 ↔ Aufrufer Tasks 4 + 5.

**Offene Punkte aus der Spec (bewusst nicht im Plan adressiert):**
- `/downloadcontroller/pause` Boolean-Param-Annahme: in Task 3 mit `[!!paused]` belegt; falls die echte API ein anderes Format erwartet, wird das beim Live-Test sichtbar und im Wrapper nachjustiert.
- Feldnamen aus aggregatedNumbers (`finishedLinks` vs. `finished` vs. `linksFinished`): in Task 8 mit Fallback-Kette belegt — falls die echte API einen weiteren Namen nutzt, in der SW-Konsole loggen und einfügen.

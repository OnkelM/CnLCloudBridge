# Popup-Refinements (Live-Status, Settings-Submenu, Geräte-Link) — Design

**Datum:** 2026-05-06
**Status:** Entwurf, Iteration 2 nach MVP

## Hintergrund

Der MVP (`feature/mvp-implementation`) liefert Login, Geräteliste mit Online-Punkt, CnL-Abfangen, Picker, `addLinks`. Diese Iteration verfeinert das Popup auf das Niveau der alten MV2-Extension: pro Gerät eine Card mit Live-Status (Speed, Verbindungs-State, finished-Counter, Bytes-Loaded/Total), Play/Pause-Steuerung, Geräte-Name als Deeplink in die MyJDownloader-Web-UI, und ein eigenes Settings-Untermenü für CnL-Toggle, Account-Anzeige und Logout.

## Ziele & Nicht-Ziele

**Ziele:**

- Idle-View zeigt **stacked Cards** pro Gerät mit Live-Status (`speed`, `jdState`, `finishedLinks`, `bytesLoaded`/`bytesTotal`).
- Polling alle 4 s **nur, solange das Popup offen ist** (Akku/Traffic-Schutz; SW-Idle-Timeout darf zuschnappen, sobald Popup zu).
- **Play/Pause**-Button pro Gerät steuert `/downloadcontroller/start` bzw. `/downloadcontroller/pause`.
- **Geräte-Name** im Card-Header ist ein Link auf `https://my.jdownloader.org/?deviceId=<encoded>#webinterface:downloads`, öffnet in neuem Tab.
- Neuer Popup-State **`settings`**, navigierbar über ein **Zahnrad-Icon** im Idle-Header. Settings-View zeigt Account-Zeile (Email, read-only), CnL-Toggle und Logout-Button.
- Header-Zeile in `idle` enthält nur noch Brand + Zahnrad. Email/Logout wandern in den Settings-View.

**Nicht-Ziele (für diese Iteration):**

- Polling-Intervall-Konfigurierbarkeit.
- Standard-Gerät / "letzte Auswahl merken" für Picker.
- Account-Zeile als Link zu my.jdownloader.org/account.
- Idle-Illustration (Rakete) aus der alten Extension.
- Live-Statistiken über Pages hinaus (nur im Idle-View).
- Mehrere Polling-Intensitäten je nach jdState.

## Architektur

### Popup-State-Machine

Bestehend: `loggedOut` / `idle` / `picker`. Neu: `settings`.

```
loggedOut ──login──▶ idle ──gear─▶ settings
                      │              │
                      │     ◀─back───┘
                      │
                      └─CNL_LINKS──▶ picker
```

- `picker` ist ein "interrupt" — sobald ein CnL-Trigger reinkommt, springt jedes andere View auf `picker`. Das gilt auch für `settings`.
- `MSG.LOGOUT` aus `settings` zurück nach `loggedOut`, **nicht** nach `idle`.
- View-Source-of-Truth bleibt `buildState()` im Service Worker. Settings ist ein **Popup-only**-Zustand: das Popup merkt sich lokal, dass der User auf "Settings" geklickt hat, und rendert die Settings-View statt Idle. Der SW kennt den Settings-State nicht — `GET_STATE` antwortet weiterhin nur `idle`/`picker`/`loggedOut`.

### Service-Worker-Erweiterungen

Neue API-Wrapper in `background/myjd-api.js`:

| Funktion | Endpoint | Param |
|---|---|---|
| `pollDevice(session, deviceId)` | `/polling/poll` | `[{ jdState: true, aggregatedNumbers: true }]` |
| `startDownloads(session, deviceId)` | `/downloadcontroller/start` | `[]` |
| `pauseDownloads(session, deviceId, paused)` | `/downloadcontroller/pause` | `[paused]` |

Neue Service-Worker-Komponente: ein **Poller**, gestartet sobald der Popup-Port verbunden ist.

```js
let popupPort = null;
let pollerTimer = null;

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "popup") return;
  popupPort = port;
  startPolling();
  port.onDisconnect.addListener(() => {
    popupPort = null;
    stopPolling();
  });
});
```

`startPolling()` läuft alle 4 s (`POLL_INTERVAL_MS`):

```js
async function tickPoll() {
  if (!popupPort || !session?.sessionToken) return;
  const devices = await getDevices().catch(() => []);
  const results = await Promise.allSettled(
    devices.map((d) =>
      withReconnectRetry(() => pollDevice(session, d.id))
        .then((stats) => ({ deviceId: d.id, stats }))
        .catch((err) => ({ deviceId: d.id, error: err.message ?? String(err) })),
    ),
  );
  for (const r of results) {
    if (r.status === "fulfilled") popupPort?.postMessage({ type: MSG.DEVICE_STATS, ...r.value });
  }
}
```

Fehler-Toleranz: nach drei aufeinanderfolgenden Fehlern pro Gerät pausiert die Card visuell (graue Werte) und der SW loggt eine Warnung. Eine einzelne Notification "Status nicht abrufbar" wird höchstens alle 60 s ausgelöst.

### Neue Message-Types

In `shared/messages.js`:

```js
MSG.START_DOWNLOADS    // popup → SW: { deviceId }
MSG.PAUSE_DOWNLOADS    // popup → SW: { deviceId, paused: bool }
MSG.DEVICE_STATS       // SW → popup (port-push): { deviceId, stats? , error? }
```

Port-Name-Konstante: `POPUP_PORT_NAME = "popup"` (Konstante in `shared/messages.js`, nicht in `MSG`-Enum).

### Popup-Erweiterungen

- `popup.js` öffnet beim Boot `chrome.runtime.connect({ name: POPUP_PORT_NAME })`. Bei `port.onMessage` mit `type: MSG.DEVICE_STATS` updated es die entsprechende Card per `data-device-id`.
- `renderIdle(state)` baut die Card-Liste neu auf, wenn die Geräte-Liste sich ändert. Stats kommen separat vom Port — die Card hat Slots für `speed`, `state`, `finished`, `bytes`, die initial leer sind und bei Bedarf per innerText gefüllt werden.
- Neues Settings-View-Element + Navigation-Hooks.
- Helper-Modul `shared/format.js` mit `formatBytes(n)` (B/KB/MB/GB) und `formatSpeed(bps)` (B/s/KB/s/MB/s).

### Geräte-Card-Struktur (HTML-Skelett)

```html
<li class="device-card" data-device-id="...">
  <header class="device-card-head">
    <a class="device-name" href="…" target="_blank" rel="noopener">
      NucLoader <span class="ext-arrow">↗</span>
    </a>
    <button class="play-pause" data-state="idle">▶</button>
  </header>
  <div class="device-card-stats">
    <span class="stat speed"><span class="ico">⏱</span><span class="val">—</span></span>
    <span class="stat state"><span class="dot"></span><span class="val">—</span></span>
    <span class="stat finished"><span class="ico">✓</span><span class="val">0</span></span>
    <span class="stat bytes"><span class="ico">📥</span><span class="val">— / —</span></span>
  </div>
</li>
```

### Settings-View (HTML-Skelett)

```html
<section id="view-settings" hidden>
  <header class="bar">
    <span class="brand">MyJDownloader</span>
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
```

Im Idle-Header:

```html
<header class="bar">
  <span class="brand">MyJDownloader</span>
  <button class="icon-btn" id="settings-open" title="Einstellungen">⚙</button>
</header>
```

Email-Anzeige + Logout-Button + alter CnL-Toggle werden aus dem Idle-View **entfernt**.

## Datenfluss (Live-Status)

```
Popup-Open
  ↓ chrome.runtime.connect("popup")
SW.onConnect.addListener
  ↓ startPolling()  (Intervall 4 s)
SW: tickPoll()
  ↓ for each device: withReconnectRetry(() => pollDevice(...))
SW.popupPort.postMessage({ type: DEVICE_STATS, deviceId, stats })
  ↓
Popup.port.onMessage → DOM-Update der passenden Card

Popup-Close
  ↓ port.onDisconnect
SW: stopPolling()
```

## Fehlerbehandlung

| Situation | Verhalten |
|---|---|
| Gerät offline (poll wirft) | Card zeigt graue Werte, Status-Punkt grau, kein UI-Crash. |
| 3× Fehler in Folge auf einem Gerät | Polling für dieses Gerät pausiert; nach 60 s ein Retry; Notification (max. 1 pro 60 s extension-weit). |
| Session-Verlust beim Polling | `withReconnectRetry` versucht still ein `connectWithSecret`. Schlägt das fehl, wird Polling gestoppt; nächstes Popup-Open zeigt Logged-Out-State. |
| Play/Pause-Button-Klick + API-Fehler | Optimistischer Flip wird zurückgesetzt; Notification "Aktion fehlgeschlagen". |
| Popup geöffnet aber nicht eingeloggt | Kein Polling; Idle-View existiert in dem Zustand sowieso nicht. |

## Storage-Strategie

Keine neuen Storage-Keys. Stats sind volatil und leben ausschließlich im SW-Memory + Popup-DOM.

## Performance-Überlegungen

- Polling **nur bei offenem Popup** spart bei vielen Geräten Traffic. Bei N Geräten → 1 Roundtrip pro Gerät pro 4 s, parallel → ein 4-s-Tick-Cost ≈ N×~4 KB Payload + signed Decryption. Bei 5 Geräten ~5 KB/4 s = ~1,25 KB/s — vertretbar.
- Long-Living-Port verhindert SW-Idle-Kill so lange das Popup offen ist, was wir aktiv wollen (sonst geht das Polling kaputt).
- DOM-Updates nutzen `data-device-id`-Lookup statt full re-render — flackernde Werte bleiben aus.

## Projektstruktur-Diff

```
shared/
  format.js              # NEU: formatBytes, formatSpeed, formatDuration
  messages.js            # MODIFIED: + START_DOWNLOADS, PAUSE_DOWNLOADS,
                         #            DEVICE_STATS, POPUP_PORT_NAME
background/
  myjd-api.js            # MODIFIED: + pollDevice, startDownloads, pauseDownloads
  service-worker.js      # MODIFIED: + popupPort/poller logic, message cases
popup/
  popup.html             # MODIFIED: + view-settings, idle-header refactor,
                         #            device-card-stats markup
  popup.js               # MODIFIED: + renderSettings, renderDeviceStats,
                         #            port wiring, play/pause handlers
  popup.css              # MODIFIED: + .device-card-*, .settings, gear icon
```

## Test-Strategie

Manuelles Testen analog MVP. Test-Punkte:

- Popup öffnen → Card erscheint mit Status-Werten innerhalb von 4 s.
- Download im JDownloader starten → speed/bytes update live.
- Pause-Klick → Cabin-Button flippt, jdState in nächster Tick auf PAUSED.
- Settings-Zahnrad → Settings-View; Logout → loggedOut-View.
- Settings → CnL-Toggle aus → CnL-Trigger zeigt Notification "deaktiviert".
- Mehrere Geräte → mehrere Cards, scrollbar wenn > 3.
- Geräte-Name-Klick → öffnet my.jdownloader.org Web-UI im neuen Tab.
- Popup schließen → Polling stoppt (verifizierbar via SW-Konsole-Logs).

## Offene Punkte / Risiken

- **`/downloadcontroller/pause` Param-Format:** alter Code in `old/vendor/js/jdapi.js` zeigt typischerweise `[true]`/`[false]`. Wird beim Implementieren gegen die echte API verifiziert; falls `pause()` ohne Param `pause` und `unpause()` als separater Endpoint nötig, switchen wir die Wrapper-Signatur.
- **`finishedLinks`-Feld** im aggregatedNumbers ist unsicher dokumentiert. Falls das tatsächliche Response-Feld einen anderen Namen hat (z. B. `finished` oder `linksFinished`), passen wir das beim Implementieren an. SW-Konsolen-Log auf der Stats-Response hilft.
- **Port-Lifecycle und SW-Restart:** Wenn der SW während aktivem Polling gekillt wird (sollte nicht passieren bei aktivem Port — der hält ihn am Leben), würde Polling wieder neu starten beim nächsten Tick.

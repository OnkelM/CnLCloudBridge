# MyJDownloader Browser Extension (Manifest V3) — Design

**Datum:** 2026-05-05
**Status:** Entwurf, MVP

## Hintergrund & Motivation

Die offizielle MyJDownloader-Browser-Extension ist obsolet, weil sie nicht auf Manifest V3 migriert wurde und in aktuellen Chromium-Browsern (Chrome, Edge, Brave, Opera) nicht mehr ladbar ist. Diese Spec beschreibt eine Neuentwicklung mit MV3, die als Erstes den **Click'n'Load-Abfangmechanismus** wiederherstellt: Webseiten triggern den lokalen JDownloader-Standard auf `127.0.0.1:9666`, die Extension fängt diese Aufrufe ab und leitet sie über die MyJDownloader-Cloud-API an eine *entfernte* JDownloader-Instanz weiter.

**Referenzen:**

- Alte Extension (obsolet): https://chromewebstore.google.com/detail/myjdownloader-browser-ext/fbcohnmimjicjdomonkcbcpbpnhggkip
- MyJDownloader-API-Doku: https://my.jdownloader.org/developers/index.html

## Ziele & Nicht-Ziele

**MVP-Ziele:**

- Manifest V3 kompatibel, lädt in aktuellem Chrome/Edge.
- Email/Passwort-Login bei MyJDownloader, persistierte Auto-Reconnect-Session.
- Click'n'Load-Aufrufe (`/jdcheck.js`, `/flash/add`, `/flash/addcrypted2`) der Webseite werden abgefangen.
- Verschlüsselte CnL-Payloads (`crypted` + `jk`) werden client-seitig entschlüsselt.
- Bei jedem CnL-Trigger öffnet sich ein Geräteauswahl-Popup; nach Auswahl gehen die Links per `/linkgrabberv2/addLinks` an die gewählte Remote-JDownloader-Instanz.
- Idle-Popup mit eingeloggter Email, CnL-Toggle und Geräteliste (Name + Online-Indikator).

**Nicht-Ziele (für MVP, später möglich):**

- Live-Status pro Gerät (Geschwindigkeit, Bytes, Play/Pause).
- Clipboard-Überwachung mit Shortcut.
- Rechtsklick-Kontextmenü auf Links/Bilder/Selektion.
- Captcha-Forwarding.
- Manuelles Senden via Popup-Button (URL paste).
- Standard-Gerät als Default ohne Picker.
- Automatisierte Tests (manuelles Testen für MVP).
- Bundler/Build-Pipeline (reines ES-Module-Setup).
- `.dlc`-Container-Support via `/flash/addcrypted` (legacy).

## Architektur

### Komponenten

1. **Content Script (MAIN world, `run_at: "document_start"`)** — `cnl-hook.js`:
   - Patcht `window.fetch` und `XMLHttpRequest.prototype.open/send`.
   - Erkennt Calls an `http://127.0.0.1:9666/...`.
   - `/jdcheck.js`: liefert Fake-Response `jdownloader=true; var jcheck = true;` (sonst bleibt der CnL-Button auf der Seite deaktiviert).
   - `/flash/add`: parst form-encoded Body, extrahiert `urls`-Feld.
   - `/flash/addcrypted2`: führt `jk`-JS-Funktion aus (MAIN world hat eval-Zugriff), entschlüsselt `crypted` per Web Crypto AES-CBC mit IV = Key (CnL-Konvention).
   - Sendet `{ urls, source, passwords }` per `chrome.runtime.sendMessage` an Service Worker.
   - Antwortet der Webseite sofort mit Fake `200 OK` + Body `success`, **bevor** der API-Call durch ist.

2. **Service Worker (Background)** — `service-worker.js` + `myjd-api.js`:
   - Hält MyJDownloader-Session: `email`, `loginSecret`, `deviceSecret` (persistent), `sessiontoken`, `regaintoken`, Encryption-Keys (volatil).
   - Bei Restart: lädt Persistent-Werte aus `storage.local` und reconnectet still per `/my/connect`.
   - Empfängt CnL-Payloads vom Content Script → speichert Pending-Request unter Request-ID → öffnet Popup (`chrome.action.openPopup()` mit Window-Fallback).
   - Nach User-Auswahl im Picker: `POST /linkgrabberv2/addLinks` auf der gewählten Device-Instanz.
   - Erfolg → Browser-Notification ("N Links an &lt;Gerätename&gt; gesendet").
   - Fehler → Browser-Notification mit Fehlertext.

3. **Popup-UI** — `popup.html/js/css`:
   - **State `loggedOut`**: Login-Form (Email, Passwort, Login-Button).
   - **State `idle`**: Header mit eingeloggter Email + Logout-Icon, CnL-Toggle (ON/OFF), Liste aller verbundenen Geräte mit Online-Indikator.
   - **State `picker`**: URL-Vorschau (erste 3 Links + Gesamtanzahl) + klickbare Geräteliste; Auswahl löst Senden aus.
   - State wird beim Open vom Service Worker gequeryed.

### Datenfluss (Happy Path)

```
Webseite → fetch("http://127.0.0.1:9666/flash/addcrypted2", {...})
  ↓ MAIN-world fetch-Hook im Content Script
Content Script: jk() ausführen → AES-Key
Content Script: crypted Base64-decode → AES-CBC entschlüsseln → URL-Liste
Content Script: chrome.runtime.sendMessage({ type: "CNL_LINKS", urls, source })
Content Script: gibt Webseite synthetisches 200 OK "success" zurück
  ↓
Service Worker: speichert Pending unter requestId, ruft chrome.action.openPopup()
  ↓
Popup öffnet im picker-State, zeigt URL-Vorschau + Geräteliste
  ↓ User-Klick auf Gerät
Popup → Service Worker: { type: "PICK_DEVICE", requestId, deviceId }
  ↓
Service Worker: ggf. reconnect, dann POST /linkgrabberv2/addLinks an device
  ↓
JDownloader auf Remote-Gerät empfängt Links
Service Worker: Browser-Notification "3 Links an NAS-JD gesendet"
```

## MyJDownloader-API-Mechanik

**Schlüsselableitung** (im Service Worker, Web Crypto API):

- `loginSecret = PBKDF2-SHA256(password, salt = email + "server", iter = 256, length = 256 bit)`
- `deviceSecret = PBKDF2-SHA256(password, salt = email + "device", iter = 256, length = 256 bit)`

**Session-Aufbau:**

- `POST https://api.jdownloader.org/my/connect?email=<email>&loginSecret=<hex>` → liefert (verschlüsseltes) JSON mit `sessiontoken`, `regaintoken`.
- Server-Encryption-Key = HMAC oder Update von `loginSecret` mit `sessiontoken` (laut API-Doku).

**Signed Requests:**

- Alle Folgeaufrufe werden HMAC-SHA256-signiert; Request- und Response-Bodies sind AES-CBC-verschlüsselt mit dem Server- bzw. Device-Encryption-Key.
- Endpunkt-Format für Geräte-Calls: `https://api.jdownloader.org/t_<token>_<deviceId>/<command>`.

**Genutzte Endpoints (MVP):**

| Endpoint | Zweck |
|---|---|
| `/my/connect` | Login |
| `/my/disconnect` | Logout |
| `/my/listdevices` | Geräteliste (cached 60 s in `storage.session`) |
| `/linkgrabberv2/addLinks` (auf Device) | Links zum LinkGrabber des Geräts hinzufügen |

**Aufruf-Body für `addLinks`:**

```json
{
  "links": "url1\nurl2\nurl3",
  "autostart": false,
  "sourceUrl": "<source>",
  "packageName": null
}
```

`autostart=false` für MVP (User kann den Download im JD selbst starten); Toggle dafür ist eine spätere Erweiterung.

## Storage-Strategie

| Key | Speicher | Lebensdauer |
|---|---|---|
| `email`, `loginSecret`, `deviceSecret` | `chrome.storage.local` | persistent bis Logout |
| `cnlEnabled` (boolean) | `chrome.storage.local` | persistent |
| `sessiontoken`, `regaintoken`, Server-Encryption-Key | `chrome.storage.session` | bis Browser-Schließen |
| Cached Device-List | `chrome.storage.session` | max. 60 s |
| Pending-CnL-Requests | In-Memory im Service Worker | bis User-Auswahl oder Timeout (5 min) |
| Passwort | nirgends | nur Memory zur Schlüsselableitung, danach verworfen |

**Logout:** löscht `storage.local` + `storage.session` komplett, ruft `/my/disconnect`.

## Click'n'Load-Detail

**Abgefangene Endpunkte:**

| Endpoint | Inhalt | Aktion |
|---|---|---|
| `GET /jdcheck.js` | Heartbeat-Check | Fake-Response `jdownloader=true; var jcheck = true;` |
| `POST /flash/add` | URLs im Klartext (form-encoded) | Body parsen, `urls`-Feld auslesen |
| `POST /flash/addcrypted2` | `crypted`, `jk`, `source`, `passwords` | Entschlüsseln (siehe Architektur), URLs extrahieren |
| `POST /flash/addcrypted` (legacy `.dlc`) | DLC-Container-URL | MVP: ignorieren, im Service-Worker-Log warnen |

**Fake-Response-Verhalten:**

Damit die Webseite nicht hängt oder einen Fehler-Toast zeigt, gibt der Hook der Webseite **synchron** ein erfolgreiches `200 OK` mit Body `success` zurück. Der echte API-Call zur MyJDownloader-Cloud läuft asynchron im Service Worker. Bei Fehler erfährt der User es per Browser-Notification, **nicht** über die Webseite.

## UI-States

**Popup (eine HTML-Datei, JS-State-Machine):**

- `loggedOut` → Email-Input, Passwort-Input, Login-Button. Login-Fehler zeigen Inline-Error.
- `idle` → Header `<email> | Logout-Icon`, CnL-Toggle (groß, ON/OFF), darunter Geräte-Liste mit Name + Online-Punkt (grün/grau).
- `picker` → Header gleich, dann Block "Click'n'Load: 3 Links" + URL-Vorschau (erste 3 + "+N weitere"), dann Geräte-Liste (klickbar, Klick = Senden + Picker schließen).

State-Quelle = Service Worker; Popup queryed per `chrome.runtime.sendMessage({ type: "GET_STATE" })` beim Open.

## Fehlerbehandlung

| Situation | Verhalten |
|---|---|
| Kein Internet / API-Timeout | Browser-Notification "Keine Verbindung zu MyJDownloader"; Webseite hat bereits 200 OK bekommen, kein Hänger |
| Session-Token abgelaufen | Service Worker reconnectet still via `loginSecret` und retryt **einmal** |
| Reconnect schlägt fehl | Notification "Bitte erneut einloggen"; nächstes Popup-Open zeigt Login-State |
| Kein Gerät online | Picker zeigt Hinweis "Keine Geräte verbunden" + Refresh-Button; Pending-Request bleibt 5 min liegen |
| CnL-Toggle OFF | Hook lässt Calls passiv durch (keine Interception, keine Fake-Response) |
| Decrypt-Fehler (`addcrypted2`) | Service-Worker-Log + Notification "Link-Entschlüsselung fehlgeschlagen" |
| Pending-Request älter als 5 min | wird im Service Worker verworfen, Notification "Click'n'Load-Anfrage abgelaufen" |

## Projektstruktur

```
src/
  manifest.json
  background/
    service-worker.js     # Message-Routing, State, Popup-Trigger, addLinks-Aufruf
    myjd-api.js           # Endpoints, signed-Request-Wrapper
  content/
    cnl-hook.js           # MAIN-world fetch/XHR-Hook + Decrypt
  popup/
    popup.html
    popup.js              # State-Machine (loggedOut / idle / picker)
    popup.css
  shared/
    crypto.js             # PBKDF2, HMAC-SHA256, AES-CBC Web-Crypto-Wrapper
    messages.js           # Message-Type-Konstanten
icons/                    # 16/32/48/128 px
docs/superpowers/specs/   # Diese Spec
```

**Manifest-V3-Highlights:**

- `"manifest_version": 3`
- `"background": { "service_worker": "background/service-worker.js", "type": "module" }`
- `"content_scripts": [{ "matches": ["<all_urls>"], "js": ["content/cnl-hook.js"], "run_at": "document_start", "world": "MAIN", "all_frames": true }]`
- `"action": { "default_popup": "popup/popup.html" }`
- `"permissions": ["storage", "notifications"]`
- `"host_permissions": ["https://api.jdownloader.org/*"]`

`chrome.action.openPopup()` benötigt Chrome 127+ und ein User-Gesture-Kontext oder die `permissions: ["activeTab"]`-Pendant-Berücksichtigung; Fallback ist ein eigenständiges `chrome.windows.create` mit dem Popup im Picker-Modus, falls `openPopup` fehlschlägt.

## Build & Tooling

- **Kein Bundler** für MVP. Reines ES-Module-Setup, direkt als unpacked extension ladbar (`chrome://extensions/` → Entwicklermodus → "Entpackte Erweiterung laden").
- Web Crypto API nutzt Browser-native Crypto, keine externen Abhängigkeiten.
- Optional: ein simples `package.json` nur für Linting/Formatting (Prettier), kein Bundle-Step.

## Testing-Strategie

**MVP: manuelles Testen** — keine automatisierten Tests im ersten Wurf. Test-Punkte:

- Login mit echtem MyJDownloader-Account → Geräte-Liste erscheint.
- Browser-Restart → Auto-Reconnect funktioniert ohne erneuten Login.
- Echte CnL-Buttons (z. B. die Seite, die der User gerade testet) → Picker erscheint, Auswahl sendet erfolgreich, Notification zeigt Erfolg.
- CnL-Toggle OFF → Webseite ruft normal `127.0.0.1:9666` auf (Hook inaktiv).
- Logout → Storage geleert, nächster Open zeigt Login-State.

Automatisierte Tests (Decrypt-Pfade, API-Wrapper) folgen, sobald die Crypto-Pfade in der Praxis stabil laufen.

## Offene Punkte / Risiken

- **PBKDF2-Iterations** und **Salt-Format** der MyJDownloader-API müssen während der Implementierung gegen die Live-API verifiziert werden — Doku ist an einigen Stellen unscharf.
- **`chrome.action.openPopup()`-Verfügbarkeit**: erst ab Chrome 127 ohne Sondergenehmigungen. Wenn das in der Praxis nicht zuverlässig vom Service Worker aus aufrufbar ist, fallen wir auf `chrome.windows.create` zurück (kleines Browser-Fenster mit Picker-HTML).
- **Frame-Konflikte**: Manche CnL-Buttons triggern aus iFrames. Hook muss deshalb in `all_frames: true` injiziert werden.
- **Rate-Limit der MyJDownloader-API** ist undokumentiert; bei Reconnect-Schleifen vorsichtig sein (Backoff einbauen, falls auffällig).

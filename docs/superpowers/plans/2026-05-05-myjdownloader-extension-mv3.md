# MyJDownloader MV3 Extension — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Manifest-V3-Chrome-Extension bauen, die Click'n'Load-Aufrufe (`127.0.0.1:9666`) auf Webseiten abfängt und über die MyJDownloader-Cloud-API an eine vom User pro Trigger gewählte Remote-JDownloader-Instanz weiterleitet.

**Architecture:** Drei Komponenten — ein MAIN-world Content Script hooked `fetch`/`XMLHttpRequest`, fängt Calls an `127.0.0.1:9666` ab, entschlüsselt CnL-Payloads (`crypted` + `jk`) und gibt der Webseite synchron 200 OK zurück; ein Service Worker hält die MyJDownloader-Session, empfängt URLs vom Content Script, öffnet das Picker-Popup und ruft nach Auswahl `/linkgrabberv2/addLinks` auf; das Popup ist eine kleine JS-State-Machine (`loggedOut` / `idle` / `picker`).

**Tech Stack:** Reines ES-Module-Setup (kein Bundler), Web Crypto API für SHA-256/HMAC-SHA256/AES-CBC, Chrome MV3 APIs (`chrome.action`, `chrome.storage`, `chrome.notifications`, `chrome.runtime`, `chrome.windows`).

**Spec-Korrektur:** Die Spec nimmt PBKDF2 für die Schlüsselableitung an. Eine Verifikation gegen die öffentliche MyJDownloader-API-Referenzimplementation (`myjdapi`-Library) zeigt: tatsächlich wird `SHA-256(email + password + domain)` verwendet (mit `domain ∈ {"server", "device"}`), nicht PBKDF2. Der Plan setzt das korrekte Verfahren ein. Die Spec wird zu Beginn von Task 4 entsprechend nachgezogen.

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `manifest.json` | MV3-Manifest, Permissions, Content-Script-Registrierung |
| `background/service-worker.js` | Message-Routing, Auth-State, Pending-Requests, Picker-Trigger, Notifications |
| `background/myjd-api.js` | API-Client: connect, signedRequest, listDevices, addLinks, disconnect |
| `content/cnl-hook.js` | MAIN-world `fetch`/`XHR`-Hook + CnL-Decrypt |
| `popup/popup.html` | Popup-Markup mit drei View-Containern |
| `popup/popup.js` | State-Machine + Event-Handler |
| `popup/popup.css` | Popup-Styling |
| `shared/crypto.js` | `sha256`, `hmacSha256`, `aesCbcDecrypt`, `aesCbcEncrypt`, `updateToken` |
| `shared/messages.js` | Message-Type-Konstanten |
| `icons/` | 16/32/48/128 px PNG-Platzhalter |

---

## Task 1: Projekt-Scaffold + minimales MV3-Manifest mit Stub-Popup

**Files:**
- Create: `manifest.json`
- Create: `popup/popup.html`
- Create: `popup/popup.js`
- Create: `popup/popup.css`
- Create: `icons/icon16.png`, `icons/icon32.png`, `icons/icon48.png`, `icons/icon128.png`

- [ ] **Step 1: `manifest.json` anlegen**

```json
{
  "manifest_version": 3,
  "name": "MyJDownloader (MV3)",
  "version": "0.1.0",
  "description": "Fängt Click'n'Load-Aufrufe ab und leitet sie über MyJDownloader an eine entfernte JDownloader-Instanz weiter.",
  "minimum_chrome_version": "127",
  "permissions": ["storage", "notifications"],
  "host_permissions": ["https://api.jdownloader.org/*"],
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "32": "icons/icon32.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "icons": {
    "16": "icons/icon16.png",
    "32": "icons/icon32.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Stub-Popup-HTML anlegen**

`popup/popup.html`:
```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <link rel="stylesheet" href="popup.css" />
  </head>
  <body>
    <div id="root">MyJDownloader Extension läuft.</div>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

`popup/popup.css`:
```css
body { margin: 0; font-family: -apple-system, "Segoe UI", sans-serif; min-width: 320px; min-height: 120px; }
#root { padding: 16px; color: #1f2937; }
```

`popup/popup.js`:
```javascript
console.log("popup loaded");
```

- [ ] **Step 3: Service-Worker-Stub anlegen**

`background/service-worker.js`:
```javascript
console.log("service worker started");
```

- [ ] **Step 4: Icon-Platzhalter erstellen**

Viermal eine 1×1-PNG-Datei reicht für den ersten Wurf. PowerShell:
```powershell
$bytes = [byte[]](0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,0x89,0x00,0x00,0x00,0x0D,0x49,0x44,0x41,0x54,0x78,0x9C,0x63,0xF8,0xCF,0xC0,0x00,0x00,0x00,0x03,0x00,0x01,0x55,0xCD,0xD7,0x39,0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,0x42,0x60,0x82)
New-Item -ItemType Directory -Force -Path icons | Out-Null
foreach ($n in 16,32,48,128) { [IO.File]::WriteAllBytes("icons/icon$n.png", $bytes) }
```

- [ ] **Step 5: Extension in Chrome laden und Popup-Klick testen**

1. `chrome://extensions/` öffnen.
2. Entwicklermodus aktivieren.
3. "Entpackte Erweiterung laden" → Projektordner wählen.
4. Extension-Icon klicken → Popup zeigt "MyJDownloader Extension läuft."
5. Service-Worker-Konsole öffnen (Link "service worker" im extensions-Eintrag) → Log "service worker started" sichtbar.

Erwartung: Beide Logs erscheinen, keine Manifest-Fehler.

- [ ] **Step 6: Commit**

```bash
git add manifest.json popup/ background/ icons/
git commit -m "feat: scaffold MV3 extension with stub popup and service worker"
```

---

## Task 2: Shared Crypto-Modul (SHA-256, HMAC-SHA256, AES-CBC, Token-Update)

**Files:**
- Create: `shared/crypto.js`

- [ ] **Step 1: `shared/crypto.js` schreiben**

```javascript
const enc = new TextEncoder();

export function utf8(str) {
  return enc.encode(str);
}

export function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

export function bytesToBase64(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function sha256(data) {
  const buf = typeof data === "string" ? utf8(data) : data;
  return new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
}

export async function deriveSecret(email, password, domain) {
  return sha256(email.toLowerCase() + password + domain.toLowerCase());
}

export async function updateToken(oldToken, newTokenHex) {
  const concat = new Uint8Array(oldToken.length + newTokenHex.length);
  concat.set(oldToken, 0);
  concat.set(utf8(newTokenHex), oldToken.length);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", concat));
}

export async function hmacSha256(keyBytes, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, utf8(message));
  return bytesToHex(sig);
}

export async function aesCbcDecrypt(secret, base64Cipher) {
  const iv = secret.slice(0, 16);
  const keyBytes = secret.slice(16, 32);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const cipher = base64ToBytes(base64Cipher);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher));
  return new TextDecoder().decode(plain);
}

export async function aesCbcEncrypt(secret, plaintext) {
  const iv = secret.slice(0, 16);
  const keyBytes = secret.slice(16, 32);
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt"]);
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-CBC", iv }, key, utf8(plaintext)),
  );
  return bytesToBase64(cipher);
}

export async function aesCbcDecryptRaw(keyHex, base64Cipher) {
  const keyBytes = hexToBytes(keyHex);
  const iv = keyBytes;
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
  const cipher = base64ToBytes(base64Cipher);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher));
  return new TextDecoder().decode(plain);
}
```

- [ ] **Step 2: Selftest-Skript schreiben (temporär für die Verifikation)**

`background/_crypto-selftest.js`:
```javascript
import { sha256, hmacSha256, deriveSecret, bytesToHex, aesCbcDecryptRaw } from "../shared/crypto.js";

async function run() {
  const empty = bytesToHex(await sha256(""));
  console.assert(
    empty === "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "SHA-256('') Vektor stimmt nicht",
  );

  const hmacOk = await hmacSha256(new TextEncoder().encode("key"), "The quick brown fox jumps over the lazy dog");
  console.assert(
    hmacOk === "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
    "HMAC-SHA256 Vektor stimmt nicht",
  );

  const secret = bytesToHex(await deriveSecret("user@example.com", "passw0rd", "server"));
  console.log("deriveSecret('user@example.com','passw0rd','server') =", secret);

  const cnlPlain = await aesCbcDecryptRaw(
    "31323334353637383930313233343536",
    "tFkDqOSF8Vdzq6kDwFXhwQ==",
  );
  console.log("CnL-Roundtrip-Decrypt (Beispiel-Key+Cipher):", cnlPlain);

  console.log("Selftest fertig.");
}
run().catch((e) => console.error("Selftest-Fehler:", e));
```

- [ ] **Step 3: Selftest temporär aus dem Service Worker laden und prüfen**

In `background/service-worker.js` temporär ergänzen:
```javascript
import "./_crypto-selftest.js";
```

Extension in `chrome://extensions/` neu laden → Service-Worker-Konsole öffnen.

Erwartung: Beide `console.assert`-Zeilen geben *keinen* Assertion-Fehler aus, der `deriveSecret`-Hex erscheint, der CnL-Roundtrip-Decrypt zeigt einen lesbaren ASCII-String oder einen Padding-Error (letzteres ist OK — wir testen die Funktion, nicht den exakten Cipher).

- [ ] **Step 4: Selftest-Import wieder entfernen**

`background/service-worker.js`:
```javascript
console.log("service worker started");
```

`_crypto-selftest.js` darf **nicht** committed werden — aus dem Arbeitsbaum löschen.

- [ ] **Step 5: Commit**

```bash
git add shared/crypto.js
git rm -f background/_crypto-selftest.js 2>/dev/null
git commit -m "feat(crypto): add SHA-256/HMAC/AES-CBC helpers for MyJD API and CnL decrypt"
```

---

## Task 3: Shared Message-Type-Konstanten

**Files:**
- Create: `shared/messages.js`

- [ ] **Step 1: `shared/messages.js` schreiben**

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
});

export const POPUP_VIEW = Object.freeze({
  LOGGED_OUT: "loggedOut",
  IDLE: "idle",
  PICKER: "picker",
});
```

- [ ] **Step 2: Manifest-Reload in Chrome → keine Fehler in der SW-Konsole**

Die Datei wird noch nicht importiert; Reload nur zur Sicherheit.

- [ ] **Step 3: Commit**

```bash
git add shared/messages.js
git commit -m "feat(shared): add message-type and popup-view constants"
```

---

## Task 4: MyJDownloader-API — `connect` und `disconnect`

> **Spec-Korrektur in dieser Task durchziehen:** in `docs/superpowers/specs/2026-05-05-myjdownloader-extension-mv3-design.md` den Abschnitt "MyJDownloader-API-Mechanik" so anpassen, dass die Schlüsselableitung als `SHA-256(email + password + domain)` (statt PBKDF2) beschrieben ist. Begründung in der Commit-Message.

**Files:**
- Modify: `docs/superpowers/specs/2026-05-05-myjdownloader-extension-mv3-design.md`
- Create: `background/myjd-api.js`

- [ ] **Step 1: Spec-Abschnitt korrigieren**

In `docs/superpowers/specs/2026-05-05-myjdownloader-extension-mv3-design.md`, Abschnitt **MyJDownloader-API-Mechanik / Schlüsselableitung**, ersetzen durch:

```markdown
**Schlüsselableitung** (im Service Worker, Web Crypto API):

- `loginSecret = SHA-256(email + password + "server")`
- `deviceSecret = SHA-256(email + password + "device")`

(Email wird dabei lower-cased; Domain ebenfalls lower-cased. Die ursprünglich
hier vermutete PBKDF2-Variante ist falsch — die Referenz-Implementation
`myjdapi` verwendet einfaches SHA-256.)
```

- [ ] **Step 2: API-Modul-Skelett mit `connect`/`disconnect` schreiben**

`background/myjd-api.js`:
```javascript
import {
  deriveSecret,
  updateToken,
  hmacSha256,
  aesCbcDecrypt,
  aesCbcEncrypt,
  bytesToHex,
  utf8,
} from "../shared/crypto.js";

const API_ROOT = "https://api.jdownloader.org";
const APP_KEY = "MyJDownloaderMV3Extension";

export class MyJdApiError extends Error {
  constructor(msg, code) {
    super(msg);
    this.code = code;
  }
}

export class MyJdSession {
  constructor() {
    this.email = null;
    this.loginSecret = null;
    this.deviceSecret = null;
    this.sessionToken = null;
    this.regainToken = null;
    this.serverEncToken = null;
    this.deviceEncToken = null;
    this.requestId = Math.floor(Math.random() * 1e9);
  }

  serializePersistent() {
    if (!this.email) return null;
    return {
      email: this.email,
      loginSecret: bytesToHex(this.loginSecret),
      deviceSecret: bytesToHex(this.deviceSecret),
    };
  }

  static restorePersistent({ email, loginSecret, deviceSecret }) {
    const s = new MyJdSession();
    s.email = email;
    s.loginSecret = hexToBytesLocal(loginSecret);
    s.deviceSecret = hexToBytesLocal(deviceSecret);
    return s;
  }
}

function hexToBytesLocal(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

function nextRid(session) {
  session.requestId += 1;
  return session.requestId;
}

async function callApi(path, query, secret, body) {
  const sep = query.includes("?") ? "&" : "?";
  const sigBase = `${path}${query}`;
  const sig = await hmacSha256(secret, sigBase);
  const url = `${API_ROOT}${path}${query}${sep}signature=${sig}`;
  const init = body
    ? {
        method: "POST",
        headers: { "Content-Type": "application/aesjson-jd; charset=utf-8" },
        body: await aesCbcEncrypt(secret, body),
      }
    : { method: "POST" };
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`;
    try {
      const txt = await res.text();
      detail += ` — ${txt}`;
    } catch {}
    throw new MyJdApiError(detail, res.status);
  }
  const cipherB64 = await res.text();
  const plain = await aesCbcDecrypt(secret, cipherB64);
  return JSON.parse(plain);
}

export async function connect(session, email, password) {
  session.email = email.toLowerCase();
  session.loginSecret = await deriveSecret(session.email, password, "server");
  session.deviceSecret = await deriveSecret(session.email, password, "device");

  const rid = nextRid(session);
  const path = "/my/connect";
  const query = `?email=${encodeURIComponent(session.email)}&appkey=${APP_KEY}&rid=${rid}`;
  const data = await callApi(path, query, session.loginSecret, null);

  if (!data || !data.sessiontoken) {
    throw new MyJdApiError("Antwort enthielt kein sessiontoken", "AUTH");
  }
  session.sessionToken = data.sessiontoken;
  session.regainToken = data.regaintoken;
  session.serverEncToken = await updateToken(session.loginSecret, data.sessiontoken);
  session.deviceEncToken = await updateToken(session.deviceSecret, data.sessiontoken);
  return data;
}

export async function reconnect(session) {
  if (!session.email || !session.loginSecret) {
    throw new MyJdApiError("Keine persistierten Credentials", "NO_CREDS");
  }
  const rid = nextRid(session);
  const path = "/my/reconnect";
  const query = `?appkey=${APP_KEY}&sessiontoken=${session.sessionToken ?? ""}&regaintoken=${
    session.regainToken ?? ""
  }&rid=${rid}`;
  const data = await callApi(path, query, session.serverEncToken ?? session.loginSecret, null);
  session.sessionToken = data.sessiontoken;
  session.regainToken = data.regaintoken;
  session.serverEncToken = await updateToken(session.loginSecret, data.sessiontoken);
  session.deviceEncToken = await updateToken(session.deviceSecret, data.sessiontoken);
  return data;
}

export async function disconnect(session) {
  if (!session.sessionToken || !session.serverEncToken) return;
  const rid = nextRid(session);
  const path = "/my/disconnect";
  const query = `?sessiontoken=${session.sessionToken}&rid=${rid}`;
  try {
    await callApi(path, query, session.serverEncToken, null);
  } catch (e) {
    console.warn("disconnect ignoriert Fehler:", e);
  } finally {
    session.sessionToken = null;
    session.regainToken = null;
    session.serverEncToken = null;
    session.deviceEncToken = null;
  }
}
```

- [ ] **Step 3: Smoke-Test im Service-Worker-Konsole**

Temporär in `background/service-worker.js`:
```javascript
import { MyJdSession, connect, disconnect } from "./myjd-api.js";
globalThis._test = { MyJdSession, connect, disconnect };
```

Extension neu laden, in der SW-Konsole eingeben (mit echten Credentials, **nicht** committen):
```javascript
const s = new _test.MyJdSession();
await _test.connect(s, "DEINE_EMAIL", "DEIN_PASSWORT");
console.log("session token:", s.sessionToken);
await _test.disconnect(s);
console.log("disconnect ok");
```

Erwartung: `sessionToken` ist ein nicht-leerer String, `disconnect` wirft keinen Fehler.

Falls die API mit `403`/`AUTH_FAILED` antwortet: Email/Passwort prüfen. Falls mit `OUTDATED_VERSION` o.ä.: API-Doku auf neuere Endpoint-Versionen prüfen.

- [ ] **Step 4: Test-Import wieder entfernen**

`background/service-worker.js`:
```javascript
console.log("service worker started");
```

- [ ] **Step 5: Commit**

```bash
git add background/myjd-api.js docs/superpowers/specs/2026-05-05-myjdownloader-extension-mv3-design.md
git commit -m "feat(api): add connect/reconnect/disconnect against MyJDownloader

Spec said PBKDF2 derivation; verified against the public myjdapi reference
that the actual algorithm is SHA-256(email + password + domain). Spec updated
to match implementation."
```

---

## Task 5: MyJDownloader-API — Signed Requests + `listDevices`

**Files:**
- Modify: `background/myjd-api.js`

- [ ] **Step 1: Generischen Device-Call und `listDevices` ergänzen**

Am Ende von `background/myjd-api.js` anhängen:
```javascript
export async function listDevices(session) {
  if (!session.sessionToken || !session.serverEncToken) {
    throw new MyJdApiError("Nicht eingeloggt", "NOT_LOGGED_IN");
  }
  const rid = nextRid(session);
  const path = "/my/listdevices";
  const query = `?sessiontoken=${session.sessionToken}&rid=${rid}`;
  const data = await callApi(path, query, session.serverEncToken, null);
  return Array.isArray(data?.list) ? data.list : [];
}

export async function deviceCall(session, deviceId, action, params = []) {
  if (!session.sessionToken || !session.deviceEncToken) {
    throw new MyJdApiError("Nicht eingeloggt", "NOT_LOGGED_IN");
  }
  const rid = nextRid(session);
  const path = `/t_${session.sessionToken}_${deviceId}${action}`;
  const query = "";
  const body = JSON.stringify({
    apiVer: 1,
    url: action,
    params: params.map((p) => (typeof p === "string" ? p : JSON.stringify(p))),
    rid,
  });
  return callApi(path, query, session.deviceEncToken, body);
}
```

- [ ] **Step 2: Smoke-Test in der SW-Konsole**

Temporär in `background/service-worker.js`:
```javascript
import { MyJdSession, connect, listDevices, disconnect } from "./myjd-api.js";
globalThis._test = { MyJdSession, connect, listDevices, disconnect };
```

In der SW-Konsole:
```javascript
const s = new _test.MyJdSession();
await _test.connect(s, "DEINE_EMAIL", "DEIN_PASSWORT");
const devs = await _test.listDevices(s);
console.log("devices:", devs);
await _test.disconnect(s);
```

Erwartung: `devs` ist ein Array mit Objekten der Form `{ id, name, type, status }` und enthält die Geräte des Accounts.

- [ ] **Step 3: Test-Import entfernen**

`background/service-worker.js`:
```javascript
console.log("service worker started");
```

- [ ] **Step 4: Commit**

```bash
git add background/myjd-api.js
git commit -m "feat(api): add listDevices and generic deviceCall wrapper"
```

---

## Task 6: Service Worker — Auth-State, Storage-Hydration, Reconnect

**Files:**
- Modify: `background/service-worker.js`

- [ ] **Step 1: `service-worker.js` mit Auth-State und Message-Routing schreiben**

```javascript
import { MSG, POPUP_VIEW } from "../shared/messages.js";
import {
  MyJdSession,
  connect,
  reconnect,
  disconnect,
  listDevices,
  MyJdApiError,
} from "./myjd-api.js";

const STORAGE_LOCAL_KEYS = ["email", "loginSecret", "deviceSecret", "cnlEnabled"];

let session = null;
let cnlEnabled = true;
let cachedDevices = null;
let cachedDevicesAt = 0;
const DEVICE_CACHE_MS = 60_000;

async function loadFromStorage() {
  const local = await chrome.storage.local.get(STORAGE_LOCAL_KEYS);
  cnlEnabled = local.cnlEnabled !== false;
  if (local.email && local.loginSecret && local.deviceSecret) {
    session = MyJdSession.restorePersistent({
      email: local.email,
      loginSecret: local.loginSecret,
      deviceSecret: local.deviceSecret,
    });
  } else {
    session = null;
  }
}

async function persistSession(email, loginSecretBytes, deviceSecretBytes) {
  await chrome.storage.local.set({
    email,
    loginSecret: bytesToHex(loginSecretBytes),
    deviceSecret: bytesToHex(deviceSecretBytes),
  });
}

function bytesToHex(bytes) {
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function clearAllStorage() {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
}

async function ensureSessionAlive() {
  if (!session) throw new MyJdApiError("Nicht eingeloggt", "NOT_LOGGED_IN");
  if (session.sessionToken) return;
  await reconnect(session).catch(async (e) => {
    if (e.code === "NO_CREDS") throw e;
    await connectWithStoredSecretsOrFail();
  });
}

async function connectWithStoredSecretsOrFail() {
  throw new MyJdApiError(
    "Session abgelaufen, bitte erneut einloggen",
    "RECONNECT_FAILED",
  );
}

async function getDevices(forceRefresh = false) {
  if (!session?.sessionToken) await ensureSessionAlive();
  const fresh = !cachedDevices || Date.now() - cachedDevicesAt > DEVICE_CACHE_MS;
  if (forceRefresh || fresh) {
    cachedDevices = await listDevices(session);
    cachedDevicesAt = Date.now();
    await chrome.storage.session.set({ cachedDevices, cachedDevicesAt });
  }
  return cachedDevices;
}

async function buildState() {
  if (!session) return { view: POPUP_VIEW.LOGGED_OUT, cnlEnabled };
  if (!session.sessionToken) {
    try {
      await reconnect(session);
    } catch (e) {
      if (e.code === "NO_CREDS" || e.code === "AUTH" || e.code === 403) {
        await clearAllStorage();
        session = null;
        return { view: POPUP_VIEW.LOGGED_OUT, cnlEnabled, error: "Session abgelaufen" };
      }
      return { view: POPUP_VIEW.IDLE, email: session.email, cnlEnabled, devices: [], offline: true };
    }
  }
  const devices = await getDevices().catch(() => []);
  return { view: POPUP_VIEW.IDLE, email: session.email, cnlEnabled, devices };
}

async function handleLogin(email, password) {
  const s = new MyJdSession();
  await connect(s, email, password);
  session = s;
  await persistSession(s.email, s.loginSecret, s.deviceSecret);
  await chrome.storage.session.set({
    sessionToken: s.sessionToken,
    regainToken: s.regainToken,
  });
  cachedDevices = null;
  return buildState();
}

async function handleLogout() {
  if (session) await disconnect(session).catch(() => {});
  session = null;
  cachedDevices = null;
  await clearAllStorage();
  await chrome.storage.local.set({ cnlEnabled });
  return { view: POPUP_VIEW.LOGGED_OUT, cnlEnabled };
}

async function handleSetCnlEnabled(enabled) {
  cnlEnabled = !!enabled;
  await chrome.storage.local.set({ cnlEnabled });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg?.type) {
        case MSG.GET_STATE:
          sendResponse(await buildState());
          break;
        case MSG.LOGIN:
          sendResponse(await handleLogin(msg.email, msg.password));
          break;
        case MSG.LOGOUT:
          sendResponse(await handleLogout());
          break;
        case MSG.SET_CNL_ENABLED:
          sendResponse(await handleSetCnlEnabled(msg.enabled));
          break;
        case MSG.REFRESH_DEVICES: {
          await ensureSessionAlive();
          const devices = await getDevices(true);
          sendResponse({ devices });
          break;
        }
        default:
          sendResponse({ error: "unknown_message_type" });
      }
    } catch (e) {
      sendResponse({ error: e.message ?? String(e), code: e.code });
    }
  })();
  return true;
});

chrome.runtime.onInstalled.addListener(() => loadFromStorage());
chrome.runtime.onStartup.addListener(() => loadFromStorage());
loadFromStorage();
console.log("service worker started");
```

- [ ] **Step 2: Manifest neu laden, SW-Konsole prüfen**

`chrome://extensions/` → Reload-Knopf an der Extension. SW-Konsole öffnen.

Erwartung: keine Fehler, `service worker started` erscheint.

- [ ] **Step 3: Smoke-Test der `GET_STATE`-Message in SW-Konsole**

In SW-Konsole:
```javascript
chrome.runtime.sendMessage({ type: "GET_STATE" }, (r) => console.log(r));
```

Erwartung: Antwort `{ view: "loggedOut", cnlEnabled: true }` (Storage ist leer).

- [ ] **Step 4: Commit**

```bash
git add background/service-worker.js
git commit -m "feat(sw): add auth state, storage hydration, message routing for popup"
```

---

## Task 7: Popup — Logged-Out-View mit Login-Form

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.js`
- Modify: `popup/popup.css`

- [ ] **Step 1: HTML-Container für alle drei Views aufbauen**

`popup/popup.html`:
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

      <section id="view-idle" hidden></section>
      <section id="view-picker" hidden></section>
      <section id="view-loading">Lade…</section>
    </div>
    <script type="module" src="popup.js"></script>
  </body>
</html>
```

- [ ] **Step 2: Popup-State-Machine + Login-Handler implementieren**

`popup/popup.js`:
```javascript
import { MSG, POPUP_VIEW } from "../shared/messages.js";

const views = {
  [POPUP_VIEW.LOGGED_OUT]: document.getElementById("view-loggedOut"),
  [POPUP_VIEW.IDLE]: document.getElementById("view-idle"),
  [POPUP_VIEW.PICKER]: document.getElementById("view-picker"),
};
const loadingView = document.getElementById("view-loading");

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
  if (state.view === POPUP_VIEW.LOGGED_OUT) {
    showView(POPUP_VIEW.LOGGED_OUT);
    const errEl = document.getElementById("login-error");
    if (state.error) {
      errEl.textContent = state.error;
      errEl.hidden = false;
    } else {
      errEl.hidden = true;
    }
  } else if (state.view === POPUP_VIEW.IDLE) {
    showView(POPUP_VIEW.IDLE);
  } else if (state.view === POPUP_VIEW.PICKER) {
    showView(POPUP_VIEW.PICKER);
  }
}

document.getElementById("login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const email = fd.get("email");
  const password = fd.get("password");
  const btn = document.getElementById("login-btn");
  btn.disabled = true;
  const errEl = document.getElementById("login-error");
  errEl.hidden = true;
  const res = await send({ type: MSG.LOGIN, email, password });
  btn.disabled = false;
  if (res?.error) {
    errEl.textContent = `Login fehlgeschlagen: ${res.error}`;
    errEl.hidden = false;
    return;
  }
  render(res);
});

refreshState();
```

- [ ] **Step 3: Login-View stylen**

`popup/popup.css`:
```css
:root {
  --bg: #0f3a3f;
  --panel: #d4ecec;
  --accent: #f4c43c;
  --text: #1f2937;
  --muted: #6b7280;
  --error: #b91c1c;
  --green: #16a34a;
  --gray: #9ca3af;
}
body { margin: 0; font-family: -apple-system, "Segoe UI", sans-serif; min-width: 320px; min-height: 220px; background: var(--panel); color: var(--text); }
#root { padding: 0; }
.brand { background: var(--bg); color: var(--accent); padding: 12px 16px; font-weight: 700; letter-spacing: 0.5px; }
section { padding: 16px; }
form label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 12px; }
form input { width: 100%; box-sizing: border-box; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 14px; }
form button { width: 100%; padding: 10px; background: var(--bg); color: var(--accent); border: 0; border-radius: 4px; font-weight: 600; cursor: pointer; }
form button[disabled] { opacity: 0.6; cursor: progress; }
.error { color: var(--error); font-size: 13px; margin: 8px 0 0; }
#view-loading { padding: 24px; color: var(--muted); }
```

- [ ] **Step 4: Manuell testen**

1. Extension neu laden.
2. `chrome.storage.local.clear()` in der SW-Konsole.
3. Popup öffnen → Login-Form sichtbar.
4. Mit echten Credentials einloggen.
5. View springt auf `idle` (leerer Container — füllen wir in Task 8).

Erwartung: bei Fehler erscheint die Inline-Error-Zeile; bei Erfolg leerer Idle-View.

- [ ] **Step 5: Commit**

```bash
git add popup/popup.html popup/popup.js popup/popup.css
git commit -m "feat(popup): add logged-out state with login form and view router"
```

---

## Task 8: Popup — Idle-View mit Email, Logout, CnL-Toggle, Geräteliste

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.js`
- Modify: `popup/popup.css`

- [ ] **Step 1: Idle-View-Markup ergänzen**

`popup/popup.html`, `<section id="view-idle">` ersetzen durch:
```html
<section id="view-idle" hidden>
  <header class="bar">
    <span class="email" id="idle-email"></span>
    <button class="icon-btn" id="logout-btn" title="Logout">⎋</button>
  </header>
  <div class="row">
    <label class="toggle">
      <input type="checkbox" id="cnl-toggle" />
      <span>Click'n'Load via MyJDownloader</span>
    </label>
    <p class="hint">Fängt lokale Click'n'Load-Aufrufe ab und sendet sie über MyJDownloader an verbundene JDownloader.</p>
  </div>
  <div class="row">
    <div class="row-head">
      <span>Geräte</span>
      <button class="link-btn" id="refresh-devices-btn">Aktualisieren</button>
    </div>
    <ul class="devices" id="devices-list"></ul>
    <p class="empty" id="devices-empty" hidden>Keine Geräte verbunden.</p>
    <p class="error" id="devices-error" hidden></p>
  </div>
</section>
```

- [ ] **Step 2: Idle-Render-Logik in `popup.js` ergänzen**

In `popup/popup.js` die `render(state)`-Funktion erweitern und einen `renderIdle`-Helper anlegen. Die fertige Datei:

```javascript
import { MSG, POPUP_VIEW } from "../shared/messages.js";

const views = {
  [POPUP_VIEW.LOGGED_OUT]: document.getElementById("view-loggedOut"),
  [POPUP_VIEW.IDLE]: document.getElementById("view-idle"),
  [POPUP_VIEW.PICKER]: document.getElementById("view-picker"),
};
const loadingView = document.getElementById("view-loading");

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
  if (state.view === POPUP_VIEW.LOGGED_OUT) {
    showView(POPUP_VIEW.LOGGED_OUT);
    const errEl = document.getElementById("login-error");
    if (state.error) {
      errEl.textContent = state.error;
      errEl.hidden = false;
    } else {
      errEl.hidden = true;
    }
  } else if (state.view === POPUP_VIEW.IDLE) {
    renderIdle(state);
  } else if (state.view === POPUP_VIEW.PICKER) {
    showView(POPUP_VIEW.PICKER);
  }
}

function renderIdle(state) {
  showView(POPUP_VIEW.IDLE);
  document.getElementById("idle-email").textContent = state.email ?? "";
  document.getElementById("cnl-toggle").checked = state.cnlEnabled !== false;
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
    const li = document.createElement("li");
    li.className = "device";
    const dot = document.createElement("span");
    dot.className = "dot " + (d.status === "ONLINE" || d.status === undefined ? "online" : "offline");
    li.appendChild(dot);
    const nm = document.createElement("span");
    nm.className = "name";
    nm.textContent = d.name ?? d.id;
    li.appendChild(nm);
    const ty = document.createElement("span");
    ty.className = "type";
    ty.textContent = d.type ?? "";
    li.appendChild(ty);
    list.appendChild(li);
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

document.getElementById("logout-btn").addEventListener("click", async () => {
  const res = await send({ type: MSG.LOGOUT });
  render(res);
});

document.getElementById("cnl-toggle").addEventListener("change", async (e) => {
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

refreshState();
```

- [ ] **Step 3: Idle-Styles ergänzen**

In `popup/popup.css` anhängen:
```css
.bar { background: var(--bg); color: #fff; padding: 8px 12px; display: flex; justify-content: space-between; align-items: center; }
.bar .email { font-size: 13px; opacity: 0.9; }
.icon-btn { background: transparent; color: #fff; border: 0; font-size: 16px; cursor: pointer; padding: 4px 8px; }
.icon-btn:hover { color: var(--accent); }
.row { padding: 12px 16px; border-top: 1px solid #b8d6d6; }
.row:first-of-type { border-top: 0; }
.row-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; font-size: 12px; color: var(--muted); text-transform: uppercase; }
.toggle { display: flex; align-items: center; gap: 8px; font-size: 14px; cursor: pointer; }
.toggle input { width: 18px; height: 18px; }
.hint { font-size: 12px; color: var(--muted); margin: 6px 0 0 26px; line-height: 1.4; }
.link-btn { background: transparent; border: 0; color: #0f766e; cursor: pointer; font-size: 12px; }
.devices { list-style: none; margin: 0; padding: 0; }
.device { display: flex; align-items: center; gap: 8px; padding: 6px 0; }
.device .name { font-size: 14px; flex: 1; }
.device .type { font-size: 11px; color: var(--muted); }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.online { background: var(--green); }
.dot.offline { background: var(--gray); }
.empty { color: var(--muted); font-size: 13px; }
```

- [ ] **Step 4: Manuell testen**

1. Extension neu laden.
2. Popup öffnen — falls noch eingeloggt: Idle-View zeigt Email, Toggle (an), Geräteliste.
3. Toggle umlegen → SW-Storage `cnlEnabled` = false (in SW-Konsole prüfen: `chrome.storage.local.get("cnlEnabled", console.log)`).
4. "Aktualisieren" klicken → Geräte werden neu geladen.
5. Logout klicken → springt auf Login-View, Storage ist leer.

Erwartung: alle UI-Pfade funktionieren ohne Fehler in der Konsole.

- [ ] **Step 5: Commit**

```bash
git add popup/popup.html popup/popup.js popup/popup.css
git commit -m "feat(popup): add idle view with email, logout, CnL toggle, device list"
```

---

## Task 9: Content Script — `/jdcheck.js`-Hook und Manifest-Registrierung

**Files:**
- Create: `content/cnl-hook.js`
- Modify: `manifest.json`

- [ ] **Step 1: Hook-Skelett mit `/jdcheck.js`-Spoof schreiben**

`content/cnl-hook.js`:
```javascript
(function () {
  const TARGET_HOST = "127.0.0.1:9666";

  function isCnlUrl(url) {
    try {
      const u = new URL(url, location.href);
      return u.host === TARGET_HOST;
    } catch {
      return false;
    }
  }

  function endpointOf(url) {
    try {
      return new URL(url, location.href).pathname;
    } catch {
      return "";
    }
  }

  function fakeJdcheckResponse() {
    return new Response("jdownloader=true; var jcheck = true;", {
      status: 200,
      headers: { "Content-Type": "application/javascript" },
    });
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    if (url && isCnlUrl(url)) {
      const ep = endpointOf(url);
      if (ep === "/jdcheck.js" || ep === "/jdcheck") {
        return fakeJdcheckResponse();
      }
    }
    return origFetch(input, init);
  };

  const OrigXHR = window.XMLHttpRequest;
  function HookedXHR() {
    const xhr = new OrigXHR();
    let hookUrl = null;
    let hookMethod = "GET";
    const origOpen = xhr.open;
    xhr.open = function (method, url, ...rest) {
      hookMethod = method;
      hookUrl = url;
      return origOpen.call(xhr, method, url, ...rest);
    };
    const origSend = xhr.send;
    xhr.send = function (body) {
      if (hookUrl && isCnlUrl(hookUrl)) {
        const ep = endpointOf(hookUrl);
        if ((hookMethod || "GET").toUpperCase() === "GET" && (ep === "/jdcheck.js" || ep === "/jdcheck")) {
          setTimeout(() => {
            Object.defineProperty(xhr, "readyState", { value: 4, configurable: true });
            Object.defineProperty(xhr, "status", { value: 200, configurable: true });
            Object.defineProperty(xhr, "responseText", {
              value: "jdownloader=true; var jcheck = true;",
              configurable: true,
            });
            Object.defineProperty(xhr, "response", {
              value: "jdownloader=true; var jcheck = true;",
              configurable: true,
            });
            xhr.dispatchEvent(new Event("readystatechange"));
            xhr.dispatchEvent(new Event("load"));
            xhr.dispatchEvent(new Event("loadend"));
          }, 0);
          return;
        }
      }
      return origSend.call(xhr, body);
    };
    return xhr;
  }
  HookedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = HookedXHR;

  console.debug("[MyJD-MV3] CnL hook installed");
})();
```

- [ ] **Step 2: Content-Script-Eintrag im Manifest hinzufügen**

`manifest.json`, oberhalb von `"action"`:
```json
"content_scripts": [
  {
    "matches": ["<all_urls>"],
    "js": ["content/cnl-hook.js"],
    "run_at": "document_start",
    "world": "MAIN",
    "all_frames": true
  }
],
```

- [ ] **Step 3: Test-HTML im Projekt anlegen (für lokales Probieren)**

`docs/test-pages/jdcheck-test.html`:
```html
<!doctype html>
<html>
  <body>
    <h1>jdcheck-Test</h1>
    <button id="b">jdcheck via fetch</button>
    <pre id="out"></pre>
    <script>
      document.getElementById("b").onclick = async () => {
        try {
          const r = await fetch("http://127.0.0.1:9666/jdcheck.js");
          document.getElementById("out").textContent = await r.text();
        } catch (e) {
          document.getElementById("out").textContent = "ERR: " + e;
        }
      };
    </script>
  </body>
</html>
```

- [ ] **Step 4: Manuell testen**

1. Extension neu laden.
2. `docs/test-pages/jdcheck-test.html` per `file://` öffnen.
3. Button klicken → `<pre>` zeigt `jdownloader=true; var jcheck = true;`.
4. DevTools → Konsole zeigt `[MyJD-MV3] CnL hook installed`.

Erwartung: Webseite bekommt die Fake-Antwort, **nicht** einen `Failed to fetch`-Error.

- [ ] **Step 5: Commit**

```bash
git add content/cnl-hook.js manifest.json docs/test-pages/jdcheck-test.html
git commit -m "feat(content): hook fetch/XHR for /jdcheck.js spoofing"
```

---

## Task 10: Content Script — `/flash/add` und `/flash/addcrypted2` mit Decrypt

**Files:**
- Modify: `content/cnl-hook.js`

- [ ] **Step 1: Hook um POST-Body-Parsing und Decrypt erweitern**

Die Datei `content/cnl-hook.js` komplett ersetzen durch:
```javascript
(function () {
  const TARGET_HOST = "127.0.0.1:9666";

  function isCnlUrl(url) {
    try {
      return new URL(url, location.href).host === TARGET_HOST;
    } catch {
      return false;
    }
  }

  function endpointOf(url) {
    try {
      return new URL(url, location.href).pathname;
    } catch {
      return "";
    }
  }

  function fakeJdcheck() {
    return new Response("jdownloader=true; var jcheck = true;", {
      status: 200,
      headers: { "Content-Type": "application/javascript" },
    });
  }

  function fakeOk() {
    return new Response("success", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  function parseFormBody(body) {
    if (!body) return new URLSearchParams();
    if (typeof body === "string") return new URLSearchParams(body);
    if (body instanceof URLSearchParams) return body;
    if (body instanceof FormData) {
      const p = new URLSearchParams();
      for (const [k, v] of body.entries()) p.append(k, typeof v === "string" ? v : "");
      return p;
    }
    if (body instanceof Blob) {
      return body.text().then((t) => new URLSearchParams(t));
    }
    return new URLSearchParams();
  }

  function hexToBytes(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }

  function base64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function evalJk(jkSource) {
    const fn = new Function(jkSource + "; return f();");
    const result = fn();
    if (typeof result !== "string") throw new Error("jk() lieferte keinen String");
    const hex = result.trim();
    if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error("jk()-Resultat ist kein 32-stelliger Hex-Key");
    return hex.toLowerCase();
  }

  async function decryptAddcrypted2(cryptedB64, jkSource) {
    const keyHex = evalJk(jkSource);
    const keyBytes = hexToBytes(keyHex);
    const iv = keyBytes;
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["decrypt"]);
    const cipher = base64ToBytes(cryptedB64);
    const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-CBC", iv }, key, cipher));
    return new TextDecoder().decode(plain).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  }

  async function handleFlashAdd(params) {
    const urls = (params.get("urls") ?? "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const source = params.get("source") ?? location.href;
    const passwords = params.get("passwords") ?? "";
    if (!urls.length) return;
    chrome.runtime.sendMessage({ type: "CNL_LINKS", urls, source, passwords });
  }

  async function handleAddcrypted2(params) {
    const cryptedB64 = params.get("crypted") ?? "";
    const jk = params.get("jk") ?? "";
    const source = params.get("source") ?? location.href;
    const passwords = params.get("passwords") ?? "";
    if (!cryptedB64 || !jk) {
      console.warn("[MyJD-MV3] addcrypted2 ohne crypted/jk", { cryptedB64, jk });
      return;
    }
    try {
      const urls = await decryptAddcrypted2(cryptedB64, jk);
      if (!urls.length) return;
      chrome.runtime.sendMessage({ type: "CNL_LINKS", urls, source, passwords });
    } catch (e) {
      console.error("[MyJD-MV3] Decrypt fehlgeschlagen:", e);
      chrome.runtime.sendMessage({
        type: "CNL_LINKS",
        urls: [],
        source,
        passwords,
        error: "decrypt_failed",
      });
    }
  }

  async function dispatch(endpoint, body) {
    const params = await Promise.resolve(parseFormBody(body));
    if (endpoint === "/flash/add") return handleFlashAdd(params);
    if (endpoint === "/flash/addcrypted2") return handleAddcrypted2(params);
    if (endpoint === "/flash/addcrypted") {
      console.warn("[MyJD-MV3] /flash/addcrypted (DLC) wird im MVP nicht unterstützt");
    }
  }

  const origFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url;
    if (url && isCnlUrl(url)) {
      const ep = endpointOf(url);
      if (ep === "/jdcheck.js" || ep === "/jdcheck") return fakeJdcheck();
      if (ep === "/flash/add" || ep === "/flash/addcrypted2" || ep === "/flash/addcrypted") {
        const body = init?.body ?? (input instanceof Request ? await input.clone().text() : null);
        dispatch(ep, body).catch((e) => console.error("[MyJD-MV3]", e));
        return fakeOk();
      }
    }
    return origFetch(input, init);
  };

  const OrigXHR = window.XMLHttpRequest;
  function HookedXHR() {
    const xhr = new OrigXHR();
    let hookUrl = null;
    let hookMethod = "GET";
    const origOpen = xhr.open;
    xhr.open = function (method, url, ...rest) {
      hookMethod = method;
      hookUrl = url;
      return origOpen.call(xhr, method, url, ...rest);
    };
    const origSend = xhr.send;
    xhr.send = function (body) {
      if (hookUrl && isCnlUrl(hookUrl)) {
        const ep = endpointOf(hookUrl);
        const isJdcheck = ep === "/jdcheck.js" || ep === "/jdcheck";
        const isFlash = ep === "/flash/add" || ep === "/flash/addcrypted2" || ep === "/flash/addcrypted";
        if (isJdcheck || isFlash) {
          if (isFlash) dispatch(ep, body).catch((e) => console.error("[MyJD-MV3]", e));
          const responseBody = isJdcheck ? "jdownloader=true; var jcheck = true;" : "success";
          setTimeout(() => {
            Object.defineProperty(xhr, "readyState", { value: 4, configurable: true });
            Object.defineProperty(xhr, "status", { value: 200, configurable: true });
            Object.defineProperty(xhr, "responseText", { value: responseBody, configurable: true });
            Object.defineProperty(xhr, "response", { value: responseBody, configurable: true });
            xhr.dispatchEvent(new Event("readystatechange"));
            xhr.dispatchEvent(new Event("load"));
            xhr.dispatchEvent(new Event("loadend"));
          }, 0);
          return;
        }
      }
      return origSend.call(xhr, body);
    };
    return xhr;
  }
  HookedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = HookedXHR;

  console.debug("[MyJD-MV3] CnL hook installed (full)");
})();
```

- [ ] **Step 2: Test-HTML mit `/flash/add` und `/flash/addcrypted2` erweitern**

`docs/test-pages/cnl-test.html`:
```html
<!doctype html>
<html>
  <body>
    <h1>CnL-Test</h1>
    <button id="plain">flash/add</button>
    <button id="crypted">flash/addcrypted2</button>
    <pre id="out"></pre>
    <script>
      const out = document.getElementById("out");
      document.getElementById("plain").onclick = async () => {
        const body = new URLSearchParams({
          urls: "https://example.com/file1.zip\nhttps://example.com/file2.zip",
          source: location.href,
          passwords: "",
        });
        const r = await fetch("http://127.0.0.1:9666/flash/add", { method: "POST", body });
        out.textContent = "plain: " + (await r.text());
      };
      document.getElementById("crypted").onclick = async () => {
        const keyHex = "31323334353637383930313233343536";
        const plaintext = "https://example.com/secret1.zip\r\nhttps://example.com/secret2.zip";
        const enc = new TextEncoder();
        const keyBytes = new Uint8Array(keyHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
        const key = await crypto.subtle.importKey("raw", keyBytes, { name: "AES-CBC" }, false, ["encrypt"]);
        const padded = (() => {
          const data = enc.encode(plaintext);
          const padLen = 16 - (data.length % 16);
          const out = new Uint8Array(data.length + padLen);
          out.set(data);
          out.fill(padLen, data.length);
          return out;
        })();
        const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-CBC", iv: keyBytes }, key, padded));
        const b64 = btoa(String.fromCharCode(...cipher));
        const body = new URLSearchParams({
          crypted: b64,
          jk: "function f(){ return '" + keyHex + "'; }",
          source: location.href,
          passwords: "",
        });
        const r = await fetch("http://127.0.0.1:9666/flash/addcrypted2", { method: "POST", body });
        out.textContent = "crypted: " + (await r.text());
      };
    </script>
  </body>
</html>
```

- [ ] **Step 3: Manuell testen**

1. Extension neu laden.
2. `docs/test-pages/cnl-test.html` per `file://` öffnen.
3. SW-Konsole öffnen, dort temporär:
   ```javascript
   chrome.runtime.onMessage.addListener((m) => console.log("MSG:", m));
   ```
4. "flash/add" klicken → SW-Konsole zeigt `MSG: { type: "CNL_LINKS", urls: [...] }` mit zwei URLs.
5. "flash/addcrypted2" klicken → SW-Konsole zeigt CNL_LINKS mit zwei entschlüsselten URLs.
6. Im Tab steht jeweils "plain: success" / "crypted: success".

Erwartung: beide Buttons triggern die Message; Decrypt liefert exakt die zwei URLs aus `plaintext`.

- [ ] **Step 4: Commit**

```bash
git add content/cnl-hook.js docs/test-pages/cnl-test.html
git commit -m "feat(content): hook /flash/add and /flash/addcrypted2 with AES-CBC decrypt"
```

---

## Task 11: Service Worker — Pending-Requests + Picker-Popup öffnen

**Files:**
- Modify: `background/service-worker.js`

- [ ] **Step 1: Pending-Map und CNL_LINKS-Handler ergänzen**

In `background/service-worker.js` direkt **vor** dem `chrome.runtime.onMessage.addListener` einfügen:
```javascript
const PENDING_TTL_MS = 5 * 60 * 1000;
const pending = new Map();

function makeRequestId() {
  return `cnl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function gcPending() {
  const now = Date.now();
  for (const [id, entry] of pending) {
    if (now - entry.createdAt > PENDING_TTL_MS) pending.delete(id);
  }
}

async function openPickerPopup() {
  try {
    if (chrome.action.openPopup) {
      await chrome.action.openPopup();
      return;
    }
  } catch (e) {
    console.warn("openPopup nicht möglich, Fallback auf window.create:", e);
  }
  await chrome.windows.create({
    url: chrome.runtime.getURL("popup/popup.html?picker=1"),
    type: "popup",
    width: 360,
    height: 480,
  });
}

async function handleCnlLinks({ urls, source, passwords, error }) {
  gcPending();
  if (error === "decrypt_failed") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: chrome.runtime.getURL("icons/icon48.png"),
      title: "MyJDownloader",
      message: "Click'n'Load-Entschlüsselung fehlgeschlagen.",
    });
    return;
  }
  if (!urls?.length) return;
  if (!cnlEnabled) return;

  const requestId = makeRequestId();
  pending.set(requestId, { urls, source: source ?? "", passwords: passwords ?? "", createdAt: Date.now() });
  await openPickerPopup();
}
```

- [ ] **Step 2: Switch-Case für `CNL_LINKS`, `GET_PENDING` und `CANCEL_PENDING` ergänzen**

In `chrome.runtime.onMessage.addListener`, im `switch (msg?.type)`-Block ergänzen:
```javascript
case MSG.CNL_LINKS:
  await handleCnlLinks(msg);
  sendResponse({ ok: true });
  break;
case MSG.GET_PENDING: {
  gcPending();
  const entries = [...pending.entries()].map(([id, v]) => ({ id, ...v }));
  const last = entries[entries.length - 1] ?? null;
  sendResponse({ pending: last });
  break;
}
case MSG.CANCEL_PENDING:
  pending.delete(msg.requestId);
  sendResponse({ ok: true });
  break;
```

- [ ] **Step 3: `buildState` so anpassen, dass Picker priorisiert wird**

In `buildState` ganz am Anfang (vor `if (!session)`):
```javascript
gcPending();
const lastPending = [...pending.values()].pop();
if (lastPending && session?.sessionToken) {
  const devices = await getDevices().catch(() => []);
  return {
    view: POPUP_VIEW.PICKER,
    email: session.email,
    cnlEnabled,
    devices,
    pending: { id: [...pending.keys()].pop(), urls: lastPending.urls, source: lastPending.source },
  };
}
```

- [ ] **Step 4: Manuell testen**

1. Extension neu laden, eingeloggt sein.
2. `docs/test-pages/cnl-test.html` öffnen, "flash/add" klicken.
3. Erwartung: Popup öffnet sich automatisch (oder ein neues kleines Fenster, falls `openPopup` blockiert) — aktuell zeigt es noch einen leeren `view-picker`-Bereich (Task 12 füllt ihn).
4. SW-Konsole: `chrome.storage.local.get(null, console.log)` → `cnlEnabled: true`. `chrome.runtime.sendMessage({ type: "GET_PENDING" }, console.log)` zeigt das Pending mit den URLs.

Erwartung: Pending wird gespeichert, Popup öffnet, kein Fehler.

- [ ] **Step 5: Commit**

```bash
git add background/service-worker.js
git commit -m "feat(sw): store pending CnL requests and trigger picker popup"
```

---

## Task 12: Popup — Picker-View mit URL-Vorschau und Geräteauswahl

**Files:**
- Modify: `popup/popup.html`
- Modify: `popup/popup.js`
- Modify: `popup/popup.css`

- [ ] **Step 1: Picker-View-Markup ergänzen**

In `popup/popup.html`, `<section id="view-picker">` ersetzen durch:
```html
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
```

- [ ] **Step 2: Picker-Render und Click-Handler in `popup.js` ergänzen**

In `render(state)`, den `else if (state.view === POPUP_VIEW.PICKER)`-Zweig ersetzen durch `renderPicker(state);` und folgende Funktion sowie Event-Wiring ergänzen:
```javascript
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
    li.className = "device " + (d.status === "ONLINE" || d.status === undefined ? "online" : "offline");
    li.dataset.deviceId = d.id;
    const dot = document.createElement("span");
    dot.className = "dot " + (d.status === "ONLINE" || d.status === undefined ? "online" : "offline");
    li.appendChild(dot);
    const nm = document.createElement("span");
    nm.className = "name";
    nm.textContent = d.name ?? d.id;
    li.appendChild(nm);
    ulDev.appendChild(li);
  }
}

document.getElementById("picker-devices").addEventListener("click", async (e) => {
  const li = e.target.closest("li.device");
  if (!li) return;
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

let currentPendingId = null;

const origRender = render;
render = function (state) {
  currentPendingId = state?.pending?.id ?? null;
  origRender(state);
};
```

- [ ] **Step 3: Picker-Styles ergänzen**

In `popup/popup.css` anhängen:
```css
.urls { list-style: none; padding: 0; margin: 0; font-size: 12px; color: var(--muted); }
.urls li { padding: 4px 0; word-break: break-all; }
.urls li.more { color: #0f766e; font-style: italic; }
.devices.clickable .device { cursor: pointer; padding: 8px; border-radius: 4px; }
.devices.clickable .device:hover { background: #b8d6d6; }
.devices.clickable .device.offline { opacity: 0.5; cursor: not-allowed; }
.devices.clickable .device.sending { opacity: 0.6; pointer-events: none; }
```

- [ ] **Step 4: Manuell testen**

1. Eingeloggt sein.
2. CnL-Test-Seite öffnen, "flash/add" klicken.
3. Picker-Popup zeigt URLs und Geräteliste.
4. Cancel-Button funktioniert (Popup schließt, kein Senden).
5. Erneut triggern, ein Gerät klicken → SW-Konsole zeigt `PICK_DEVICE`-Message (Erfolg ohne addLinks-Call kommt erst Task 13).

Erwartung: Picker-UI verhält sich korrekt, Cancel verwirft Pending.

- [ ] **Step 5: Commit**

```bash
git add popup/popup.html popup/popup.js popup/popup.css
git commit -m "feat(popup): add picker view with URL preview and device selection"
```

---

## Task 13: Service Worker + API — `addLinks` aufrufen, Erfolgs-Notification

**Files:**
- Modify: `background/myjd-api.js`
- Modify: `background/service-worker.js`

- [ ] **Step 1: `addLinks`-Wrapper im API-Modul ergänzen**

In `background/myjd-api.js` ans Ende anhängen:
```javascript
export async function addLinks(session, deviceId, { links, sourceUrl, autostart = false, packageName = null, passwords = "" }) {
  const linksStr = Array.isArray(links) ? links.join("\n") : String(links ?? "");
  const param = {
    autostart,
    links: linksStr,
    sourceUrl: sourceUrl ?? "",
    packageName,
    autoExtract: false,
    overwritePackagizerRules: false,
    deepDecrypt: false,
    extractPassword: passwords || null,
  };
  return deviceCall(session, deviceId, "/linkgrabberv2/addLinks", [param]);
}
```

- [ ] **Step 2: `PICK_DEVICE`-Handler im Service Worker implementieren**

In `background/service-worker.js`, am Anfang die Imports erweitern:
```javascript
import { addLinks } from "./myjd-api.js";
```

Vor dem `chrome.runtime.onMessage.addListener` ergänzen:
```javascript
async function handlePickDevice(requestId, deviceId) {
  const entry = pending.get(requestId);
  if (!entry) throw new MyJdApiError("Anfrage nicht mehr verfügbar (Timeout?)", "PENDING_GONE");
  await ensureSessionAlive();
  const devices = await getDevices().catch(() => cachedDevices ?? []);
  const dev = devices.find((d) => d.id === deviceId) ?? { id: deviceId, name: deviceId };

  try {
    await addLinks(session, deviceId, {
      links: entry.urls,
      sourceUrl: entry.source,
      passwords: entry.passwords,
      autostart: false,
    });
  } catch (e) {
    if (e.code === 401 || e.code === 403) {
      try {
        await reconnect(session);
        await addLinks(session, deviceId, {
          links: entry.urls,
          sourceUrl: entry.source,
          passwords: entry.passwords,
          autostart: false,
        });
      } catch (e2) {
        notify(`Senden fehlgeschlagen: ${e2.message ?? e2}`);
        throw e2;
      }
    } else {
      notify(`Senden fehlgeschlagen: ${e.message ?? e}`);
      throw e;
    }
  }
  pending.delete(requestId);
  notify(`${entry.urls.length} Link${entry.urls.length === 1 ? "" : "s"} an ${dev.name} gesendet`);
}

function notify(message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon48.png"),
    title: "MyJDownloader",
    message,
  });
}
```

- [ ] **Step 3: Switch-Case für `PICK_DEVICE` ergänzen**

Im `switch (msg?.type)`-Block:
```javascript
case MSG.PICK_DEVICE:
  await handlePickDevice(msg.requestId, msg.deviceId);
  sendResponse({ ok: true });
  break;
```

- [ ] **Step 4: Manuell End-to-End testen**

1. Extension neu laden, eingeloggt.
2. JDownloader auf einem verbundenen Gerät offen halten.
3. CnL-Test-Seite "flash/add" → Picker zeigt URLs und Geräte.
4. Gerät anklicken.
5. Erwartung: Browser-Notification "2 Links an &lt;Gerätename&gt; gesendet"; im JDownloader auf dem Gerät tauchen die zwei Links im LinkGrabber auf.
6. Wiederholen mit "flash/addcrypted2".

Erwartung: Beide Pfade funktionieren, Notification erscheint, Links sind im JD sichtbar.

- [ ] **Step 5: Commit**

```bash
git add background/myjd-api.js background/service-worker.js
git commit -m "feat(sw): send pending CnL links via addLinks and notify on success"
```

---

## Task 14: Reconnect-Retry bei 401/403 + Auth-Verlust-Behandlung

**Files:**
- Modify: `background/service-worker.js`

- [ ] **Step 1: Generischen Retry-Wrapper bauen und Aufrufer migrieren**

In `background/service-worker.js`, vor `handlePickDevice` ergänzen:
```javascript
async function withReconnectRetry(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.code === 401 || e.code === 403 || e.code === "TOKEN" || /token/i.test(e.message ?? "")) {
      await reconnect(session);
      return await fn();
    }
    throw e;
  }
}
```

`handlePickDevice` so umschreiben, dass es `withReconnectRetry` nutzt und das duplizierte try/catch verschwindet:
```javascript
async function handlePickDevice(requestId, deviceId) {
  const entry = pending.get(requestId);
  if (!entry) throw new MyJdApiError("Anfrage nicht mehr verfügbar (Timeout?)", "PENDING_GONE");
  await ensureSessionAlive();
  const devices = await getDevices().catch(() => cachedDevices ?? []);
  const dev = devices.find((d) => d.id === deviceId) ?? { id: deviceId, name: deviceId };
  try {
    await withReconnectRetry(() =>
      addLinks(session, deviceId, {
        links: entry.urls,
        sourceUrl: entry.source,
        passwords: entry.passwords,
        autostart: false,
      }),
    );
  } catch (e) {
    if (e.code === "AUTH" || e.code === "RECONNECT_FAILED" || e.code === "NO_CREDS") {
      await clearAllStorage();
      session = null;
      notify("Bitte erneut einloggen — Session abgelaufen.");
      throw e;
    }
    notify(`Senden fehlgeschlagen: ${e.message ?? e}`);
    throw e;
  }
  pending.delete(requestId);
  notify(`${entry.urls.length} Link${entry.urls.length === 1 ? "" : "s"} an ${dev.name} gesendet`);
}
```

`getDevices` analog wrappen:
```javascript
async function getDevices(forceRefresh = false) {
  if (!session?.sessionToken) await ensureSessionAlive();
  const fresh = !cachedDevices || Date.now() - cachedDevicesAt > DEVICE_CACHE_MS;
  if (forceRefresh || fresh) {
    cachedDevices = await withReconnectRetry(() => listDevices(session));
    cachedDevicesAt = Date.now();
    await chrome.storage.session.set({ cachedDevices, cachedDevicesAt });
  }
  return cachedDevices;
}
```

- [ ] **Step 2: Manuell testen**

1. Eingeloggt, CnL-Trigger funktioniert (Smoke-Check).
2. In SW-Konsole `session.sessionToken` manuell ungültig setzen:
   ```javascript
   // hacky test: nichts in JS-Modulkontext direkt zugreifbar — alternativer Test via Session-Cache invalidieren:
   chrome.storage.session.clear();
   ```
   Stattdessen pragmatischer Test: 1 Stunde warten oder Browser neu starten und ohne Login direkt CnL triggern.
3. Erwartung: Reconnect läuft transparent, Senden klappt; ist auch der `regaintoken` weg, erscheint Notification "Bitte erneut einloggen".

Hinweis: 100%-Reproduktion eines abgelaufenen Tokens ohne Wartezeit ist schwierig — pragmatisch reicht: nach Browser-Neustart funktioniert das Senden ohne erneuten Login-Prompt.

- [ ] **Step 3: Commit**

```bash
git add background/service-worker.js
git commit -m "feat(sw): add silent reconnect retry on 401/403 and clear session on auth loss"
```

---

## Task 15: Restliche Fehler-Pfade & CnL-Toggle respektieren

**Files:**
- Modify: `content/cnl-hook.js`
- Modify: `background/service-worker.js`

- [ ] **Step 1: Toggle-Status im Content-Script per Storage abfragen, bevor abgefangen wird**

`content/cnl-hook.js` — am Anfang des Moduls (vor den `parseFormBody`-Helfern) ergänzen und den `dispatch`-Aufruf gating:
```javascript
let cnlEnabledLocal = true;
try {
  chrome.storage.local.get("cnlEnabled", ({ cnlEnabled }) => {
    cnlEnabledLocal = cnlEnabled !== false;
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && "cnlEnabled" in changes) {
      cnlEnabledLocal = changes.cnlEnabled.newValue !== false;
    }
  });
} catch (e) {
  console.warn("[MyJD-MV3] storage-Zugriff aus MAIN-world fehlgeschlagen:", e);
}
```

> **Hinweis zur Realität:** `chrome.storage` ist im MAIN-world **nicht** verfügbar. Die obige Prüfung schlägt deshalb fehl. Lösung: das Toggle-Gating wandert komplett in den Service Worker — der Content Script schickt CnL_LINKS auch bei OFF, der Service Worker wirft sie weg. **Das ist die Implementierung.** Die obigen Zeilen werden also **nicht** committed; stattdessen siehe Step 2.

- [ ] **Step 2: Toggle-Gating im Service Worker (statt Content Script)**

Sicherstellen, dass `handleCnlLinks` bereits prüft (sollte aus Task 11 da sein):
```javascript
if (!cnlEnabled) return;
```

Zusätzlich der Webseite trotzdem ein 200 zurückgegeben — das passiert bereits im Content Script ungeachtet des Toggle-Status, das ist OK (sonst wechselt die Webseite ihr Verhalten je nach Toggle, was schlecht ist). Aktuell aber: Content Script fängt **immer** ab, das gibt Pseudo-Erfolg auch wenn Toggle aus ist und der User wundert sich. Pragmatischer Kompromiss: Toggle-Off = Hook ist trotzdem aktiv, aber Service Worker macht nichts; das wird in Step 3 mit einer kleinen Off-Notification klarer.

- [ ] **Step 3: Notification bei `Toggle OFF + CnL-Aufruf`**

In `handleCnlLinks` (im SW), den frühen Return ergänzen:
```javascript
if (!cnlEnabled) {
  notify("Click'n'Load über die Extension ist deaktiviert.");
  return;
}
```

Außerdem absichern: keine Geräte vorhanden:
```javascript
const devices = await getDevices().catch(() => []);
if (!devices.length) {
  notify("Kein verbundenes Gerät gefunden.");
  return;
}
```

(Diesen Block direkt **nach** `pending.set(...)` hinzufügen, davor verschieben — siehe finale Variante:)
```javascript
async function handleCnlLinks({ urls, source, passwords, error }) {
  gcPending();
  if (error === "decrypt_failed") {
    notify("Click'n'Load-Entschlüsselung fehlgeschlagen.");
    return;
  }
  if (!urls?.length) return;
  if (!cnlEnabled) {
    notify("Click'n'Load über die Extension ist deaktiviert.");
    return;
  }
  if (!session?.sessionToken) {
    try { await ensureSessionAlive(); } catch {
      notify("Bitte erst einloggen, dann Click'n'Load erneut versuchen.");
      return;
    }
  }
  const devices = await getDevices().catch(() => []);
  if (!devices.length) {
    notify("Keine Geräte verbunden.");
    return;
  }
  const requestId = makeRequestId();
  pending.set(requestId, { urls, source: source ?? "", passwords: passwords ?? "", createdAt: Date.now() });
  await openPickerPopup();
}
```

- [ ] **Step 4: Manuell testen**

1. Toggle in Idle-View auf OFF stellen → CnL-Test triggern → Notification "Click'n'Load über die Extension ist deaktiviert.".
2. Toggle wieder ON, Logout → CnL-Test triggern → Notification "Bitte erst einloggen…".
3. Login wieder, alle Geräte offline (im JDownloader auf den Geräten beenden) → CnL-Trigger → Notification "Keine Geräte verbunden.".
4. Decrypt-Fehler simulieren: in `cnl-test.html` ein ungültiges `crypted` (z. B. nur 4 Zeichen Base64) → Notification "Click'n'Load-Entschlüsselung fehlgeschlagen.".

Erwartung: Jede Fehlerart liefert die richtige Notification, kein Picker-Popup öffnet sich fälschlich.

- [ ] **Step 5: Commit**

```bash
git add background/service-worker.js content/cnl-hook.js
git commit -m "feat(sw): handle CnL toggle off, no devices, and not-logged-in with notifications"
```

---

## Task 16: Manuelle End-to-End-Test-Checkliste & README

**Files:**
- Create: `README.md`
- Create: `docs/test-pages/manual-checklist.md`

- [ ] **Step 1: README mit Setup- und Build-Anleitung**

`README.md`:
```markdown
# MyJDownloader (Manifest V3)

Chrome-Extension, die Click'n'Load-Aufrufe abfängt und sie über MyJDownloader an eine ausgewählte JDownloader-Instanz weiterleitet.

## Setup

1. Repository klonen.
2. `chrome://extensions/` öffnen → Entwicklermodus aktivieren → "Entpackte Erweiterung laden" → diesen Ordner wählen.
3. Extension-Icon klicken → mit MyJDownloader-Account einloggen.
4. Auf einer Seite mit Click'n'Load-Button ausprobieren.

## Architektur

- Service Worker (`background/`) hält die Session und kommuniziert mit der MyJDownloader-API.
- Content Script (`content/cnl-hook.js`) läuft im MAIN-World jeder Seite und hooked `fetch`/`XHR`.
- Popup (`popup/`) ist eine Mini-State-Machine: `loggedOut`, `idle`, `picker`.

Mehr in [docs/superpowers/specs/](docs/superpowers/specs/).

## Testen

Siehe [docs/test-pages/manual-checklist.md](docs/test-pages/manual-checklist.md).
```

- [ ] **Step 2: Manuelle Test-Checkliste schreiben**

`docs/test-pages/manual-checklist.md`:
```markdown
# Manuelle Test-Checkliste

## Setup
- [ ] Extension geladen, keine Manifest-Fehler in `chrome://extensions/`.
- [ ] Service-Worker-Konsole zeigt `service worker started`.

## Login & Idle
- [ ] Storage leer → Popup zeigt Login-Form.
- [ ] Login mit gültigen Credentials → Idle-View mit Email + Geräteliste.
- [ ] Falsche Credentials → Inline-Error "Login fehlgeschlagen: …".
- [ ] Browser neu starten → Popup zeigt direkt Idle (Auto-Reconnect ohne Prompt).
- [ ] CnL-Toggle OFF/ON → `chrome.storage.local.get("cnlEnabled", …)` reflektiert den Status.
- [ ] "Aktualisieren"-Button → Geräteliste wird neu geladen.
- [ ] Logout → Storage geleert, Popup zeigt Login-Form.

## Click'n'Load
- [ ] `docs/test-pages/jdcheck-test.html` → Button liefert `jdownloader=true; …`.
- [ ] `docs/test-pages/cnl-test.html` → "flash/add" öffnet Picker mit zwei URLs, Senden landet im JDownloader.
- [ ] `cnl-test.html` → "flash/addcrypted2" öffnet Picker mit zwei entschlüsselten URLs, Senden landet im JDownloader.
- [ ] Echte CnL-Webseite (z. B. die ursprünglich getestete Seite) → Picker öffnet, Senden klappt.

## Fehler-Pfade
- [ ] Toggle OFF + CnL-Trigger → Notification "Click'n'Load über die Extension ist deaktiviert.".
- [ ] Logout + CnL-Trigger → Notification "Bitte erst einloggen…".
- [ ] Alle Geräte offline + CnL-Trigger → Notification "Keine Geräte verbunden.".
- [ ] Picker-Cancel-Button → schließt Popup, Pending wird verworfen.
- [ ] Pending älter als 5 min → wird beim nächsten `GET_PENDING` aussortiert.

## Mehrere Geräte
- [ ] Account mit mindestens zwei Geräten → Picker zeigt beide.
- [ ] Online-Indikator: grün für ONLINE, grau sonst.
- [ ] Klick auf offline-Gerät → cursor: not-allowed (kein Senden).

## iFrames
- [ ] CnL-Trigger aus iFrame (z. B. `cnl-test.html` in `<iframe>` einbetten) → Picker öffnet, Senden klappt.
```

- [ ] **Step 3: Checkliste durchgehen, Fehler dokumentieren**

Jeden Punkt manuell prüfen. Gefundene Fehler entweder direkt fixen oder als Issue / Follow-up notieren.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/test-pages/manual-checklist.md
git commit -m "docs: add README and manual end-to-end test checklist"
```

---

## Self-Review-Checkliste (vor Implementierungsbeginn)

**1. Spec-Coverage**
- ✅ MV3-kompatibel, Manifest in Task 1
- ✅ Email/Passwort-Login, persistierte Auto-Reconnect-Session: Tasks 4, 6, 14
- ✅ `/jdcheck.js`, `/flash/add`, `/flash/addcrypted2` abfangen: Tasks 9, 10
- ✅ `crypted`+`jk` entschlüsseln: Task 10
- ✅ Picker-Popup öffnet bei Trigger: Tasks 11, 12
- ✅ `/linkgrabberv2/addLinks` an gewähltes Gerät: Task 13
- ✅ Idle-Popup mit Email, CnL-Toggle, Geräteliste: Task 8
- ✅ Storage-Strategie umgesetzt: Tasks 4, 6, 11
- ✅ Fehlerbehandlung (Toggle off, no devices, decrypt error, 401/403): Tasks 14, 15
- ✅ Manuelles Testen statt Automation: Task 16

**2. Placeholder-Scan**
- Keine "TBD"/"TODO"-Marker in den Tasks; das Notification-Icon bezieht sich auf `icons/icon48.png` (existiert nach Task 1).
- Alle Codeblöcke vollständig.

**3. Type/Naming-Konsistenz**
- `MSG.CNL_LINKS`, `MSG.PICK_DEVICE`, `MSG.GET_PENDING`, `MSG.CANCEL_PENDING` in `shared/messages.js` definiert (Task 3) und in Service Worker (Task 11) sowie Popup (Task 12) referenziert.
- `MyJdSession`-Felder (`email`, `loginSecret`, `deviceSecret`, `sessionToken`, `regainToken`, `serverEncToken`, `deviceEncToken`) konsistent in Tasks 4, 5, 6, 13.
- `pending`-Map-Eintrag-Form `{ urls, source, passwords, createdAt }` konsistent zwischen `handleCnlLinks` (Task 11) und `handlePickDevice` (Task 13).
- `handleCnlLinks` wird in Task 15 erweitert — Endform in Task-15-Step-3 vollständig dargestellt, kein Konflikt mit Task 11.

**4. Offene Punkte (aus der Spec, bewusst nicht im Plan adressiert)**
- API-Algorithmus-Verifikation: in Task 4 + Korrektur in Spec dokumentiert.
- `chrome.action.openPopup`-Fallback: in Task 11 implementiert.
- iFrame-Hook: `all_frames: true` in Task 9 gesetzt; manueller Test in Task 16.
- Rate-Limit: kein dezidierter Backoff im MVP; späteres Thema wenn auffällig.

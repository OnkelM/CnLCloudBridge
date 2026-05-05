import { MSG, POPUP_VIEW, POPUP_PORT_NAME } from "../shared/messages.js";
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
import { bytesToHex, hexToBytes } from "../shared/crypto.js";

const STORAGE_LOCAL_KEYS = ["email", "loginSecret", "deviceSecret", "cnlEnabled"];
const STORAGE_SESSION_KEYS = ["sessionToken", "regainToken", "serverEncToken", "deviceEncToken"];
const NOTIFICATION_ID = "myjd-mv3";

let session = null;
let cnlEnabled = true;
let cachedDevices = null;
let cachedDevicesAt = 0;
const DEVICE_CACHE_MS = 60_000;
const POLL_INTERVAL_MS = 4000;
const DEVICE_FAIL_THRESHOLD = 3;
const NOTIFY_FAIL_INTERVAL_MS = 60_000;
let popupPort = null;
let pollerTimer = null;
const deviceFailCounts = new Map();
let lastFailNotifyAt = 0;

async function loadFromStorage() {
  const local = await chrome.storage.local.get(STORAGE_LOCAL_KEYS);
  cnlEnabled = local.cnlEnabled !== false;
  if (local.email && local.loginSecret && local.deviceSecret) {
    session = MyJdSession.restorePersistent({
      email: local.email,
      loginSecret: local.loginSecret,
      deviceSecret: local.deviceSecret,
    });
    const ses = await chrome.storage.session.get(STORAGE_SESSION_KEYS);
    if (ses.sessionToken) session.sessionToken = ses.sessionToken;
    if (ses.regainToken) session.regainToken = ses.regainToken;
    if (ses.serverEncToken) session.serverEncToken = hexToBytes(ses.serverEncToken);
    if (ses.deviceEncToken) session.deviceEncToken = hexToBytes(ses.deviceEncToken);
  } else {
    session = null;
  }
}

async function persistSessionPersistent(s) {
  await chrome.storage.local.set({
    email: s.email,
    loginSecret: bytesToHex(s.loginSecret),
    deviceSecret: bytesToHex(s.deviceSecret),
  });
}

async function persistSessionVolatile(s) {
  await chrome.storage.session.set({
    sessionToken: s.sessionToken ?? null,
    regainToken: s.regainToken ?? null,
    serverEncToken: s.serverEncToken ? bytesToHex(s.serverEncToken) : null,
    deviceEncToken: s.deviceEncToken ? bytesToHex(s.deviceEncToken) : null,
  });
}

async function clearAllStorage() {
  await chrome.storage.local.clear();
  await chrome.storage.session.clear();
}

async function ensureSessionAlive() {
  if (!session) throw new MyJdApiError("Nicht eingeloggt", "NOT_LOGGED_IN");
  if (session.sessionToken && session.serverEncToken) return;
  try {
    await reconnect(session);
    await persistSessionVolatile(session);
    return;
  } catch (e) {
    if (e.code === "NO_CREDS") throw e;
  }
  await connectWithSecret(session);
  await persistSessionVolatile(session);
}

async function withReconnectRetry(fn) {
  try {
    return await fn();
  } catch (e) {
    if (e.code === 401 || e.code === 403 || /token/i.test(e.message ?? "")) {
      try {
        await reconnect(session);
      } catch {
        await connectWithSecret(session);
      }
      await persistSessionVolatile(session);
      return await fn();
    }
    throw e;
  }
}

function notify(message) {
  chrome.notifications.create(NOTIFICATION_ID, {
    type: "basic",
    iconUrl: chrome.runtime.getURL("icons/icon48.png"),
    title: "MyJDownloader",
    message,
  });
}

async function getDevices(forceRefresh = false) {
  if (!session?.sessionToken) await ensureSessionAlive();
  const fresh = !cachedDevices || Date.now() - cachedDevicesAt > DEVICE_CACHE_MS;
  if (forceRefresh || fresh) {
    cachedDevices = await withReconnectRetry(() => listDevices(session));
    console.debug("[MyJD-MV3] devices:", cachedDevices);
    cachedDevicesAt = Date.now();
    await chrome.storage.session.set({ cachedDevices, cachedDevicesAt });
  }
  return cachedDevices;
}

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
  const requestId = makeRequestId();
  pending.set(requestId, { urls, source: source ?? "", passwords: passwords ?? "", createdAt: Date.now() });
  await openPickerPopup();
}

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

async function buildState() {
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
  if (!session) return { view: POPUP_VIEW.LOGGED_OUT, cnlEnabled };
  if (!session.sessionToken) {
    try {
      await ensureSessionAlive();
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
  await persistSessionPersistent(s);
  await persistSessionVolatile(s);
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
        case MSG.CNL_LINKS:
          await handleCnlLinks(msg);
          sendResponse({ ok: true });
          break;
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
        case MSG.GET_PENDING: {
          gcPending();
          const entries = [...pending.entries()].map(([id, v]) => ({ id, ...v }));
          const last = entries[entries.length - 1] ?? null;
          sendResponse({ pending: last });
          break;
        }
        case MSG.PICK_DEVICE:
          await handlePickDevice(msg.requestId, msg.deviceId);
          sendResponse({ ok: true });
          break;
        case MSG.CANCEL_PENDING:
          pending.delete(msg.requestId);
          sendResponse({ ok: true });
          break;
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

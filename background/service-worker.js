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

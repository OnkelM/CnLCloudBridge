import {
  deriveSecret,
  updateToken,
  hmacSha256,
  aesCbcDecrypt,
  aesCbcEncrypt,
  bytesToHex,
  hexToBytes,
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
    s.loginSecret = hexToBytes(loginSecret);
    s.deviceSecret = hexToBytes(deviceSecret);
    return s;
  }
}

function nextRid(session) {
  session.requestId += 1;
  return session.requestId;
}

async function callApi(path, query, secret, body, { sign = true } = {}) {
  let url = `${API_ROOT}${path}${query}`;
  if (sign) {
    const sigBase = `${path}${query}`;
    const sig = await hmacSha256(secret, sigBase);
    const sep = query.includes("?") ? "&" : "?";
    url = `${API_ROOT}${path}${query}${sep}signature=${sig}`;
  }
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
    let raw = "";
    try {
      raw = await res.text();
    } catch {}
    if (raw) {
      let decrypted = null;
      try {
        decrypted = await aesCbcDecrypt(secret, raw);
      } catch {}
      detail += decrypted ? ` — ${decrypted}` : ` — ${raw}`;
    }
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
  return callApi(path, query, session.deviceEncToken, body, { sign: false });
}

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

export async function connectWithSecret(session) {
  if (!session.email || !session.loginSecret || !session.deviceSecret) {
    throw new MyJdApiError("Keine persistierten Credentials", "NO_CREDS");
  }
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

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
let currentCnlAutoSelect = true;
let currentCnlAutoSelectSeconds = 5;
let autoSelectTimeout = null;
let autoSelectInterval = null;
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
  currentCnlEnabled = state.cnlEnabled !== false;
  currentCnlAutoSelect = state.cnlAutoSelect !== false;
  currentCnlAutoSelectSeconds = state.cnlAutoSelectDelay ?? 5;
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
  const buttons = document.createElement("span");
  buttons.className = "buttons";
  head.appendChild(buttons);
  const btnStop = document.createElement("button");
  btnStop.className = "stop";
  btnStop.disabled = true;
  btnStop.hidden = true;
  btnStop.textContent = "⏹";
  buttons.appendChild(btnStop);
  const btn = document.createElement("button");
  btn.className = "play-pause";
  btn.dataset.state = "idle";
  btn.textContent = "▶";
  buttons.appendChild(btn);
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
  document.getElementById("cnl-toggle-settings-autoselect").checked = currentCnlAutoSelect;
  document.getElementById("cnl-toggle-settings-autoselect-delay").value = currentCnlAutoSelectSeconds;
}

function renderPicker(state) {
  if (autoSelectTimeout) {
    clearTimeout(autoSelectTimeout);
    autoSelectTimeout = null;
  }
  if (autoSelectInterval) {
    clearInterval(autoSelectInterval);
    autoSelectInterval = null;
  }
  showView(POPUP_VIEW.PICKER);
  document.getElementById("picker-countdown").hidden = !currentCnlAutoSelect;
  const countdownEl = document.getElementById("countdown");
  countdownEl.textContent = "";
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
  let firstOnlineDeviceEl = null;
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
    if (isOnline && !firstOnlineDeviceEl) firstOnlineDeviceEl = li;
  }
  if (currentPendingId && firstOnlineDeviceEl && currentCnlAutoSelect) {
    let timeLeft = currentCnlAutoSelectSeconds
    countdownEl.textContent = `${timeLeft}s`;
    autoSelectInterval = setInterval(() => {
      timeLeft -= 1;
      if (timeLeft > 0) { countdownEl.textContent = `${timeLeft}s`; }
      else {
        countdownEl.textContent = "Sende...";
        clearInterval(autoSelectInterval);
        autoSelectInterval = null;
      }
    }, 1000);
    autoSelectTimeout = setTimeout(() => {
      if (firstOnlineDeviceEl && document.body.contains(firstOnlineDeviceEl)) selectDevice(firstOnlineDeviceEl);
    }, currentCnlAutoSelectSeconds * 1000);
  }
}

async function selectDevice(liElement) {
  if (autoSelectTimeout) {
    clearTimeout(autoSelectTimeout);
    autoSelectTimeout = null;
  }
  if (autoSelectInterval) {
    clearInterval(autoSelectInterval);
    autoSelectInterval = null;
  }
  if (liElement.classList.contains("offline")) return;
  const requestId = currentPendingId;
  const deviceId = liElement.dataset.deviceId;
  const errEl = document.getElementById("picker-error");
  errEl.hidden = true;
  liElement.classList.add("sending");
  const res = await send({ type: MSG.PICK_DEVICE, requestId, deviceId });
  if (res?.error) {
    liElement.classList.remove("sending");
    errEl.textContent = res.error;
    errEl.hidden = false;
    return;
  }
  await refreshState();
  window.close();
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

document.getElementById("cnl-toggle-settings-autoselect").addEventListener("change", async (e) => {
  currentCnlAutoSelect = e.target.checked;
  await send({ type: MSG.SET_CNL_AUTOSELECT, enabled: e.target.checked });
});

document.getElementById("cnl-toggle-settings-autoselect-delay").addEventListener("change", async (e) => {
  currentCnlAutoSelectSeconds = parseInt(e.target.value, 10) || 5;
  await send({ type: MSG.SET_CNL_AUTOSELECT_DELAY, delay: currentCnlAutoSelectSeconds });
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

document.getElementById("devices-list").addEventListener("click", async (e) => {
  const card = e.target.closest("li.device-card"); if (!card) return;
  const btn = e.target.closest("button.play-pause");
  const btnStop = e.target.closest("button.stop");
  const deviceId = card.dataset.deviceId;
  if (btn){
    const wasRunning = btn.dataset.state === "running";
    btn.disabled = true;
    const prevText = btn.textContent;
    const msgType = wasRunning ? MSG.PAUSE_DOWNLOADS : MSG.START_DOWNLOADS;
    const payload = wasRunning
      ? { type: msgType, deviceId, paused: true }
      : { type: msgType, deviceId };
    const res = await send(payload);
    btn.disabled = false;
    if (res?.error) {
      btn.textContent = prevText;
      console.error("play/pause failed:", res.error);
    }
  }
  if (btnStop){
    btnStop.disabled = true;
    const res = await send({ type: MSG.STOP_DOWNLOADS, deviceId });
    if (res?.error) {
      btnStop.disabled = false;
      console.error("stop failed:", res.error);
    }
    btnStop.hidden = true;
  }
});

document.getElementById("picker-devices").addEventListener("click", async (e) => {
  const li = e.target.closest("li.device");
  if (!li) return;
  selectDevice(li);
});

document.getElementById("picker-cancel").addEventListener("click", async () => {
  if (autoSelectTimeout) clearTimeout(autoSelectTimeout);
  if (autoSelectInterval) clearInterval(autoSelectInterval);
  if (currentPendingId) await send({ type: MSG.CANCEL_PENDING, requestId: currentPendingId });
  window.close();
});

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
  const resolvedState = raw?.jdState ?? raw?.state ?? "IDLE";
  const jdState = resolvedState === "STOPPED_STATE" ? "STOPPED" : resolvedState;

  const speed = agg.downloadSpeed ?? 0;
  const finished = agg.finishedLinks ?? agg.finished ?? agg.linksFinished ?? 0;
  const loaded = agg.bytesLoaded ?? agg.loadedBytes ?? 0;
  const total = agg.bytesTotal ?? agg.totalBytes ?? 0;

  setStatVal(card, "speed", formatSpeed(speed));
  setStateDot(card, jdState);
  setStatVal(card, "finished", finished === 0 ? "-" : String(finished));
  setStatVal(card, "bytes", `${formatBytes(loaded)} / ${formatBytes(total)}`);

  const btn = card.querySelector(".play-pause");
  if (btn && !btn.disabled) {
    const running = String(jdState).toUpperCase() === "RUNNING";
    btn.dataset.state = running ? "running" : "paused";
    btn.textContent = running ? "⏸" : "▶";
  }
  
  const btnStop = card.querySelector(".stop");
  if (btnStop) {
    const running = String(jdState).toUpperCase() === "RUNNING";
    btnStop.disabled = !running;
    btnStop.hidden = !running;
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
  dot.className = "dot " + (s === "RUNNING" ? "running" : s === "PAUSED" ? "paused" : s == "STOPPED_STATE" ? "stopped" : "idle");
  val.textContent = s;
}

refreshState();

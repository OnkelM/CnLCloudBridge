import { MSG, POPUP_VIEW } from "../shared/messages.js";

const views = {
  [POPUP_VIEW.LOGGED_OUT]: document.getElementById("view-loggedOut"),
  [POPUP_VIEW.IDLE]: document.getElementById("view-idle"),
  [POPUP_VIEW.PICKER]: document.getElementById("view-picker"),
};
const loadingView = document.getElementById("view-loading");

let currentPendingId = null;

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
    renderPicker(state);
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
    dot.className = "dot " + (isDeviceOnline(d) ? "online" : "offline");
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

function isDeviceOnline(d) {
  if (typeof d.status === "string") {
    return !/offline/i.test(d.status);
  }
  if (typeof d.online === "boolean") return d.online;
  if (typeof d.connected === "boolean") return d.connected;
  return true;
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

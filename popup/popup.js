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

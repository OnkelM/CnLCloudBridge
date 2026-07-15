(function () {
  const TARGET_HOSTS = new Set(["127.0.0.1:9666", "localhost:9666"]);

  function isCnlUrl(url) {
    try {
      return TARGET_HOSTS.has(new URL(url, location.href).host);
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
    if (typeof body === "string") {
      const trimmed = body.trim();
      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          const j = JSON.parse(trimmed);
          const p = new URLSearchParams();
          if (j && typeof j === "object" && !Array.isArray(j)) {
            for (const [k, v] of Object.entries(j)) p.append(k, typeof v === "string" ? v : String(v ?? ""));
          }
          return p;
        } catch {}
      }
      return new URLSearchParams(body);
    }
    if (body instanceof URLSearchParams) return body;
    if (body instanceof FormData) {
      const p = new URLSearchParams();
      for (const [k, v] of body.entries()) p.append(k, typeof v === "string" ? v : "");
      return p;
    }
    if (body instanceof Blob) {
      return body.text().then((t) => parseFormBody(t));
    }
    return new URLSearchParams();
  }

  function bodyFromRequest(input, init, url) {
    if (init?.body != null) return Promise.resolve(init.body);
    if (input instanceof Request) {
      try { return input.clone().text(); } catch { return Promise.resolve(null); }
    }
    try {
      const u = new URL(url, location.href);
      return Promise.resolve(u.search.startsWith("?") ? u.search.slice(1) : u.search);
    } catch { return Promise.resolve(null); }
  }

  function postToBridge(payload) {
    window.postMessage({ __myjd: true, ...payload }, "*");
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
    const trimmed = (jkSource ?? "").trim();
    if (/^[0-9a-fA-F]{32}$/.test(trimmed)) return trimmed.toLowerCase();
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
    postToBridge({ type: "CNL_LINKS", urls, source, passwords });
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
      postToBridge({ type: "CNL_LINKS", urls, source, passwords });
    } catch (e) {
      console.error("[MyJD-MV3] Decrypt fehlgeschlagen:", e);
      postToBridge({
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
    const keys = [...params.keys()];
    console.debug("[MyJD-MV3] CnL dispatch:", endpoint, "fields:", keys);
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
        const body = await bodyFromRequest(input, init, url);
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
          let effectiveBody = body;
          if (!effectiveBody) {
            try {
              const u = new URL(hookUrl, location.href);
              effectiveBody = u.search.startsWith("?") ? u.search.slice(1) : u.search;
            } catch {}
          }
          if (isFlash) dispatch(ep, effectiveBody).catch((e) => console.error("[MyJD-MV3]", e));
          const responseBody = isJdcheck ? "jdownloader=true; var jcheck = true;" : "success";
          try {
            Object.defineProperty(xhr, "readyState", { get: () => 4, configurable: true });
            Object.defineProperty(xhr, "status", { get: () => 200, configurable: true });
            Object.defineProperty(xhr, "statusText", { get: () => "OK", configurable: true });
            Object.defineProperty(xhr, "responseText", { get: () => responseBody, configurable: true });
            Object.defineProperty(xhr, "response", { get: () => responseBody, configurable: true });
            Object.defineProperty(xhr, "responseURL", { get: () => hookUrl, configurable: true });
          } catch (defErr) {
            console.warn("[MyJD-MV3] XHR property faking failed, letting real request go:", defErr);
            return origSend.call(xhr, body);
          }
          setTimeout(() => {
            try {
              xhr.dispatchEvent(new Event("readystatechange"));
              xhr.dispatchEvent(new Event("load"));
              xhr.dispatchEvent(new Event("loadend"));
            } catch (evErr) {
              console.warn("[MyJD-MV3] XHR event dispatch failed:", evErr);
            }
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

  const OrigFormSubmit = HTMLFormElement.prototype.submit;
  HTMLFormElement.prototype.submit = function () {
    try {
      const action = this.action || this.getAttribute("action") || "";
      if (action && isCnlUrl(action)) {
        const ep = endpointOf(action);
        if (ep === "/flash/add" || ep === "/flash/addcrypted2" || ep === "/flash/addcrypted") {
          const fd = new FormData(this);
          const params = new URLSearchParams();
          for (const [k, v] of fd.entries()) {
            params.append(k, typeof v === "string" ? v : "");
          }
          console.debug("[MyJD-MV3] intercepted form.submit() to", ep);
          dispatch(ep, params).catch((e) => console.error("[MyJD-MV3]", e));
          return; // swallow the real submit — never navigates
        }
      }
    } catch (e) {
      console.warn("[MyJD-MV3] form submit hook failed, falling back:", e);
    }
    return OrigFormSubmit.call(this);
  };

  function handleScriptElement(node) {
    if (!node || node.tagName !== "SCRIPT") return;
    const src = node.getAttribute("src") || node.src;
    if (!src || !isCnlUrl(src)) return;
    const ep = endpointOf(src);
    if (ep === "/jdcheck.js" || ep === "/jdcheck") {
      node.removeAttribute("src");
      setTimeout(() => {
        try { node.dispatchEvent(new Event("load")); } catch {}
      }, 0);
      try { window.jdownloader = true; } catch {}
      try { window.jcheck = true; } catch {}
      return;
    }
    if (ep === "/flash/add" || ep === "/flash/addcrypted2" || ep === "/flash/addcrypted") {
      try {
        const u = new URL(src, location.href);
        const body = u.search.startsWith("?") ? u.search.slice(1) : u.search;
        console.debug("[MyJD-MV3] JSONP CnL trigger:", ep);
        dispatch(ep, body).catch((e) => console.error("[MyJD-MV3]", e));
      } catch (e) {
        console.error("[MyJD-MV3] JSONP parse failed:", e);
      }
      node.removeAttribute("src");
      setTimeout(() => {
        try { node.dispatchEvent(new Event("load")); } catch {}
      }, 0);
    }
  }

  const scriptObserver = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === "SCRIPT") {
          handleScriptElement(node);
        } else if (node.querySelectorAll) {
          for (const s of node.querySelectorAll("script[src]")) handleScriptElement(s);
        }
      }
    }
  });
  try {
    scriptObserver.observe(document.documentElement || document, { childList: true, subtree: true });
  } catch (e) {
    console.warn("[MyJD-MV3] script observer failed:", e);
  }

  console.debug("[MyJD-MV3] CnL hook installed (full)");
})();

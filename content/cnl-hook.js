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

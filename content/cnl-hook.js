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

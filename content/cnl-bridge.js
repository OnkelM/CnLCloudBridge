(function () {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__myjd !== true) return;
    if (data.type !== "CNL_LINKS") return;
    const urlsCount = Array.isArray(data.urls) ? data.urls.length : 0;
    console.debug("[MyJD-MV3] bridge received CNL_LINKS, urls=" + urlsCount + ", error=" + (data.error ?? "none"));
    chrome.runtime.sendMessage(
      {
        type: "CNL_LINKS",
        urls: data.urls,
        source: data.source,
        passwords: data.passwords,
        error: data.error,
      },
      (resp) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          console.error("[MyJD-MV3] bridge sendMessage error:", lastErr.message ?? lastErr);
        } else {
          console.debug("[MyJD-MV3] bridge → SW response:", resp);
        }
      },
    );
  });
  console.debug("[MyJD-MV3] CnL bridge installed");
})();

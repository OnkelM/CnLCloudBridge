(function () {
  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.__myjd !== true) return;
    if (data.type !== "CNL_LINKS") return;
    chrome.runtime.sendMessage({
      type: "CNL_LINKS",
      urls: data.urls,
      source: data.source,
      passwords: data.passwords,
      error: data.error,
    });
  });
  console.debug("[MyJD-MV3] CnL bridge installed");
})();

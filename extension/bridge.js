// Bridge: escuta window.postMessage do painel Apont Auto e encaminha para o service worker.
// O painel envia: window.postMessage({ source: "apontauto-panel", type: "enqueue", batch }, "*")

(function () {
  if (window.__apontautoBridge__) return;
  window.__apontautoBridge__ = true;

  // Marca a página para o painel detectar que a extensão está instalada.
  try {
    const flag = document.createElement("meta");
    flag.name = "apontauto-extension";
    flag.content = "1.0.0";
    document.head?.appendChild(flag);
    document.documentElement.dataset.apontautoExtension = "1.0.0";
  } catch { /* noop */ }

  window.addEventListener("message", (ev) => {
    const data = ev?.data;
    if (!data || typeof data !== "object") return;
    if (data.source !== "apontauto-panel") return;
    if (data.type === "enqueue" && data.batch) {
      chrome.runtime.sendMessage({ type: "apontauto:enqueue", batch: data.batch }, (resp) => {
        window.postMessage(
          { source: "apontauto-extension", type: "enqueue:ack", requestId: data.requestId, response: resp || { ok: false } },
          "*",
        );
      });
    }
    if (data.type === "ping") {
      window.postMessage(
        { source: "apontauto-extension", type: "pong", requestId: data.requestId, version: "1.0.0" },
        "*",
      );
    }
    if (data.type === "open-prisma") {
      chrome.runtime.sendMessage({ type: "apontauto:open-prisma" });
    }
  });
})();

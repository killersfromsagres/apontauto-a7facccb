// Service worker — fila de lotes e coordenação entre painel e Prisma4.
// Armazena o payload em chrome.storage.local e sinaliza a aba do Prisma4.

const VERSION = "1.0.0";

async function enqueue(batch) {
  const stamped = {
    ...batch,
    id: batch.id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    enqueuedAt: new Date().toISOString(),
    status: "pending",
  };
  const { queue = [] } = await chrome.storage.local.get(["queue"]);
  queue.push(stamped);
  await chrome.storage.local.set({ queue });
  chrome.action.setBadgeText({ text: String(queue.filter((b) => b.status === "pending").length) });
  chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
  try {
    chrome.notifications?.create({
      type: "basic",
      iconUrl: "icons/icon128.png",
      title: "Apont Auto",
      message: `Lote recebido: ${stamped.os?.length || 0} OS · ${stamped.categoria}. Abra o Prisma4 para executar.`,
    });
  } catch { /* noop */ }
  return stamped.id;
}

async function refreshBadge() {
  const { queue = [] } = await chrome.storage.local.get(["queue"]);
  const pending = queue.filter((b) => b.status === "pending").length;
  chrome.action.setBadgeText({ text: pending > 0 ? String(pending) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#10b981" });
}

chrome.runtime.onInstalled.addListener(() => { refreshBadge(); });
chrome.runtime.onStartup?.addListener(() => refreshBadge());

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "apontauto:enqueue") {
        const id = await enqueue(msg.batch);
        sendResponse({ ok: true, id });
        return;
      }
      if (msg?.type === "apontauto:list") {
        const { queue = [], history = [] } = await chrome.storage.local.get(["queue", "history"]);
        sendResponse({ ok: true, queue, history, version: VERSION });
        return;
      }
      if (msg?.type === "apontauto:clear-queue") {
        await chrome.storage.local.set({ queue: [] });
        await refreshBadge();
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "apontauto:remove") {
        const { queue = [] } = await chrome.storage.local.get(["queue"]);
        await chrome.storage.local.set({ queue: queue.filter((b) => b.id !== msg.id) });
        await refreshBadge();
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "apontauto:update-status") {
        const { queue = [], history = [] } = await chrome.storage.local.get(["queue", "history"]);
        const idx = queue.findIndex((b) => b.id === msg.id);
        if (idx >= 0) {
          queue[idx] = { ...queue[idx], ...msg.patch };
          if (msg.patch?.status === "done" || msg.patch?.status === "error") {
            history.unshift(queue[idx]);
            queue.splice(idx, 1);
          }
        }
        await chrome.storage.local.set({ queue, history: history.slice(0, 50) });
        await refreshBadge();
        sendResponse({ ok: true });
        return;
      }
      if (msg?.type === "apontauto:open-prisma") {
        const tab = await chrome.tabs.create({ url: "https://cimogps.com.br/Prisma4/AccountCustom/Login?ReturnUrl=%2fPrisma4", active: true });
        sendResponse({ ok: true, tabId: tab.id });
        return;
      }
      sendResponse({ ok: false, error: "unknown" });
    } catch (e) {
      sendResponse({ ok: false, error: String(e?.message || e) });
    }
  })();
  return true;
});

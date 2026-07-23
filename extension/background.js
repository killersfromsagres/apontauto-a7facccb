// Service worker MV3 — heartbeat + polling leve do Supabase.
// A execução real acontece no content script (content.js) na aba do Prisma.

const HEARTBEAT_MIN = 1; // minutos

async function getConfig() {
  return chrome.storage.local.get(["supabaseUrl", "anonKey", "userCode"]);
}

async function heartbeat() {
  const cfg = await getConfig();
  if (!cfg.supabaseUrl || !cfg.anonKey) return;
  try {
    // best-effort: apenas timestamp local. O painel exibe o último ping via realtime da própria tabela se existir.
    await chrome.storage.local.set({ lastHeartbeat: Date.now() });
  } catch (e) {
    console.warn("[ApontAuto] heartbeat error", e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create?.("heartbeat", { periodInMinutes: HEARTBEAT_MIN });
  heartbeat();
});

chrome.alarms?.onAlarm.addListener((alarm) => {
  if (alarm.name === "heartbeat") heartbeat();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "config-updated") {
    heartbeat();
    sendResponse({ ok: true });
  }
  if (msg?.type === "get-config") {
    getConfig().then(sendResponse);
    return true; // async
  }
  return false;
});

// Service worker — mantém a sessão autenticada e envia heartbeat ao Supabase
// a cada minuto, gravando em prisma_extensao_status para o painel acender verde.

const HEARTBEAT_MIN = 1;
const VERSION = "3.1.0";

async function getConfig() {
  return chrome.storage.local.get([
    "supabaseUrl",
    "anonKey",
    "userCode",
    "accessToken",
    "userId",
  ]);
}

async function sbFetch(path, init = {}) {
  const cfg = await getConfig();
  if (!cfg.supabaseUrl || !cfg.anonKey) throw new Error("Supabase não configurado.");
  const headers = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.accessToken || cfg.anonKey}`,
    "Content-Type": "application/json",
    ...(init.headers || {}),
  };
  return fetch(`${cfg.supabaseUrl}${path}`, { ...init, headers });
}

async function heartbeat() {
  try {
    const cfg = await getConfig();
    if (!cfg.supabaseUrl || !cfg.anonKey || !cfg.accessToken || !cfg.userId) {
      await chrome.storage.local.set({ lastHeartbeat: Date.now() });
      return;
    }
    const body = [
      {
        user_id: cfg.userId,
        ultima_atividade: new Date().toISOString(),
        versao: VERSION,
        info: { code: cfg.userCode || null, ua: navigator.userAgent },
      },
    ];
    const res = await sbFetch(`/rest/v1/prisma_extensao_status?on_conflict=user_id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.warn("[ApontAuto] heartbeat", res.status, await res.text());
    await chrome.storage.local.set({ lastHeartbeat: Date.now() });
  } catch (e) {
    console.warn("[ApontAuto] heartbeat err", e);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms?.create("heartbeat", { periodInMinutes: HEARTBEAT_MIN });
  heartbeat();
});
chrome.runtime.onStartup?.addListener(() => heartbeat());
chrome.alarms?.onAlarm.addListener((a) => {
  if (a.name === "heartbeat") heartbeat();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "config-updated") {
    heartbeat().then(() => sendResponse({ ok: true }));
    return true;
  }
  if (msg?.type === "get-config") {
    getConfig().then(sendResponse);
    return true;
  }
  if (msg?.type === "ping-heartbeat") {
    heartbeat().then(() => sendResponse({ ok: true }));
    return true;
  }
  return false;
});

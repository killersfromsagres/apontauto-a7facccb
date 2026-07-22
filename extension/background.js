// Service worker — orquestra abertura da aba do Prisma4 e injeção do runner.

let currentTabId = null;
let stopFlag = false;

function toPopup(msg) {
  chrome.runtime.sendMessage(msg).catch(() => {});
}

async function openPrisma4Tab() {
  const tab = await chrome.tabs.create({
    url: "https://cimogps.com.br/Prisma4/AccountCustom/Login?ReturnUrl=%2fPrisma4",
    active: true,
  });
  return tab.id;
}

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("Timeout aguardando carregamento da aba."));
    }, timeoutMs);
    function listener(id, info) {
      if (id === tabId && info.status === "complete") {
        clearTimeout(t);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
  });
}

async function injectRunner(tabId, payload) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content.js"],
  });
  await chrome.tabs.sendMessage(tabId, { type: "APONTAUTO_RUN", payload });
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "APONTAUTO_START") {
    stopFlag = false;
    (async () => {
      try {
        toPopup({ type: "APONTAUTO_LOG", msg: "Abrindo aba do Prisma4…", kind: "info" });
        currentTabId = await openPrisma4Tab();
        await waitForTabComplete(currentTabId);
        toPopup({ type: "APONTAUTO_LOG", msg: "Aba carregada. Injetando runner…", kind: "info" });
        await injectRunner(currentTabId, msg.payload);
      } catch (err) {
        toPopup({ type: "APONTAUTO_LOG", msg: `Erro: ${err.message}`, kind: "err" });
        toPopup({ type: "APONTAUTO_DONE" });
      }
    })();
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "APONTAUTO_STOP") {
    stopFlag = true;
    if (currentTabId) {
      chrome.tabs.sendMessage(currentTabId, { type: "APONTAUTO_STOP" }).catch(() => {});
    }
    sendResponse({ ok: true });
    return true;
  }
  // Relay logs/progress from content script → popup
  if (
    msg?.type === "APONTAUTO_LOG" ||
    msg?.type === "APONTAUTO_PROGRESS" ||
    msg?.type === "APONTAUTO_RESULT" ||
    msg?.type === "APONTAUTO_DONE"
  ) {
    toPopup(msg);
  }
});

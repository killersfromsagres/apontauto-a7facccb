// Content script — roda dentro da aba autenticada do Prisma4.
// Placeholder mínimo: expõe hook global para depuração e responde ao painel.
// A automação real de preenchimento é adicionada aqui conforme evolução do painel.

(function () {
  if (window.__apontAutoPrisma__) return;
  window.__apontAutoPrisma__ = { version: "3.0.0", ready: true };

  // Log discreto para o console do Prisma
  console.info("%c[Apont Auto] extensão v3.0.0 ativa nesta aba do Prisma4.", "color:#a855f7");

  chrome.runtime.onMessage?.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === "ping") {
      sendResponse({ ok: true, href: location.href, version: "3.0.0" });
    }
    return true;
  });
})();

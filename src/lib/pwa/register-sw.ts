/**
 * Registro do service worker de modo offline.
 *
 * Regras rígidas: NUNCA registrar em desenvolvimento, dentro de iframe ou nos
 * domínios de preview da Lovable — o SW guardaria HTML antigo e quebraria o
 * editor. Nestes contextos, qualquer registro anterior é removido.
 * `?sw=off` funciona como chave de emergência para desinstalar o SW.
 */
const PREVIEW_HOST_SUFFIXES = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];

function isBlockedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (window.top !== window.self) return true;

  const host = window.location.hostname;
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  for (const suffix of PREVIEW_HOST_SUFFIXES) {
    if (host === suffix || host.endsWith(`.${suffix}`)) return true;
  }
  return new URLSearchParams(window.location.search).get("sw") === "off";
}

async function unregisterAppServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.allSettled(
    registrations
      .filter((r) => (r.active?.scriptURL ?? r.installing?.scriptURL ?? "").includes("/sw.js"))
      .map((r) => r.unregister()),
  );
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  if (isBlockedContext()) {
    void unregisterAppServiceWorkers();
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      /* offline é um extra: falha no registro não pode quebrar o app */
    });
  });
}

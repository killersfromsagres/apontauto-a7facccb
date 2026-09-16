/**
 * Registro do service worker de modo offline.
 *
 * Regras rígidas: NUNCA registrar em desenvolvimento, dentro de iframe ou nos
 * domínios de preview da Lovable — o SW guardaria HTML antigo e quebraria o
 * editor. Nestes contextos, qualquer registro anterior é removido.
 * `?sw=off` funciona como chave de emergência para desinstalar o SW.
 */
const PREVIEW_HOST_SUFFIXES = ["lovableproject.com", "lovableproject-dev.com", "beta.lovable.dev"];
const SW_UPDATE_INTERVAL_MS = 5 * 60 * 1000;
const SW_URL = "/sw.js?v=20260916-offline-final";

let controllerReloadStarted = false;
let updateTimer: number | null = null;

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
      .filter((registration) =>
        (registration.active?.scriptURL ?? registration.installing?.scriptURL ?? "").includes("/sw.js"),
      )
      .map((registration) => registration.unregister()),
  );
}

function installControllerReloadGuard() {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (controllerReloadStarted) return;
    controllerReloadStarted = true;
    window.location.reload();
  });
}

function installUpdateChecks(registration: ServiceWorkerRegistration) {
  const requestUpdate = () => {
    if (!navigator.onLine) return;
    void registration.update().catch(() => {
      /* atualização do SW é best-effort e não pode interromper o app */
    });
  };

  requestUpdate();

  if (updateTimer === null) {
    updateTimer = window.setInterval(requestUpdate, SW_UPDATE_INTERVAL_MS);
  }

  window.addEventListener("online", requestUpdate);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") requestUpdate();
  });
}

export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  if (isBlockedContext()) {
    void unregisterAppServiceWorkers();
    return;
  }

  installControllerReloadGuard();

  window.addEventListener("load", () => {
    void navigator.serviceWorker
      .register(SW_URL, {
        scope: "/",
        updateViaCache: "none",
      })
      .then((registration) => installUpdateChecks(registration))
      .catch(() => {
        /* offline é um extra: falha no registro não pode quebrar o app */
      });
  });
}

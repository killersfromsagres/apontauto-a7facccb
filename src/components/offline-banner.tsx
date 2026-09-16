import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CloudOff, CloudUpload, RefreshCw, Wifi } from "lucide-react";

import { cn } from "@/lib/utils";

const QUEUE_CHANGED_EVENT = "corretiva-offline-queue-changed";
const SYNC_STATE_EVENT = "corretiva-offline-sync-state";

/**
 * Status global do modo de campo offline.
 * Além da conectividade, mostra quantos apontamentos do usuário atual ainda
 * estão protegidos no aparelho e se já existem OS preparadas para uso offline.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [reconnected, setReconnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pending, setPending] = useState(0);
  const [cachedOrders, setCachedOrders] = useState(0);

  const refreshLocalState = useCallback(async () => {
    try {
      const { outboxCountCurrentUser, getOfflineCacheInfo } = await import("@/lib/corretiva/db");
      const [queueCount, cacheInfo] = await Promise.all([
        outboxCountCurrentUser(),
        getOfflineCacheInfo(),
      ]);
      setPending(queueCount);
      setCachedOrders(cacheInfo.count);
    } catch {
      // IndexedDB pode estar indisponível em navegação privada; não bloqueia o app.
    }
  }, []);

  useEffect(() => {
    const syncConnection = () => {
      const isOffline = !navigator.onLine;
      setOffline((wasOffline) => {
        if (wasOffline && !isOffline) {
          setReconnected(true);
          window.setTimeout(() => setReconnected(false), 4500);
        }
        return isOffline;
      });
      void refreshLocalState();
    };

    const handleQueueChanged = () => void refreshLocalState();
    const handleSyncState = (event: Event) => {
      const detail = (event as CustomEvent<{ state?: string }>).detail;
      setSyncing(detail?.state === "start");
      if (detail?.state === "finish") void refreshLocalState();
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refreshLocalState();
    };

    syncConnection();
    void refreshLocalState();
    window.addEventListener("online", syncConnection);
    window.addEventListener("offline", syncConnection);
    window.addEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged);
    window.addEventListener(SYNC_STATE_EVENT, handleSyncState as EventListener);
    document.addEventListener("visibilitychange", handleVisibility);
    const interval = window.setInterval(() => void refreshLocalState(), 5000);

    return () => {
      window.removeEventListener("online", syncConnection);
      window.removeEventListener("offline", syncConnection);
      window.removeEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged);
      window.removeEventListener(SYNC_STATE_EVENT, handleSyncState as EventListener);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
    };
  }, [refreshLocalState]);

  if (!offline && !reconnected && !syncing && pending === 0) return null;

  const onlineWithPending = !offline && pending > 0;
  const synchronized = !offline && !syncing && pending === 0 && reconnected;
  const offlineNotPrepared = offline && cachedOrders === 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-0 top-0 z-[70] flex items-center justify-center gap-2 border-b px-3 py-2 text-[11px] font-medium sm:text-xs",
        "pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl",
        offline
          ? "border-amber-400/25 bg-[#17130a]/95 text-amber-100"
          : synchronized
            ? "border-emerald-400/25 bg-[#07150f]/95 text-emerald-100"
            : "border-cyan-300/20 bg-[#061119]/95 text-cyan-50",
      )}
    >
      {offline ? (
        <>
          <CloudOff className="size-4 shrink-0 text-amber-300" />
          <span>
            {offlineNotPrepared
              ? "Sem internet — este aparelho ainda não possui OS preparadas. Conecte-se e abra Corretiva Novo uma vez para habilitar o trabalho offline."
              : pending > 0
                ? `Sem internet — ${pending} apontamento${pending === 1 ? "" : "s"} protegido${pending === 1 ? "" : "s"} neste aparelho.`
                : `Sem internet — ${cachedOrders} OS preparada${cachedOrders === 1 ? "" : "s"} para trabalho de campo neste aparelho.`}
          </span>
        </>
      ) : synchronized ? (
        <>
          <CheckCircle2 className="size-4 shrink-0 text-emerald-300" />
          <span>Conexão restabelecida. Todos os apontamentos deste aparelho estão sincronizados.</span>
        </>
      ) : syncing ? (
        <>
          <RefreshCw className="size-4 shrink-0 animate-spin text-cyan-200" />
          <span>Sincronizando {pending > 0 ? `${pending} apontamento${pending === 1 ? "" : "s"}` : "dados de campo"}…</span>
        </>
      ) : onlineWithPending ? (
        <>
          <CloudUpload className="size-4 shrink-0 text-cyan-200" />
          <span>{pending} apontamento{pending === 1 ? "" : "s"} aguardando envio automático.</span>
        </>
      ) : (
        <>
          <Wifi className="size-4 shrink-0 text-emerald-300" />
          <span>Conexão ativa.</span>
        </>
      )}
    </div>
  );
}

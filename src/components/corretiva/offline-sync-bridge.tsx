import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const QUEUE_CHANGED_EVENT = "corretiva-offline-queue-changed";

/**
 * Sincronização global e silenciosa da fila offline de Corretivas.
 * Roda ao entrar no sistema, quando a internet volta, quando uma nova operação
 * entra na fila, ao retornar para a aba e periodicamente enquanto estiver online.
 */
export function CorretivaOfflineSyncBridge() {
  useEffect(() => {
    let disposed = false;
    let running = false;

    const run = async () => {
      if (disposed || running || !navigator.onLine) return;
      running = true;
      try {
        const { data } = await supabase.auth.getSession();
        if (!data.session) return;
        const { syncPending } = await import("@/lib/corretiva/sync");
        const result = await syncPending();
        if (result.sent > 0) {
          console.info(`[CorretivaOffline] ${result.sent} operação(ões) sincronizada(s).`);
        }
        if (result.failed > 0) {
          console.warn(`[CorretivaOffline] ${result.failed} operação(ões) permaneceram na fila para nova tentativa.`);
        }
      } catch (error) {
        console.warn("[CorretivaOffline] Sincronização adiada:", error);
      } finally {
        running = false;
      }
    };

    const scheduleRun = () => window.setTimeout(() => void run(), 0);
    const handleOnline = () => scheduleRun();
    const handleQueueChanged = () => scheduleRun();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") scheduleRun();
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged);
    document.addEventListener("visibilitychange", handleVisibility);

    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") {
        scheduleRun();
      }
    });

    const interval = window.setInterval(() => void run(), 20_000);
    void run();

    return () => {
      disposed = true;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(QUEUE_CHANGED_EVENT, handleQueueChanged);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.clearInterval(interval);
      authListener.subscription.unsubscribe();
    };
  }, []);

  return null;
}

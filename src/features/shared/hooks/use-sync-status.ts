import { useEffect, useState } from "react";

/**
 * Hook para monitorar status online e gerenciar fila de sincronização (Item 7.5)
 */
export function useSyncStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Listener customizado para eventos de sincronização do app
    const handleSyncUpdate = (e: any) => {
      if (e.detail?.count !== undefined) {
        setPendingCount(e.detail.count);
      }
    };
    window.addEventListener("app:sync-status", handleSyncUpdate);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("app:sync-status", handleSyncUpdate);
    };
  }, []);

  return { isOnline, pendingCount };
}

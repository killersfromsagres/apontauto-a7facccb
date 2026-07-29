import { useEffect, useState } from "react";
import { CloudOff, Wifi } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Faixa fixa avisando que o aparelho está sem internet. Os módulos de campo
 * (Refrigeração/Corretiva) continuam salvando localmente e sincronizam depois.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  const [reconectou, setReconectou] = useState(false);

  useEffect(() => {
    const sync = () => {
      const isOffline = !navigator.onLine;
      setOffline((prev) => {
        if (prev && !isOffline) {
          setReconectou(true);
          window.setTimeout(() => setReconectou(false), 3000);
        }
        return isOffline;
      });
    };
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  if (!offline && !reconectou) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-0 top-0 z-[60] flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium",
        "pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-xl",
        offline
          ? "bg-amber-500/20 text-amber-100 border-b border-amber-400/30"
          : "bg-emerald-500/20 text-emerald-100 border-b border-emerald-400/30",
      )}
    >
      {offline ? (
        <>
          <CloudOff className="size-4 shrink-0" />
          <span>Sem internet — seus apontamentos ficam salvos e sobem ao reconectar.</span>
        </>
      ) : (
        <>
          <Wifi className="size-4 shrink-0" />
          <span>Conexão restabelecida. Sincronizando…</span>
        </>
      )}
    </div>
  );
}

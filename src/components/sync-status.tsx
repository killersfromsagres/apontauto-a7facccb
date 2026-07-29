import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CloudOff, RefreshCw, TriangleAlert, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { outboxAll as refrigOutbox } from "@/lib/refrigeracao/db";
import { outboxAll as corretivaOutbox } from "@/lib/corretiva/db";
import { syncPending as syncRefrig } from "@/lib/refrigeracao/sync";
import { syncPending as syncCorretiva } from "@/lib/corretiva/sync";

type Estado = "offline" | "pendente" | "erro" | "sincronizado";

const POLL_MS = 15_000;

async function contarFila(): Promise<{ pendentes: number; comErro: number }> {
  const listas = await Promise.allSettled([refrigOutbox(), corretivaOutbox()]);
  let pendentes = 0;
  let comErro = 0;
  for (const l of listas) {
    if (l.status !== "fulfilled") continue;
    for (const item of l.value as any[]) {
      pendentes += 1;
      if (item?.lastError || item?.dead) comErro += 1;
    }
  }
  return { pendentes, comErro };
}

/**
 * Selo global de sincronização dos fluxos de campo (Corretiva/Refrigeração).
 * Estados: offline, pendente de sincronização, erro e sincronizado.
 * Rascunhos nunca são apagados — apenas reenviados.
 */
export function SyncStatus() {
  const [pendentes, setPendentes] = useState(0);
  const [comErro, setComErro] = useState(0);
  const [offline, setOffline] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  const atualizar = useCallback(async () => {
    setOffline(!navigator.onLine);
    const { pendentes: p, comErro: e } = await contarFila();
    setPendentes(p);
    setComErro(e);
  }, []);

  useEffect(() => {
    atualizar();
    const timer = window.setInterval(atualizar, POLL_MS);
    window.addEventListener("online", atualizar);
    window.addEventListener("offline", atualizar);
    document.addEventListener("visibilitychange", atualizar);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", atualizar);
      window.removeEventListener("offline", atualizar);
      document.removeEventListener("visibilitychange", atualizar);
    };
  }, [atualizar]);

  const sincronizarAgora = async () => {
    if (sincronizando || !navigator.onLine) return;
    setSincronizando(true);
    try {
      await Promise.allSettled([syncRefrig(), syncCorretiva()]);
    } finally {
      setSincronizando(false);
      atualizar();
    }
  };

  const estado: Estado = offline
    ? "offline"
    : comErro > 0
      ? "erro"
      : pendentes > 0
        ? "pendente"
        : "sincronizado";

  // Sem nada na fila e online: não polui a barra superior.
  if (estado === "sincronizado") return null;

  const visual: Record<Exclude<Estado, "sincronizado">, { icon: typeof CloudOff; label: string; hint: string; classe: string }> = {
    offline: {
      icon: CloudOff,
      label: pendentes > 0 ? `Offline · ${pendentes}` : "Offline",
      hint: "Sem internet. Os registros ficam salvos no aparelho e sobem ao reconectar.",
      classe: "border-amber-400/40 bg-amber-500/15 text-amber-200",
    },
    pendente: {
      icon: UploadCloud,
      label: `Pendente · ${pendentes}`,
      hint: "Registros aguardando envio. Toque para sincronizar agora.",
      classe: "border-sky-400/40 bg-sky-500/15 text-sky-200",
    },
    erro: {
      icon: TriangleAlert,
      label: `Erro · ${comErro}`,
      hint: "Alguns envios falharam. O rascunho foi mantido — toque para tentar de novo.",
      classe: "border-rose-400/40 bg-rose-500/15 text-rose-200",
    },
  };

  const { icon: Icon, label, hint, classe } = visual[estado];

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={sincronizarAgora}
          disabled={offline || sincronizando}
          aria-label={hint}
          className={cn("h-9 min-w-11 gap-1.5 rounded-full px-2.5 text-xs font-medium", classe)}
        >
          {sincronizando ? (
            <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Icon className="h-4 w-4" aria-hidden />
          )}
          <span className="hidden sm:inline">{label}</span>
          <span className="sm:hidden">{pendentes || comErro || ""}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent className="max-w-56 text-xs">
        <span className="flex items-start gap-1.5">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden />
          {hint}
        </span>
      </TooltipContent>
    </Tooltip>
  );
}

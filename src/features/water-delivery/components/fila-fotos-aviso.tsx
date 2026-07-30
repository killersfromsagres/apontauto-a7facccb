// Aviso de evidências aguardando envio (item 10.1): a foto nunca é descartada
// em silêncio — fica no aparelho até o ImgBB confirmar, com retry manual.

import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useFilaFotosAgua } from "@/features/water-delivery/offline/fotos";

export function FilaFotosAviso({ className }: { className?: string }) {
  const { itens, processando, reenviar } = useFilaFotosAgua();
  if (!itens.length) return null;

  const comErro = itens.filter((i) => i.status === "erro").length;

  return (
    <div
      className={`rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs ${className ?? ""}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-medium text-amber-600 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          {itens.length} evidência(s) aguardando envio
          {comErro ? ` · ${comErro} com falha` : ""}
        </p>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="min-h-[36px]"
          disabled={processando}
          onClick={() => void reenviar()}
        >
          {processando ? (
            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          )}
          Tentar agora
        </Button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {itens.map((i) => (
          <div key={i.id} className="relative">
            {i.thumb ? (
              <img
                src={i.thumb}
                alt="Evidência na fila"
                className="h-14 w-14 rounded-lg border border-amber-500/40 object-cover opacity-80"
              />
            ) : (
              <div className="grid h-14 w-14 place-items-center rounded-lg border border-amber-500/40 text-[10px]">
                foto
              </div>
            )}
            <span className="absolute inset-x-0 bottom-0 rounded-b-lg bg-background/80 text-center text-[9px]">
              {i.status === "erro" ? "falhou" : "na fila"}
            </span>
          </div>
        ))}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground">
        As fotos ficam guardadas neste aparelho e sobem sozinhas quando houver rede.
      </p>
    </div>
  );
}

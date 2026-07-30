import { AlertTriangle, CloudOff, RefreshCw, UploadCloud } from "lucide-react";

import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAguaSync } from "@/features/water-delivery/offline/offline";

const KIND_LABEL: Record<string, string> = {
  "visita.andamento": "Mudança de status",
  "visita.entrega": "Registro de entrega",
  "visita.retificacao": "Retificação",
};

function quando(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

/**
 * Painel da fila offline (item 16): pendências, falhas visíveis (dead-letter)
 * e botão de tentar novamente. Nenhum rascunho é descartado automaticamente.
 */
export function FilaSincronizacaoCard() {
  const {
    itens,
    pendentes,
    falhas,
    listaFalhas,
    online,
    sincronizando,
    sincronizar,
    tentarNovamente,
  } = useAguaSync();

  return (
    <GlassCard className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {online ? (
            <UploadCloud className="h-4 w-4 text-primary" />
          ) : (
            <CloudOff className="h-4 w-4 text-amber-400" />
          )}
          <h2 className="text-sm font-semibold">Fila de sincronização</h2>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={online ? "secondary" : "outline"}>
            {online ? "Conectado" : "Sem conexão"}
          </Badge>
          <Badge variant="outline">{pendentes} pendente(s)</Badge>
          {falhas > 0 && <Badge variant="destructive">{falhas} com falha</Badge>}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Registros feitos sem internet ficam salvos no aparelho e sobem sozinhos, com novas
        tentativas em intervalos crescentes. Paradas com foto obrigatória só são concluídas no
        servidor depois que a evidência é enviada.
      </p>

      {itens.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nada aguardando envio neste aparelho.</p>
      ) : (
        <ul className="space-y-2">
          {itens.slice(0, 8).map((i) => (
            <li
              key={i.id}
              className="rounded-xl border border-border/50 bg-card/30 px-3 py-2 text-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{KIND_LABEL[i.kind] ?? i.kind}</span>
                <span className="text-muted-foreground">{quando(i.createdAt)}</span>
              </div>
              <p className="mt-0.5 text-muted-foreground">
                {i.dead
                  ? "Falhou várias vezes — aguardando nova tentativa manual."
                  : i.attempts > 0
                    ? `Tentativas: ${i.attempts}`
                    : "Aguardando sincronização"}
              </p>
              {i.lastError && (
                <p className="mt-0.5 flex items-start gap-1 text-rose-300">
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
                  {i.lastError}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border/50 pt-3">
        <Button
          variant="secondary"
          className="min-h-[44px]"
          disabled={!online || sincronizando || pendentes === 0}
          onClick={() => void sincronizar()}
        >
          <RefreshCw className={sincronizando ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />
          Sincronizar agora
        </Button>
        {listaFalhas.length > 0 && (
          <Button
            variant="outline"
            className="min-h-[44px]"
            disabled={!online || sincronizando}
            onClick={() => void tentarNovamente()}
          >
            <AlertTriangle className="mr-2 h-4 w-4" />
            Tentar novamente ({listaFalhas.length})
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

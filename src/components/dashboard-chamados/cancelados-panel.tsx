import { Badge } from "@/components/ui/badge";
import { GlassCard } from "@/components/glass-card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { STATUS_COLOR, STATUS_LABEL } from "@/lib/backorder/status";
import type { V2Cancelado } from "@/lib/dashboard-chamados/stats-v2";

const fmt = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};

/** Histórico de chamados cancelados / não executados. */
export function CanceladosPanel({ rows }: { rows: V2Cancelado[] }) {
  if (rows.length === 0) {
    return (
      <GlassCard>
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum chamado cancelado nesta seleção.
        </p>
      </GlassCard>
    );
  }

  const porMotivo = new Map<string, number>();
  for (const r of rows) {
    const k = (r.statusOrigem || "Não informado").trim();
    porMotivo.set(k, (porMotivo.get(k) ?? 0) + 1);
  }

  return (
    <GlassCard className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold">Histórico de cancelamentos</h3>
        <Badge variant="secondary" className="ml-auto">
          {rows.length.toLocaleString("pt-BR")} OS
        </Badge>
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from(porMotivo.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([motivo, n]) => (
            <Badge key={motivo} variant="outline" className="text-[11px]">
              {motivo} · {n}
            </Badge>
          ))}
      </div>

      <ScrollArea className="max-h-[420px]">
        <div className="grid gap-2 sm:grid-cols-2">
          {rows.map((r) => (
            <div key={r.os} className="rounded-2xl border bg-card/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <span className="font-mono text-xs text-muted-foreground">{r.os}</span>
                <Badge
                  className="shrink-0 text-[10px] text-white"
                  style={{ background: STATUS_COLOR[r.statusCat] }}
                >
                  {STATUS_LABEL[r.statusCat]}
                </Badge>
              </div>
              <p className="mt-1 line-clamp-2 text-sm font-medium">{r.nome || "Sem descrição"}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <Badge variant="outline" className="text-[10px]">
                  {r.equipe || "Sem equipe"}
                </Badge>
                <span className="truncate">{r.predio || "—"}</span>
                <span className="truncate">{r.solicitante || "—"}</span>
                <span className="ml-auto">Aberto em {fmt(r.dataSolicitacao)}</span>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </GlassCard>
  );
}

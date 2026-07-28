import { useEffect, useState } from "react";
import { CheckCircle2, ListChecks, Loader2, RotateCcw } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusBadge } from "@/components/pcm";
import type { ChamadoRow } from "@/lib/dashboard-chamados/parser";

const PAGE_SIZE = 100;

export function ChamadosTable({
  rows,
  pendingOs,
  onToggle,
}: {
  rows: ChamadoRow[];
  pendingOs: Set<string>;
  onToggle: (row: ChamadoRow, next: boolean) => void;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Cada mudança de filtro reinicia a paginação para evitar render de listas longas.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [rows]);

  const visible = rows.slice(0, limit);

  return (
    <GlassCard delay={0.55}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" strokeWidth={1.75} />
          <h3 className="text-base font-semibold">Chamados</h3>
          <Badge variant="secondary" className="text-xs">
            {rows.length}
          </Badge>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Concluir aqui sincroniza automaticamente com o módulo Backorder
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhum chamado no filtro atual"
          description="Ajuste os filtros acima para ver outros chamados."
        />
      ) : (
        <>
          <div
            className="scroll-fluid relative w-full overflow-auto rounded-xl border border-border/60"
            style={{ maxHeight: "min(70vh, 640px)", scrollBehavior: "smooth" }}
          >
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
                <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="whitespace-nowrap px-3 py-2 font-medium">OS</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Descrição</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Equipe</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Solicitante</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Status</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => {
                  const done = r.statusNorm === "concluido";
                  const busy = pendingOs.has(r.os);
                  return (
                    <tr
                      key={r.os}
                      className="border-b border-border/40 last:border-b-0 hover:bg-muted/40"
                    >
                      <td className="px-3 py-2 font-mono text-[11px] tabular-nums">{r.os}</td>
                      <td className="max-w-[340px] truncate px-3 py-2" title={r.descricao}>
                        {r.descricao || "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">{r.equipe}</td>
                      <td className="max-w-[180px] truncate px-3 py-2" title={r.solicitante}>
                        {r.solicitante}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge
                          status={done ? "Concluído" : r.status || "Aberto"}
                          tone={
                            done
                              ? "success"
                              : r.statusNorm === "andamento"
                                ? "warning"
                                : "info"
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant={done ? "outline" : "default"}
                          disabled={busy}
                          onClick={() => onToggle(r, !done)}
                        >
                          {busy ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : done ? (
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          ) : (
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          )}
                          {done ? "Reabrir" : "Concluir"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rows.length > visible.length && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <span className="text-[11px] text-muted-foreground">
                Mostrando {visible.length} de {rows.length}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setLimit((l) => l + PAGE_SIZE)}
              >
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
}

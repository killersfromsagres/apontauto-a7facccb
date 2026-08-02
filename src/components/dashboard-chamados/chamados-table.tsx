import { memo, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CheckCircle2, ListChecks, Loader2, RotateCcw } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, StatusBadge } from "@/components/pcm";
import type { ServerRow } from "@/lib/dashboard-chamados/server-stats";

const PAGE_SIZE = 50;
/** Acima deste volume o corpo da tabela passa a ser virtualizado. */
const VIRTUALIZE_AFTER = 60;
const ROW_HEIGHT = 41;

const STATUS_LABEL: Record<ServerRow["status"], string> = {
  aberto: "Aberta",
  concluido: "Concluída",
  cancelado: "Cancelada",
};

const STATUS_TONE: Record<ServerRow["status"], "success" | "danger" | "info"> = {
  aberto: "info",
  concluido: "success",
  cancelado: "danger",
};

function dateLabel(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
}

/** Linha isolada e memoizada: re-renderiza só quando a própria OS muda. */
const Row = memo(function Row({
  r,
  busy,
  onToggle,
  measureRef,
  index,
}: {
  r: ServerRow;
  busy: boolean;
  onToggle: (row: ServerRow, next: boolean) => void;
  measureRef?: (el: HTMLTableRowElement | null) => void;
  index?: number;
}) {
  const done = r.status === "concluido";
  return (
    <tr
      ref={measureRef}
      data-index={index}
      className="border-b border-border/40 last:border-b-0 hover:bg-muted/40"
    >
      <td className="px-3 py-2 font-mono text-[11px] tabular-nums">{r.os}</td>
      <td className="max-w-[300px] truncate px-3 py-2" title={r.nome ?? ""}>
        {r.nome || "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2">{r.equipe || "—"}</td>
      <td className="max-w-[160px] truncate px-3 py-2" title={r.predio ?? ""}>
        {r.predio || "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2 tabular-nums">{dateLabel(r.dataSolicitacao)}</td>
      <td className="px-3 py-2">
        <StatusBadge status={STATUS_LABEL[r.status]} tone={STATUS_TONE[r.status]} />
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
});

function VirtualBody({
  rows,
  pendingOs,
  onToggle,
  scrollRef,
}: {
  rows: ServerRow[];
  pendingOs: Set<string>;
  onToggle: (row: ServerRow, next: boolean) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
}) {
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const items = virtualizer.getVirtualItems();
  const paddingTop = items.length ? items[0].start : 0;
  const paddingBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0;

  return (
    <tbody>
      {paddingTop > 0 ? (
        <tr aria-hidden>
          <td colSpan={7} style={{ height: paddingTop, padding: 0 }} />
        </tr>
      ) : null}
      {items.map((item) => {
        const r = rows[item.index];
        return (
          <Row
            key={r.os}
            r={r}
            index={item.index}
            measureRef={virtualizer.measureElement}
            busy={pendingOs.has(r.os)}
            onToggle={onToggle}
          />
        );
      })}
      {paddingBottom > 0 ? (
        <tr aria-hidden>
          <td colSpan={7} style={{ height: paddingBottom, padding: 0 }} />
        </tr>
      ) : null}
    </tbody>
  );
}

export const ChamadosTable = memo(function ChamadosTable({
  rows,
  total,
  pendingOs,
  onToggle,
}: {
  rows: ServerRow[];
  total: number;
  pendingOs: Set<string>;
  onToggle: (row: ServerRow, next: boolean) => void;
}) {
  const [limit, setLimit] = useState(PAGE_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [rows]);

  const visible = useMemo(() => rows.slice(0, limit), [rows, limit]);
  const virtualize = visible.length > VIRTUALIZE_AFTER;

  return (
    <GlassCard delay={0.55}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-primary" strokeWidth={1.75} />
          <h3 className="text-base font-semibold">OS mais recentes</h3>
          <Badge variant="secondary" className="text-xs">
            {rows.length} de {total.toLocaleString("pt-BR")}
          </Badge>
        </div>
        <span className="text-[11px] text-muted-foreground">
          Amostra das últimas OS do filtro — concluir aqui sincroniza com o Backorder
        </span>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Nenhuma OS no filtro atual"
          description="Ajuste os filtros acima para ver outras ordens de serviço."
        />
      ) : (
        <>
          <div
            ref={scrollRef}
            className="scroll-fluid relative w-full overflow-auto rounded-xl border border-border/60"
            style={{ maxHeight: "min(70vh, 640px)", scrollBehavior: "smooth" }}
          >
            <table className="w-full min-w-[820px] text-xs">
              <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
                <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="whitespace-nowrap px-3 py-2 font-medium">OS</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Descrição</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Equipe</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Prédio</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Abertura</th>
                  <th className="whitespace-nowrap px-3 py-2 font-medium">Status</th>
                  <th className="whitespace-nowrap px-3 py-2 text-right font-medium">Ação</th>
                </tr>
              </thead>
              {virtualize ? (
                <VirtualBody
                  rows={visible}
                  pendingOs={pendingOs}
                  onToggle={onToggle}
                  scrollRef={scrollRef}
                />
              ) : (
                <tbody>
                  {visible.map((r) => (
                    <Row key={r.os} r={r} busy={pendingOs.has(r.os)} onToggle={onToggle} />
                  ))}
                </tbody>
              )}
            </table>
          </div>

          {rows.length > visible.length && (
            <div className="mt-3 flex items-center justify-center gap-3">
              <span className="text-[11px] text-muted-foreground">
                Mostrando {visible.length} de {rows.length}
              </span>
              <Button size="sm" variant="outline" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </GlassCard>
  );
});

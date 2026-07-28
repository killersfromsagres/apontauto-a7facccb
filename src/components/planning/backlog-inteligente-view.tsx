import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Flame, ListChecks, RefreshCw, Timer } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  DetailDrawer,
  DetailRow,
  EmptyState,
  ErrorState,
  FilterBar,
  KpiCard,
  PriorityBadge,
  StatusBadge,
  type DataTableColumn,
} from "@/components/pcm";
import { fetchBackorderRows } from "@/lib/dashboard-chamados/backorder-sync";
import type { ChamadoRow } from "@/lib/dashboard-chamados/parser";
import { scoreChamados, type ScoredChamado } from "@/modules/planning/backlog-adapter";

const LEVEL_LABEL: Record<string, string> = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Médio",
  baixo: "Baixo",
};

const LEVEL_CLASS: Record<string, string> = {
  critico: "border-destructive/50 bg-destructive/10 text-destructive",
  alto: "border-warning/50 bg-warning/10 text-warning",
  medio: "border-primary/45 bg-primary/10 text-primary",
  baixo: "border-border/60 bg-muted/30 text-muted-foreground",
};

export function BacklogInteligenteView() {
  const [rows, setRows] = useState<ChamadoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [equipe, setEquipe] = useState("todas");
  const [nivel, setNivel] = useState("todos");
  const [selected, setSelected] = useState<ScoredChamado | null>(null);

  const load = async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await fetchBackorderRows();
      setRows(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar o backlog";
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void load(true);
  }, []);

  const scored = useMemo(
    () => scoreChamados(rows.filter((r) => r.statusNorm !== "concluido")),
    [rows],
  );

  const equipes = useMemo(
    () => Array.from(new Set(scored.map((s) => s.row.equipe).filter(Boolean))).sort(),
    [scored],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return scored.filter(({ row, score }) => {
      if (equipe !== "todas" && row.equipe !== equipe) return false;
      if (nivel !== "todos" && score.level !== nivel) return false;
      if (!term) return true;
      return `${row.os} ${row.descricao} ${row.predio} ${row.local} ${row.solicitante}`
        .toLowerCase()
        .includes(term);
    });
  }, [scored, search, equipe, nivel]);

  const kpis = useMemo(() => {
    const criticos = scored.filter((s) => s.score.level === "critico").length;
    const altos = scored.filter((s) => s.score.level === "alto").length;
    const vencidos = scored.filter((s) =>
      s.score.factors.some((f) => f.key === "sla" && f.reason.includes("vencido")),
    ).length;
    return { total: scored.length, criticos, altos, vencidos };
  }, [scored]);

  const columns: DataTableColumn<ScoredChamado>[] = [
    {
      key: "score",
      header: "Score",
      sortValue: (r) => r.score.score,
      className: "w-[7.5rem]",
      cell: ({ score }) => (
        <div className="w-24 space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span>{score.score}</span>
            <Badge variant="outline" className={LEVEL_CLASS[score.level]}>
              {LEVEL_LABEL[score.level]}
            </Badge>
          </div>
          <Progress value={score.score} className="h-1.5" />
        </div>
      ),
    },
    {
      key: "os",
      header: "OS",
      sortValue: (r) => r.row.os,
      className: "whitespace-nowrap font-medium",
      cell: ({ row }) => row.os,
    },
    {
      key: "descricao",
      header: "Descrição da atividade",
      sortValue: (r) => r.row.descricao,
      className: "min-w-[16rem] max-w-[28rem]",
      cell: ({ row }) => <span className="line-clamp-2">{row.descricao || "—"}</span>,
    },
    {
      key: "equipe",
      header: "Equipe",
      sortValue: (r) => r.row.equipe,
      className: "whitespace-nowrap",
      cell: ({ row }) => row.equipe || "—",
    },
    {
      key: "criticidade",
      header: "Criticidade",
      sortValue: (r) => r.row.criticidade,
      className: "whitespace-nowrap",
      cell: ({ row }) => <PriorityBadge priority={row.criticidade} />,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (r) => r.row.statusNorm,
      className: "whitespace-nowrap",
      cell: ({ row }) => <StatusBadge status={row.status || row.statusNorm} />,
    },
    {
      key: "local",
      header: "Local",
      sortValue: (r) => `${r.row.predio} ${r.row.local}`,
      className: "whitespace-nowrap",
      cell: ({ row }) =>
        [row.predio, row.andar, row.local].filter(Boolean).join(" · ") || "—",
    },
  ];

  return (
    <PageShell
      eyebrow="Planejamento"
      title="Backlog Inteligente"
      description="Priorização automática das ordens em aberto por criticidade, risco de segurança, SLA, idade e reincidência — com justificativa de cada ponto atribuído."
      actions={
        <Button variant="outline" onClick={() => void load()} disabled={refreshing}>
          <RefreshCw className={refreshing ? "size-4 animate-spin" : "size-4"} aria-hidden />
          Atualizar
        </Button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <KpiCard
            label="Ordens no backlog"
            value={kpis.total}
            icon={<ListChecks className="size-4" aria-hidden />}
            loading={loading}
          />
          <KpiCard
            label="Score crítico"
            value={kpis.criticos}
            hint="Programar no próximo turno"
            icon={<Flame className="size-4" aria-hidden />}
            loading={loading}
          />
          <KpiCard
            label="Score alto"
            value={kpis.altos}
            hint="Programar nesta semana"
            icon={<AlertTriangle className="size-4" aria-hidden />}
            loading={loading}
          />
          <KpiCard
            label="SLA vencido"
            value={kpis.vencidos}
            icon={<Timer className="size-4" aria-hidden />}
            loading={loading}
          />
        </div>

        <FilterBar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Pesquisar OS, descrição, local ou solicitante…"
          activeCount={[equipe !== "todas", nivel !== "todos"].filter(Boolean).length}
          onClear={() => {
            setEquipe("todas");
            setNivel("todos");
            setSearch("");
          }}
          filters={
            <>
              <Select value={equipe} onValueChange={setEquipe}>
                <SelectTrigger className="h-10 w-full sm:w-44">
                  <SelectValue placeholder="Equipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as equipes</SelectItem>
                  {equipes.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={nivel} onValueChange={setNivel}>
                <SelectTrigger className="h-10 w-full sm:w-40">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os níveis</SelectItem>
                  <SelectItem value="critico">Crítico</SelectItem>
                  <SelectItem value="alto">Alto</SelectItem>
                  <SelectItem value="medio">Médio</SelectItem>
                  <SelectItem value="baixo">Baixo</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
        />

        {error ? (
          <ErrorState description={error} onRetry={() => void load()} />
        ) : !loading && scored.length === 0 ? (
          <EmptyState
            title="Nenhuma ordem em aberto"
            description="Importe ou sincronize o Backorder para calcular o backlog priorizado."
          />
        ) : (
          <DataTable
            data={filtered}
            columns={columns}
            rowKey={({ row }, i) => `${row.os}-${i}`}
            loading={loading}
            onRowClick={setSelected}
            emptyTitle="Nenhuma ordem no filtro atual"
            pageSize={40}
          />
        )}
      </div>

      <DetailDrawer
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
        title={selected ? `OS ${selected.row.os}` : ""}
        description={selected?.score.recommendation}
      >
        {selected ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-border/60 p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-semibold">Score de priorização</span>
                <Badge variant="outline" className={LEVEL_CLASS[selected.score.level]}>
                  {selected.score.score} · {LEVEL_LABEL[selected.score.level]}
                </Badge>
              </div>
              <Progress value={selected.score.score} className="h-2" />
            </div>

            <div className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Justificativa do score
              </p>
              <ul className="space-y-2">
                {selected.score.factors.map((f) => (
                  <li
                    key={f.key}
                    className="flex items-start justify-between gap-3 rounded-xl border border-border/50 p-3 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{f.label}</span>
                      <span className="block text-xs text-muted-foreground">{f.reason}</span>
                    </span>
                    <span
                      className={
                        f.points >= 0
                          ? "shrink-0 font-semibold text-primary"
                          : "shrink-0 font-semibold text-destructive"
                      }
                    >
                      {f.points > 0 ? `+${f.points}` : f.points}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <DetailRow label="Atividade">{selected.row.descricao || "—"}</DetailRow>
              <DetailRow label="Equipe">{selected.row.equipe || "—"}</DetailRow>
              <DetailRow label="Solicitante">{selected.row.solicitante || "—"}</DetailRow>
              <DetailRow label="Local">
                {[selected.row.predio, selected.row.andar, selected.row.local]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </DetailRow>
              <DetailRow label="Abertura">
                {selected.row.dataAbertura
                  ? new Date(selected.row.dataAbertura).toLocaleString("pt-BR")
                  : "—"}
              </DetailRow>
              <DetailRow label="Limite SLA">
                {selected.row.dataLimite
                  ? new Date(selected.row.dataLimite).toLocaleString("pt-BR")
                  : "—"}
              </DetailRow>
            </div>
          </div>
        ) : null}
      </DetailDrawer>
    </PageShell>
  );
}

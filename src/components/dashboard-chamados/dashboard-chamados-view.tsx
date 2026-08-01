import { lazy, Suspense } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Clock,
  Database,
  MailCheck,
  Radio,
  RefreshCw,
  Timer,
  TriangleAlert,
  XCircle,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, ErrorState, SkeletonState } from "@/components/pcm";
import { QuickAccessStrip } from "./quick-access-strip";
import { CanceladosPanel } from "./cancelados-panel";
import { AvaliacaoEmailCard } from "@/components/backorder/avaliacao-email-card";
import { StatusBoard } from "@/components/backorder/status-board";
import { STATUS_CATS, STATUS_COLOR, STATUS_LABEL } from "@/lib/backorder/status";
import { useDashboardV2 } from "./use-dashboard-v2";

const DashboardChartsV2 = lazy(() => import("./dashboard-charts-v2"));

const num = (n: number) => n.toLocaleString("pt-BR");

function Kpi({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}) {
  const tones: Record<string, string> = {
    default: "text-foreground",
    success: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    danger: "text-red-600 dark:text-red-400",
    info: "text-sky-600 dark:text-sky-400",
  };
  return (
    <GlassCard variant="block" className="p-3 sm:p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums sm:text-2xl ${tones[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</p>}
    </GlassCard>
  );
}

export function DashboardChamadosView() {
  const {
    stats,
    uniques,
    anos,
    anoAtual,
    filters,
    setFilters,
    loading,
    refreshing,
    error,
    lastUpdate,
    reload,
  } = useDashboardV2();

  const k = stats.kpis;
  const taxa = k.total ? Math.round((k.concluidos / k.total) * 100) : 0;

  const actions = (
    <div className="flex items-center gap-2">
      <Badge
        variant="outline"
        className="hidden gap-1.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 sm:inline-flex"
      >
        <Radio className="h-3 w-3 animate-pulse" />
        Tempo real
      </Badge>
      <Button variant="outline" size="sm" onClick={() => void reload()} disabled={refreshing}>
        <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        Atualizar
      </Button>
    </div>
  );

  if (loading) {
    return (
      <PageShell title="Dashboard de Chamados" description="Carregando indicadores…">
        <div className="space-y-4">
          <QuickAccessStrip />
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <GlassCard key={i} variant="block" className="h-[96px]" delay={i * 0.03}>
                <span className="sr-only">Carregando indicador</span>
              </GlassCard>
            ))}
          </div>
          <GlassCard>
            <SkeletonState rows={4} />
          </GlassCard>
        </div>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell title="Dashboard de Chamados" description="Sincronizado com Backorder">
        <div className="space-y-4">
          <QuickAccessStrip />
          <ErrorState description={error} onRetry={() => void reload()} />
        </div>
      </PageShell>
    );
  }

  if (k.total === 0) {
    return (
      <PageShell
        title="Dashboard de Chamados"
        description="Nenhuma OS na seleção atual"
        actions={actions}
      >
        <div className="space-y-4">
          <QuickAccessStrip />
          <GlassCard>
            <EmptyState
              className="border-0"
              icon={<Database className="size-5" aria-hidden />}
              title={`Sem chamados em ${filters.ano === "todos" ? "todos os anos" : filters.ano}`}
              description="Importe a planilha na aba Backorder — os indicadores são atualizados automaticamente em tempo real, com os status lidos da coluna G."
              action={
                <Button asChild size="sm" variant="outline">
                  <Link to="/backorder">
                    <ArrowRight className="mr-2 h-4 w-4" />
                    Abrir Backorder
                  </Link>
                </Button>
              }
            />
          </GlassCard>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Dashboard de Chamados"
      description={`${num(k.total)} OS · ${filters.ano === "todos" ? "todos os anos" : `ano ${filters.ano}`}`}
      actions={actions}
    >
      <div className="space-y-4">
        <QuickAccessStrip />

        {/* Filtros — mobile primeiro */}
        <GlassCard className="grid grid-cols-2 gap-2 p-3 lg:grid-cols-4">
          <Select value={filters.ano} onValueChange={(v) => setFilters((f) => ({ ...f, ano: v }))}>
            <SelectTrigger className="h-11">
              <CalendarRange className="mr-2 h-4 w-4 opacity-60" />
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anos.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a === anoAtual ? `${a} (ano atual)` : a}
                </SelectItem>
              ))}
              <SelectItem value="todos">Todos os anos</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.statusCat}
            onValueChange={(v) => setFilters((f) => ({ ...f, statusCat: v }))}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os status</SelectItem>
              {STATUS_CATS.map((c) => (
                <SelectItem key={c} value={c}>
                  {STATUS_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.equipe}
            onValueChange={(v) => setFilters((f) => ({ ...f, equipe: v }))}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Equipe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as equipes</SelectItem>
              {uniques.equipes.map((e) => (
                <SelectItem key={e} value={e}>
                  {e}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.predio}
            onValueChange={(v) => setFilters((f) => ({ ...f, predio: v }))}
          >
            <SelectTrigger className="h-11">
              <SelectValue placeholder="Prédio" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os prédios</SelectItem>
              {uniques.predios.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </GlassCard>

        {/* KPIs */}
        <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-6">
          <Kpi
            icon={<Database className="h-3.5 w-3.5" />}
            label="Total"
            value={num(k.total)}
            hint={`Taxa de conclusão ${taxa}%`}
          />
          <Kpi
            icon={<Clock className="h-3.5 w-3.5" />}
            label="Em aberto"
            value={num(k.abertos)}
            tone="info"
            hint="Aberto, pendente, programado, execução"
          />
          <Kpi
            icon={<CheckCircle2 className="h-3.5 w-3.5" />}
            label="Concluídos"
            value={num(k.concluidos)}
            tone="success"
            hint="Concluído, fechado, validado"
          />
          <Kpi
            icon={<MailCheck className="h-3.5 w-3.5" />}
            label="Aguardando aprovação"
            value={num(k.aguardandoAprovacao)}
            tone="warning"
            hint="Precisam de avaliação"
          />
          <Kpi
            icon={<XCircle className="h-3.5 w-3.5" />}
            label="Cancelados"
            value={num(k.cancelados)}
            tone="danger"
            hint="Cancelado e não executada"
          />
          <Kpi
            icon={<Timer className="h-3.5 w-3.5" />}
            label="Tempo médio"
            value={`${k.tempoMedioDias} d`}
            hint={`${num(k.vencidos)} com SLA vencido`}
          />
        </div>

        {k.vencidos > 0 && (
          <GlassCard className="flex items-center gap-3 border-amber-500/40 bg-amber-500/5 p-3">
            <TriangleAlert className="h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-xs sm:text-sm">
              <strong>{num(k.vencidos)}</strong> chamados com SLA vencido e{" "}
              <strong>{num(k.vencendo48h)}</strong> vencendo nas próximas 48h.
            </p>
          </GlassCard>
        )}

        <Tabs defaultValue="graficos" className="w-full">
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <TabsList className="flex w-max gap-1">
              <TabsTrigger value="graficos" className="min-h-11">
                Gráficos
              </TabsTrigger>
              <TabsTrigger value="avaliacao" className="min-h-11">
                Avaliação pendente
                <Badge className="ml-2 bg-amber-500 text-white">
                  {stats.avaliacaoPendente.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="cancelados" className="min-h-11">
                Cancelados
                <Badge variant="secondary" className="ml-2">
                  {num(k.cancelados)}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="chamados" className="min-h-11">
                Chamados
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="graficos" className="mt-4 space-y-3">
            <div className="-mx-1 overflow-x-auto px-1 pb-1">
              <div className="flex w-max gap-2">
                {STATUS_CATS.filter((c) => (stats.porStatus[c] ?? 0) > 0).map((c) => (
                  <Badge
                    key={c}
                    className="text-[11px] text-white"
                    style={{ background: STATUS_COLOR[c] }}
                  >
                    {STATUS_LABEL[c]} · {num(stats.porStatus[c] ?? 0)}
                  </Badge>
                ))}
              </div>
            </div>
            <Suspense
              fallback={
                <GlassCard>
                  <SkeletonState rows={3} />
                </GlassCard>
              }
            >
              <DashboardChartsV2 stats={stats} />
            </Suspense>
          </TabsContent>

          <TabsContent value="avaliacao" className="mt-4">
            <AvaliacaoEmailCard
              rows={[]}
              resumo={stats.avaliacaoPendente}
              ano={filters.ano === "todos" ? "todos os anos" : filters.ano}
            />
          </TabsContent>

          <TabsContent value="cancelados" className="mt-4">
            <CanceladosPanel rows={stats.cancelados} />
          </TabsContent>

          <TabsContent value="chamados" className="mt-4">
            <StatusBoard
              rows={stats.rows.map((r) => ({
                os: r.os,
                nome: r.nome ?? "",
                equipe: r.equipe ?? "",
                predio: r.predio ?? "",
                andar: r.andar ?? "",
                espaco: r.espaco ?? "",
                outros: r.solicitante ?? "",
                data_solicitacao: r.dataSolicitacao ?? "",
                status_origem: r.statusOrigem ?? "",
                statusCat: r.statusCat,
              }))}
            />
          </TabsContent>
        </Tabs>

        {lastUpdate && (
          <p className="text-center text-[11px] text-muted-foreground">
            Atualizado às {new Date(lastUpdate).toLocaleTimeString("pt-BR")}
          </p>
        )}
      </div>
    </PageShell>
  );
}

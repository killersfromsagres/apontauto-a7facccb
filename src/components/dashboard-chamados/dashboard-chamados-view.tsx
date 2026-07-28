import { lazy, Suspense } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Database, Radio, RefreshCw } from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, SkeletonState } from "@/components/pcm";
import { QuickAccessStrip } from "./quick-access-strip";
import { DashboardKpis } from "./dashboard-kpis";
import { DashboardFilters } from "./dashboard-filters";
import { InsightsPanel } from "./insights-panel";
import { ChamadosTable } from "./chamados-table";
import { useDashboardChamados } from "./use-dashboard-chamados";

// Recharts fica fora do bundle inicial da rota.
const DashboardCharts = lazy(() => import("./dashboard-charts"));

export function DashboardChamadosView() {
  const {
    rows,
    filtered,
    stats,
    topPredios,
    uniques,
    filters,
    setFilters,
    activeFilterCount,
    resetFilters,
    loading,
    refreshing,
    error,
    lastUpdate,
    reload,
    pendingOs,
    toggleConcluido,
  } = useDashboardChamados();

  const refreshAction = (
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

  if (loading && rows.length === 0) {
    return (
      <PageShell
        title="Dashboard de Chamados"
        description="Carregando informações da aba Backorder…"
      >
        <div className="space-y-4">
          <QuickAccessStrip />
          <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <GlassCard key={i} variant="block" className="h-[104px]" delay={i * 0.03}>
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

  if (error && rows.length === 0) {
    return (
      <PageShell title="Dashboard de Chamados" description="Sincronizado com Backorder">
        <div className="space-y-4">
          <QuickAccessStrip />
          <ErrorState description={error} onRetry={() => void reload()} />
        </div>
      </PageShell>
    );
  }

  if (rows.length === 0) {
    return (
      <PageShell
        title="Dashboard de Chamados"
        description="Nenhum chamado disponível no módulo Backorder"
        actions={refreshAction}
      >
        <div className="space-y-4">
          <QuickAccessStrip />
          <GlassCard>
            <EmptyState
              className="border-0"
              icon={<Database className="size-5" aria-hidden />}
              title="Sem chamados no Backorder"
              description="Assim que uma OS for adicionada ou finalizada na aba Backorder, os gráficos deste dashboard são atualizados automaticamente em tempo real."
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
      description={`Sincronizado com Backorder · ${filtered.length} de ${rows.length} chamados no filtro`}
      actions={refreshAction}
    >
      <div className="space-y-4">
        <QuickAccessStrip />

        <DashboardKpis stats={stats} lastUpdate={lastUpdate} loading={refreshing && !rows.length} />

        <DashboardFilters
          filters={filters}
          setFilters={setFilters}
          uniques={uniques}
          activeFilterCount={activeFilterCount}
          onReset={resetFilters}
        />

        <InsightsPanel insights={stats.insights} />

        <Suspense
          fallback={
            <GlassCard>
              <SkeletonState rows={3} />
            </GlassCard>
          }
        >
          <DashboardCharts stats={stats} topPredios={topPredios} />
        </Suspense>

        <ChamadosTable
          rows={filtered}
          pendingOs={pendingOs}
          onToggle={(row, next) => void toggleConcluido(row, next)}
        />
      </div>
    </PageShell>
  );
}

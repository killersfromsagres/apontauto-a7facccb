import { AlertTriangle, BarChart3, CheckCircle2, Clock } from "lucide-react";
import { KpiCard } from "@/components/pcm";
import type { DashboardChamadosState } from "./use-dashboard-chamados";

export function DashboardKpis({
  stats,
  lastUpdate,
  loading,
}: {
  stats: DashboardChamadosState["stats"];
  lastUpdate: number | null;
  loading?: boolean;
}) {
  const lastUpdateLabel = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <KpiCard
        label="Total"
        value={stats.total}
        hint={`Atualizado às ${lastUpdateLabel}`}
        icon={<BarChart3 className="size-4" aria-hidden />}
        loading={loading}
      />
      <KpiCard
        label="Concluídos"
        value={stats.concluidos}
        hint={`${stats.taxaConclusao}% do total`}
        icon={<CheckCircle2 className="size-4" aria-hidden />}
        loading={loading}
      />
      <KpiCard
        label="SLA vencido"
        value={stats.vencidos}
        hint={`+ ${stats.vencendo48h} vencendo em 48h`}
        icon={<AlertTriangle className="size-4" aria-hidden />}
        loading={loading}
      />
      <KpiCard
        label="Em aberto"
        value={stats.abertos + stats.andamento}
        hint={`${stats.abertos} novos · ${stats.andamento} em andamento`}
        icon={<Clock className="size-4" aria-hidden />}
        loading={loading}
      />
    </div>
  );
}

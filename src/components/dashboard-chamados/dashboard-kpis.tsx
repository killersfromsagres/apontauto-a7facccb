import { memo } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Clock, Timer, XCircle } from "lucide-react";
import { KpiCard } from "@/components/pcm";
import type { DashStats } from "@/lib/dashboard-chamados/server-stats";

const fmt = (n: number) => n.toLocaleString("pt-BR");

export const DashboardKpis = memo(function DashboardKpis({
  stats,
  lastUpdate,
  loading,
}: {
  stats: DashStats;
  lastUpdate: number | null;
  loading?: boolean;
}) {
  const k = stats.kpis;
  const taxa = k.total === 0 ? 0 : Math.round((k.concluidos / k.total) * 100);
  const taxaCancel = k.total === 0 ? 0 : Math.round((k.cancelados / k.total) * 100);
  const lastUpdateLabel = lastUpdate
    ? new Date(lastUpdate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "—";
  const periodo =
    k.primeiroAno && k.ultimoAno
      ? k.primeiroAno === k.ultimoAno
        ? `${k.primeiroAno}`
        : `${k.primeiroAno} – ${k.ultimoAno}`
      : "—";

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-6">
      <KpiCard
        label="Total de OS"
        value={fmt(k.total)}
        hint={`Base ${periodo} · ${lastUpdateLabel}`}
        icon={<BarChart3 className="size-4" aria-hidden />}
        loading={loading}
      />
      <KpiCard
        label="Concluídas"
        value={fmt(k.concluidos)}
        hint={`${taxa}% do total`}
        icon={<CheckCircle2 className="size-4" aria-hidden />}
        loading={loading}
      />
      <KpiCard
        label="Canceladas"
        value={fmt(k.cancelados)}
        hint={`${taxaCancel}% do total`}
        icon={<XCircle className="size-4" aria-hidden />}
        loading={loading}
      />
      <KpiCard
        label="Em aberto"
        value={fmt(k.abertos)}
        hint={`${fmt(k.criticos)} de criticidade alta`}
        icon={<Clock className="size-4" aria-hidden />}
        loading={loading}
      />
      <KpiCard
        label="SLA vencido"
        value={fmt(k.vencidos)}
        hint={`+ ${fmt(k.vencendo48h)} vencendo em 48h`}
        icon={<AlertTriangle className="size-4" aria-hidden />}
        loading={loading}
      />
      <KpiCard
        label="Tempo médio"
        value={`${k.tempoMedioDias} d`}
        hint="Da abertura até a conclusão"
        icon={<Timer className="size-4" aria-hidden />}
        loading={loading}
      />
    </div>
  );
});

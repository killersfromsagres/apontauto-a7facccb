import { memo } from "react";
import { GlassCard } from "@/components/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ListOrdered,
  Loader2,
  Eye,
  CheckCircle2,
  XCircle,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import type { PointingMetrics } from "../hooks/usePointingMetrics";

type Metric = { key: string; label: string; value: string; hint: string; icon: LucideIcon; tone: string };

export const MetricsGrid = memo(function MetricsGrid({
  metrics,
  loading,
  periodLabel,
}: {
  metrics: PointingMetrics;
  loading: boolean;
  periodLabel: string;
}) {
  const items: Metric[] = [
    { key: "queued", label: "Na fila", value: String(metrics.queued), hint: "aguardando agente", icon: ListOrdered, tone: "text-sky-300" },
    { key: "processing", label: "Em execução", value: String(metrics.processing), hint: "no Prisma4", icon: Loader2, tone: "text-violet-300" },
    { key: "review", label: "Revisão manual", value: String(metrics.review), hint: "conferir no desktop", icon: Eye, tone: "text-amber-300" },
    { key: "completed", label: "Concluídas", value: String(metrics.completed), hint: periodLabel, icon: CheckCircle2, tone: "text-emerald-300" },
    { key: "failed", label: "Falhas", value: String(metrics.failed), hint: periodLabel, icon: XCircle, tone: "text-red-300" },
    {
      key: "rate",
      label: "Taxa de sucesso",
      value: metrics.successRate === null ? "—" : `${Math.round(metrics.successRate * 100)}%`,
      hint: "concluídas ÷ finalizadas",
      icon: TrendingUp,
      tone: "text-primary",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((item, index) => (
        <GlassCard key={item.key} delay={index * 0.02} className="p-3 sm:p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{item.label}</span>
            <item.icon className={`h-4 w-4 ${item.tone}`} strokeWidth={1.75} />
          </div>
          {loading ? (
            <Skeleton className="mt-3 h-8 w-16" />
          ) : (
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums sm:text-3xl">{item.value}</div>
          )}
          <div className="mt-1 text-[11px] text-muted-foreground">{item.hint}</div>
        </GlassCard>
      ))}
    </div>
  );
});

import { AlertTriangle, CheckCircle2, Info, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import type { computeDashboardStats } from "@/lib/dashboard-chamados/insights";

type Insight = ReturnType<typeof computeDashboardStats>["insights"][number];

const STYLES: Record<
  Insight["tipo"],
  { bg: string; border: string; icon: React.ReactNode; text: string }
> = {
  critico: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />,
    text: "text-red-700 dark:text-red-300",
  },
  atencao: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />,
    text: "text-amber-700 dark:text-amber-300",
  },
  sucesso: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />,
    text: "text-emerald-700 dark:text-emerald-300",
  },
  info: {
    bg: "bg-sky-500/10",
    border: "border-sky-500/30",
    icon: <Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />,
    text: "text-sky-700 dark:text-sky-300",
  },
};

function InsightCard({ insight }: { insight: Insight }) {
  const s = STYLES[insight.tipo];
  return (
    <div className={`glass-tile flex gap-3 rounded-xl border p-3 ${s.bg} ${s.border}`}>
      <div className="mt-0.5 shrink-0">{s.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-semibold ${s.text}`}>{insight.titulo}</p>
          {insight.metrica !== undefined && (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {insight.metrica}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-foreground/80">{insight.descricao}</p>
      </div>
    </div>
  );
}

export function InsightsPanel({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null;
  return (
    <GlassCard delay={0.2}>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <div className="glass-tile rounded-lg p-1.5">
            <Sparkles
              className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-400"
              strokeWidth={1.75}
            />
          </div>
          <h3 className="text-sm font-semibold">
            Agente inteligente — Análise automática
          </h3>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {insights.map((ins, i) => (
            <InsightCard key={i} insight={ins} />
          ))}
        </div>
      </div>
    </GlassCard>
  );
}

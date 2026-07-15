import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import {
  ClipboardCheck,
  AlertTriangle,
  Users,
  TrendingUp,
  CalendarClock,
  Wrench,
  Droplets,
  SprayCan,
  Trees,
  ClipboardList,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Progress } from "@/components/ui/progress";

const ProductivityChart = lazy(() => import("@/components/productivity-chart"));

export const Route = createFileRoute("/_authenticated/")({
  component: Dashboard,
});

/**
 * KPIs — Liquid Glass: sem fundo colorido chapado. O acento vem apenas
 * do ícone (traço fino, cor semântica) sobre um puck de vidro.
 */
const kpis = [
  {
    label: "OS Pendentes",
    value: "128",
    delta: "+12 hoje",
    icon: ClipboardCheck,
    tint: "text-sky-400",
  },
  {
    label: "SLA Próximo do Vencimento",
    value: "17",
    delta: "próximas 48h",
    icon: AlertTriangle,
    tint: "text-amber-400",
  },
  {
    label: "Equipes Ativas",
    value: "7",
    delta: "de 7 disponíveis",
    icon: Users,
    tint: "text-emerald-400",
  },
  {
    label: "Produtividade Semanal",
    value: "92%",
    delta: "+4% vs. semana anterior",
    icon: TrendingUp,
    tint: "text-fuchsia-400",
  },
];

const teamLoad = [
  { name: "Civil", value: 78, color: "bg-blue-500" },
  { name: "Chaveiro", value: 62, color: "bg-yellow-500" },
  { name: "Hidráulica", value: 84, color: "bg-orange-500" },
  { name: "Elétrica", value: 91, color: "bg-red-500" },
  { name: "Refrigeração 1", value: 55, color: "bg-emerald-500" },
  { name: "Refrigeração 2", value: 70, color: "bg-purple-500" },
  { name: "Refrigeração 3", value: 48, color: "bg-cyan-500" },
];

// Ícones semânticos: água (abastecimento), borrifador (limpeza), árvore (jardinagem)
const modules = [
  { title: "Preventiva", to: "/preventiva", icon: CalendarClock, tint: "text-sky-400" },
  { title: "Corretiva", to: "/corretiva", icon: Wrench, tint: "text-red-400" },
  { title: "Abastecimento", to: "/abastecimento", icon: Droplets, tint: "text-cyan-400" },
  { title: "Limpeza", to: "/limpeza", icon: SprayCan, tint: "text-emerald-400" },
  { title: "Jardinagem", to: "/jardinagem", icon: Trees, tint: "text-green-400" },
  { title: "Outros Serviços", to: "/outros", icon: ClipboardList, tint: "text-purple-400" },
];

function Dashboard() {
  return (
    <PageShell
      title="Dashboard"
      description="Visão geral da operação de manutenção industrial — DEMARCHI"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((kpi, i) => (
          <GlassCard key={kpi.label} delay={i * 0.05}>
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {kpi.label}
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{kpi.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{kpi.delta}</p>
              </div>
              <div className="glass-tile rounded-2xl p-2.5">
                <kpi.icon className={`h-5 w-5 ${kpi.tint}`} strokeWidth={1.75} />
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2" delay={0.2}>
          <div className="relative">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold">Carga por equipe (semana)</h3>
              <span className="text-xs text-muted-foreground">% de utilização</span>
            </div>
            <div className="space-y-4">
              {teamLoad.map((t) => (
                <div key={t.name}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${t.color}`} />
                      <span>{t.name}</span>
                    </div>
                    <span className="tabular-nums text-muted-foreground">{t.value}%</span>
                  </div>
                  <Progress value={t.value} className="h-2" />
                </div>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard delay={0.3}>
          <div className="relative">
            <h3 className="mb-4 text-base font-semibold">Acesso rápido</h3>
            <div className="grid grid-cols-2 gap-3">
              {modules.map((m) => (
                <Link
                  key={m.to}
                  to={m.to}
                  className="glass-tile group flex flex-col items-start gap-2 rounded-2xl p-3 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/40"
                >
                  <m.icon className={`h-5 w-5 ${m.tint}`} strokeWidth={1.75} />
                  <span className="text-sm font-medium">{m.title}</span>
                </Link>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>

      <GlassCard delay={0.4}>
        <div className="relative">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-semibold">Produtividade — últimas 7 semanas</h3>
              <p className="text-xs text-muted-foreground">OS concluídas vs. programadas</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-500">
              +8% no mês
            </span>
          </div>
          <div className="h-64 w-full">
            <Suspense
              fallback={
                <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">
                  Carregando gráfico…
                </div>
              }
            >
              <ProductivityChart />
            </Suspense>
          </div>
        </div>
      </GlassCard>
    </PageShell>
  );
}

const productivityData = [
  { week: "S1", programadas: 120, concluidas: 108 },
  { week: "S2", programadas: 135, concluidas: 121 },
  { week: "S3", programadas: 128, concluidas: 119 },
  { week: "S4", programadas: 142, concluidas: 133 },
  { week: "S5", programadas: 138, concluidas: 129 },
  { week: "S6", programadas: 151, concluidas: 145 },
  { week: "S7", programadas: 147, concluidas: 140 },
];

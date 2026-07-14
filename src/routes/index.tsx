import { createFileRoute } from "@tanstack/react-router";
import {
  ClipboardCheck,
  AlertTriangle,
  Users,
  TrendingUp,
  CalendarClock,
  Wrench,
  Fuel,
  Sparkles,
  Trees,
  ClipboardList,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Progress } from "@/components/ui/progress";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const kpis = [
  {
    label: "OS Pendentes",
    value: "128",
    delta: "+12 hoje",
    icon: ClipboardCheck,
    accent: "from-blue-500/25 to-cyan-500/10",
  },
  {
    label: "SLA Próximo do Vencimento",
    value: "17",
    delta: "próximas 48h",
    icon: AlertTriangle,
    accent: "from-amber-500/25 to-orange-500/10",
  },
  {
    label: "Equipes Ativas",
    value: "7",
    delta: "de 7 disponíveis",
    icon: Users,
    accent: "from-emerald-500/25 to-teal-500/10",
  },
  {
    label: "Produtividade Semanal",
    value: "92%",
    delta: "+4% vs. semana anterior",
    icon: TrendingUp,
    accent: "from-fuchsia-500/25 to-purple-500/10",
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

const modules = [
  { title: "Preventiva", to: "/preventiva", icon: CalendarClock, tint: "text-blue-500" },
  { title: "Corretiva", to: "/corretiva", icon: Wrench, tint: "text-red-500" },
  { title: "Abastecimento", to: "/abastecimento", icon: Fuel, tint: "text-orange-500" },
  { title: "Limpeza", to: "/limpeza", icon: Sparkles, tint: "text-emerald-500" },
  { title: "Jardinagem", to: "/jardinagem", icon: Trees, tint: "text-green-600" },
  { title: "Outros Serviços", to: "/outros", icon: ClipboardList, tint: "text-purple-500" },
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
            <div className={`absolute inset-0 bg-gradient-to-br ${kpi.accent} opacity-60`} />
            <div className="relative flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {kpi.label}
                </p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">{kpi.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{kpi.delta}</p>
              </div>
              <div className="rounded-xl border border-border/60 bg-background/50 p-2 backdrop-blur">
                <kpi.icon className="h-5 w-5" />
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
                  className="group flex flex-col items-start gap-2 rounded-xl border border-border/60 bg-background/40 p-3 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:bg-background/70"
                >
                  <m.icon className={`h-5 w-5 ${m.tint}`} />
                  <span className="text-sm font-medium">{m.title}</span>
                </Link>
              ))}
            </div>
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}

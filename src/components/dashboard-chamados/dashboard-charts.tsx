import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  LabelList,
} from "recharts";
import { Building2, TrendingUp, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import type { DashboardChamadosState } from "./use-dashboard-chamados";

const CHART_COLORS = [
  "oklch(0.62 0.19 256)",
  "oklch(0.696 0.17 162.48)",
  "oklch(0.75 0.18 60)",
  "oklch(0.7 0.2 25)",
  "oklch(0.65 0.22 305)",
  "oklch(0.72 0.16 195)",
  "oklch(0.68 0.18 130)",
  "oklch(0.7 0.2 340)",
  "oklch(0.75 0.15 90)",
  "oklch(0.6 0.18 220)",
];

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
} as const;

/**
 * Bloco de gráficos do dashboard. Carregado sob demanda (React.lazy) para
 * tirar o Recharts do bundle inicial da rota.
 */
export default function DashboardCharts({
  stats,
  topPredios,
}: {
  stats: DashboardChamadosState["stats"];
  topPredios: DashboardChamadosState["topPredios"];
}) {
  return (
    <>
      <GlassCard delay={0.25}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" strokeWidth={1.75} />
            <h3 className="text-base font-semibold">Chamados por equipe</h3>
          </div>
          <span className="text-xs text-muted-foreground">Concluídos vs. em aberto</span>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <BarChart data={stats.porEquipe} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
              <defs>
                <linearGradient id="gConc" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS[1]} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={CHART_COLORS[1]} stopOpacity={0.55} />
                </linearGradient>
                <linearGradient id="gAb" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART_COLORS[3]} stopOpacity={0.95} />
                  <stop offset="100%" stopColor={CHART_COLORS[3]} stopOpacity={0.55} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="name"
                stroke="var(--muted-foreground)"
                fontSize={11}
                interval={0}
                angle={-20}
                height={60}
                textAnchor="end"
              />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
              <Bar
                dataKey="concluidos"
                name="Concluídos"
                fill="url(#gConc)"
                radius={[6, 6, 0, 0]}
              />
              <Bar dataKey="abertos" name="Em aberto" fill="url(#gAb)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2" delay={0.35}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" strokeWidth={1.75} />
              <h3 className="text-base font-semibold">Top solicitantes</h3>
            </div>
            <span className="text-xs text-muted-foreground">Quem abriu mais chamados</span>
          </div>
          <div
            className="w-full"
            style={{ height: `${Math.max(260, stats.porSolicitante.length * 36 + 60)}px` }}
          >
            <ResponsiveContainer>
              <BarChart
                data={stats.porSolicitante}
                layout="vertical"
                margin={{ top: 8, right: 32, bottom: 8, left: 8 }}
                barCategoryGap={8}
              >
                <defs>
                  <linearGradient id="gSol" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={CHART_COLORS[4]} stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  allowDecimals={false}
                  hide
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  width={200}
                  interval={0}
                  tick={{ fill: "var(--muted-foreground)" }}
                  tickFormatter={(v: string) => (v && v.length > 26 ? `${v.slice(0, 25)}…` : v)}
                />
                <Tooltip
                  cursor={{ fill: "color-mix(in oklab, var(--primary) 10%, transparent)" }}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Bar
                  dataKey="total"
                  name="Total"
                  fill="url(#gSol)"
                  radius={[0, 6, 6, 0]}
                  barSize={20}
                >
                  <LabelList
                    dataKey="total"
                    position="right"
                    style={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard delay={0.4}>
          <h3 className="mb-4 text-base font-semibold">Por categoria</h3>
          <div className="h-96 w-full">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={stats.porCategoria}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={60}
                  outerRadius={110}
                  paddingAngle={2}
                >
                  {stats.porCategoria.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2" delay={0.45}>
          <h3 className="mb-4 text-base font-semibold">Aberturas ao longo do tempo</h3>
          <div className="h-64 w-full">
            {stats.timeline.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Datas de abertura não disponíveis
              </div>
            ) : (
              <ResponsiveContainer>
                <AreaChart data={stats.timeline}>
                  <defs>
                    <linearGradient id="gTL" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.7} />
                      <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={10} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke={CHART_COLORS[0]}
                    fill="url(#gTL)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </GlassCard>

        <GlassCard delay={0.5}>
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" strokeWidth={1.75} />
              <h3 className="text-base font-semibold">Prédios mais recorrentes</h3>
            </div>
            <span className="text-xs text-muted-foreground">Top {topPredios.length}</span>
          </div>
          <div
            className="w-full"
            style={{ height: `${Math.max(220, topPredios.length * 34 + 40)}px` }}
          >
            {topPredios.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Sem dados de prédio nos chamados filtrados
              </div>
            ) : (
              <ResponsiveContainer>
                <BarChart
                  data={topPredios}
                  layout="vertical"
                  margin={{ top: 4, right: 40, bottom: 4, left: 8 }}
                >
                  <defs>
                    <linearGradient id="gPredio" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={CHART_COLORS[2]} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={CHART_COLORS[5]} stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    allowDecimals={false}
                    hide
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    width={140}
                    tick={{ fill: "var(--muted-foreground)" }}
                  />
                  <Tooltip
                    cursor={{ fill: "color-mix(in oklab, var(--primary) 10%, transparent)" }}
                    contentStyle={TOOLTIP_STYLE}
                  />
                  <Bar dataKey="value" name="Chamados" fill="url(#gPredio)" radius={[0, 6, 6, 0]}>
                    <LabelList
                      dataKey="value"
                      position="right"
                      style={{ fill: "var(--foreground)", fontSize: 11, fontWeight: 600 }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </GlassCard>
      </div>
    </>
  );
}

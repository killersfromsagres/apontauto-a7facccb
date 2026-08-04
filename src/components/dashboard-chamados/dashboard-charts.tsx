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
  ComposedChart,
  Line,
} from "recharts";
import { Building2, CalendarRange, TrendingUp, Users } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import type { DashStats } from "@/lib/dashboard-chamados/server-stats";
import { CHART_STATUS, NEON_PALETTE } from "@/lib/charts/palette";

const CHART_COLORS = NEON_PALETTE;

const COLOR_CONC = CHART_STATUS.concluido;
const COLOR_CANC = CHART_STATUS.cancelado;
const COLOR_ABERTO = CHART_STATUS.aberto;

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  color: "var(--popover-foreground)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  fontSize: 12,
} as const;

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function mesLabel(mes: string) {
  const [y, m] = mes.split("-");
  return `${MESES[Number(m) - 1] ?? m}/${y.slice(2)}`;
}

/**
 * Bloco de gráficos do dashboard. Carregado sob demanda (React.lazy) para
 * tirar o Recharts do bundle inicial da rota.
 */
export default function DashboardCharts({ stats }: { stats: DashStats }) {
  const porAno = stats.porAno;
  const porMes = stats.porMes.slice(-36).map((m) => ({ ...m, label: mesLabel(m.mes) }));
  const topPredios = stats.porPredio;
  const anoComTaxa = porAno.map((a) => ({
    ...a,
    taxa: a.total === 0 ? 0 : Math.round((a.concluidos / a.total) * 100),
  }));

  return (
    <>
      <GlassCard delay={0.2}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" strokeWidth={1.75} />
            <h3 className="text-base font-semibold">Histórico por ano</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            Concluídas · canceladas · em aberto e taxa de conclusão
          </span>
        </div>
        <div className="h-80 w-full">
          {anoComTaxa.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Sem datas de abertura na base
            </div>
          ) : (
            <ResponsiveContainer>
              <ComposedChart data={anoComTaxa} margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="ano" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis
                  yAxisId="l"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  allowDecimals={false}
                />
                <YAxis
                  yAxisId="r"
                  orientation="right"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  unit="%"
                  domain={[0, 100]}
                />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                <Bar
                  yAxisId="l"
                  dataKey="concluidos"
                  stackId="a"
                  name="Concluídas"
                  fill={COLOR_CONC}
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  yAxisId="l"
                  dataKey="cancelados"
                  stackId="a"
                  name="Canceladas"
                  fill={COLOR_CANC}
                />
                <Bar
                  yAxisId="l"
                  dataKey="abertos"
                  stackId="a"
                  name="Em aberto"
                  fill={COLOR_ABERTO}
                  radius={[6, 6, 0, 0]}
                />
                <Line
                  yAxisId="r"
                  type="monotone"
                  dataKey="taxa"
                  name="Taxa de conclusão (%)"
                  stroke={CHART_COLORS[0]}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </GlassCard>

      <GlassCard delay={0.25}>
        <div className="mb-4 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" strokeWidth={1.75} />
            <h3 className="text-base font-semibold">OS por equipe</h3>
          </div>
          <span className="text-xs text-muted-foreground">
            Concluídas vs. canceladas vs. abertas
          </span>
        </div>
        <div className="h-72 w-full">
          <ResponsiveContainer>
            <BarChart data={stats.porEquipe} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
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
              <Bar dataKey="concluidos" stackId="e" name="Concluídas" fill={COLOR_CONC} />
              <Bar dataKey="cancelados" stackId="e" name="Canceladas" fill={COLOR_CANC} />
              <Bar
                dataKey="abertos"
                stackId="e"
                name="Em aberto"
                fill={COLOR_ABERTO}
                radius={[6, 6, 0, 0]}
              />
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
            <span className="text-xs text-muted-foreground">Quem mais abriu OS</span>
          </div>
          <div
            className="w-full"
            style={{ height: `${Math.max(260, stats.porSolicitante.length * 36 + 60)}px` }}
          >
            <ResponsiveContainer>
              <BarChart
                data={stats.porSolicitante}
                layout="vertical"
                margin={{ top: 8, right: 40, bottom: 8, left: 8 }}
                barCategoryGap={8}
              >
                <defs>
                  <linearGradient id="gSol" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={CHART_COLORS[4]} stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" fontSize={11} allowDecimals={false} hide />
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
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-base font-semibold">Evolução mensal</h3>
            <span className="text-xs text-muted-foreground">Últimos 36 meses com registro</span>
          </div>
          <div className="h-64 w-full">
            {porMes.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Datas de abertura não disponíveis
              </div>
            ) : (
              <ResponsiveContainer>
                <AreaChart data={porMes}>
                  <defs>
                    <linearGradient id="gTL" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.7} />
                      <stop offset="100%" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gTLc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={COLOR_CONC} stopOpacity={0.6} />
                      <stop offset="100%" stopColor={COLOR_CONC} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    minTickGap={16}
                  />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
                  <Area
                    type="monotone"
                    dataKey="total"
                    name="Abertas"
                    stroke={CHART_COLORS[0]}
                    fill="url(#gTL)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="concluidos"
                    name="Concluídas"
                    stroke={COLOR_CONC}
                    fill="url(#gTLc)"
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
              <h3 className="text-base font-semibold">Prédios recorrentes</h3>
            </div>
            <span className="text-xs text-muted-foreground">Top {topPredios.length}</span>
          </div>
          <div
            className="w-full"
            style={{ height: `${Math.max(220, topPredios.length * 34 + 40)}px` }}
          >
            {topPredios.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                Sem dados de prédio nas OS filtradas
              </div>
            ) : (
              <ResponsiveContainer>
                <BarChart
                  data={topPredios}
                  layout="vertical"
                  margin={{ top: 4, right: 44, bottom: 4, left: 8 }}
                >
                  <defs>
                    <linearGradient id="gPredio" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={CHART_COLORS[2]} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={CHART_COLORS[5]} stopOpacity={0.85} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                  <XAxis type="number" fontSize={11} allowDecimals={false} hide />
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
                  <Bar dataKey="value" name="OS" fill="url(#gPredio)" radius={[0, 6, 6, 0]}>
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

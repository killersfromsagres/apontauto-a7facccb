import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, CircleGauge, UsersRound } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import type {
  CorretivaStatusPoint,
  CorretivaTeamPoint,
  CorretivaTrendPoint,
} from "../corretiva-dashboard";

const STATUS_COLORS = [
  "var(--chart-1)",
  "var(--info)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

const tooltipStyle = {
  backgroundColor: "var(--popover)",
  border: "1px solid rgba(148, 163, 184, 0.2)",
  borderRadius: "12px",
  color: "var(--foreground)",
  boxShadow: "0 18px 40px rgba(0, 0, 0, 0.28)",
};

export default function CorretivaDashboardCharts({
  trend,
  teams,
  statuses,
}: {
  trend: CorretivaTrendPoint[];
  teams: CorretivaTeamPoint[];
  statuses: CorretivaStatusPoint[];
}) {
  const statusTotal = statuses.reduce((total, item) => total + item.value, 0);

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-5">
      <GlassCard className="min-w-0 overflow-hidden border-border bg-white/[0.035] p-4 sm:p-6 xl:col-span-3">
        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
              <BarChart3 className="h-4 w-4 text-primary" />
              Fluxo de corretivas
            </div>
            <p className="text-xs text-muted-foreground">
              Entradas em Novo comparadas às finalizações registradas no
              Histórico de Execução.
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-[11px] font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-chart-1" /> Entradas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-chart-2" /> Concluídas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-chart-5" /> Canceladas
            </span>
          </div>
        </div>

        <div className="h-[300px] w-full sm:h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={trend}
              margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="corretivaEntradas"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0.28}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart-1)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
                <linearGradient
                  id="corretivaConcluidas"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="0%"
                    stopColor="var(--chart-2)"
                    stopOpacity={0.24}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--chart-2)"
                    stopOpacity={0.02}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="4 4"
                stroke="rgba(148,163,184,0.12)"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                minTickGap={24}
              />
              <YAxis
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ stroke: "rgba(148,163,184,0.25)" }}
              />
              <Area
                isAnimationActive={false}
                type="monotone"
                dataKey="entradas"
                name="Entradas"
                stroke="var(--chart-1)"
                strokeWidth={2.2}
                fill="url(#corretivaEntradas)"
                activeDot={{ r: 4 }}
              />
              <Area
                isAnimationActive={false}
                type="monotone"
                dataKey="concluidas"
                name="Concluídas"
                stroke="var(--chart-2)"
                strokeWidth={2.2}
                fill="url(#corretivaConcluidas)"
                activeDot={{ r: 4 }}
              />
              <Area
                isAnimationActive={false}
                type="monotone"
                dataKey="canceladas"
                name="Canceladas"
                stroke="var(--chart-5)"
                strokeWidth={1.6}
                fill="transparent"
                strokeDasharray="5 5"
                activeDot={{ r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </GlassCard>

      <GlassCard className="min-w-0 border-border bg-white/[0.035] p-4 sm:p-6 xl:col-span-2">
        <div className="mb-4">
          <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-foreground">
            <CircleGauge className="h-4 w-4 text-cyan-400" />
            Situação do campo
          </div>
          <p className="text-xs text-muted-foreground">
            Distribuição das OS que permanecem abertas na execução.
          </p>
        </div>

        {statuses.length ? (
          <>
            <div className="relative h-[245px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    isAnimationActive={false}
                    data={statuses}
                    dataKey="value"
                    nameKey="status"
                    innerRadius={64}
                    outerRadius={92}
                    paddingAngle={3}
                    stroke="transparent"
                  >
                    {statuses.map((entry, index) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[index % STATUS_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-3xl font-semibold tabular-nums text-foreground">
                  {statusTotal}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  em campo
                </span>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {statuses.map((item, index) => (
                <div
                  key={item.status}
                  className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-border bg-white/[0.03] px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          STATUS_COLORS[index % STATUS_COLORS.length],
                      }}
                    />
                    <span className="truncate text-xs text-muted-foreground">
                      {item.status}
                    </span>
                  </div>
                  <span className="text-xs font-semibold tabular-nums text-foreground">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-dashed border-border text-center text-sm text-muted-foreground">
            Nenhuma OS aberta para o filtro atual.
          </div>
        )}
      </GlassCard>

      <GlassCard className="min-w-0 overflow-hidden border-border bg-white/[0.035] p-4 sm:p-6 xl:col-span-5">
        <div className="mb-5 flex flex-col gap-1">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <UsersRound className="h-4 w-4 text-violet-400" />
            Carga e entrega por equipe
          </div>
          <p className="text-xs text-muted-foreground">
            Compara volume ainda em campo, finalizações no período e OS abertas
            há 30 dias ou mais.
          </p>
        </div>

        {teams.length ? (
          <div className="h-[330px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={teams}
                margin={{ top: 8, right: 8, left: -14, bottom: 0 }}
                barGap={4}
              >
                <CartesianGrid
                  strokeDasharray="4 4"
                  stroke="rgba(148,163,184,0.12)"
                  vertical={false}
                />
                <XAxis
                  dataKey="equipe"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                  minTickGap={24}
                  height={46}
                />
                <YAxis
                  allowDecimals={false}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "rgba(148,163,184,0.05)" }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                <Bar
                  isAnimationActive={false}
                  dataKey="emCampo"
                  name="Em campo"
                  fill="var(--chart-1)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="concluidas"
                  name="Concluídas"
                  fill="var(--chart-2)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={28}
                />
                <Bar
                  isAnimationActive={false}
                  dataKey="atrasadas"
                  name="Atrasadas 30d+"
                  fill="var(--chart-3)"
                  radius={[5, 5, 0, 0]}
                  maxBarSize={28}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-dashed border-border text-center text-sm text-muted-foreground">
            Nenhuma equipe com movimentação no filtro atual.
          </div>
        )}
      </GlassCard>
    </div>
  );
}

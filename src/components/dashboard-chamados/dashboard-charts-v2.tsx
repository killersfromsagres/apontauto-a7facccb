import { memo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,
} from "recharts";
import { GlassCard } from "@/components/glass-card";
import { STATUS_CATS, STATUS_COLOR, STATUS_LABEL } from "@/lib/backorder/status";
import type { V2Stats } from "@/lib/dashboard-chamados/stats-v2";

const AXIS = { fontSize: 11 };
const PALETTE = [
  "#06B6D4",
  "#10B981",
  "#8B5CF6",
  "#F59E0B",
  "#EF4444",
  "#3B82F6",
  "#EC4899",
  "#14B8A6",
];

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <GlassCard className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="h-[240px] w-full sm:h-[280px]">{children}</div>
    </GlassCard>
  );
}

function DashboardChartsV2({ stats }: { stats: V2Stats }) {
  const statusData = STATUS_CATS.map((c) => ({
    name: STATUS_LABEL[c],
    value: stats.porStatus[c] ?? 0,
    color: STATUS_COLOR[c],
  })).filter((d) => d.value > 0);

  const mesData = stats.porMes.map((m) => ({
    ...m,
    label: m.mes?.slice(5) ?? "",
  }));

  const anoData = stats.porAno.map((a) => ({
    ...a,
    taxa: a.total ? Math.round(((a.concluidos ?? 0) / a.total) * 100) : 0,
  }));

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartCard title="Distribuição por status (coluna G)" subtitle="Seleção atual">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={statusData}
              dataKey="value"
              nameKey="name"
              innerRadius="52%"
              outerRadius="80%"
              paddingAngle={2}
            >
              {statusData.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip formatter={(v: number) => v.toLocaleString("pt-BR")} />
            <Legend wrapperStyle={AXIS} />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Evolução mensal" subtitle="Abertos, concluídos e cancelados">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={mesData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="label" tick={AXIS} />
            <YAxis tick={AXIS} width={40} />
            <Tooltip />
            <Legend wrapperStyle={AXIS} />
            <Area
              type="monotone"
              dataKey="abertos"
              name="Abertos"
              stroke="#3B82F6"
              fill="#3B82F6"
              fillOpacity={0.25}
            />
            <Area
              type="monotone"
              dataKey="concluidos"
              name="Concluídos"
              stroke="#10B981"
              fill="#10B981"
              fillOpacity={0.25}
            />
            <Area
              type="monotone"
              dataKey="cancelados"
              name="Cancelados"
              stroke="#DC2626"
              fill="#DC2626"
              fillOpacity={0.2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Histórico por ano" subtitle="Volume e taxa de conclusão (%)">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={anoData}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis dataKey="ano" tick={AXIS} />
            <YAxis yAxisId="l" tick={AXIS} width={40} />
            <YAxis yAxisId="r" orientation="right" tick={AXIS} width={36} unit="%" />
            <Tooltip />
            <Legend wrapperStyle={AXIS} />
            <Bar yAxisId="l" dataKey="concluidos" name="Concluídos" stackId="a" fill="#10B981" />
            <Bar
              yAxisId="l"
              dataKey="aguardando"
              name="Aguardando aprovação"
              stackId="a"
              fill="#EAB308"
            />
            <Bar yAxisId="l" dataKey="abertos" name="Abertos" stackId="a" fill="#3B82F6" />
            <Bar yAxisId="l" dataKey="cancelados" name="Cancelados" stackId="a" fill="#DC2626" />
            <Line
              yAxisId="r"
              type="monotone"
              dataKey="taxa"
              name="Taxa de conclusão"
              stroke="#8B5CF6"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Chamados por equipe" subtitle="Top 12">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.porEquipe} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis type="number" tick={AXIS} />
            <YAxis type="category" dataKey="name" tick={AXIS} width={92} />
            <Tooltip />
            <Legend wrapperStyle={AXIS} />
            <Bar dataKey="abertos" name="Abertos" stackId="b" fill="#3B82F6" />
            <Bar dataKey="concluidos" name="Concluídos" stackId="b" fill="#10B981" />
            <Bar dataKey="cancelados" name="Cancelados" stackId="b" fill="#DC2626" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Prédios com mais chamados" subtitle="Top 10">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.porPredio} layout="vertical" margin={{ left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis type="number" tick={AXIS} />
            <YAxis type="category" dataKey="name" tick={AXIS} width={110} />
            <Tooltip />
            <Bar dataKey="value" name="Chamados" radius={[0, 6, 6, 0]}>
              {stats.porPredio.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Categorias de serviço" subtitle="Classificação automática">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={stats.porCategoria}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
            <XAxis
              dataKey="name"
              tick={AXIS}
              interval={0}
              angle={-20}
              textAnchor="end"
              height={60}
            />
            <YAxis tick={AXIS} width={40} />
            <Tooltip />
            <Bar dataKey="value" name="Chamados" radius={[6, 6, 0, 0]}>
              {stats.porCategoria.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

export default memo(DashboardChartsV2);

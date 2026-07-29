import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@/lib/utils";
import { KPIS, DATASETS, type Row, type WidgetSpec, type Datasets } from "@/features/bi/catalog";
import { buildMatrix, buildSeries, tableColumns } from "@/features/bi/data";

export const PALETTE = [
  "#22d3ee",
  "#60a5fa",
  "#a78bfa",
  "#34d399",
  "#f59e0b",
  "#f472b6",
  "#4ade80",
  "#fb7185",
  "#facc15",
  "#38bdf8",
];

const AXIS = { stroke: "hsl(var(--muted-foreground))", fontSize: 11 };

const tooltipStyle = {
  contentStyle: {
    background: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: 12,
    fontSize: 12,
    color: "hsl(var(--popover-foreground))",
  },
  labelStyle: { color: "hsl(var(--muted-foreground))", fontSize: 11 },
};

export function formatKpi(value: number | null, unit?: string) {
  if (value == null || !Number.isFinite(value)) return "—";
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "R$") return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  if (unit === "R$/km") return `${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} R$/km`;
  if (unit) return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${unit}`;
  return value.toLocaleString("pt-BR", { maximumFractionDigits: value < 10 ? 1 : 0 });
}

const short = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

function Gauge({ value, target }: { value: number | null; target: number }) {
  const pct = Math.max(0, Math.min(100, value ?? 0));
  const tone = pct >= target ? "#34d399" : pct >= target * 0.75 ? "#f59e0b" : "#fb7185";
  const r = 54;
  const circ = Math.PI * r;
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <svg viewBox="0 0 140 84" className="w-full max-w-[190px]">
        <path d="M 16 74 A 54 54 0 0 1 124 74" fill="none" stroke="hsl(var(--muted))" strokeWidth="12" strokeLinecap="round" />
        <path
          d="M 16 74 A 54 54 0 0 1 124 74"
          fill="none"
          stroke={tone}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * circ} ${circ}`}
        />
        <text x="70" y="66" textAnchor="middle" className="fill-foreground" style={{ fontSize: 20, fontWeight: 700 }}>
          {pct.toFixed(0)}%
        </text>
      </svg>
      <p className="mt-1 text-xs text-muted-foreground">Meta {target}%</p>
    </div>
  );
}

function Heatmap({ widget, rows }: { widget: WidgetSpec; rows: Row[] }) {
  const { keys, data } = useMemo(() => buildMatrix(widget, rows), [widget, rows]);
  const max = Math.max(1, ...data.flatMap((d) => keys.map((k) => Number(d[k] ?? 0))));
  if (!data.length) return <Empty />;
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-1 text-xs">
        <thead>
          <tr>
            <th className="text-left font-medium text-muted-foreground" />
            {keys.map((k) => (
              <th key={k} className="px-1 text-center font-medium text-muted-foreground">
                {short(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={String(d.label)}>
              <td className="max-w-[130px] truncate pr-2 text-muted-foreground">{String(d.label)}</td>
              {keys.map((k) => {
                const v = Number(d[k] ?? 0);
                return (
                  <td
                    key={k}
                    className="rounded-md px-2 py-1.5 text-center font-medium tabular-nums"
                    style={{
                      background: v ? `rgba(34, 211, 238, ${0.12 + (v / max) * 0.7})` : "hsl(var(--muted)/0.35)",
                      color: v / max > 0.55 ? "#04121a" : undefined,
                    }}
                  >
                    {v || ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Timeline({ widget, rows }: { widget: WidgetSpec; rows: Row[] }) {
  const def = DATASETS[widget.dataset];
  const items = useMemo(
    () =>
      [...rows]
        .sort(
          (a, b) =>
            new Date(String(b[def.dateField])).getTime() - new Date(String(a[def.dateField])).getTime(),
        )
        .slice(0, 12),
    [rows, def.dateField],
  );
  if (!items.length) return <Empty />;
  return (
    <ol className="relative space-y-3 border-l border-border/60 pl-4">
      {items.map((r, i) => (
        <li key={i} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary))]" />
          <p className="text-xs text-muted-foreground">
            {new Date(String(r[def.dateField])).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
          </p>
          <p className="truncate text-sm font-medium">
            {String(r.numero_os ?? r.numero_pt ?? r.protocol ?? r.os ?? r.id ?? "—")} ·{" "}
            {String(r.descricao ?? r.servico ?? r.atividade ?? r.status ?? "")}
          </p>
        </li>
      ))}
    </ol>
  );
}

function AnalyticTable({ widget, rows }: { widget: WidgetSpec; rows: Row[] }) {
  const cols = tableColumns(widget.dataset);
  const list = rows.slice(0, 50);
  if (!list.length) return <Empty />;
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left text-muted-foreground">
            {cols.map((c) => (
              <th key={c} className="px-2 py-2 font-medium">
                {c.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {list.map((r, i) => (
            <tr key={i} className="border-b border-border/30 last:border-0">
              {cols.map((c) => (
                <td key={c} className="max-w-[220px] truncate px-2 py-1.5">
                  {r[c] == null ? "—" : String(r[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > list.length && (
        <p className="pt-2 text-[11px] text-muted-foreground">
          Exibindo 50 de {rows.length.toLocaleString("pt-BR")} registros — exporte para ver tudo.
        </p>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="flex h-full min-h-[140px] items-center justify-center text-sm text-muted-foreground">
      Sem dados no período selecionado.
    </div>
  );
}

export function WidgetChart({
  widget,
  rows,
  datasets,
  height = 240,
}: {
  widget: WidgetSpec;
  rows: Row[];
  datasets: Datasets;
  height?: number;
}) {
  const series = useMemo(
    () => (["line", "area", "bar", "donut", "pareto"].includes(widget.chart) ? buildSeries(widget, rows) : []),
    [widget, rows],
  );
  const matrix = useMemo(
    () => (widget.chart === "stacked" ? buildMatrix(widget, rows) : { keys: [], data: [] }),
    [widget, rows],
  );

  if (widget.chart === "kpi") {
    const def = widget.kpi ? KPIS[widget.kpi] : null;
    const value = def ? def.compute(datasets) : rows.length;
    return (
      <div className="flex h-full flex-col justify-center">
        <p className="font-display text-3xl font-bold tracking-tight text-gradient sm:text-4xl">
          {formatKpi(value, def?.unit)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{def?.hint ?? `${rows.length} registros`}</p>
      </div>
    );
  }

  if (widget.chart === "gauge") {
    const def = widget.kpi ? KPIS[widget.kpi] : null;
    const value = def ? def.compute(datasets) : null;
    return <Gauge value={def?.unit === "%" ? value : value != null ? Math.min(100, value) : null} target={def?.target ?? 90} />;
  }

  if (widget.chart === "heatmap") return <Heatmap widget={widget} rows={rows} />;
  if (widget.chart === "timeline") return <Timeline widget={widget} rows={rows} />;
  if (widget.chart === "table") return <AnalyticTable widget={widget} rows={rows} />;

  if (!series.length && !matrix.data.length) return <Empty />;

  return (
    <ResponsiveContainer width="100%" height={height}>
      {widget.chart === "line" ? (
        <LineChart data={series} margin={{ left: -18, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
          <XAxis dataKey="label" tick={AXIS} tickFormatter={short} />
          <YAxis tick={AXIS} />
          <Tooltip {...tooltipStyle} />
          <Line type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2.5} dot={false} name="Valor" />
        </LineChart>
      ) : widget.chart === "area" ? (
        <AreaChart data={series} margin={{ left: -18, right: 8, top: 8 }}>
          <defs>
            <linearGradient id={`grad-${widget.id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE[0]} stopOpacity={0.55} />
              <stop offset="100%" stopColor={PALETTE[0]} stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
          <XAxis dataKey="label" tick={AXIS} tickFormatter={short} />
          <YAxis tick={AXIS} />
          <Tooltip {...tooltipStyle} />
          <Area type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2.5} fill={`url(#grad-${widget.id})`} name="Valor" />
        </AreaChart>
      ) : widget.chart === "bar" ? (
        <BarChart data={series} margin={{ left: -18, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
          <XAxis dataKey="label" tick={AXIS} tickFormatter={short} interval={0} angle={-18} textAnchor="end" height={54} />
          <YAxis tick={AXIS} />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} name="Valor">
            {series.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
            ))}
          </Bar>
        </BarChart>
      ) : widget.chart === "donut" ? (
        <PieChart>
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Pie data={series} dataKey="value" nameKey="label" innerRadius="52%" outerRadius="78%" paddingAngle={2}>
            {series.map((_, i) => (
              <Cell key={i} fill={PALETTE[i % PALETTE.length]} stroke="transparent" />
            ))}
          </Pie>
        </PieChart>
      ) : widget.chart === "pareto" ? (
        <ComposedChart data={series} margin={{ left: -18, right: 4, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
          <XAxis dataKey="label" tick={AXIS} tickFormatter={short} interval={0} angle={-18} textAnchor="end" height={54} />
          <YAxis tick={AXIS} />
          <YAxis yAxisId="pct" orientation="right" tick={AXIS} domain={[0, 100]} unit="%" />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="value" radius={[8, 8, 0, 0]} fill={PALETTE[1]} name="Ocorrências" />
          <Line yAxisId="pct" type="monotone" dataKey="acumulado" stroke={PALETTE[4]} strokeWidth={2.5} dot={false} name="Acumulado %" />
        </ComposedChart>
      ) : (
        <BarChart data={matrix.data} margin={{ left: -18, right: 8, top: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.35} />
          <XAxis dataKey="label" tick={AXIS} tickFormatter={short} interval={0} angle={-18} textAnchor="end" height={54} />
          <YAxis tick={AXIS} />
          <Tooltip {...tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {matrix.keys.map((k, i) => (
            <Bar key={k} dataKey={k} stackId="a" fill={PALETTE[i % PALETTE.length]} radius={i === matrix.keys.length - 1 ? [8, 8, 0, 0] : undefined} />
          ))}
        </BarChart>
      )}
    </ResponsiveContainer>
  );
}

export const widgetSpan = (size: WidgetSpec["size"]) =>
  cn(size === "lg" && "sm:col-span-2 xl:col-span-4", size === "md" && "sm:col-span-2 xl:col-span-2", size === "sm" && "xl:col-span-1");

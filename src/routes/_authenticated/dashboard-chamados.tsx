import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import {
  Upload,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  BarChart3,
  TrendingUp,
  Filter,
  X,
  FileSpreadsheet,
  Info,
} from "lucide-react";
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
  RadialBarChart,
  RadialBar,
} from "recharts";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { parseChamadosFile, type ChamadoRow } from "@/lib/dashboard-chamados/parser";
import { computeDashboardStats } from "@/lib/dashboard-chamados/insights";

export const Route = createFileRoute("/_authenticated/dashboard-chamados")({
  component: DashboardChamados,
});

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

type Filters = {
  equipe: string;
  categoria: string;
  criticidade: string;
  status: string;
  solicitante: string;
  predio: string;
  periodo: string; // dias
};

const EMPTY_FILTERS: Filters = {
  equipe: "todas",
  categoria: "todas",
  criticidade: "todas",
  status: "todos",
  solicitante: "todos",
  predio: "todos",
  periodo: "todos",
};

function DashboardChamados() {
  const [rows, setRows] = useState<ChamadoRow[]>([]);
  const [fileInfo, setFileInfo] = useState<{ name: string; origem: string; total: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);

  const onUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const res = await parseChamadosFile(file);
      if (res.rows.length === 0) {
        toast.error("Nenhum chamado válido encontrado na planilha");
        return;
      }
      setRows(res.rows);
      setFileInfo({ name: res.arquivo, origem: res.origem, total: res.totalLidas });
      setFilters(EMPTY_FILTERS);
      toast.success(
        `${res.rows.length} chamados carregados (${res.origem === "generico" ? "formato genérico" : res.origem})`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao ler planilha");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }, []);

  const uniques = useMemo(() => {
    const eq = new Set<string>();
    const ca = new Set<string>();
    const cr = new Set<string>();
    const st = new Set<string>();
    const so = new Set<string>();
    const pr = new Set<string>();
    for (const r of rows) {
      if (r.equipe) eq.add(r.equipe);
      if (r.categoria) ca.add(r.categoria);
      if (r.criticidade) cr.add(r.criticidade);
      if (r.status) st.add(r.status);
      if (r.solicitante) so.add(r.solicitante);
      if (r.predio) pr.add(r.predio);
    }
    return {
      equipes: [...eq].sort(),
      categorias: [...ca].sort(),
      criticidades: [...cr].sort(),
      statuses: [...st].sort(),
      solicitantes: [...so].sort(),
      predios: [...pr].sort(),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const periodoMs = filters.periodo === "todos" ? 0 : Number(filters.periodo) * 86400000;
    return rows.filter((r) => {
      if (filters.equipe !== "todas" && r.equipe !== filters.equipe) return false;
      if (filters.categoria !== "todas" && r.categoria !== filters.categoria) return false;
      if (filters.criticidade !== "todas" && r.criticidade !== filters.criticidade) return false;
      if (filters.status !== "todos" && r.status !== filters.status) return false;
      if (filters.solicitante !== "todos" && r.solicitante !== filters.solicitante) return false;
      if (filters.predio !== "todos" && r.predio !== filters.predio) return false;
      if (periodoMs > 0) {
        if (!r.dataAberturaTs) return false;
        if (now - r.dataAberturaTs > periodoMs) return false;
      }
      return true;
    });
  }, [rows, filters]);

  const stats = useMemo(() => computeDashboardStats(filtered), [filtered]);

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => v !== EMPTY_FILTERS[k as keyof Filters],
  ).length;

  if (rows.length === 0) {
    return (
      <PageShell
        title="Dashboard de Chamados"
        description="Envie uma planilha de chamados (Backorder ou Preventiva) para gerar análises interativas com um agente inteligente"
      >
        <GlassCard>
          <div className="flex flex-col items-center justify-center gap-6 py-16 text-center">
            <div className="glass-tile flex h-20 w-20 items-center justify-center rounded-3xl">
              <FileSpreadsheet className="h-10 w-10 text-primary" strokeWidth={1.5} />
            </div>
            <div className="max-w-md space-y-2">
              <h3 className="text-lg font-semibold">Envie sua planilha para começar</h3>
              <p className="text-sm text-muted-foreground">
                Suportamos automaticamente planilhas do Backorder e das Preventivas.
                O sistema detecta as colunas, calcula métricas por equipe, criticidade,
                solicitante e SLA, e gera insights automáticos.
              </p>
            </div>
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={onUpload}
                disabled={loading}
              />
              <Button size="lg" asChild disabled={loading}>
                <span>
                  <Upload className="mr-2 h-4 w-4" />
                  {loading ? "Processando…" : "Enviar planilha (.xlsx)"}
                </span>
              </Button>
            </label>
          </div>
        </GlassCard>
      </PageShell>
    );
  }

  const kpis = [
    {
      label: "Total",
      value: stats.total.toString(),
      hint: fileInfo ? `${fileInfo.origem}` : "",
      icon: BarChart3,
      tint: "text-sky-400",
    },
    {
      label: "Concluídos",
      value: `${stats.concluidos}`,
      hint: `${stats.taxaConclusao}% do total`,
      icon: CheckCircle2,
      tint: "text-emerald-400",
    },
    {
      label: "SLA vencido",
      value: `${stats.vencidos}`,
      hint: `+ ${stats.vencendo48h} vencendo em 48h`,
      icon: AlertTriangle,
      tint: stats.vencidos > 0 ? "text-red-400" : "text-muted-foreground",
    },
    {
      label: "Em aberto",
      value: `${stats.abertos + stats.andamento}`,
      hint: `${stats.abertos} novos · ${stats.andamento} em andamento`,
      icon: Clock,
      tint: "text-amber-400",
    },
  ];

  return (
    <PageShell
      title="Dashboard de Chamados"
      description={
        fileInfo
          ? `${fileInfo.name} · ${filtered.length} de ${rows.length} chamados no filtro`
          : "Análise de chamados"
      }
      actions={
        <>
          <label className="cursor-pointer">
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onUpload}
              disabled={loading}
            />
            <Button variant="outline" size="sm" asChild disabled={loading}>
              <span>
                <Upload className="mr-2 h-4 w-4" />
                {loading ? "Processando…" : "Trocar planilha"}
              </span>
            </Button>
          </label>
        </>
      }
    >
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k, i) => (
          <GlassCard key={k.label} delay={i * 0.05}>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {k.label}
                </p>
                <p className="mt-2 text-3xl font-semibold tabular-nums">{k.value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{k.hint}</p>
              </div>
              <div className="glass-tile rounded-2xl p-2.5">
                <k.icon className={`h-5 w-5 ${k.tint}`} strokeWidth={1.75} />
              </div>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Filtros */}
      <GlassCard delay={0.15}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Filtros</h3>
              {activeFilterCount > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {activeFilterCount} ativo(s)
                </Badge>
              )}
            </div>
            {activeFilterCount > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
                <X className="mr-1 h-3.5 w-3.5" />
                Limpar
              </Button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            <FilterSelect
              label="Período"
              value={filters.periodo}
              onChange={(v) => setFilters((f) => ({ ...f, periodo: v }))}
              options={[
                { value: "todos", label: "Todos" },
                { value: "7", label: "Últimos 7 dias" },
                { value: "30", label: "Últimos 30 dias" },
                { value: "90", label: "Últimos 90 dias" },
              ]}
            />
            <FilterSelect
              label="Equipe"
              value={filters.equipe}
              onChange={(v) => setFilters((f) => ({ ...f, equipe: v }))}
              options={[
                { value: "todas", label: "Todas" },
                ...uniques.equipes.map((v) => ({ value: v, label: v })),
              ]}
            />
            <FilterSelect
              label="Categoria"
              value={filters.categoria}
              onChange={(v) => setFilters((f) => ({ ...f, categoria: v }))}
              options={[
                { value: "todas", label: "Todas" },
                ...uniques.categorias.map((v) => ({ value: v, label: v })),
              ]}
            />
            <FilterSelect
              label="Criticidade"
              value={filters.criticidade}
              onChange={(v) => setFilters((f) => ({ ...f, criticidade: v }))}
              options={[
                { value: "todas", label: "Todas" },
                ...uniques.criticidades.map((v) => ({ value: v, label: v })),
              ]}
            />
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
              options={[
                { value: "todos", label: "Todos" },
                ...uniques.statuses.map((v) => ({ value: v, label: v })),
              ]}
            />
            <FilterSelect
              label="Solicitante"
              value={filters.solicitante}
              onChange={(v) => setFilters((f) => ({ ...f, solicitante: v }))}
              options={[
                { value: "todos", label: "Todos" },
                ...uniques.solicitantes.map((v) => ({ value: v, label: v })),
              ]}
            />
            <FilterSelect
              label="Prédio"
              value={filters.predio}
              onChange={(v) => setFilters((f) => ({ ...f, predio: v }))}
              options={[
                { value: "todos", label: "Todos" },
                ...uniques.predios.map((v) => ({ value: v, label: v })),
              ]}
            />
          </div>
        </div>
      </GlassCard>

      {/* Agente inteligente */}
      <GlassCard delay={0.2}>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="glass-tile rounded-lg p-1.5">
              <Sparkles className="h-4 w-4 text-fuchsia-400" strokeWidth={1.75} />
            </div>
            <h3 className="text-sm font-semibold">Agente inteligente — Análise automática</h3>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {stats.insights.map((ins, i) => (
              <InsightCard key={i} insight={ins} />
            ))}
          </div>
        </div>
      </GlassCard>

      {/* Gráfico principal — Equipes */}
      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2" delay={0.25}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" strokeWidth={1.75} />
              <h3 className="text-base font-semibold">Chamados por equipe</h3>
            </div>
            <span className="text-xs text-muted-foreground">
              Concluídos vs. em aberto
            </span>
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
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="concluidos" name="Concluídos" fill="url(#gConc)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="abertos" name="Em aberto" fill="url(#gAb)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard delay={0.3}>
          <h3 className="mb-4 text-base font-semibold">Distribuição por criticidade</h3>
          <div className="h-72 w-full">
            <ResponsiveContainer>
              <RadialBarChart
                innerRadius="30%"
                outerRadius="100%"
                data={stats.porCriticidade.map((c, i) => ({ ...c, fill: CHART_COLORS[i % CHART_COLORS.length] }))}
                startAngle={90}
                endAngle={-270}
              >
                <RadialBar dataKey="value" cornerRadius={8} background />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend
                  iconSize={10}
                  layout="vertical"
                  verticalAlign="middle"
                  align="right"
                  wrapperStyle={{ fontSize: 11 }}
                />
              </RadialBarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      {/* Solicitantes + Categoria */}
      <div className="grid gap-4 lg:grid-cols-3">
        <GlassCard className="lg:col-span-2" delay={0.35}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" strokeWidth={1.75} />
              <h3 className="text-base font-semibold">Top solicitantes</h3>
            </div>
            <span className="text-xs text-muted-foreground">
              Quem abriu mais chamados
            </span>
          </div>
          <div className="h-96 w-full">
            <ResponsiveContainer>
              <BarChart
                data={stats.porSolicitante}
                layout="vertical"
                margin={{ top: 4, right: 24, bottom: 4, left: 8 }}
              >
                <defs>
                  <linearGradient id="gSol" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor={CHART_COLORS[0]} stopOpacity={0.95} />
                    <stop offset="100%" stopColor={CHART_COLORS[4]} stopOpacity={0.85} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
                <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <YAxis
                  type="category"
                  dataKey="name"
                  stroke="var(--muted-foreground)"
                  fontSize={11}
                  width={160}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="total" name="Total" fill="url(#gSol)" radius={[0, 6, 6, 0]} />
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
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>

      {/* Timeline + Prédios */}
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
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
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
          <h3 className="mb-4 text-base font-semibold">Prédios mais recorrentes</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer>
              <BarChart data={stats.porPredio} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="value" fill={CHART_COLORS[2]} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      </div>
    </PageShell>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-9 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function InsightCard({ insight }: { insight: ReturnType<typeof computeDashboardStats>["insights"][number] }) {
  const styles: Record<typeof insight.tipo, { bg: string; border: string; icon: React.ReactNode; text: string }> = {
    critico: {
      bg: "bg-red-500/10",
      border: "border-red-500/30",
      icon: <AlertTriangle className="h-4 w-4 text-red-400" />,
      text: "text-red-400",
    },
    atencao: {
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
      icon: <AlertTriangle className="h-4 w-4 text-amber-400" />,
      text: "text-amber-400",
    },
    sucesso: {
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
      icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
      text: "text-emerald-400",
    },
    info: {
      bg: "bg-sky-500/10",
      border: "border-sky-500/30",
      icon: <Info className="h-4 w-4 text-sky-400" />,
      text: "text-sky-400",
    },
  };
  const s = styles[insight.tipo];
  return (
    <div className={`glass-tile flex gap-3 rounded-xl border p-3 ${s.bg} ${s.border}`}>
      <div className="mt-0.5 shrink-0">{s.icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`text-sm font-semibold ${s.text}`}>{insight.titulo}</p>
          {insight.metrica !== undefined && (
            <span className="text-xs font-mono tabular-nums text-muted-foreground">
              {insight.metrica}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{insight.descricao}</p>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  BarChart3,
  TrendingUp,
  Filter,
  X,
  Info,
  Building2,
  CalendarClock,
  Wrench,
  Droplets,
  SprayCan,
  Trees,
  ShieldCheck,
  HardHat,
  ArrowRight,
  ListChecks,
  RotateCcw,
  Loader2,
  RefreshCw,
  Database,
  Radio,
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
  LabelList,
} from "recharts";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
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
import { parseChamadosFile as _unused, type ChamadoRow } from "@/lib/dashboard-chamados/parser";
import { computeDashboardStats } from "@/lib/dashboard-chamados/insights";
import {
  fetchBackorderRows,
  setBackorderConcluido,
  setBackorderReaberto,
  subscribeBackorderTable,
} from "@/lib/dashboard-chamados/backorder-sync";
import { useMyAccess } from "@/hooks/use-my-access";
void _unused;

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
  periodo: string;
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

const quickModules = [
  { key: "preventiva", title: "Preventiva", to: "/preventiva", icon: CalendarClock, tint: "text-sky-600 dark:text-sky-400" },
  { key: "corretiva", title: "Corretiva", to: "/corretiva", icon: Wrench, tint: "text-red-600 dark:text-red-400" },
  { key: "backorder", title: "Backorder", to: "/backorder", icon: AlertTriangle, tint: "text-amber-600 dark:text-amber-400" },
  { key: "apontamentos", title: "Abastecimento", to: "/apontamentos", icon: Droplets, tint: "text-cyan-600 dark:text-cyan-400" },
  { key: "apontamentos", title: "Limpeza", to: "/apontamentos", icon: SprayCan, tint: "text-emerald-600 dark:text-emerald-400" },
  { key: "apontamentos", title: "Jardinagem", to: "/apontamentos", icon: Trees, tint: "text-green-600 dark:text-green-400" },
  { key: "painel-legal", title: "Itens Legais", to: "/painel-legal", icon: ShieldCheck, tint: "text-purple-600 dark:text-purple-400" },
  { key: "seguranca-trabalho", title: "Segurança", to: "/seguranca-trabalho", icon: HardHat, tint: "text-orange-600 dark:text-orange-400" },
] as const;

function QuickAccessStrip() {
  const { access } = useMyAccess();
  const visible = quickModules.filter(
    (m) => access.isAdmin || !access.allowed || access.allowed.includes(m.key),
  );
  if (visible.length === 0) return null;
  return (
    <GlassCard delay={0.05}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className="glass-tile rounded-lg p-1.5">
            <ArrowRight className="h-4 w-4 text-primary" strokeWidth={1.75} />
          </div>
          <h3 className="text-sm font-semibold">Acesso rápido</h3>
        </div>
        <div className="scroll-fluid flex-1 overflow-x-auto">
          <div className="flex gap-2 pb-1">
            {visible.map((m, idx) => (
              <Link
                key={`${m.key}-${idx}`}
                to={m.to}
                className="glass-tile group flex shrink-0 items-center gap-2 rounded-full border border-border/60 px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:text-foreground"
              >
                <m.icon className={`h-3.5 w-3.5 ${m.tint}`} strokeWidth={2} />
                <span>{m.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

export function DashboardChamadosView() {
  const [rows, setRows] = useState<ChamadoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [pendingOs, setPendingOs] = useState<Set<string>>(new Set());
  const debounceRef = useRef<number | null>(null);

  const loadRows = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await fetchBackorderRows();
      setRows(data);
      setLastUpdate(Date.now());
    } catch (err) {
      console.error("[dashboard] fetchBackorderRows", err);
      toast.error(err instanceof Error ? err.message : "Falha ao carregar backorders");
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  // Carga inicial.
  useEffect(() => {
    void loadRows(true);
  }, [loadRows]);

  // Realtime: qualquer alteração em backorder_os dispara um refetch (com debounce
  // para agrupar rajadas de eventos, como imports em massa).
  useEffect(() => {
    const unsub = subscribeBackorderTable(() => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void loadRows(true);
      }, 350);
    });
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      unsub();
    };
  }, [loadRows]);

  // As linhas já vêm do banco (finalizado/data_finalizacao mapeados), então
  // mergedRows é apenas um alias para compatibilidade com o restante do componente.
  const mergedRows = rows;

  const uniques = useMemo(() => {
    const eq = new Set<string>();
    const ca = new Set<string>();
    const cr = new Set<string>();
    const st = new Set<string>();
    const so = new Set<string>();
    const pr = new Set<string>();
    for (const r of mergedRows) {
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
  }, [mergedRows]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const periodoMs = filters.periodo === "todos" ? 0 : Number(filters.periodo) * 86400000;
    return mergedRows.filter((r) => {
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
  }, [mergedRows, filters]);

  const stats = useMemo(() => computeDashboardStats(filtered), [filtered]);
  const topPredios = useMemo(
    () => [...stats.porPredio].sort((a, b) => b.value - a.value).slice(0, 10),
    [stats.porPredio],
  );

  const toggleConcluido = useCallback(
    async (row: ChamadoRow, next: boolean) => {
      setPendingOs((prev) => new Set(prev).add(row.os));
      // Atualização otimista — o realtime completa o restante em seguida.
      setRows((prev) =>
        prev.map((r) =>
          r.os === row.os
            ? {
                ...r,
                statusNorm: next ? "concluido" : "aberto",
                status: next ? "Concluído" : "Reaberto",
                dataConclusao: next ? new Date().toISOString() : null,
              }
            : r,
        ),
      );
      try {
        if (next) await setBackorderConcluido(row);
        else await setBackorderReaberto(row.os);
        toast.success(next ? `OS ${row.os} concluída` : `OS ${row.os} reaberta`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao sincronizar com backorder");
        // Reverte on error recarregando a base.
        void loadRows(true);
      } finally {
        setPendingOs((prev) => {
          const s = new Set(prev);
          s.delete(row.os);
          return s;
        });
      }
    },
    [loadRows],
  );

  const activeFilterCount = Object.entries(filters).filter(
    ([k, v]) => v !== EMPTY_FILTERS[k as keyof Filters],
  ).length;

  if (loading && rows.length === 0) {
    return (
      <PageShell
        title="Dashboard de Chamados"
        description="Carregando informações da aba Backorder…"
      >
        <QuickAccessStrip />
        <div className="mt-4">
          <GlassCard>
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Sincronizando com Backorder…</p>
            </div>
          </GlassCard>
        </div>
      </PageShell>
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <PageShell
        title="Dashboard de Chamados"
        description="Nenhum chamado disponível no módulo Backorder"
        actions={
          <Button variant="outline" size="sm" onClick={() => void loadRows()} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        }
      >
        <QuickAccessStrip />
        <div className="mt-4">
          <GlassCard>
            <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
              <div className="glass-tile flex h-20 w-20 items-center justify-center rounded-3xl">
                <Database className="h-10 w-10 text-primary" strokeWidth={1.5} />
              </div>
              <div className="max-w-md space-y-2">
                <h3 className="text-lg font-semibold">Sem chamados no Backorder</h3>
                <p className="text-sm text-muted-foreground">
                  Assim que uma OS for adicionada ou finalizada na aba <strong>Backorder</strong>,
                  os gráficos deste dashboard são atualizados automaticamente em tempo real.
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link to="/backorder">
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Abrir Backorder
                </Link>
              </Button>
            </div>
          </GlassCard>
        </div>
      </PageShell>
    );
  }


  const kpis = [
    {
      label: "Total",
      value: stats.total.toString(),
      hint: fileInfo ? `${fileInfo.origem}` : "",
      icon: BarChart3,
      tint: "text-sky-600 dark:text-sky-400",
    },
    {
      label: "Concluídos",
      value: `${stats.concluidos}`,
      hint: `${stats.taxaConclusao}% do total`,
      icon: CheckCircle2,
      tint: "text-emerald-600 dark:text-emerald-400",
    },
    {
      label: "SLA vencido",
      value: `${stats.vencidos}`,
      hint: `+ ${stats.vencendo48h} vencendo em 48h`,
      icon: AlertTriangle,
      tint: stats.vencidos > 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground",
    },
    {
      label: "Em aberto",
      value: `${stats.abertos + stats.andamento}`,
      hint: `${stats.abertos} novos · ${stats.andamento} em andamento`,
      icon: Clock,
      tint: "text-amber-600 dark:text-amber-400",
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
      }
    >
      <div className="space-y-4">
        <QuickAccessStrip />

        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k, i) => (
            <GlassCard key={k.label} delay={i * 0.05}>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {k.label}
                  </p>
                  <p className="mt-2 text-3xl font-semibold tabular-nums text-foreground">
                    {k.value}
                  </p>
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
                <Sparkles
                  className="h-4 w-4 text-fuchsia-600 dark:text-fuchsia-400"
                  strokeWidth={1.75}
                />
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

        {/* Chamados por equipe */}
        <GlassCard delay={0.25}>
          <div className="mb-4 flex items-center justify-between">
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
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    color: "var(--popover-foreground)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: "var(--muted-foreground)" }} />
                <Bar dataKey="concluidos" name="Concluídos" fill="url(#gConc)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="abertos" name="Em aberto" fill="url(#gAb)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        {/* Solicitantes + Categoria */}
        <div className="grid gap-4 lg:grid-cols-3">
          <GlassCard className="lg:col-span-2" delay={0.35}>
            <div className="mb-4 flex items-center justify-between">
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
                    tickFormatter={(v: string) =>
                      v && v.length > 26 ? `${v.slice(0, 25)}…` : v
                    }
                  />
                  <Tooltip
                    cursor={{ fill: "color-mix(in oklab, var(--primary) 10%, transparent)" }}
                    contentStyle={{
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="total" name="Total" fill="url(#gSol)" radius={[0, 6, 6, 0]} barSize={20}>
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
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      color: "var(--popover-foreground)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
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
                        color: "var(--popover-foreground)",
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
            <div className="mb-4 flex items-center justify-between">
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
                      contentStyle={{
                        background: "var(--popover)",
                        color: "var(--popover-foreground)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
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

        {/* Lista de chamados com sincronização Backorder */}
        <GlassCard delay={0.55}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-primary" strokeWidth={1.75} />
              <h3 className="text-base font-semibold">Chamados</h3>
              <Badge variant="secondary" className="text-xs">
                {filtered.length}
              </Badge>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Concluir aqui sincroniza automaticamente com o módulo Backorder
            </span>
          </div>
          <div
            className="scroll-fluid relative w-full overflow-auto rounded-xl border border-border/60"
            style={{ maxHeight: "min(70vh, 640px)", scrollBehavior: "smooth" }}
          >
            <table className="w-full min-w-[720px] text-xs">
              <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
                <tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-2 font-medium">OS</th>
                  <th className="px-3 py-2 font-medium">Descrição</th>
                  <th className="px-3 py-2 font-medium">Equipe</th>
                  <th className="px-3 py-2 font-medium">Solicitante</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map((r) => {
                  const done = r.statusNorm === "concluido";
                  const busy = pendingOs.has(r.os);
                  return (
                    <tr
                      key={r.os}
                      className="border-b border-border/40 last:border-b-0 hover:bg-muted/40"
                    >
                      <td className="px-3 py-2 font-mono text-[11px] tabular-nums">{r.os}</td>
                      <td className="max-w-[340px] truncate px-3 py-2" title={r.descricao}>
                        {r.descricao || "—"}
                      </td>
                      <td className="px-3 py-2">{r.equipe}</td>
                      <td className="max-w-[180px] truncate px-3 py-2" title={r.solicitante}>
                        {r.solicitante}
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant="outline"
                          className={
                            done
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                              : r.statusNorm === "andamento"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                              : "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                          }
                        >
                          {done ? "Concluído" : r.status || "Aberto"}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          size="sm"
                          variant={done ? "outline" : "default"}
                          disabled={busy}
                          onClick={() => toggleConcluido(r, !done)}
                        >
                          {busy ? (
                            <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                          ) : done ? (
                            <RotateCcw className="mr-1 h-3.5 w-3.5" />
                          ) : (
                            <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          )}
                          {done ? "Reabrir" : "Concluir"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length > 300 && (
              <div className="border-t border-border/60 bg-muted/30 px-3 py-2 text-center text-[11px] text-muted-foreground">
                Mostrando 300 de {filtered.length} chamados — refine os filtros para ver os demais.
              </div>
            )}
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

function InsightCard({
  insight,
}: {
  insight: ReturnType<typeof computeDashboardStats>["insights"][number];
}) {
  const styles: Record<
    typeof insight.tipo,
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
        <p className="mt-1 text-xs text-foreground/80">{insight.descricao}</p>
      </div>
    </div>
  );
}

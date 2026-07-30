import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  ChartColumn,
  Copy,
  Database,
  LayoutTemplate,
  Loader2,
  Move,
  Plug,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState, ErrorState, ExportMenu, SkeletonState } from "@/components/pcm";
import { WidgetChart, widgetSpan, formatKpi } from "@/components/bi/widget-chart";
import { useCanAccessModule } from "@/hooks/use-can-access-module";
import { cn } from "@/lib/utils";

import {
  BI_VIEWS,
  CHART_LABEL,
  DATASETS,
  KPIS,
  KPI_LIST,
  TEMPLATES,
  type ChartType,
  type DatasetKey,
  type Row,
  type WidgetSpec,
} from "@/features/bi/catalog";
import {
  DEFAULT_FILTERS,
  PERIODS,
  applyFilters,
  db,
  distinctValues,
  filteredDatasets,
  loadDatasets,
  tableColumns,
  type GlobalFilters,
} from "@/features/bi/data";
import {
  exportCsv,
  exportDatasetExcel,
  exportExcel,
  exportPdf,
  exportPng,
} from "@/features/bi/export";

export const Route = createFileRoute("/_authenticated/bi-studio")({
  head: () => ({
    meta: [
      { title: "BI Studio | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Monte painéis de manutenção com modelos prontos, indicadores de PCM, frota e taludes, e exporte para Excel, PDF, imagem ou Power BI.",
      },
      { property: "og:title", content: "BI Studio | Apont Auto PCM" },
      {
        property: "og:description",
        content: "Painéis de BI simplificados para o PCM, sem precisar montar consultas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BiStudioPage,
});

type Dashboard = {
  id: string | null;
  name: string;
  description: string;
  template_key: string;
  shared: boolean;
  widgets: WidgetSpec[];
};

const uid = () => Math.random().toString(36).slice(2, 10);

function fromTemplate(key: string): Dashboard {
  const tpl = TEMPLATES.find((t) => t.key === key) ?? TEMPLATES[0];
  return {
    id: null,
    name: tpl.label,
    description: tpl.description,
    template_key: tpl.key,
    shared: false,
    widgets: tpl.widgets.map((w) => ({ ...w, id: uid() })),
  };
}

function BiStudioPage() {
  const { allowed, isLoading: loadingAccess } = useCanAccessModule("bi-studio");
  const [tab, setTab] = useState("painel");
  const [dashboard, setDashboard] = useState<Dashboard>(() => fromTemplate("executivo"));
  const [filters, setFilters] = useState<GlobalFilters>(DEFAULT_FILTERS);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);

  const neededDatasets = useMemo(
    () => [
      ...new Set(
        dashboard.widgets.flatMap((w) => [w.dataset, ...(w.kpi ? KPIS[w.kpi].datasets : [])]),
      ),
    ],
    [dashboard.widgets],
  );

  const dataQuery = useQuery({
    queryKey: ["bi-data", neededDatasets.slice().sort().join(","), filters.periodDays],
    queryFn: () => loadDatasets(neededDatasets as DatasetKey[], filters.periodDays),
    enabled: allowed && neededDatasets.length > 0,
    staleTime: 60_000,
  });

  const saved = useQuery({
    queryKey: ["bi-dashboards"],
    queryFn: async () => {
      const { data, error } = await db
        .from("bi_dashboards")
        .select("id, name, description, template_key, shared, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    enabled: allowed,
  });

  const raw = dataQuery.data ?? {};
  const data = useMemo(() => filteredDatasets(raw, filters), [raw, filters]);

  const equipes = useMemo(() => distinctValues(raw, "equipe"), [raw]);
  const predios = useMemo(() => distinctValues(raw, "predio"), [raw]);
  const modalidades = useMemo(() => distinctValues(raw, "modalidade"), [raw]);
  const veiculos = useMemo(() => distinctValues(raw, "veiculo"), [raw]);

  const rowsFor = (widget: WidgetSpec): Row[] => {
    const list = data[widget.dataset] ?? [];
    if (!widget.filters) return list;
    return list.filter((r) =>
      Object.entries(widget.filters ?? {}).every(
        ([k, v]) => String(r[k] ?? "").toLowerCase() === v.toLowerCase(),
      ),
    );
  };

  /* --------------------------- Persistência --------------------------- */

  async function saveDashboard() {
    setSaving(true);
    try {
      const { data: userData } = await db.auth.getUser();
      const owner = userData?.user?.id;
      if (!owner) throw new Error("Sessão expirada.");

      const payload = {
        name: dashboard.name.trim() || "Painel sem nome",
        description: dashboard.description,
        template_key: dashboard.template_key,
        shared: dashboard.shared,
        owner_id: owner,
        layout: { widgets: dashboard.widgets },
        default_filters: filters,
      };

      let id = dashboard.id;
      if (id) {
        const { error } = await db.from("bi_dashboards").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await db
          .from("bi_dashboards")
          .insert(payload)
          .select("id")
          .single();
        if (error) throw error;
        id = (inserted as { id: string }).id;
      }

      await db.from("bi_widgets").delete().eq("dashboard_id", id);
      if (dashboard.widgets.length) {
        const { error } = await db.from("bi_widgets").insert(
          dashboard.widgets.map((w, i) => ({
            dashboard_id: id,
            title: w.title,
            chart_type: w.chart,
            metric_key: w.kpi ?? w.field ?? w.aggregation ?? "count",
            dimension_key: w.dimension ?? w.bucket ?? null,
            aggregation: w.aggregation ?? "count",
            filters: w.filters ?? {},
            position: i,
            size: w.size,
            visual: { dataset: w.dataset, bucket: w.bucket ?? null, series: w.series ?? null },
          })),
        );
        if (error) throw error;
      }

      setDashboard((d) => ({ ...d, id }));
      await saved.refetch();
      toast.success("Painel salvo");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o painel");
    } finally {
      setSaving(false);
    }
  }

  async function openDashboard(id: string) {
    const { data: rec, error } = await db
      .from("bi_dashboards")
      .select("id, name, description, template_key, shared, layout, default_filters")
      .eq("id", id)
      .single();
    if (error || !rec) {
      toast.error("Painel não encontrado");
      return;
    }
    const r = rec as Row;
    const layout = (r.layout as { widgets?: WidgetSpec[] } | null) ?? {};
    setDashboard({
      id: String(r.id),
      name: String(r.name ?? ""),
      description: String(r.description ?? ""),
      template_key: String(r.template_key ?? "custom"),
      shared: Boolean(r.shared),
      widgets: (layout.widgets ?? []).map((w) => ({ ...w, id: w.id || uid() })),
    });
    if (r.default_filters)
      setFilters({ ...DEFAULT_FILTERS, ...(r.default_filters as GlobalFilters) });
    setTab("painel");
  }

  async function removeDashboard(id: string) {
    const { error } = await db.from("bi_dashboards").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Painel excluído");
      if (dashboard.id === id) setDashboard((d) => ({ ...d, id: null }));
      void saved.refetch();
    }
  }

  /* ---------------------------- Exportações ---------------------------- */

  async function handleExport(kind: "png" | "pdf" | "xlsx" | "csv") {
    setExporting(true);
    try {
      if (kind === "png") {
        if (boardRef.current) await exportPng(boardRef.current, dashboard.name);
      } else if (kind === "pdf") {
        await exportPdf({
          title: dashboard.name,
          subtitle: `${dashboard.description} · período: ${
            PERIODS.find((p) => p.key === filters.periodDays)?.label
          } · gerado em ${new Date().toLocaleString("pt-BR")}`,
          kpis: dashboard.widgets
            .filter((w) => w.chart === "kpi" || w.chart === "gauge")
            .map((w) => ({
              label: w.title,
              value: w.kpi
                ? formatKpi(KPIS[w.kpi].compute(data), KPIS[w.kpi].unit)
                : String(rowsFor(w).length),
            })),
          tables: dashboard.widgets
            .filter((w) => w.chart === "table")
            .map((w) => {
              const cols = tableColumns(w.dataset);
              return {
                title: w.title,
                columns: cols,
                rows: rowsFor(w)
                  .slice(0, 40)
                  .map((r) => cols.map((c) => (r[c] == null ? "" : String(r[c])))),
              };
            }),
        });
      } else if (kind === "xlsx") {
        await exportExcel(
          Object.entries(data).map(([key, list]) => ({
            name: DATASETS[key as DatasetKey].label,
            rows: list ?? [],
          })),
          dashboard.name.toLowerCase().replace(/\s+/g, "-"),
          `Apont Auto — ${dashboard.name}`,
        );
      } else {
        const first = neededDatasets[0] as DatasetKey | undefined;
        if (first) exportCsv(data[first] ?? [], `bi-${first}`);
      }
      toast.success("Exportação concluída");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  }

  /* ------------------------------ Widgets ------------------------------ */

  const moveWidget = (index: number, dir: -1 | 1) =>
    setDashboard((d) => {
      const next = [...d.widgets];
      const target = index + dir;
      if (target < 0 || target >= next.length) return d;
      [next[index], next[target]] = [next[target], next[index]];
      return { ...d, widgets: next };
    });

  const cycleSize = (id: string) =>
    setDashboard((d) => ({
      ...d,
      widgets: d.widgets.map((w) =>
        w.id === id ? { ...w, size: w.size === "sm" ? "md" : w.size === "md" ? "lg" : "sm" } : w,
      ),
    }));

  const removeWidget = (id: string) =>
    setDashboard((d) => ({ ...d, widgets: d.widgets.filter((w) => w.id !== id) }));

  if (loadingAccess) return <SkeletonState rows={4} />;
  if (!allowed) {
    return (
      <PageShell title="BI Studio" description="Painéis analíticos do PCM.">
        <ErrorState
          title="Sem permissão"
          description="Solicite acesso ao módulo BI Studio para visualizar e montar painéis."
        />
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow="Inteligência e BI"
      title="BI Studio"
      description="Monte painéis com modelos prontos, filtre por período, equipe e prédio, e exporte para Excel, PDF, imagem ou Power BI."
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            className="h-10"
            onClick={() => void dataQuery.refetch()}
            disabled={dataQuery.isFetching}
          >
            <RefreshCw
              className={cn("size-4", dataQuery.isFetching && "animate-spin")}
              aria-hidden
            />
            Atualizar
          </Button>
          <ExportMenu
            disabled={exporting || dataQuery.isLoading}
            options={[
              {
                key: "xlsx",
                label: "Excel (todas as abas)",
                kind: "xlsx",
                onSelect: () => handleExport("xlsx"),
              },
              {
                key: "csv",
                label: "CSV do dataset principal",
                kind: "csv",
                onSelect: () => handleExport("csv"),
              },
              {
                key: "pdf",
                label: "PDF executivo",
                kind: "pdf",
                onSelect: () => handleExport("pdf"),
              },
              {
                key: "png",
                label: "Imagem do painel (PNG)",
                kind: "png",
                onSelect: () => handleExport("png"),
              },
            ]}
          />
          <Button size="sm" className="h-10" onClick={() => void saveDashboard()} disabled={saving}>
            {saving ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Save className="size-4" aria-hidden />
            )}
            Salvar painel
          </Button>
        </>
      }
    >
      <Tabs value={tab} onValueChange={setTab} className="space-y-5">
        <TabsList className="h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="painel" className="gap-2">
            <ChartColumn className="size-4" aria-hidden /> Painel
          </TabsTrigger>
          <TabsTrigger value="modelos" className="gap-2">
            <LayoutTemplate className="size-4" aria-hidden /> Modelos
          </TabsTrigger>
          <TabsTrigger value="salvos" className="gap-2">
            <Database className="size-4" aria-hidden /> Meus painéis
          </TabsTrigger>
          <TabsTrigger value="conector" className="gap-2">
            <Plug className="size-4" aria-hidden /> Conector BI
          </TabsTrigger>
        </TabsList>

        {/* ------------------------------ PAINEL ------------------------------ */}
        <TabsContent value="painel" className="space-y-5">
          <GlassCard className="space-y-3 p-3 sm:p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 space-y-1">
                <Label className="text-xs text-muted-foreground">Nome do painel</Label>
                <Input
                  value={dashboard.name}
                  onChange={(e) => setDashboard((d) => ({ ...d, name: e.target.value }))}
                  className="h-10"
                />
              </div>
              <FilterSelect
                label="Período"
                value={String(filters.periodDays)}
                onChange={(v) => setFilters((f) => ({ ...f, periodDays: Number(v) }))}
                options={PERIODS.map((p) => ({ value: String(p.key), label: p.label }))}
              />
              <FilterSelect
                label="Equipe"
                value={filters.equipe}
                onChange={(v) => setFilters((f) => ({ ...f, equipe: v }))}
                options={equipes.map((v) => ({ value: v, label: v }))}
                allLabel="Todas"
              />
              <FilterSelect
                label="Prédio"
                value={filters.predio}
                onChange={(v) => setFilters((f) => ({ ...f, predio: v }))}
                options={predios.map((v) => ({ value: v, label: v }))}
                allLabel="Todos"
              />
              <FilterSelect
                label="Modalidade"
                value={filters.modalidade}
                onChange={(v) => setFilters((f) => ({ ...f, modalidade: v }))}
                options={modalidades.map((v) => ({ value: v, label: v }))}
                allLabel="Todas"
              />
              {veiculos.length > 0 && (
                <FilterSelect
                  label="Veículo"
                  value={filters.veiculo}
                  onChange={(v) => setFilters((f) => ({ ...f, veiculo: v }))}
                  options={veiculos.map((v) => ({ value: v, label: v }))}
                  allLabel="Todos"
                />
              )}
              <Button
                variant="secondary"
                size="sm"
                className="h-10"
                onClick={() => setAddOpen(true)}
              >
                <Plus className="size-4" aria-hidden />
                Novo bloco
              </Button>
            </div>
            <Textarea
              value={dashboard.description}
              onChange={(e) => setDashboard((d) => ({ ...d, description: e.target.value }))}
              placeholder="Descrição do painel (aparece no PDF exportado)"
              className="min-h-[44px] text-sm"
            />
          </GlassCard>

          {dataQuery.isLoading ? (
            <SkeletonState rows={6} />
          ) : dataQuery.isError ? (
            <ErrorState
              title="Não foi possível carregar os dados"
              description={(dataQuery.error as Error)?.message}
              onRetry={() => void dataQuery.refetch()}
            />
          ) : dashboard.widgets.length === 0 ? (
            <EmptyState
              icon={<BarChart3 className="size-5" aria-hidden />}
              title="Painel vazio"
              description="Adicione blocos ou escolha um modelo pronto na aba Modelos."
            />
          ) : (
            <div
              ref={boardRef}
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:gap-4"
            >
              {dashboard.widgets.map((widget, index) => (
                <GlassCard
                  key={widget.id}
                  variant={widget.chart === "kpi" ? "block" : "surface"}
                  className={cn("flex min-w-0 flex-col", widgetSpan(widget.size))}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{widget.title}</p>
                      <p className="truncate text-[11px] text-muted-foreground">
                        {DATASETS[widget.dataset].label} · {CHART_LABEL[widget.chart]}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-0.5" data-export-ignore="true">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => moveWidget(index, -1)}
                        aria-label="Mover para trás"
                      >
                        <Move className="size-3.5 rotate-180" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => cycleSize(widget.id)}
                        aria-label="Alterar tamanho"
                      >
                        <LayoutTemplate className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => removeWidget(widget.id)}
                        aria-label="Remover bloco"
                      >
                        <Trash2 className="size-3.5 text-destructive" aria-hidden />
                      </Button>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <WidgetChart
                      widget={widget}
                      rows={rowsFor(widget)}
                      datasets={data}
                      height={widget.size === "lg" ? 280 : 220}
                    />
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ----------------------------- MODELOS ----------------------------- */}
        <TabsContent
          value="modelos"
          className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3"
        >
          {TEMPLATES.map((tpl) => (
            <GlassCard key={tpl.key} className="flex flex-col justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" aria-hidden />
                  <p className="font-semibold">{tpl.label}</p>
                </div>
                <p className="text-sm text-muted-foreground">{tpl.description}</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {tpl.widgets.slice(0, 6).map((w, i) => (
                    <Badge key={i} variant="secondary" className="text-[10px]">
                      {CHART_LABEL[w.chart]}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button
                size="sm"
                className="h-10 w-full"
                onClick={() => {
                  setDashboard(fromTemplate(tpl.key));
                  setTab("painel");
                  toast.success(`Modelo “${tpl.label}” carregado`);
                }}
              >
                Usar este modelo
              </Button>
            </GlassCard>
          ))}
        </TabsContent>

        {/* ----------------------------- SALVOS ----------------------------- */}
        <TabsContent value="salvos" className="space-y-3">
          {saved.isLoading ? (
            <SkeletonState rows={3} />
          ) : (saved.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Database className="size-5" aria-hidden />}
              title="Nenhum painel salvo"
              description="Monte um painel na aba Painel e clique em Salvar painel."
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(saved.data ?? []).map((d) => (
                <GlassCard key={String(d.id)} className="flex flex-col justify-between gap-3">
                  <div>
                    <p className="font-semibold">{String(d.name)}</p>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {String(d.description ?? "")}
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      Atualizado em {new Date(String(d.updated_at)).toLocaleString("pt-BR")}
                      {d.shared ? " · compartilhado" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-10 flex-1"
                      onClick={() => void openDashboard(String(d.id))}
                    >
                      Abrir
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10"
                      onClick={() => void removeDashboard(String(d.id))}
                      aria-label="Excluir painel"
                    >
                      <Trash2 className="size-4 text-destructive" aria-hidden />
                    </Button>
                  </div>
                </GlassCard>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ---------------------------- CONECTOR ---------------------------- */}
        <TabsContent value="conector" className="space-y-4">
          <ConnectorPanel />
        </TabsContent>
      </Tabs>

      <AddWidgetDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onAdd={(w) => setDashboard((d) => ({ ...d, widgets: [...d.widgets, { ...w, id: uid() }] }))}
      />
    </PageShell>
  );
}

/* ----------------------------- Subcomponentes ----------------------------- */

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  return (
    <div className="min-w-[140px] space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || "__all"} onValueChange={(v) => onChange(v === "__all" ? "" : v)}>
        <SelectTrigger className="h-10">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allLabel && <SelectItem value="__all">{allLabel}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

const CHART_OPTIONS: ChartType[] = [
  "kpi",
  "gauge",
  "line",
  "area",
  "bar",
  "stacked",
  "donut",
  "pareto",
  "heatmap",
  "timeline",
  "table",
];

function AddWidgetDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (widget: Omit<WidgetSpec, "id">) => void;
}) {
  const [chart, setChart] = useState<ChartType>("bar");
  const [dataset, setDataset] = useState<DatasetKey>("work_orders");
  const [dimension, setDimension] = useState("equipe");
  const [series, setSeries] = useState("status");
  const [aggregation, setAggregation] = useState("count");
  const [field, setField] = useState("");
  const [kpi, setKpi] = useState(KPI_LIST[0].key);
  const [bucket, setBucket] = useState<"" | "day" | "week" | "month">("");
  const [title, setTitle] = useState("");

  const def = DATASETS[dataset];
  const isKpi = chart === "kpi" || chart === "gauge";

  useEffect(() => {
    if (!def.dimensions.some((d) => d.key === dimension))
      setDimension(def.dimensions[0]?.key ?? "");
    if (!def.dimensions.some((d) => d.key === series))
      setSeries(def.dimensions[1]?.key ?? def.dimensions[0]?.key ?? "");
    if (field && !(def.measures ?? []).some((m) => m.key === field)) setField("");
  }, [dataset, def, dimension, series, field]);

  const submit = () => {
    const kpiDef = KPIS[kpi];
    onAdd({
      title:
        title.trim() ||
        (isKpi
          ? kpiDef.label
          : `${def.label} por ${bucket ? "período" : (def.dimensions.find((d) => d.key === dimension)?.label ?? dimension)}`),
      chart,
      dataset: isKpi ? kpiDef.datasets[0] : dataset,
      dimension: bucket ? undefined : dimension,
      bucket: bucket || undefined,
      series: chart === "stacked" || chart === "heatmap" ? series : undefined,
      aggregation: aggregation as WidgetSpec["aggregation"],
      field: field || undefined,
      kpi: isKpi ? kpi : undefined,
      size: isKpi
        ? "sm"
        : chart === "table" || chart === "timeline" || chart === "heatmap"
          ? "lg"
          : "md",
    });
    onOpenChange(false);
    setTitle("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo bloco</DialogTitle>
          <DialogDescription>
            Escolha o que medir e como visualizar — sem escrever consultas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Visualização</Label>
            <Select value={chart} onValueChange={(v) => setChart(v as ChartType)}>
              <SelectTrigger className="h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CHART_OPTIONS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {CHART_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isKpi ? (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Indicador</Label>
              <Select value={kpi} onValueChange={(v) => setKpi(v as typeof kpi)}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KPI_LIST.map((k) => (
                    <SelectItem key={k.key} value={k.key}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">{KPIS[kpi].hint}</p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Fonte de dados</Label>
                <Select value={dataset} onValueChange={(v) => setDataset(v as DatasetKey)}>
                  <SelectTrigger className="h-10">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(DATASETS).map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {chart !== "table" && chart !== "timeline" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Agrupar por</Label>
                      <Select
                        value={bucket ? `bucket:${bucket}` : dimension}
                        onValueChange={(v) => {
                          if (v.startsWith("bucket:")) setBucket(v.slice(7) as "day");
                          else {
                            setBucket("");
                            setDimension(v);
                          }
                        }}
                      >
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {def.dimensions.map((d) => (
                            <SelectItem key={d.key} value={d.key}>
                              {d.label}
                            </SelectItem>
                          ))}
                          <SelectItem value="bucket:day">Por dia</SelectItem>
                          <SelectItem value="bucket:week">Por semana</SelectItem>
                          <SelectItem value="bucket:month">Por mês</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Cálculo</Label>
                      <Select value={aggregation} onValueChange={setAggregation}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="count">Contagem</SelectItem>
                          <SelectItem value="sum">Soma</SelectItem>
                          <SelectItem value="avg">Média</SelectItem>
                          <SelectItem value="max">Máximo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {aggregation !== "count" && (def.measures ?? []).length > 0 && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Campo numérico</Label>
                      <Select value={field} onValueChange={setField}>
                        <SelectTrigger className="h-10">
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          {(def.measures ?? []).map((m) => (
                            <SelectItem key={m.key} value={m.key}>
                              {m.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {(chart === "stacked" || chart === "heatmap") && (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Segunda dimensão</Label>
                      <Select value={series} onValueChange={setSeries}>
                        <SelectTrigger className="h-10">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {def.dimensions.map((d) => (
                            <SelectItem key={d.key} value={d.key}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Título (opcional)</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} className="h-10" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button className="h-10" onClick={submit}>
            Adicionar bloco
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConnectorPanel() {
  const [busy, setBusy] = useState<string | null>(null);
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado");
  };

  const download = async (view: (typeof BI_VIEWS)[number], kind: "csv" | "xlsx") => {
    setBusy(view.name);
    try {
      const { data, error } = await db.from(view.name).select("*").limit(20000);
      if (error) throw error;
      const rows = (data ?? []) as Row[];
      if (kind === "csv") exportCsv(rows, view.name);
      else await exportDatasetExcel(view.dataset, rows);
      toast.success(`${rows.length} linha(s) exportada(s)`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao exportar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <GlassCard className="space-y-3">
        <div className="flex items-center gap-2">
          <Plug className="size-4 text-primary" aria-hidden />
          <p className="font-semibold">Como conectar o Power BI ou o Excel</p>
        </div>
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Baixe o arquivo Excel da visão desejada abaixo para uma carga inicial rápida.</li>
          <li>
            Para atualização automática, use o feed autenticado abaixo em “Obter dados → Web”,
            informando o cabeçalho{" "}
            <code className="rounded bg-muted px-1">Authorization: Bearer &lt;token&gt;</code>.
          </li>
          <li>
            Use o parâmetro <code className="rounded bg-muted px-1">since</code> (data ISO) para
            trazer só o que mudou desde a última atualização — carga incremental.
          </li>
        </ol>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/30 p-2.5">
          <code className="min-w-0 flex-1 truncate text-xs">
            {origin}/api/bi-feed?view=vw_bi_work_orders&amp;since=2026-01-01T00:00:00Z
          </code>
          <Button
            size="sm"
            variant="outline"
            className="h-9"
            onClick={() =>
              void copy(`${origin}/api/bi-feed?view=vw_bi_work_orders&since=2026-01-01T00:00:00Z`)
            }
          >
            <Copy className="size-3.5" aria-hidden />
            Copiar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          O feed respeita as permissões do usuário: cada pessoa enxerga apenas o que já pode ver no
          sistema. Dados sensíveis (CPF completo, tokens e URLs administrativas) não são publicados
          nas visões.
        </p>
      </GlassCard>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {BI_VIEWS.map((view) => (
          <GlassCard key={view.name} className="space-y-3">
            <div>
              <p className="font-semibold">{view.label}</p>
              <code className="text-[11px] text-muted-foreground">{view.name}</code>
            </div>
            <div className="flex flex-wrap gap-1">
              {DATASETS[view.dataset].dimensions.slice(0, 5).map((d) => (
                <Badge key={d.key} variant="secondary" className="text-[10px]">
                  {d.label}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-10"
                disabled={busy === view.name}
                onClick={() => void download(view, "xlsx")}
              >
                {busy === view.name ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                ) : null}
                Excel
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-10"
                onClick={() => void download(view, "csv")}
              >
                CSV
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-10"
                onClick={() => void copy(`${origin}/api/bi-feed?view=${view.name}`)}
              >
                <Copy className="size-3.5" aria-hidden />
                URL do feed
              </Button>
            </div>
          </GlassCard>
        ))}
      </div>
    </>
  );
}

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Database,
  Download,
  FileSpreadsheet,
  History,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Table2,
  Upload,
  X,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { downloadBlob } from "@/lib/download";
import { loadActiveAssetGraph } from "@/features/assets/services/asset-graph-loader";
import {
  DEFAULT_FILL_OPTIONS,
  STATUS_LABEL,
  accumulate,
  detectAtivoColumn,
  detectTargetColumns,
  emptyTotals,
  isAssetSheetName,
  processRows,
  type AtivoDetection,
  type FillOptions,
  type MatchStatus,
  type RowResult,
  type TargetColumns,
  type Totals,
} from "@/features/assets/services/sheet-fill";
import {
  buildUnmatchedReport,
  loadWorkbook,
  validateFile,
  writeProcessed,
  type LoadedWorkbook,
  type SheetPlan,
} from "@/features/assets/services/spreadsheet-io";
import { saveJob } from "@/features/assets/services/fill-jobs";
import type { AssetRecord } from "@/features/assets/types";
import { fetchCatalogAssets, fetchLegacyAssets, getActiveCatalog } from "@/features/assets/services/asset-catalog";

export const Route = createFileRoute("/_authenticated/inteligencia-ativos/preencher")({
  head: () => ({
    meta: [
      { title: "Preencher Planilha — Inteligência de Ativos" },
      {
        name: "description",
        content:
          "Preencha Prédio, Andar e Ambiente automaticamente a partir do código do ativo, sem PROCV manual.",
      },
      { property: "og:title", content: "Preencher Planilha — Inteligência de Ativos" },
      {
        property: "og:description",
        content: "Motor hierárquico de ativos aplicado às suas planilhas em segundos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PreencherPlanilha,
});

/* -------------------------------------------------------------------------- */

type Step = "upload" | "analise" | "mapeamento" | "opcoes" | "previa" | "processando" | "resultado";

const STEPS: { key: Step; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "analise", label: "Análise" },
  { key: "mapeamento", label: "Mapeamento" },
  { key: "opcoes", label: "Opções" },
  { key: "previa", label: "Prévia" },
  { key: "processando", label: "Processamento" },
  { key: "resultado", label: "Resultado" },
];

interface SheetConfig {
  selected: boolean;
  headerRow: number;
  ativoIndex: number;
  targets: TargetColumns;
  detection: AtivoDetection | null;
}

const MAPPING_TEMPLATE_KEY = "pcm.fill.mapping-templates";

function LiquidPanel({
  children,
  className,
  tone = "default",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "default" | "accent";
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border bg-card/60 p-5 backdrop-blur-xl sm:p-7",
        tone === "accent"
          ? "border-primary/40 shadow-[0_0_60px_-25px_hsl(var(--primary)/0.9)]"
          : "border-border/60",
        className,
      )}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      {children}
    </div>
  );
}

const STATUS_TONE: Record<MatchStatus, string> = {
  exact: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  tree: "bg-sky-500/15 text-sky-500 border-sky-500/30",
  legacy: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  preserved: "bg-muted text-muted-foreground border-border",
  conflict: "bg-orange-500/15 text-orange-500 border-orange-500/30",
  unmatched: "bg-destructive/15 text-destructive border-destructive/30",
  empty: "bg-muted text-muted-foreground border-border",
};

type PreviewFilter = "all" | "exact" | "tree" | "legacy" | "conflict" | "unmatched";

/* -------------------------------------------------------------------------- */

function PreencherPlanilha() {
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [loaded, setLoaded] = useState<LoadedWorkbook | null>(null);
  const [configs, setConfigs] = useState<Record<string, SheetConfig>>({});
  const [options, setOptions] = useState<FillOptions>(DEFAULT_FILL_OPTIONS);
  const [activeSheet, setActiveSheet] = useState<string>("");
  const [filter, setFilter] = useState<PreviewFilter>("all");
  const [overrides, setOverrides] = useState<Record<string, [string, string, string]>>({});
  const [progress, setProgress] = useState({ overall: 0, sheet: "", done: 0, total: 0 });
  const [plans, setPlans] = useState<SheetPlan[]>([]);
  const [totals, setTotals] = useState<Totals>(emptyTotals());
  const [duration, setDuration] = useState(0);
  const [errors, setErrors] = useState<{ sheet: string; message: string }[]>([]);
  const [fatal, setFatal] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const workerRef = useRef<Worker | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const catalogQuery = useQuery({
    queryKey: ["asset-graph-active"],
    queryFn: () => loadActiveAssetGraph(),
    staleTime: 60_000,
  });
  const graph = catalogQuery.data?.graph ?? null;
  const catalogName = catalogQuery.data?.catalogName ?? "base legada";

  useEffect(() => () => workerRef.current?.terminate(), []);

  /* ---------------------------------------------------------------- upload */

  const handleFile = useCallback(
    async (f: File) => {
      const problem = validateFile(f);
      if (problem) {
        toast.error(problem);
        return;
      }
      setBusy(true);
      setFatal(null);
      try {
        const wb = await loadWorkbook(f);
        const cfg: Record<string, SheetConfig> = {};
        for (const sheet of wb.sheets) {
          const dataRows = sheet.rows.slice(sheet.headerRow + 1);
          const detection = detectAtivoColumn(sheet.headers, dataRows, graph);
          cfg[sheet.name] = {
            selected: !isAssetSheetName(sheet.name) && detection.index >= 0,
            headerRow: sheet.headerRow,
            ativoIndex: detection.index,
            targets: detectTargetColumns(sheet.headers, detection.index),
            detection,
          };
        }
        setFile(f);
        setLoaded(wb);
        setConfigs(cfg);
        setActiveSheet(wb.sheets.find((s) => cfg[s.name].selected)?.name ?? wb.sheets[0]?.name ?? "");
        setStep("analise");
        if (wb.kind === "csv")
          toast.info("CSV não possui estilos nem múltiplas abas — o resultado sairá em .xlsx.");
        if (wb.kind === "legacy-xls")
          toast.info("Arquivos .xls antigos não preservam estilos; o resultado sairá em .xlsx.");
      } catch (e) {
        setFatal(e instanceof Error ? e.message : String(e));
        toast.error("Não foi possível abrir o arquivo.");
      } finally {
        setBusy(false);
      }
    },
    [graph],
  );

  /* --------------------------------------------------------------- prévia  */

  const selectedSheets = useMemo(
    () => (loaded?.sheets ?? []).filter((s) => configs[s.name]?.selected && configs[s.name].ativoIndex >= 0),
    [loaded, configs],
  );

  const previewRows = useMemo<RowResult[]>(() => {
    if (!graph || !loaded) return [];
    const sheet = loaded.sheets.find((s) => s.name === activeSheet);
    const cfg = configs[activeSheet];
    if (!sheet || !cfg || cfg.ativoIndex < 0) return [];
    const dataRows = sheet.rows.slice(cfg.headerRow + 1, cfg.headerRow + 1 + 400);
    return processRows(graph, {
      rows: dataRows,
      ativoIndex: cfg.ativoIndex,
      targets: cfg.targets,
      headerRow: cfg.headerRow,
      options,
    }).filter((r) => r.status !== "empty");
  }, [graph, loaded, activeSheet, configs, options]);

  const filteredPreview = useMemo(() => {
    const match = (r: RowResult) => {
      if (filter === "all") return true;
      if (filter === "exact") return r.status === "exact";
      if (filter === "tree") return r.status === "tree";
      if (filter === "legacy") return r.status === "legacy";
      if (filter === "conflict") return r.status === "conflict";
      return r.status === "unmatched";
    };
    return previewRows.filter(match).slice(0, 100);
  }, [previewRows, filter]);

  /* --------------------------------------------------------- processamento */

  const runProcessing = useCallback(async () => {
    if (!loaded) return;
    setStep("processando");
    setErrors([]);
    setPlans([]);
    setProgress({ overall: 0, sheet: "", done: 0, total: 0 });
    const started = performance.now();

    let records: AssetRecord[] = [];
    let catalogId: string | null = null;
    try {
      const catalog = await getActiveCatalog();
      if (catalog) {
        catalogId = catalog.id;
        records = await fetchCatalogAssets(catalog.id);
      }
      if (records.length === 0) records = await fetchLegacyAssets();
    } catch (e) {
      setFatal("Não foi possível carregar a base de ativos.");
      setStep("previa");
      return;
    }

    const worker = new Worker(
      new URL("../../features/assets/workers/fill.worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;

    const collected: SheetPlan[] = [];
    const localErrors: { sheet: string; message: string }[] = [];

    worker.onmessage = (ev: MessageEvent<any>) => {
      const msg = ev.data;
      if (msg.type === "progress") {
        setProgress({ overall: msg.overall, sheet: msg.sheet, done: msg.done, total: msg.total });
      } else if (msg.type === "sheet-done") {
        const cfg = configs[msg.sheet];
        const results: RowResult[] = msg.results.map((r: RowResult) => {
          const key = `${msg.sheet}:${r.row}`;
          const o = overrides[key];
          if (o) return { ...r, final: o, computed: o, method: "manual" as const, changed: true };
          return r;
        });
        collected.push({
          sheetName: msg.sheet,
          headerRow: cfg.headerRow,
          ativoIndex: cfg.ativoIndex,
          targets: cfg.targets,
          results,
          options,
          catalogName,
        });
      } else if (msg.type === "sheet-error") {
        localErrors.push({ sheet: msg.sheet, message: msg.message });
      } else if (msg.type === "error") {
        localErrors.push({ sheet: "—", message: msg.message });
      } else if (msg.type === "done") {
        const t = emptyTotals();
        t.sheets = collected.length;
        collected.forEach((p) => accumulate(t, p.results));
        setPlans(collected);
        setTotals(t);
        setErrors(localErrors);
        setDuration(performance.now() - started);
        setStep("resultado");
        worker.terminate();
        workerRef.current = null;

        saveJob({
          fileName: loaded.fileName,
          fileSize: loaded.fileSize,
          fileType: loaded.kind,
          catalogId,
          columnMapping: Object.fromEntries(
            collected.map((p) => [p.sheetName, { ativo: p.ativoIndex, ...p.targets }]),
          ),
          options: options as unknown as Record<string, unknown>,
          totals: t,
          durationMs: performance.now() - started,
          plans: collected,
        }).catch(() => undefined);
      }
    };

    worker.postMessage({
      type: "run",
      records,
      options,
      sheets: selectedSheets.map((s) => {
        const cfg = configs[s.name];
        return {
          name: s.name,
          rows: s.rows.slice(cfg.headerRow + 1),
          headerRow: cfg.headerRow,
          ativoIndex: cfg.ativoIndex,
          targets: cfg.targets,
        };
      }),
    });
  }, [loaded, configs, options, overrides, selectedSheets, catalogName]);

  const cancelProcessing = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setStep("previa");
    toast.info("Processamento cancelado.");
  };

  /* ------------------------------------------------------------- downloads */

  const downloadProcessed = async () => {
    if (!loaded) return;
    setBusy(true);
    try {
      const { blob, fileName } = await writeProcessed(loaded, plans);
      downloadBlob(blob, fileName);
    } catch (e) {
      toast.error("Falha ao gerar o arquivo.");
      setFatal(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadUnmatched = async () => {
    if (!loaded) return;
    const { blob, fileName } = await buildUnmatchedReport(loaded.fileName, plans);
    downloadBlob(blob, fileName);
  };

  const downloadFailureReport = () => {
    const text = [
      `Arquivo: ${loaded?.fileName ?? "-"}`,
      `Data: ${new Date().toISOString()}`,
      "",
      ...errors.map((e) => `[${e.sheet}] ${e.message}`),
      fatal ? `[fatal] ${fatal}` : "",
    ].join("\n");
    downloadBlob(new Blob([text], { type: "text/plain" }), "relatorio-de-falhas.txt");
  };

  const saveTemplate = () => {
    if (!loaded) return;
    try {
      const store = JSON.parse(localStorage.getItem(MAPPING_TEMPLATE_KEY) ?? "{}");
      store[loaded.fileName.replace(/\d+/g, "#")] = { configs, options };
      localStorage.setItem(MAPPING_TEMPLATE_KEY, JSON.stringify(store));
      toast.success("Mapeamento salvo como modelo.");
    } catch {
      toast.error("Não foi possível salvar o modelo.");
    }
  };

  const reset = () => {
    setFile(null);
    setLoaded(null);
    setConfigs({});
    setPlans([]);
    setOverrides({});
    setErrors([]);
    setFatal(null);
    setStep("upload");
  };

  /* ----------------------------------------------------------------- view  */

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <PageShell
      eyebrow="PCM · Inteligência de Ativos"
      title="Preencher Planilha"
      description="Prédio, Andar e Ambiente resolvidos pela árvore real de ativos — sem PROCV, sem fórmula quebrada."
      actions={
        <>
          <Button variant="outline" asChild>
            <Link to="/base-ativos">
              <Database className="mr-2 h-4 w-4" /> Base de Ativos
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/inteligencia-ativos/nao-encontrados">
              <Search className="mr-2 h-4 w-4" /> Não encontrados
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/inteligencia-ativos/historico">
              <History className="mr-2 h-4 w-4" /> Histórico
            </Link>
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {/* Stepper */}
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-7 items-center gap-2 rounded-full border px-3 text-[11px] font-medium transition-colors sm:text-xs",
                  i === stepIndex
                    ? "border-primary/50 bg-primary/15 text-primary"
                    : i < stepIndex
                      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                      : "border-border/60 text-muted-foreground",
                )}
              >
                {i < stepIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span>{i + 1}</span>}
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="hidden h-px w-4 bg-border sm:block" />}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="border-primary/30 text-primary">
            catálogo: {catalogQuery.isLoading ? "carregando…" : catalogName}
          </Badge>
          {catalogQuery.data && <span>{catalogQuery.data.total.toLocaleString("pt-BR")} ativos indexados</span>}
        </div>

        {/* -------------------------------------------------------- UPLOAD */}
        {step === "upload" && (
          <LiquidPanel tone="accent" className="text-center">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const f = e.dataTransfer.files?.[0];
                if (f) void handleFile(f);
              }}
              className={cn(
                "flex flex-col items-center gap-5 rounded-2xl border-2 border-dashed px-4 py-12 transition-all sm:py-16",
                dragging ? "border-primary bg-primary/10 scale-[1.01]" : "border-primary/25",
              )}
            >
              <div className="relative">
                <div className="absolute inset-0 -z-10 animate-pulse rounded-3xl bg-gradient-to-br from-primary/40 to-violet-500/40 blur-2xl" />
                <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-primary/40 bg-gradient-to-br from-primary/25 via-violet-500/20 to-transparent shadow-elegant">
                  <FileSpreadsheet className="h-11 w-11 text-primary" />
                </div>
              </div>
              <div className="space-y-1.5">
                <h3 className="font-display text-xl font-bold sm:text-2xl">
                  Arraste sua planilha aqui
                </h3>
                <p className="mx-auto max-w-md text-sm text-muted-foreground">
                  .xlsx, .xls ou .csv · até 25 MB. Arquivos .xlsx preservam estilos, fórmulas,
                  larguras, filtros e abas ocultas.
                </p>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleFile(f);
                  e.target.value = "";
                }}
              />
              <Button
                size="lg"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="h-12 rounded-2xl bg-gradient-to-r from-primary to-violet-500 px-8 text-base font-semibold shadow-elegant hover:opacity-90"
              >
                {busy ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Upload className="mr-2 h-5 w-5" />}
                Selecionar arquivo
              </Button>
              <p className="text-[11px] text-muted-foreground">
                O conteúdo da planilha é processado no seu navegador e nunca é enviado a serviços de IA.
              </p>
            </div>
          </LiquidPanel>
        )}

        {/* -------------------------------------------------------- ANÁLISE */}
        {step === "analise" && loaded && (
          <div className="space-y-4">
            <GlassCard>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{loaded.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {(loaded.fileSize / 1024).toFixed(0)} KB · {loaded.sheets.length} aba(s) ·{" "}
                    {loaded.kind === "xlsx" ? "estilos preservados" : "sem estilos (formato de origem)"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={reset}>
                  <X className="mr-1 h-4 w-4" /> Trocar arquivo
                </Button>
              </div>
              <div className="space-y-2">
                {loaded.sheets.map((s) => {
                  const cfg = configs[s.name];
                  const ignored = isAssetSheetName(s.name);
                  return (
                    <div
                      key={s.name}
                      className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/60 bg-background/40 p-3"
                    >
                      <Checkbox
                        checked={cfg?.selected}
                        onCheckedChange={(v) =>
                          setConfigs((c) => ({ ...c, [s.name]: { ...c[s.name], selected: Boolean(v) } }))
                        }
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          cabeçalho na linha {cfg.headerRow + 1} · {s.totalRows.toLocaleString("pt-BR")} linhas
                          {cfg.ativoIndex >= 0
                            ? ` · Ativo em ${colLetter(cfg.ativoIndex)} (${s.headers[cfg.ativoIndex]})`
                            : " · coluna Ativo não identificada"}
                        </p>
                      </div>
                      {ignored && <Badge variant="outline">base de ativos</Badge>}
                      {s.hidden && <Badge variant="outline">oculta</Badge>}
                      {cfg.detection && (
                        <Badge
                          variant="outline"
                          className={cn(
                            cfg.detection.confidence === "high"
                              ? "border-emerald-500/40 text-emerald-500"
                              : cfg.detection.confidence === "medium"
                                ? "border-amber-500/40 text-amber-500"
                                : "border-destructive/40 text-destructive",
                          )}
                        >
                          confiança {cfg.detection.confidence === "high" ? "alta" : cfg.detection.confidence === "medium" ? "média" : "baixa"}
                        </Badge>
                      )}
                    </div>
                  );
                })}
              </div>
            </GlassCard>
            <StepNav
              onBack={reset}
              backLabel="Cancelar"
              onNext={() => setStep("mapeamento")}
              nextDisabled={selectedSheets.length === 0}
            />
          </div>
        )}

        {/* ----------------------------------------------------- MAPEAMENTO */}
        {step === "mapeamento" && loaded && (
          <div className="space-y-4">
            {selectedSheets.map((s) => {
              const cfg = configs[s.name];
              return (
                <GlassCard key={s.name}>
                  <p className="mb-3 font-semibold">{s.name}</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <ColumnSelect
                      label="Coluna Ativo"
                      headers={s.headers}
                      value={cfg.ativoIndex}
                      allowNone={false}
                      onChange={(v) =>
                        setConfigs((c) => ({
                          ...c,
                          [s.name]: { ...c[s.name], ativoIndex: v, targets: detectTargetColumns(s.headers, v) },
                        }))
                      }
                    />
                    {(["predio", "andar", "ambiente"] as const).map((k) => (
                      <ColumnSelect
                        key={k}
                        label={k === "predio" ? "Prédio" : k === "andar" ? "Andar / Pavimento" : "Ambiente / Local"}
                        headers={s.headers}
                        value={cfg.targets[k]}
                        allowNone
                        noneLabel="criar coluna nova"
                        onChange={(v) =>
                          setConfigs((c) => ({
                            ...c,
                            [s.name]: { ...c[s.name], targets: { ...c[s.name].targets, [k]: v } },
                          }))
                        }
                      />
                    ))}
                  </div>
                  {cfg.detection && cfg.detection.confidence !== "high" && (
                    <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                      <p className="mb-1 flex items-center gap-2 font-medium text-amber-500">
                        <AlertTriangle className="h-3.5 w-3.5" /> Confirme a coluna do código do ativo
                      </p>
                      <ul className="space-y-0.5 text-muted-foreground">
                        {cfg.detection.candidates.slice(0, 3).map((c) => (
                          <li key={c.index}>
                            {colLetter(c.index)} · {c.header || "(sem título)"} — score {c.score}, {Math.round(c.sampleHitRate * 100)}% dos
                            valores no catálogo ({c.reason})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </GlassCard>
              );
            })}
            <StepNav onBack={() => setStep("analise")} onNext={() => setStep("opcoes")} />
          </div>
        )}

        {/* --------------------------------------------------------- OPÇÕES */}
        {step === "opcoes" && (
          <div className="space-y-4">
            <GlassCard className="space-y-4">
              <ToggleRow
                label="Sobrescrever valores existentes"
                hint="Por padrão, apenas células vazias são preenchidas."
                checked={options.overwrite}
                onChange={(v) => setOptions((o) => ({ ...o, overwrite: v }))}
              />
              <ToggleRow
                label="Adicionar coluna “Método de Resolução”"
                hint="Registra se o valor veio da árvore, do fallback legado ou já existia."
                checked={options.addMethodColumn}
                onChange={(v) => setOptions((o) => ({ ...o, addMethodColumn: v }))}
              />
              <ToggleRow
                label="Adicionar comentário na célula"
                hint="Anota o código do ativo e o catálogo utilizado."
                checked={options.addComment}
                onChange={(v) => setOptions((o) => ({ ...o, addComment: v }))}
              />
            </GlassCard>
            <StepNav onBack={() => setStep("mapeamento")} onNext={() => setStep("previa")} nextLabel="Ver prévia" />
          </div>
        )}

        {/* ---------------------------------------------------------- PRÉVIA */}
        {step === "previa" && loaded && (
          <div className="space-y-4">
            <GlassCard>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Select value={activeSheet} onValueChange={setActiveSheet}>
                  <SelectTrigger className="h-9 w-full sm:w-56">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedSheets.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["all", "Todos"],
                      ["exact", "Exata"],
                      ["tree", "Hierarquia"],
                      ["legacy", "Legado"],
                      ["conflict", "Conflitos"],
                      ["unmatched", "Não encontrados"],
                    ] as [PreviewFilter, string][]
                  ).map(([k, label]) => (
                    <Button
                      key={k}
                      size="sm"
                      variant={filter === k ? "default" : "outline"}
                      className="h-8 rounded-full px-3 text-xs"
                      onClick={() => setFilter(k)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="max-h-[26rem] overflow-auto rounded-2xl border border-border/60">
                <table className="w-full min-w-[900px] text-xs">
                  <thead className="sticky top-0 z-10 bg-card/95 backdrop-blur">
                    <tr className="[&>th]:whitespace-nowrap [&>th]:px-3 [&>th]:py-2 [&>th]:text-left [&>th]:font-medium [&>th]:text-muted-foreground">
                      <th>Linha</th>
                      <th>Ativo</th>
                      <th>Prédio atual</th>
                      <th>Prédio calculado</th>
                      <th>Andar atual</th>
                      <th>Andar calculado</th>
                      <th>Ambiente atual</th>
                      <th>Ambiente calculado</th>
                      <th>Método</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreview.map((r) => {
                      const key = `${activeSheet}:${r.row}`;
                      const ov = overrides[key];
                      const calc = ov ?? r.computed;
                      return (
                        <tr key={key} className="border-t border-border/40 hover:bg-muted/30">
                          <td className="px-3 py-1.5 text-muted-foreground">{r.row}</td>
                          <td className="px-3 py-1.5 font-mono">{r.code}</td>
                          {[0, 1, 2].map((k) => (
                            <Fragment key={k}>
                              <td className="px-3 py-1.5 text-muted-foreground">
                                {r.current[k] || "—"}
                              </td>
                              <td className="px-1 py-1">
                                <input
                                  value={calc[k]}
                                  onChange={(e) => {
                                    const next: [string, string, string] = [...calc] as [string, string, string];
                                    next[k] = e.target.value;
                                    setOverrides((o) => ({ ...o, [key]: next }));
                                  }}
                                  className={cn(
                                    "w-full rounded-md border border-transparent bg-transparent px-2 py-1 outline-none transition-colors focus:border-primary/50 focus:bg-background",
                                    calc[k] && calc[k] !== r.current[k] && "bg-primary/10 font-medium",
                                  )}
                                />
                              </td>
                            </Fragment>
                          ))}

                          <td className="px-3 py-1.5 text-muted-foreground">{r.method}</td>
                          <td className="px-3 py-1.5">
                            <Badge variant="outline" className={cn("text-[10px]", STATUS_TONE[r.status])}>
                              {STATUS_LABEL[r.status]}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                    {filteredPreview.length === 0 && (
                      <tr>
                        <td colSpan={10} className="px-3 py-8 text-center text-muted-foreground">
                          Nenhuma linha para este filtro.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Prévia de até 100 linhas. Valores destacados serão alterados; edite qualquer célula
                calculada antes de processar.
              </p>
            </GlassCard>
            <StepNav
              onBack={() => setStep("opcoes")}
              onNext={runProcessing}
              nextLabel="Processar planilha"
              nextIcon={<Sparkles className="ml-2 h-4 w-4" />}
            />
          </div>
        )}

        {/* --------------------------------------------------- PROCESSANDO */}
        {step === "processando" && (
          <LiquidPanel tone="accent" className="space-y-5 text-center">
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <div>
              <p className="font-display text-lg font-bold">Processando…</p>
              <p className="text-sm text-muted-foreground">
                {progress.sheet ? `Aba “${progress.sheet}” · ${progress.done}/${progress.total} linhas` : "Preparando"}
              </p>
            </div>
            <Progress value={Math.round(progress.overall * 100)} className="h-2" />
            <Button variant="outline" onClick={cancelProcessing}>
              <X className="mr-2 h-4 w-4" /> Cancelar
            </Button>
          </LiquidPanel>
        )}

        {/* ------------------------------------------------------- RESULTADO */}
        {step === "resultado" && (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Abas processadas" value={totals.sheets} />
              <Stat label="Linhas com ativo" value={totals.rowsWithAsset} />
              <Stat label="Pela árvore" value={totals.tree} tone="emerald" />
              <Stat label="Fallback legado" value={totals.legacy} tone="amber" />
              <Stat label="Valores preservados" value={totals.preserved} />
              <Stat label="Conflitos" value={totals.conflicts} tone="orange" />
              <Stat label="Não encontrados" value={totals.unmatched} tone="red" />
              <Stat label="Tempo" value={`${(duration / 1000).toFixed(1)}s`} />
            </div>

            {errors.length > 0 && (
              <GlassCard className="border-destructive/30">
                <p className="flex items-center gap-2 font-medium text-destructive">
                  <AlertTriangle className="h-4 w-4" /> {errors.length} aba(s) falharam — o restante foi processado
                  normalmente.
                </p>
                <button
                  onClick={() => setShowTech((v) => !v)}
                  className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
                >
                  <ChevronDown className={cn("h-3 w-3 transition-transform", showTech && "rotate-180")} />
                  Detalhes técnicos
                </button>
                {showTech && (
                  <pre className="mt-2 max-h-40 overflow-auto rounded-xl bg-muted/40 p-3 text-[11px]">
                    {errors.map((e) => `[${e.sheet}] ${e.message}`).join("\n")}
                  </pre>
                )}
                <Button variant="outline" size="sm" className="mt-3" onClick={downloadFailureReport}>
                  <Download className="mr-2 h-4 w-4" /> Relatório de falha
                </Button>
              </GlassCard>
            )}

            <GlassCard className="flex flex-wrap gap-2">
              <Button onClick={downloadProcessed} disabled={busy} className="bg-gradient-to-r from-primary to-violet-500">
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                Baixar planilha processada
              </Button>
              <Button variant="outline" onClick={downloadUnmatched}>
                <Download className="mr-2 h-4 w-4" /> Relatório de não encontrados
              </Button>
              <Button variant="outline" asChild>
                <Link to="/inteligencia-ativos/nao-encontrados">
                  <Search className="mr-2 h-4 w-4" /> Revisar não encontrados
                </Link>
              </Button>
              <Button variant="outline" onClick={saveTemplate}>
                <Save className="mr-2 h-4 w-4" /> Salvar mapeamento como modelo
              </Button>
              <Button variant="ghost" onClick={reset}>
                <RefreshCw className="mr-2 h-4 w-4" /> Processar outro arquivo
              </Button>
            </GlassCard>
          </div>
        )}

        {fatal && step !== "resultado" && (
          <GlassCard className="border-destructive/30">
            <p className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4" /> Algo deu errado ao ler o arquivo.
            </p>
            <button
              onClick={() => setShowTech((v) => !v)}
              className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"
            >
              <ChevronDown className={cn("h-3 w-3 transition-transform", showTech && "rotate-180")} /> Detalhes técnicos
            </button>
            {showTech && <pre className="mt-2 rounded-xl bg-muted/40 p-3 text-[11px]">{fatal}</pre>}
          </GlassCard>
        )}
      </div>
    </PageShell>
  );
}

/* -------------------------------------------------------------------------- */

function colLetter(index: number) {
  let n = index;
  let out = "";
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

function StepNav({
  onBack,
  onNext,
  backLabel = "Voltar",
  nextLabel = "Continuar",
  nextDisabled,
  nextIcon,
}: {
  onBack: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextIcon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap justify-between gap-2">
      <Button variant="ghost" onClick={onBack}>
        <ArrowLeft className="mr-2 h-4 w-4" /> {backLabel}
      </Button>
      <Button onClick={onNext} disabled={nextDisabled} className="bg-gradient-to-r from-primary to-violet-500">
        {nextLabel} {nextIcon ?? <ArrowRight className="ml-2 h-4 w-4" />}
      </Button>
    </div>
  );
}

function ColumnSelect({
  label,
  headers,
  value,
  onChange,
  allowNone,
  noneLabel = "nenhuma",
}: {
  label: string;
  headers: string[];
  value: number;
  onChange: (v: number) => void;
  allowNone: boolean;
  noneLabel?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Selecionar" />
        </SelectTrigger>
        <SelectContent>
          {allowNone && <SelectItem value="-1">{noneLabel}</SelectItem>}
          {headers.map((h, i) => (
            <SelectItem key={i} value={String(i)}>
              {colLetter(i)} · {h || "(sem título)"}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/60 bg-background/40 p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "emerald" | "amber" | "orange" | "red";
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-500"
      : tone === "amber"
        ? "text-amber-500"
        : tone === "orange"
          ? "text-orange-500"
          : tone === "red"
            ? "text-destructive"
            : "text-foreground";
  return (
    <GlassCard className="p-4">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("font-display text-2xl font-bold", toneClass)}>
        {typeof value === "number" ? value.toLocaleString("pt-BR") : value}
      </p>
    </GlassCard>
  );
}

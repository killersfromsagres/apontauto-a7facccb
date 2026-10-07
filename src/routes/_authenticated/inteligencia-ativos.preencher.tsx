import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Cog,
  Columns3,
  Database,
  DoorOpen,
  Download,
  FileSpreadsheet,
  GitBranch,
  History,
  Layers,
  Loader2,
  PackageCheck,
  Play,
  RefreshCw,
  Save,
  ScanBarcode,
  ScanSearch,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Table2,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/integrations/supabase/client";
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
  buildBlankTemplate,
  buildUnmatchedReport,
  loadWorkbook,
  processedFileName,
  validateFile,
  writeProcessed,
  type LoadedWorkbook,
  type SheetPlan,
} from "@/features/assets/services/spreadsheet-io";
import { saveJob } from "@/features/assets/services/fill-jobs";
import type { AssetRecord } from "@/features/assets/types";
import {
  fetchCatalogAssets,
  fetchLegacyAssets,
  getActiveCatalog,
} from "@/features/assets/services/asset-catalog";

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

const STEPS: { key: Step; label: string; hint: string }[] = [
  { key: "upload", label: "Upload", hint: "Importar planilha" },
  { key: "analise", label: "Análise", hint: "Abas e colunas" },
  { key: "mapeamento", label: "Mapeamento", hint: "Colunas de destino" },
  { key: "opcoes", label: "Opções", hint: "Regras de gravação" },
  { key: "previa", label: "Prévia", hint: "Conferir e ajustar" },
  { key: "processando", label: "Processamento", hint: "Resolvendo hierarquia" },
  { key: "resultado", label: "Resultado", hint: "Baixar arquivo" },
];

interface SheetConfig {
  selected: boolean;
  headerRow: number;
  ativoIndex: number;
  targets: TargetColumns;
  detection: AtivoDetection | null;
}

const MAPPING_TEMPLATE_KEY = "pcm.fill.mapping-templates";

const STATUS_TONE: Record<MatchStatus, "ok" | "info" | "warn" | "risk" | "bad" | "plain"> = {
  exact: "ok",
  tree: "info",
  legacy: "warn",
  preserved: "plain",
  conflict: "risk",
  unmatched: "bad",
  empty: "plain",
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
  const [output, setOutput] = useState<{ fileName: string; size: number } | null>(null);
  const [userEmail, setUserEmail] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ""));
  }, []);
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
        setActiveSheet(
          wb.sheets.find((s) => cfg[s.name].selected)?.name ?? wb.sheets[0]?.name ?? "",
        );
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
    () =>
      (loaded?.sheets ?? []).filter(
        (s) => configs[s.name]?.selected && configs[s.name].ativoIndex >= 0,
      ),
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
      const catalogAssets = options.includeCatalogSheet
        ? Array.from(graph?.byCode.values() ?? []).map((n) => ({
            code: n.code,
            name: n.name,
            level: n.rawLevel || n.level,
            parentCode: n.parentCode ?? "",
          }))
        : undefined;

      const { blob, fileName, validation } = await writeProcessed(loaded, plans, {
        originalFileName: loaded.fileName,
        user: userEmail,
        catalogName,
        catalogVersion: catalogQuery.data?.catalogVersion ?? null,
        processedAt: new Date(),
        durationMs: duration,
        options,
        totals: totals as unknown as Record<string, number>,
        catalogAssets,
      });
      downloadBlob(blob, fileName);
      setOutput({ fileName, size: blob.size });
      if (!validation.ok) {
        toast.warning("Arquivo gerado, mas a validação encontrou pendências.");
        setFatal(validation.refErrors.join("\n"));
      } else {
        toast.success("Planilha processada gerada e validada.");
      }
    } catch (e) {
      toast.error("Falha ao gerar o arquivo.");
      setFatal(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const { blob, fileName } = await buildBlankTemplate();
      downloadBlob(blob, fileName);
    } catch {
      toast.error("Não foi possível gerar o modelo.");
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
    setOutput(null);
    setFatal(null);
    setStep("upload");
  };

  /* ----------------------------------------------------------------- view  */

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  const counts = useMemo(() => {
    const c = { all: previewRows.length, exact: 0, tree: 0, legacy: 0, conflict: 0, unmatched: 0 };
    for (const r of previewRows) {
      if (r.status === "exact") c.exact++;
      else if (r.status === "tree") c.tree++;
      else if (r.status === "legacy") c.legacy++;
      else if (r.status === "conflict") c.conflict++;
      else if (r.status === "unmatched") c.unmatched++;
    }
    return c;
  }, [previewRows]);

  const pct = Math.max(0, Math.min(100, Math.round(progress.overall * 100)));
  const split = [
    { key: "tree", label: "Pela árvore", value: totals.tree, color: "var(--fx-accent)" },
    { key: "legacy", label: "Fallback legado", value: totals.legacy, color: "var(--fx-warn)" },
    {
      key: "preserved",
      label: "Preservados",
      value: totals.preserved,
      color: "var(--fx-line-strong)",
    },
    { key: "conflicts", label: "Conflitos", value: totals.conflicts, color: "var(--fx-risk)" },
    { key: "unmatched", label: "Não encontrados", value: totals.unmatched, color: "var(--fx-bad)" },
  ];
  const splitTotal = split.reduce((a, b) => a + b.value, 0);

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
      <div className="fx">
        <div className="fx-statusbar">
          <span className="fx-dot" data-state={catalogQuery.isLoading ? "loading" : "ready"} />
          <span>
            Catálogo <strong>{catalogQuery.isLoading ? "carregando…" : catalogName}</strong>
          </span>
          {catalogQuery.data && (
            <span>
              <strong>{catalogQuery.data.total.toLocaleString("pt-BR")}</strong> ativos indexados
            </span>
          )}
        </div>

        <div className="fx-grid">
          {/* ------------------------------------------------ etapas */}
          <nav className="fx-rail" aria-label="Etapas do preenchimento">
            <div className="fx-rail-mobile">
              <div className="fx-rail-mobile-head">
                <strong>{STEPS[stepIndex].label}</strong>
                <span>
                  Etapa {stepIndex + 1} de {STEPS.length}
                </span>
              </div>
              <div className="fx-rail-mobile-bar">
                <span style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
              </div>
            </div>
            <ol className="fx-steps">
              {STEPS.map((s, i) => {
                const state = i < stepIndex ? "done" : i === stepIndex ? "current" : "todo";
                return (
                  <li
                    key={s.key}
                    className="fx-step"
                    data-state={state}
                    aria-current={state === "current" ? "step" : undefined}
                  >
                    <span className="fx-step-mark">
                      {state === "done" ? (
                        <Check className="h-3.5 w-3.5" strokeWidth={2.4} />
                      ) : (
                        i + 1
                      )}
                    </span>
                    <span className="fx-step-copy">
                      <span className="fx-step-title">{s.label}</span>
                      <span className="fx-step-hint block">{s.hint}</span>
                    </span>
                  </li>
                );
              })}
            </ol>
          </nav>

          <div className="fx-main">
            {/* ---------------------------------------------------- UPLOAD */}
            {step === "upload" && (
              <>
                <section className="fx-panel">
                  <PanelHead
                    icon={Upload}
                    title="Importar planilha"
                    description="Envie a planilha com o código do ativo. O sistema identifica a coluna e prepara o preenchimento de Prédio, Andar e Ambiente."
                  />
                  <div className="fx-body">
                    <div
                      className="fx-drop"
                      data-drag={dragging}
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
                    >
                      <div className="fx-tile">
                        <FileSpreadsheet />
                      </div>
                      <div>
                        <h3 className="fx-drop-title">Arraste a planilha para esta área</h3>
                        <p className="fx-drop-sub">ou selecione o arquivo no seu computador</p>
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
                      <button
                        type="button"
                        className="fx-btn fx-btn-primary fx-btn-lg"
                        disabled={busy || catalogQuery.isLoading}
                        onClick={() => inputRef.current?.click()}
                      >
                        {busy || catalogQuery.isLoading ? (
                          <Loader2 className="fx-spin" />
                        ) : (
                          <Upload />
                        )}
                        {catalogQuery.isLoading
                          ? "Carregando base de ativos…"
                          : busy
                            ? "Lendo planilha…"
                            : "Importar planilha"}
                      </button>
                      <ul className="fx-specs" aria-label="Formatos aceitos">
                        <li>.xlsx</li>
                        <li>.xls</li>
                        <li>.csv</li>
                        <li>até 25 MB</li>
                      </ul>
                    </div>

                    <div className="fx-feats">
                      <div className="fx-feat">
                        <ScanSearch />
                        <div>
                          <b>Detecta a coluna</b>
                          <span>Localiza o código do ativo e indica o nível de confiança.</span>
                        </div>
                      </div>
                      <div className="fx-feat">
                        <GitBranch />
                        <div>
                          <b>Resolve pela árvore</b>
                          <span>
                            Sobe a hierarquia real de ativos até Prédio, Andar e Ambiente.
                          </span>
                        </div>
                      </div>
                      <div className="fx-feat">
                        <ShieldCheck />
                        <div>
                          <b>Preserva o arquivo</b>
                          <span>Em .xlsx mantém estilos, fórmulas, filtros e abas ocultas.</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="fx-panel">
                  <div className="fx-body fx-template">
                    <p>
                      <b>Ainda não tem uma planilha?</b>
                      Baixe o modelo vazio com as colunas esperadas e preencha com seus ativos.
                    </p>
                    <button type="button" className="fx-btn" onClick={downloadTemplate}>
                      <Download /> Baixar modelo vazio
                    </button>
                  </div>
                </section>
              </>
            )}

            {/* ---------------------------------------------------- ANÁLISE */}
            {step === "analise" && loaded && (
              <section className="fx-panel">
                <div className="fx-file">
                  <div className="fx-tile">
                    <FileSpreadsheet />
                  </div>
                  <div className="fx-file-main">
                    <div className="fx-file-name">{loaded.fileName}</div>
                    <div className="fx-file-meta">
                      {(loaded.fileSize / 1024).toFixed(0)} KB · {loaded.sheets.length} aba(s) ·{" "}
                      {loaded.kind === "xlsx"
                        ? "estilos preservados"
                        : "sem estilos (formato de origem)"}
                    </div>
                  </div>
                  <button type="button" className="fx-btn fx-btn-ghost fx-btn-sm" onClick={reset}>
                    <X /> Trocar arquivo
                  </button>
                </div>
                <div>
                  {loaded.sheets.map((s) => {
                    const cfg = configs[s.name];
                    const ignored = isAssetSheetName(s.name);
                    return (
                      <div key={s.name} className="fx-row">
                        <Checkbox
                          checked={cfg?.selected}
                          aria-label={`Processar aba ${s.name}`}
                          onCheckedChange={(v) =>
                            setConfigs((c) => ({
                              ...c,
                              [s.name]: { ...c[s.name], selected: Boolean(v) },
                            }))
                          }
                        />
                        <div className="fx-row-main">
                          <div className="fx-row-name">{s.name}</div>
                          <div className="fx-row-meta">
                            cabeçalho na linha {cfg.headerRow + 1} ·{" "}
                            {s.totalRows.toLocaleString("pt-BR")} linhas
                            {cfg.ativoIndex >= 0
                              ? ` · Ativo em ${colLetter(cfg.ativoIndex)} (${s.headers[cfg.ativoIndex]})`
                              : " · coluna Ativo não identificada"}
                          </div>
                        </div>
                        {ignored && (
                          <span className="fx-tag" data-tone="plain">
                            base de ativos
                          </span>
                        )}
                        {s.hidden && (
                          <span className="fx-tag" data-tone="plain">
                            oculta
                          </span>
                        )}
                        {cfg.detection && (
                          <span
                            className="fx-tag"
                            data-tone={
                              cfg.detection.confidence === "high"
                                ? "ok"
                                : cfg.detection.confidence === "medium"
                                  ? "warn"
                                  : "bad"
                            }
                          >
                            confiança{" "}
                            {cfg.detection.confidence === "high"
                              ? "alta"
                              : cfg.detection.confidence === "medium"
                                ? "média"
                                : "baixa"}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <StepNav
                  onBack={reset}
                  backLabel="Cancelar"
                  onNext={() => setStep("mapeamento")}
                  nextDisabled={selectedSheets.length === 0}
                />
              </section>
            )}

            {/* ------------------------------------------------- MAPEAMENTO */}
            {step === "mapeamento" && loaded && (
              <>
                {selectedSheets.map((s) => {
                  const cfg = configs[s.name];
                  return (
                    <section key={s.name} className="fx-panel">
                      <PanelHead
                        icon={Columns3}
                        title={s.name}
                        description="Indique a coluna com o código do ativo e onde gravar Prédio, Andar e Ambiente."
                      />
                      <div className="fx-body">
                        <div className="fx-fields">
                          <ColumnSelect
                            icon={ScanBarcode}
                            label="Coluna Ativo"
                            help="Origem do código"
                            headers={s.headers}
                            value={cfg.ativoIndex}
                            allowNone={false}
                            onChange={(v) =>
                              setConfigs((c) => ({
                                ...c,
                                [s.name]: {
                                  ...c[s.name],
                                  ativoIndex: v,
                                  targets: detectTargetColumns(s.headers, v),
                                },
                              }))
                            }
                          />
                          {(
                            [
                              ["predio", "Prédio", Building2],
                              ["andar", "Andar / Pavimento", Layers],
                              ["ambiente", "Ambiente / Local", DoorOpen],
                            ] as const
                          ).map(([k, label, Icon]) => (
                            <ColumnSelect
                              key={k}
                              icon={Icon}
                              label={label}
                              help="Coluna de destino"
                              headers={s.headers}
                              value={cfg.targets[k]}
                              allowNone
                              noneLabel="criar coluna nova"
                              onChange={(v) =>
                                setConfigs((c) => ({
                                  ...c,
                                  [s.name]: {
                                    ...c[s.name],
                                    targets: { ...c[s.name].targets, [k]: v },
                                  },
                                }))
                              }
                            />
                          ))}
                        </div>
                        {cfg.detection && cfg.detection.confidence !== "high" && (
                          <div className="fx-note" role="status">
                            <AlertTriangle />
                            <div>
                              <b>Confirme a coluna do código do ativo</b>
                              <ul>
                                {cfg.detection.candidates.slice(0, 3).map((c) => (
                                  <li key={c.index}>
                                    {colLetter(c.index)} · {c.header || "(sem título)"} — score{" "}
                                    {c.score}, {Math.round(c.sampleHitRate * 100)}% dos valores no
                                    catálogo ({c.reason})
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        )}
                      </div>
                    </section>
                  );
                })}
                <StepNav solo onBack={() => setStep("analise")} onNext={() => setStep("opcoes")} />
              </>
            )}

            {/* ------------------------------------------------------ OPÇÕES */}
            {step === "opcoes" && (
              <section className="fx-panel">
                <PanelHead
                  icon={SlidersHorizontal}
                  title="Opções de gravação"
                  description="Defina como os valores são escritos na planilha final."
                />
                <div>
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
                  <ToggleRow
                    label="Incluir aba “Base de Ativos Utilizada”"
                    hint="Aba oculta com o catálogo aplicado, para auditoria."
                    checked={options.includeCatalogSheet}
                    onChange={(v) => setOptions((o) => ({ ...o, includeCatalogSheet: v }))}
                  />
                </div>
                <StepNav
                  onBack={() => setStep("mapeamento")}
                  onNext={() => setStep("previa")}
                  nextLabel="Ver prévia"
                />
              </section>
            )}

            {/* ------------------------------------------------------ PRÉVIA */}
            {step === "previa" && loaded && (
              <section className="fx-panel">
                <PanelHead
                  icon={Table2}
                  title="Prévia do preenchimento"
                  description="Confira os valores calculados. Você pode editar qualquer célula antes de processar."
                />
                <div className="fx-toolbar">
                  <Select value={activeSheet} onValueChange={setActiveSheet}>
                    <SelectTrigger className="fx-select w-full sm:w-56" aria-label="Aba da prévia">
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
                  <div className="fx-seg" role="group" aria-label="Filtrar por status">
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
                      <button
                        key={k}
                        type="button"
                        aria-pressed={filter === k}
                        onClick={() => setFilter(k)}
                      >
                        {label} <i>{counts[k].toLocaleString("pt-BR")}</i>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="fx-scroll">
                  <table className="fx-table">
                    <thead>
                      <tr>
                        <th>Linha</th>
                        <th>Ativo</th>
                        {(["Prédio", "Andar", "Ambiente"] as const).map((g) => (
                          <Fragment key={g}>
                            <th data-group>
                              <small>{g}</small>Atual
                            </th>
                            <th>
                              <small>{g}</small>Calculado
                            </th>
                          </Fragment>
                        ))}
                        <th data-group>Método</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPreview.map((r) => {
                        const key = `${activeSheet}:${r.row}`;
                        const ov = overrides[key];
                        const calc = ov ?? r.computed;
                        return (
                          <tr key={key}>
                            <td className="fx-mute">{r.row}</td>
                            <td className="fx-mono">{r.code}</td>
                            {[0, 1, 2].map((k) => (
                              <Fragment key={k}>
                                <td className="fx-mute" data-group>
                                  {r.current[k] || "—"}
                                </td>
                                <td>
                                  <input
                                    value={calc[k]}
                                    aria-label={`${["Prédio", "Andar", "Ambiente"][k]} calculado da linha ${r.row}`}
                                    data-changed={Boolean(calc[k] && calc[k] !== r.current[k])}
                                    onChange={(e) => {
                                      const next: [string, string, string] = [...calc] as [
                                        string,
                                        string,
                                        string,
                                      ];
                                      next[k] = e.target.value;
                                      setOverrides((o) => ({ ...o, [key]: next }));
                                    }}
                                    className="fx-cell"
                                  />
                                </td>
                              </Fragment>
                            ))}
                            <td className="fx-mute" data-group>
                              {r.method}
                            </td>
                            <td>
                              <span className="fx-tag" data-tone={STATUS_TONE[r.status]}>
                                {STATUS_LABEL[r.status]}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                      {filteredPreview.length === 0 && (
                        <tr>
                          <td colSpan={10}>
                            <div className="fx-empty">Nenhuma linha para este filtro.</div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <p className="fx-caption">
                  Prévia de até 100 linhas. Valores destacados serão alterados.
                </p>
                <StepNav
                  onBack={() => setStep("opcoes")}
                  onNext={runProcessing}
                  nextLabel="Processar planilha"
                  nextIcon={<Play />}
                />
              </section>
            )}

            {/* ------------------------------------------------ PROCESSANDO */}
            {step === "processando" && (
              <section className="fx-panel">
                <PanelHead
                  icon={Cog}
                  title="Processando planilha"
                  description="Mantenha esta página aberta até a conclusão."
                />
                <div className="fx-run">
                  <div className="fx-run-head">
                    <div className="fx-pct">
                      {pct}
                      <small>%</small>
                    </div>
                    <div className="fx-run-label" aria-live="polite">
                      {progress.sheet ? (
                        <>
                          Aba <b>{progress.sheet}</b> · {progress.done.toLocaleString("pt-BR")} de{" "}
                          {progress.total.toLocaleString("pt-BR")} linhas
                        </>
                      ) : (
                        "Preparando…"
                      )}
                    </div>
                  </div>
                  <div
                    className="fx-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={pct}
                    data-running="true"
                  >
                    <span style={{ width: `${pct}%` }} />
                  </div>
                  <div className="fx-metrics">
                    <div className="fx-metric">
                      <span>Aba atual</span>
                      <b>{progress.sheet || "—"}</b>
                    </div>
                    <div className="fx-metric">
                      <span>Linhas</span>
                      <b>
                        {progress.done.toLocaleString("pt-BR")} /{" "}
                        {progress.total.toLocaleString("pt-BR")}
                      </b>
                    </div>
                    <div className="fx-metric">
                      <span>Abas</span>
                      <b>{selectedSheets.length}</b>
                    </div>
                  </div>
                  <div className="fx-actions">
                    <button type="button" className="fx-btn" onClick={cancelProcessing}>
                      <X /> Cancelar
                    </button>
                  </div>
                </div>
              </section>
            )}

            {/* ----------------------------------------------------- RESULTADO */}
            {step === "resultado" && (
              <>
                <section className="fx-panel">
                  <PanelHead
                    icon={PackageCheck}
                    title="Processamento concluído"
                    description={loaded?.fileName}
                  />
                  <div className="fx-stats">
                    <Stat label="Abas processadas" value={totals.sheets} />
                    <Stat label="Linhas com ativo" value={totals.rowsWithAsset} />
                    <Stat label="Pela árvore" value={totals.tree} tone="ok" />
                    <Stat label="Fallback legado" value={totals.legacy} tone="warn" />
                    <Stat label="Valores preservados" value={totals.preserved} />
                    <Stat label="Conflitos" value={totals.conflicts} tone="risk" />
                    <Stat label="Não encontrados" value={totals.unmatched} tone="bad" />
                    <Stat label="Tempo" value={`${(duration / 1000).toFixed(1)}s`} />
                  </div>
                  {splitTotal > 0 && (
                    <div className="fx-split">
                      <div
                        className="fx-split-bar"
                        role="img"
                        aria-label="Distribuição por método de resolução"
                      >
                        {split
                          .filter((x) => x.value > 0)
                          .map((x) => (
                            <span
                              key={x.key}
                              style={{ flexGrow: x.value, background: x.color }}
                              title={`${x.label}: ${x.value.toLocaleString("pt-BR")}`}
                            />
                          ))}
                      </div>
                      <ul className="fx-legend">
                        {split
                          .filter((x) => x.value > 0)
                          .map((x) => (
                            <li key={x.key} style={{ ["--c" as string]: x.color }}>
                              <i /> {x.label} · {x.value.toLocaleString("pt-BR")}
                            </li>
                          ))}
                      </ul>
                    </div>
                  )}
                </section>

                {errors.length > 0 && (
                  <div className="fx-note" data-tone="bad" role="alert">
                    <AlertTriangle />
                    <div>
                      <b>
                        {errors.length} aba(s) falharam — o restante foi processado normalmente.
                      </b>
                      <br />
                      <button
                        type="button"
                        className="fx-link"
                        aria-expanded={showTech}
                        onClick={() => setShowTech((v) => !v)}
                      >
                        <ChevronDown /> Detalhes técnicos
                      </button>
                      {showTech && (
                        <pre>{errors.map((e) => `[${e.sheet}] ${e.message}`).join("\n")}</pre>
                      )}
                      <div className="fx-actions" style={{ marginTop: "0.6rem" }}>
                        <button
                          type="button"
                          className="fx-btn fx-btn-sm"
                          onClick={downloadFailureReport}
                        >
                          <Download /> Relatório de falha
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <section className="fx-panel">
                  <div className="fx-download">
                    <div className="fx-tile">
                      <FileSpreadsheet />
                    </div>
                    <div className="fx-file-main">
                      <div className="fx-file-name">{output?.fileName ?? processedFileName()}</div>
                      <div className="fx-file-meta">
                        {output
                          ? `${(output.size / 1024 / 1024).toFixed(2)} MB`
                          : `~${((loaded?.fileSize ?? 0) / 1024 / 1024 + 0.15).toFixed(2)} MB estimados`}{" "}
                        · cópia do original com as abas “Resumo do Processamento” e “Ativos Não
                        Encontrados”
                      </div>
                    </div>
                    {output && (
                      <span className="fx-ok-badge">
                        <CheckCircle2 /> Gerado e validado
                      </span>
                    )}
                    <button
                      type="button"
                      className="fx-btn fx-btn-primary fx-btn-lg"
                      onClick={downloadProcessed}
                      disabled={busy}
                    >
                      {busy ? <Loader2 className="fx-spin" /> : <Download />} Baixar planilha
                    </button>
                  </div>
                  <div className="fx-secondary">
                    <div className="fx-actions">
                      <button
                        type="button"
                        className="fx-btn fx-btn-sm"
                        onClick={downloadUnmatched}
                      >
                        <Download /> Relatório de não encontrados
                      </button>
                      <button type="button" className="fx-btn fx-btn-sm" onClick={downloadTemplate}>
                        <FileSpreadsheet /> Baixar modelo de planilha
                      </button>
                      <Link to="/inteligencia-ativos/nao-encontrados" className="fx-btn fx-btn-sm">
                        <Search /> Revisar não encontrados
                      </Link>
                      <button type="button" className="fx-btn fx-btn-sm" onClick={saveTemplate}>
                        <Save /> Salvar mapeamento como modelo
                      </button>
                      <button
                        type="button"
                        className="fx-btn fx-btn-ghost fx-btn-sm"
                        onClick={reset}
                      >
                        <RefreshCw /> Processar outro arquivo
                      </button>
                    </div>
                  </div>
                </section>
              </>
            )}

            {fatal && step !== "resultado" && (
              <div className="fx-note" data-tone="bad" role="alert">
                <AlertTriangle />
                <div>
                  <b>Algo deu errado ao ler o arquivo.</b>
                  <br />
                  <button
                    type="button"
                    className="fx-link"
                    aria-expanded={showTech}
                    onClick={() => setShowTech((v) => !v)}
                  >
                    <ChevronDown /> Detalhes técnicos
                  </button>
                  {showTech && <pre>{fatal}</pre>}
                </div>
              </div>
            )}
          </div>
        </div>
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

function PanelHead({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="fx-panel-head">
      <div className="fx-tile">
        <Icon />
      </div>
      <div className="min-w-0">
        <h3 className="fx-title">{title}</h3>
        {description && <p className="fx-sub">{description}</p>}
      </div>
    </div>
  );
}

function StepNav({
  onBack,
  onNext,
  backLabel = "Voltar",
  nextLabel = "Continuar",
  nextDisabled,
  nextIcon,
  solo,
}: {
  onBack: () => void;
  onNext: () => void;
  backLabel?: string;
  nextLabel?: string;
  nextDisabled?: boolean;
  nextIcon?: React.ReactNode;
  solo?: boolean;
}) {
  return (
    <div className={cn("fx-foot", solo && "fx-foot-solo")}>
      <button type="button" className="fx-btn fx-btn-ghost" onClick={onBack}>
        <ArrowLeft /> {backLabel}
      </button>
      <div className="fx-foot-end">
        <button
          type="button"
          className="fx-btn fx-btn-primary"
          onClick={onNext}
          disabled={nextDisabled}
        >
          {nextLabel} {nextIcon ?? <ArrowRight />}
        </button>
      </div>
    </div>
  );
}

function ColumnSelect({
  icon: Icon,
  label,
  help,
  headers,
  value,
  onChange,
  allowNone,
  noneLabel = "nenhuma",
}: {
  icon: LucideIcon;
  label: string;
  help?: string;
  headers: string[];
  value: number;
  onChange: (v: number) => void;
  allowNone: boolean;
  noneLabel?: string;
}) {
  return (
    <div className="fx-field">
      <span className="fx-label">
        <Icon /> {label}
      </span>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger className="fx-select" aria-label={label}>
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
      {help && <span className="fx-help">{help}</span>}
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
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className="fx-switch-row"
      onClick={() => onChange(!checked)}
    >
      <span className="fx-switch-copy">
        <b>{label}</b>
        <span>{hint}</span>
      </span>
      <span className="fx-switch" aria-hidden="true" />
    </button>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "ok" | "warn" | "risk" | "bad";
}) {
  return (
    <div className="fx-stat" data-tone={tone}>
      <span>{label}</span>
      <b>{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</b>
    </div>
  );
}

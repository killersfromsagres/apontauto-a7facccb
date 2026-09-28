import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  FileCheck2,
  FileSpreadsheet,
  Loader2,
  Printer,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  classifyBackorderTeamsWithAi,
  type BackorderAiProvider,
} from "@/lib/corretiva/backorder-ai-classifier.functions";
import {
  BACKORDER_BUILDER_TEAMS,
  changeBackorderBuilderTeam,
  parseBackorderSpreadsheet,
  type BackorderBuilderResult,
  type BackorderBuilderRow,
  type BackorderBuilderTeam,
} from "@/lib/corretiva/backorder-spreadsheet-builder";
import { enrichBackorderRowsWithMaterialRequests } from "@/lib/corretiva/backorder-material-enrichment";
import { equipeStyles } from "@/lib/corretiva/equipe";
import { generateProgramacaoExcel } from "@/lib/corretiva/programacao-excel";
import { cn } from "@/lib/utils";

const MAX_PREVIEW = 160;
const AI_BATCH_SIZE = 25;

type ClassificationSource = "ai-free" | "ai-gateway" | "technical" | "manual" | "preserved";
type RowMeta = { source: ClassificationSource; reason?: string };
type AiSummary = {
  reviewed: number;
  changed: number;
  provider: BackorderAiProvider | "mixed";
  available: boolean;
};

function confidenceMeta(row: BackorderBuilderRow) {
  if (row.confidence === "manual") {
    return { label: "Manual", className: "border-violet-400/25 bg-violet-400/[0.08] text-violet-200" };
  }
  if (row.confidence === "alta" && !row.ambiguous) {
    return { label: "Alta", className: "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200" };
  }
  if (row.confidence === "media" && !row.ambiguous) {
    return { label: "Média", className: "border-amber-400/25 bg-amber-400/[0.08] text-amber-200" };
  }
  return { label: "Revisar", className: "border-rose-400/30 bg-rose-400/[0.08] text-rose-200" };
}

function sourceMeta(source: ClassificationSource) {
  if (source === "ai-free") return { label: "IA gratuita", className: "text-cyan-200 border-cyan-300/20 bg-cyan-300/[0.07]" };
  if (source === "ai-gateway") return { label: "IA", className: "text-sky-200 border-sky-300/20 bg-sky-300/[0.07]" };
  if (source === "manual") return { label: "Manual", className: "text-violet-200 border-violet-300/20 bg-violet-300/[0.07]" };
  if (source === "preserved") return { label: "Planilha", className: "text-white/50 border-white/10 bg-white/[0.03]" };
  return { label: "Técnica", className: "text-emerald-200 border-emerald-300/20 bg-emerald-300/[0.06]" };
}

function Metric({ value, label, tone = "neutral" }: { value: number; label: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <div className={cn(
      "rounded-2xl border px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
      tone === "good" ? "border-emerald-400/15 bg-emerald-400/[0.045]" :
        tone === "warn" ? "border-amber-400/15 bg-amber-400/[0.045]" : "border-white/[0.08] bg-white/[0.025]",
    )}>
      <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    </div>
  );
}

function shouldApplyAi(row: BackorderBuilderRow, confidence: "alta" | "media" | "baixa") {
  if (row.confidence === "manual") return false;
  if (confidence === "alta") return true;
  if (confidence === "media") {
    return row.ambiguous || row.confidence === "baixa" || row.score <= 1;
  }
  return false;
}

export function BackorderSpreadsheetBuilder() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [aiReviewing, setAiReviewing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<BackorderBuilderResult | null>(null);
  const [rows, setRows] = useState<BackorderBuilderRow[]>([]);
  const [rowMeta, setRowMeta] = useState<Record<string, RowMeta>>({});
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [reviewOnly, setReviewOnly] = useState(false);

  const reviewCount = useMemo(() => rows.filter((row) => row.confidence === "baixa" || row.ambiguous).length, [rows]);
  const highConfidenceCount = useMemo(() => rows.filter((row) => row.confidence === "alta" && !row.ambiguous).length, [rows]);
  const manualCount = useMemo(() => rows.filter((row) => row.confidence === "manual").length, [rows]);
  const teamsCount = useMemo(() => new Set(rows.map((row) => row.equipe).filter(Boolean)).size, [rows]);
  const teamCounts = useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((row) => {
      const team = String(row.equipe || "Sem equipe");
      map.set(team, (map.get(team) ?? 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [rows]);

  const visibleRows = useMemo(() => {
    const source = reviewOnly ? rows.filter((row) => row.confidence === "baixa" || row.ambiguous) : rows;
    return source.slice(0, MAX_PREVIEW);
  }, [rows, reviewOnly]);

  const reset = () => {
    setRows([]);
    setResult(null);
    setFileName(null);
    setRowMeta({});
    setAiSummary(null);
    setReviewOnly(false);
    setAiReviewing(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const reviewRowsWithAi = async (baseRows: BackorderBuilderRow[]) => {
    if (!baseRows.length) return baseRows;
    setAiReviewing(true);

    let working = [...baseRows];
    const nextMeta: Record<string, RowMeta> = Object.fromEntries(
      baseRows.map((row) => [row.builderId, {
        source: row.score > 0 ? "technical" : row.originalTeam ? "preserved" : "technical",
        reason: row.score > 0 ? "Classificação técnica inicial por evidências da descrição." : "Sem evidência técnica forte na leitura inicial.",
      }]),
    );
    let reviewed = 0;
    let changed = 0;
    let anyAvailable = false;
    const providers = new Set<BackorderAiProvider>();

    try {
      for (let start = 0; start < baseRows.length; start += AI_BATCH_SIZE) {
        const batch = working.slice(start, start + AI_BATCH_SIZE);
        const response = await classifyBackorderTeamsWithAi({
          data: {
            rows: batch.map((row) => ({
              id: row.builderId,
              numeroOs: String(row.numero_os ?? ""),
              descricao: String(row.nome_os ?? ""),
              equipamento: row.equipamento ?? null,
              ativo: row.ativo ?? null,
              predio: row.predio ?? null,
              andar: row.andar ?? null,
              local: row.local ?? null,
              equipeOriginal: row.originalTeam,
              equipeTecnica: row.equipe ?? null,
              confiancaTecnica: row.confidence,
              ambiguoTecnico: row.ambiguous,
            })),
          },
        });

        if (response.available) {
          anyAvailable = true;
          providers.add(response.provider);
        }
        reviewed += response.decisions.length;
        const decisions = new Map(response.decisions.map((decision) => [decision.id, decision]));

        working = working.map((row) => {
          const decision = decisions.get(row.builderId);
          if (!decision) return row;

          const providerSource: ClassificationSource = response.provider === "openrouter-free" ? "ai-free" : "ai-gateway";
          const applies = Boolean(decision.equipe && shouldApplyAi(row, decision.confianca));
          if (applies && decision.equipe) {
            if (row.equipe !== decision.equipe) changed += 1;
            nextMeta[row.builderId] = { source: providerSource, reason: decision.motivo };
            return {
              ...row,
              equipe: decision.equipe,
              confidence: decision.confianca,
              ambiguous: decision.confianca === "baixa",
              secondTeam: undefined,
            };
          }

          if (decision.confianca === "baixa" && (row.ambiguous || row.confidence === "baixa")) {
            nextMeta[row.builderId] = { source: nextMeta[row.builderId]?.source ?? "technical", reason: decision.motivo };
          }
          return row;
        });
        setRows([...working]);
      }

      setRowMeta(nextMeta);
      const provider: AiSummary["provider"] = providers.size > 1 ? "mixed" : [...providers][0] ?? "none";
      setAiSummary({ reviewed, changed, provider, available: anyAvailable });

      if (anyAvailable) {
        toast.success(
          changed
            ? `IA revisou ${reviewed} chamado(s) e corrigiu ${changed} equipe(s).`
            : `IA revisou ${reviewed} chamado(s). Nenhuma troca adicional foi necessária.`,
        );
      } else {
        toast.warning("IA gratuita indisponível ou sem chave configurada. A classificação técnica local foi mantida.");
      }
    } catch (error) {
      console.warn("[BackorderBuilder] Revisão de IA indisponível; mantendo classificação técnica:", error);
      setRows([...working]);
      setRowMeta(nextMeta);
      setAiSummary({ reviewed, changed, provider: "none", available: false });
      toast.warning("Não foi possível consultar a IA agora. O Montador continuou com a classificação técnica local.");
    } finally {
      setAiReviewing(false);
    }

    return working;
  };

  const readFile = async (file: File) => {
    if (reading || aiReviewing) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Envie uma planilha Excel no formato .xlsx.");
      return;
    }

    setReading(true);
    setAiSummary(null);
    try {
      const parsed = await parseBackorderSpreadsheet(file);
      let enrichedRows = parsed.rows;
      let recoveredMaterialCount = 0;

      try {
        const enrichment = await enrichBackorderRowsWithMaterialRequests(parsed.rows);
        enrichedRows = enrichment.rows;
        recoveredMaterialCount = enrichment.recoveredCount;

        if (enrichment.partial) {
          toast.warning(
            "Os Backorders foram cruzados com as OS, mas parte do histórico detalhado de peças não pôde ser consultada.",
          );
        }
      } catch (materialError) {
        console.warn(
          "[BackorderBuilder] Consulta de materiais indisponível; mantendo dados da planilha:",
          materialError,
        );
        toast.warning(
          "Backorders lidos, mas não foi possível consultar as solicitações de material agora. Os dados da planilha foram preservados.",
        );
      }

      const enrichedResult: BackorderBuilderResult = {
        ...parsed,
        rows: enrichedRows,
      };

      setRows(enrichedRows);
      setResult(enrichedResult);
      setFileName(file.name);
      setReviewOnly(false);
      setRowMeta(Object.fromEntries(enrichedRows.map((row) => [row.builderId, {
        source: row.score > 0 ? "technical" : row.originalTeam ? "preserved" : "technical",
      }])));

      toast.success(
        recoveredMaterialCount > 0
          ? `${enrichedRows.length} Backorder(s) lido(s). ${recoveredMaterialCount} chamado(s) tiveram material solicitado recuperado do sistema. Iniciando revisão inteligente das equipes.`
          : `${enrichedRows.length} Backorder(s) lido(s). Iniciando revisão inteligente das equipes.`,
      );
      setReading(false);
      await reviewRowsWithAi(enrichedRows);
    } catch (error) {
      console.error("[BackorderBuilder] Falha ao ler planilha:", error);
      reset();
      toast.error(error instanceof Error ? error.message : "Não foi possível interpretar a planilha de Backorder.");
    } finally {
      setReading(false);
      setDragging(false);
    }
  };

  const updateTeam = (builderId: string, team: BackorderBuilderTeam) => {
    setRows((current) => current.map((row) => row.builderId === builderId ? changeBackorderBuilderTeam(row, team) : row));
    setRowMeta((current) => ({
      ...current,
      [builderId]: { source: "manual", reason: "Equipe definida manualmente pelo usuário." },
    }));
  };

  const rerunAi = async () => {
    if (!rows.length || aiReviewing) return;
    await reviewRowsWithAi(rows.filter((row) => row.confidence !== "manual"));
  };

  const generate = async () => {
    if (!rows.length || exporting || aiReviewing) return;
    setExporting(true);
    try {
      await generateProgramacaoExcel(rows, "Todas as equipes", "backorder");
      toast.success(`Planilha de Backorders pronta para impressão colorida com ${rows.length} chamado(s).`);
    } catch (error) {
      console.error("[BackorderBuilder] Falha ao exportar:", error);
      toast.error("Não foi possível gerar a planilha final de Backorders.");
    } finally {
      setExporting(false);
    }
  };

  const providerLabel = aiSummary?.provider === "openrouter-free" ? "OpenRouter Free" : aiSummary?.provider === "lovable-gateway" ? "Gateway IA" : aiSummary?.provider === "mixed" ? "IA híbrida" : "Classificador técnico";

  return (
    <GlassCard className="overflow-hidden border-amber-300/[0.10] bg-[linear-gradient(145deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))]">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-300/20 bg-[linear-gradient(145deg,rgba(251,191,36,0.12),rgba(255,255,255,0.025))] text-amber-200">
              <FileSpreadsheet className="h-[1.35rem] w-[1.35rem]" strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold tracking-tight">Montador de Backorders</h2>
                <Badge variant="outline" className="border-cyan-300/15 bg-cyan-300/[0.045] text-[10px] font-semibold uppercase tracking-[0.13em] text-cyan-100/70">
                  classificação inteligente
                </Badge>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Lê a descrição completa, cruza equipamento, ativo e localização, revisa a equipe com IA e mantém uma camada técnica de segurança para evitar designações incorretas.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Não grava no banco</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5"><Printer className="h-3.5 w-3.5" /> A4 · colorido</span>
          </div>
        </div>

        {!rows.length ? (
          <div
            role="button"
            tabIndex={0}
            className={cn(
              "group relative grid min-h-52 cursor-pointer place-items-center overflow-hidden rounded-[1.35rem] border border-dashed p-6 text-center transition-all duration-200",
              dragging ? "border-rose-300/50 bg-rose-400/[0.07]" : "border-white/[0.11] bg-black/[0.08] hover:border-white/[0.18] hover:bg-white/[0.025]",
            )}
            onClick={() => !reading && inputRef.current?.click()}
            onKeyDown={(event) => { if ((event.key === "Enter" || event.key === " ") && !reading) inputRef.current?.click(); }}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }}
            onDrop={(event) => {
              event.preventDefault(); setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void readFile(file);
            }}
          >
            <input ref={inputRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void readFile(file); }} />
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.045] text-foreground">
                {reading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
              </div>
              <p className="mt-4 text-base font-semibold">{reading ? "Lendo a planilha…" : "Anexe a planilha de Backorder"}</p>
              <p className="mx-auto mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                O Montador identifica as colunas, classifica tecnicamente os chamados e depois executa uma segunda leitura contextual por IA.
              </p>
              {!reading && <Button type="button" variant="outline" className="mt-4 rounded-xl border-white/10 bg-white/[0.035]" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}><FileSpreadsheet className="mr-2 h-4 w-4" /> Selecionar .xlsx</Button>}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-black/[0.08] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl border", aiReviewing ? "border-cyan-300/20 bg-cyan-300/[0.07] text-cyan-200" : "border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300")}>
                  {aiReviewing ? <BrainCircuit className="h-4.5 w-4.5 animate-pulse" /> : <CheckCircle2 className="h-4.5 w-4.5" />}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" title={fileName ?? undefined}>{fileName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {aiReviewing ? "IA analisando equipes…" : `Aba “${result?.sourceSheet}” · ${providerLabel}`}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" className="rounded-xl border-white/10 bg-white/[0.025]" disabled={aiReviewing} onClick={() => void rerunAi()}>
                  {aiReviewing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-2 h-3.5 w-3.5" />} Revisar com IA
                </Button>
                <Button type="button" variant="outline" size="sm" className="rounded-xl border-white/10 bg-white/[0.025]" disabled={aiReviewing} onClick={reset}><RefreshCw className="mr-2 h-3.5 w-3.5" /> Trocar planilha</Button>
              </div>
            </div>

            {aiSummary && (
              <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 text-xs", aiSummary.available ? "border-cyan-300/12 bg-cyan-300/[0.035] text-cyan-50/70" : "border-amber-300/12 bg-amber-300/[0.035] text-amber-50/70")}>
                {aiSummary.available ? <BrainCircuit className="h-4 w-4 text-cyan-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
                <span><strong className="text-foreground">{aiSummary.reviewed}</strong> revisado(s) pela IA</span>
                <span><strong className="text-foreground">{aiSummary.changed}</strong> equipe(s) corrigida(s)</span>
                <span>{aiSummary.available ? providerLabel : "Fallback técnico ativo — o Montador continua funcionando normalmente"}</span>
              </div>
            )}

            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-5">
              <Metric value={rows.length} label="Chamados válidos" />
              <Metric value={highConfidenceCount} label="Alta confiança" tone="good" />
              <Metric value={reviewCount} label="Precisam revisão" tone={reviewCount ? "warn" : "good"} />
              <Metric value={manualCount} label="Ajustes manuais" />
              <Metric value={teamsCount} label="Equipes identificadas" />
            </div>

            <div className="flex flex-wrap gap-2">
              {teamCounts.map(([team, count]) => {
                const style = equipeStyles(team);
                return <span key={team} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold", style.badge)}><span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} /> {team} <span className="opacity-60">{count}</span></span>;
              })}
            </div>

            {(result?.ignoredRows || result?.duplicateRows || result?.completedRows) ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs text-muted-foreground">
                <ScanSearch className="h-4 w-4" />
                <span>{result.ignoredRows} linha(s) sem descrição ignorada(s)</span>
                <span>{result.duplicateRows} duplicidade(s) removida(s)</span>
                <span>{result.completedRows} concluído(s)/fechado(s) removido(s)</span>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/[0.08]">
              <div className="flex flex-col gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Prévia e validação das equipes</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">A origem mostra se a decisão veio da IA, da regra técnica ou de um ajuste manual.</p>
                </div>
                <Button type="button" variant={reviewOnly ? "warning" : "outline"} size="sm" className="rounded-xl" onClick={() => setReviewOnly((value) => !value)}>
                  <AlertTriangle className="mr-2 h-3.5 w-3.5" /> {reviewOnly ? "Mostrar todos" : `Revisar ${reviewCount}`}
                </Button>
              </div>

              <div className="max-h-[570px] overflow-auto">
                <table className="w-full min-w-[1040px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-slate-950/95 text-[9px] font-semibold uppercase tracking-[0.12em] text-muted-foreground backdrop-blur-xl">
                    <tr>
                      <th className="px-4 py-3">OS</th><th className="px-4 py-3">Descrição</th><th className="px-4 py-3">Localização</th><th className="px-4 py-3">Equipe</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3">Confiança</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.055]">
                    {visibleRows.map((row) => {
                      const confidence = confidenceMeta(row);
                      const meta = rowMeta[row.builderId] ?? { source: "technical" as const };
                      const source = sourceMeta(meta.source);
                      return (
                        <tr key={row.builderId} className="transition hover:bg-white/[0.025]">
                          <td className="whitespace-nowrap px-4 py-3 font-semibold text-foreground">{row.numero_os || "—"}</td>
                          <td className="max-w-[390px] px-4 py-3"><p className="line-clamp-3 leading-relaxed text-foreground/85" title={String(row.nome_os ?? "")}>{row.nome_os || "Sem descrição"}</p><p className="mt-1 text-[10px] text-muted-foreground">{row.equipamento || row.ativo || ""}</p></td>
                          <td className="max-w-[210px] px-4 py-3 text-muted-foreground"><p>{[row.predio, row.andar].filter(Boolean).join(" · ") || "—"}</p><p className="mt-0.5 truncate" title={String(row.local ?? "")}>{row.local || ""}</p></td>
                          <td className="w-[180px] px-4 py-3">
                            <Select value={String(row.equipe || "Civil")} onValueChange={(value) => updateTeam(row.builderId, value as BackorderBuilderTeam)}>
                              <SelectTrigger className="h-9 rounded-xl border-white/10 bg-white/[0.035] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>{BACKORDER_BUILDER_TEAMS.map((team) => <SelectItem key={team} value={team}>{team}</SelectItem>)}</SelectContent>
                            </Select>
                            {row.originalTeam && row.originalTeam !== row.equipe && <p className="mt-1.5 text-[9px] text-muted-foreground">Planilha: {row.originalTeam}</p>}
                          </td>
                          <td className="px-4 py-3"><span title={meta.reason} className={cn("inline-flex cursor-help items-center rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide", source.className)}>{source.label}</span></td>
                          <td className="px-4 py-3"><span className={cn("inline-flex rounded-full border px-2 py-1 text-[9px] font-bold uppercase tracking-wide", confidence.className)}>{confidence.label}</span>{row.secondTeam && row.ambiguous && <p className="mt-1 text-[9px] text-muted-foreground">2ª opção: {row.secondTeam}</p>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(reviewOnly ? reviewCount : rows.length) > MAX_PREVIEW && <p className="border-t border-white/[0.06] px-4 py-2.5 text-[10px] text-muted-foreground">Exibindo os primeiros {MAX_PREVIEW} registros para manter a tela fluida. Todos serão incluídos no Excel.</p>}
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-emerald-300/[0.10] bg-emerald-300/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-300" />
                <div><p className="text-sm font-semibold">Arquivo pronto para impressão</p><p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">As abas são geradas em A4 horizontal, mantendo as cores das equipes e a configuração de impressão colorida do arquivo.</p></div>
              </div>
              <Button type="button" variant="premium" className="shrink-0 rounded-xl" disabled={!rows.length || aiReviewing || exporting} onClick={() => void generate()}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : aiReviewing ? <BrainCircuit className="mr-2 h-4 w-4 animate-pulse" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                {aiReviewing ? "Aguardando IA…" : exporting ? "Gerando…" : "Baixar Excel colorido"}
              </Button>
            </div>
          </>
        )}
      </div>
    </GlassCard>
  );
}

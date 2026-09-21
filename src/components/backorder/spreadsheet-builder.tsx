import { useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileCheck2,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  ScanSearch,
  ShieldCheck,
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
  BACKORDER_BUILDER_TEAMS,
  changeBackorderBuilderTeam,
  parseBackorderSpreadsheet,
  type BackorderBuilderResult,
  type BackorderBuilderRow,
  type BackorderBuilderTeam,
} from "@/lib/corretiva/backorder-spreadsheet-builder";
import { equipeStyles } from "@/lib/corretiva/equipe";
import { generateProgramacaoExcel } from "@/lib/corretiva/programacao-excel";
import { cn } from "@/lib/utils";

const MAX_PREVIEW = 160;

function confidenceMeta(row: BackorderBuilderRow) {
  if (row.confidence === "manual") {
    return {
      label: "Manual",
      className: "border-violet-400/25 bg-violet-400/[0.08] text-violet-200",
    };
  }
  if (row.confidence === "alta" && !row.ambiguous) {
    return {
      label: "Alta",
      className: "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-200",
    };
  }
  if (row.confidence === "media" && !row.ambiguous) {
    return {
      label: "Média",
      className: "border-amber-400/25 bg-amber-400/[0.08] text-amber-200",
    };
  }
  return {
    label: "Revisar",
    className: "border-rose-400/30 bg-rose-400/[0.08] text-rose-200",
  };
}

function Metric({ value, label, tone = "neutral" }: { value: number; label: string; tone?: "neutral" | "good" | "warn" }) {
  return (
    <div
      className={cn(
        "rounded-2xl border px-4 py-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]",
        tone === "good"
          ? "border-emerald-400/15 bg-emerald-400/[0.045]"
          : tone === "warn"
            ? "border-amber-400/15 bg-amber-400/[0.045]"
            : "border-white/[0.08] bg-white/[0.025]",
      )}
    >
      <p className="text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    </div>
  );
}

export function BackorderSpreadsheetBuilder() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<BackorderBuilderResult | null>(null);
  const [rows, setRows] = useState<BackorderBuilderRow[]>([]);
  const [reviewOnly, setReviewOnly] = useState(false);

  const reviewCount = useMemo(
    () => rows.filter((row) => row.confidence === "baixa" || row.ambiguous).length,
    [rows],
  );
  const highConfidenceCount = useMemo(
    () => rows.filter((row) => row.confidence === "alta" && !row.ambiguous).length,
    [rows],
  );
  const manualCount = useMemo(
    () => rows.filter((row) => row.confidence === "manual").length,
    [rows],
  );
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
    const source = reviewOnly
      ? rows.filter((row) => row.confidence === "baixa" || row.ambiguous)
      : rows;
    return source.slice(0, MAX_PREVIEW);
  }, [rows, reviewOnly]);

  const reset = () => {
    setRows([]);
    setResult(null);
    setFileName(null);
    setReviewOnly(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const readFile = async (file: File) => {
    if (reading) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Envie uma planilha Excel no formato .xlsx.");
      return;
    }

    setReading(true);
    try {
      const parsed = await parseBackorderSpreadsheet(file);
      setRows(parsed.rows);
      setResult(parsed);
      setFileName(file.name);
      setReviewOnly(false);
      toast.success(`${parsed.rows.length} Backorder(s) lido(s) e classificados por equipe.`);
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
    setRows((current) =>
      current.map((row) => (row.builderId === builderId ? changeBackorderBuilderTeam(row, team) : row)),
    );
  };

  const generate = async () => {
    if (!rows.length || exporting) return;
    setExporting(true);
    try {
      await generateProgramacaoExcel(rows, "Todas as equipes", "backorder");
      toast.success(`Planilha de Backorders pronta para impressão com ${rows.length} chamado(s).`);
    } catch (error) {
      console.error("[BackorderBuilder] Falha ao exportar:", error);
      toast.error("Não foi possível gerar a planilha final de Backorders.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <GlassCard className="overflow-hidden border-amber-300/[0.10] bg-[linear-gradient(145deg,rgba(255,255,255,0.035),rgba(255,255,255,0.012))]">
      <div className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-amber-300/20 bg-[linear-gradient(145deg,rgba(251,191,36,0.12),rgba(255,255,255,0.025))] text-amber-200 shadow-[inset_0_1px_0_rgba(255,255,255,0.10),0_14px_32px_-26px_rgba(245,158,11,0.85)] backdrop-blur-xl">
              <FileSpreadsheet className="h-[1.35rem] w-[1.35rem]" strokeWidth={1.8} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-lg font-semibold tracking-tight">Planilha rápida de Backorders</h2>
                <Badge variant="outline" className="border-white/[0.10] bg-white/[0.035] text-[10px] font-semibold uppercase tracking-[0.13em] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
                  processamento local
                </Badge>
              </div>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Anexe a planilha, revise somente os casos ambíguos e gere o arquivo final com o mesmo padrão de impressão do Corretiva Novo.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> Não grava no banco
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.025] px-3 py-1.5">
              <FileCheck2 className="h-3.5 w-3.5" /> A4 horizontal
            </span>
          </div>
        </div>

        {!rows.length ? (
          <div
            role="button"
            tabIndex={0}
            className={cn(
              "group relative grid min-h-52 cursor-pointer place-items-center overflow-hidden rounded-[1.35rem] border border-dashed p-6 text-center transition-all duration-200",
              dragging
                ? "border-rose-300/50 bg-rose-400/[0.07] shadow-[inset_0_0_0_1px_rgba(251,113,133,0.06)]"
                : "border-white/[0.11] bg-black/[0.08] hover:border-white/[0.18] hover:bg-white/[0.025]",
            )}
            onClick={() => !reading && inputRef.current?.click()}
            onKeyDown={(event) => {
              if ((event.key === "Enter" || event.key === " ") && !reading) inputRef.current?.click();
            }}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { event.preventDefault(); if (event.currentTarget === event.target) setDragging(false); }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void readFile(file);
            }}
          >
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void readFile(file);
              }}
            />
            <div>
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-white/[0.1] bg-white/[0.045] text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-transform duration-200 group-hover:-translate-y-0.5">
                {reading ? <Loader2 className="h-6 w-6 animate-spin" /> : <Upload className="h-6 w-6" />}
              </div>
              <p className="mt-4 text-base font-semibold">{reading ? "Lendo e classificando chamados…" : "Anexe a planilha de Backorder"}</p>
              <p className="mx-auto mt-1.5 max-w-xl text-sm leading-relaxed text-muted-foreground">
                O sistema localiza automaticamente as colunas, lê a descrição de cada chamado e identifica Elétrica, Hidráulica, Civil, Chaveiro, Pintura, Refrigeração ou Limpeza.
              </p>
              {!reading && (
                <Button type="button" variant="outline" className="mt-4 rounded-xl border-white/10 bg-white/[0.035]" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>
                  <FileSpreadsheet className="mr-2 h-4 w-4" /> Selecionar .xlsx
                </Button>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-black/[0.08] p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-emerald-400/15 bg-emerald-400/[0.06] text-emerald-300">
                  <CheckCircle2 className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold" title={fileName ?? undefined}>{fileName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Aba “{result?.sourceSheet}” · cabeçalho na linha {result?.headerRow} · {result?.mappedFields.join(" · ")}
                  </p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="shrink-0 rounded-xl border-white/10 bg-white/[0.025]" onClick={reset}>
                <RefreshCw className="mr-2 h-3.5 w-3.5" /> Trocar planilha
              </Button>
            </div>

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
                return (
                  <span key={team} className={cn("inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold", style.badge)}>
                    <span className={cn("h-1.5 w-1.5 rounded-full", style.dot)} /> {team} <span className="opacity-60">{count}</span>
                  </span>
                );
              })}
            </div>

            {(result?.ignoredRows || result?.duplicateRows || result?.completedRows) ? (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs text-muted-foreground">
                <ScanSearch className="h-4 w-4" />
                <span>{result.ignoredRows} linha(s) sem descrição ignorada(s)</span>
                <span>{result.duplicateRows} duplicidade(s) removida(s)</span>
                <span>{result.completedRows} chamado(s) concluído(s)/fechado(s) removido(s)</span>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-black/[0.08]">
              <div className="flex flex-col gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold">Revisão da classificação</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Altere a equipe somente quando necessário. O ajuste vale apenas para o Excel gerado.</p>
                </div>
                <button
                  type="button"
                  className={cn(
                    "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-xs font-semibold transition",
                    reviewOnly
                      ? "border-amber-400/25 bg-amber-400/[0.08] text-amber-100"
                      : "border-white/[0.09] bg-white/[0.025] text-muted-foreground hover:text-foreground",
                  )}
                  onClick={() => setReviewOnly((value) => !value)}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {reviewOnly ? "Mostrando somente revisão" : `Revisar ambíguos (${reviewCount})`}
                </button>
              </div>

              <div className="max-h-[34rem] overflow-auto">
                <table className="w-full min-w-[900px] border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-background/95 backdrop-blur-xl">
                    <tr className="border-b border-white/[0.08] text-left text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                      <th className="px-4 py-3">OS</th>
                      <th className="px-4 py-3">Descrição</th>
                      <th className="px-4 py-3">Local</th>
                      <th className="px-4 py-3">Confiança</th>
                      <th className="w-56 px-4 py-3">Equipe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleRows.map((row) => {
                      const meta = confidenceMeta(row);
                      const teamStyle = equipeStyles(row.equipe);
                      return (
                        <tr key={row.builderId} className="border-b border-white/[0.055] last:border-0 hover:bg-white/[0.018]">
                          <td className="px-4 py-3 align-top font-mono text-xs text-muted-foreground">{row.numero_os}</td>
                          <td className="max-w-xl px-4 py-3 align-top">
                            <p className="line-clamp-3 font-medium leading-relaxed">{row.nome_os}</p>
                            {row.originalTeam && <p className="mt-1 text-[11px] text-muted-foreground">Equipe na origem: {row.originalTeam}</p>}
                          </td>
                          <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                            {[row.predio, row.andar, row.local].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className="px-4 py-3 align-top">
                            <span className={cn("inline-flex rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em]", meta.className)} title={row.secondTeam ? `Segunda possibilidade: ${row.secondTeam}` : undefined}>
                              {meta.label}
                            </span>
                          </td>
                          <td className="px-4 py-3 align-top">
                            <Select value={String(row.equipe)} onValueChange={(value) => updateTeam(row.builderId, value as BackorderBuilderTeam)}>
                              <SelectTrigger className={cn("h-9 rounded-xl text-xs font-semibold", teamStyle.button)}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {BACKORDER_BUILDER_TEAMS.map((team) => (
                                  <SelectItem key={team} value={team}>{team}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {(reviewOnly ? reviewCount : rows.length) > MAX_PREVIEW && (
                <div className="border-t border-white/[0.07] px-4 py-3 text-center text-xs text-muted-foreground">
                  Exibindo os primeiros {MAX_PREVIEW} registros desta visualização. Todos os {rows.length} chamados serão incluídos na exportação.
                </div>
              )}
              {reviewOnly && reviewCount === 0 && (
                <div className="grid min-h-24 place-items-center px-4 py-6 text-sm text-muted-foreground">
                  Nenhuma classificação pendente de revisão.
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-rose-400/12 bg-rose-400/[0.035] p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-semibold">Pronta para impressão no padrão Backorder</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  O download usa o mesmo gerador do Corretiva Novo: Aptos, larguras A:I, altura dinâmica da descrição, cores por equipe, bordas e ajuste A4 horizontal.
                </p>
              </div>
              <Button type="button" className="h-11 shrink-0 rounded-xl bg-rose-600 px-5 text-white shadow-[0_14px_30px_-20px_rgba(225,29,72,0.8)] hover:bg-rose-500" disabled={exporting} onClick={() => void generate()}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
                {exporting ? "Gerando…" : "Gerar planilha de Backorders"}
              </Button>
            </div>
          </>
        )}
      </div>
    </GlassCard>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatDateBr,
  formatWeekdayBr,
  maintenanceAreaRank,
  mergeSchedules,
  parseScheduleFile,
  type ScheduledMaintenance,
} from "@/features/relatorio-diario/lib/daily-maintenance";
import { shouldReplaceSchedule } from "@/features/relatorio-diario/lib/corrective-report";
import {
  buildWeeklyPlanning,
  type WeeklyCorrectiveSourceRow,
  type WeeklyPlanningRow,
} from "@/features/relatorio-diario/lib/weekly-planning";
import { supabase } from "@/integrations/supabase/client";
import { equipeHex } from "@/lib/corretiva/equipe";
import { cn } from "@/lib/utils";

const ROWS_KEY = "apontauto:relatorio-diario:programacao:v1";
const TARGET_KEY = "apontauto:relatorio-diario:meta-equipe:v2";
const AUTHOR_KEY = "apontauto:relatorio-diario:responsavel:v1";
const NOTE_KEY = "apontauto:relatorio-diario:observacao-programacao:v1";

type CompletionFilter = "todos" | "concluidas" | "pendentes";

type CompletionRecord = {
  item_key: string;
  atividade_data: string;
  os: string;
  atividade: string;
  equipe: string | null;
  descricao: string | null;
  concluida_em: string;
  concluida_por?: string | null;
};

const todayIso = () => {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
};

const safeRead = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null");
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const locationLabel = (row: WeeklyPlanningRow) =>
  [row.building, row.floor, row.space].filter(Boolean).join(" • ") || "Local não informado";

const planningStatus = (row: WeeklyPlanningRow) => {
  if (row.planningOrigin === "planilha-semanal") return "Programado pela planilha";
  if (row.programmedCorrective) return "Programado no sistema";
  return "Sugestão de encaixe";
};

const completionTime = (record?: CompletionRecord) => {
  if (!record?.concluida_em) return "";
  const date = new Date(record.concluida_em);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const sortDailyRows = (rows: WeeklyPlanningRow[]) =>
  [...rows].sort(
    (a, b) =>
      maintenanceAreaRank(a.area) - maintenanceAreaRank(b.area) ||
      a.team.localeCompare(b.team, "pt-BR") ||
      a.activity.localeCompare(b.activity, "pt-BR") ||
      a.os.localeCompare(b.os, "pt-BR"),
  );

export function DailyExecutionReport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ScheduledMaintenance[]>([]);
  const [portfolio, setPortfolio] = useState<WeeklyCorrectiveSourceRow[]>([]);
  const [completions, setCompletions] = useState<Map<string, CompletionRecord>>(new Map());
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [targetPerTeam, setTargetPerTeam] = useState(2);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("todos");
  const [completionFilter, setCompletionFilter] = useState<CompletionFilter>("todos");
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [loadingExecutions, setLoadingExecutions] = useState(false);
  const [importing, setImporting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [dragging, setDragging] = useState(false);

  const loadPortfolio = useCallback(async (notify = false) => {
    setLoadingPortfolio(true);
    try {
      const { data, error } = await supabase
        .from("corretiva_os")
        .select(
          "id,numero_os,status,data_programada,data_criacao,data_sla,equipe,nome_os,equipamento,ativo,patrimonio,predio,andar,local,programacao_status,programacao_periodo_inicio,programacao_periodo_fim,programacao_dia_indice,programacao_equipe,programacao_tentativas,tipo_importacao,updated_at",
        )
        .in("status", ["aberta", "em_andamento"])
        .order("updated_at", { ascending: false })
        .limit(10000);

      if (error) throw error;
      setPortfolio((data ?? []) as WeeklyCorrectiveSourceRow[]);
      if (notify) toast.success(`${data?.length ?? 0} corretiva(s) abertas sincronizadas.`);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar as corretivas abertas.");
    } finally {
      setLoadingPortfolio(false);
    }
  }, []);

  const loadExecutions = useCallback(async (notify = false) => {
    setLoadingExecutions(true);
    try {
      const { data, error } = await (supabase as any)
        .from("relatorio_diario_execucoes")
        .select("item_key,atividade_data,os,atividade,equipe,descricao,concluida_em,concluida_por")
        .order("atividade_data", { ascending: false })
        .limit(5000);

      if (error) throw error;
      const next = new Map<string, CompletionRecord>();
      ((data ?? []) as CompletionRecord[]).forEach((record) => next.set(record.item_key, record));
      setCompletions(next);
      if (notify) toast.success("Status de execução atualizado.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar as atividades concluídas.");
    } finally {
      setLoadingExecutions(false);
    }
  }, []);

  useEffect(() => {
    const storedRows = mergeSchedules([], safeRead<ScheduledMaintenance[]>(ROWS_KEY, []));
    setRows(storedRows);
    const storedTarget = Number(window.localStorage.getItem(TARGET_KEY) ?? "2");
    setTargetPerTeam(Number.isFinite(storedTarget) ? Math.min(10, Math.max(1, storedTarget)) : 2);
    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");
    setNote(window.localStorage.getItem(NOTE_KEY) ?? "");
    void Promise.all([loadPortfolio(false), loadExecutions(false)]);
  }, [loadExecutions, loadPortfolio]);

  useEffect(() => {
    window.localStorage.setItem(ROWS_KEY, JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    window.localStorage.setItem(TARGET_KEY, String(targetPerTeam));
  }, [targetPerTeam]);

  useEffect(() => {
    window.localStorage.setItem(AUTHOR_KEY, author);
  }, [author]);

  useEffect(() => {
    window.localStorage.setItem(NOTE_KEY, note);
  }, [note]);

  useEffect(() => {
    const channel = supabase
      .channel("relatorio-diario-programacao-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "corretiva_os" },
        () => void loadPortfolio(false),
      )
      .subscribe();

    const refreshExecutions = () => void loadExecutions(false);
    window.addEventListener("focus", refreshExecutions);

    return () => {
      window.removeEventListener("focus", refreshExecutions);
      void supabase.removeChannel(channel);
    };
  }, [loadExecutions, loadPortfolio]);

  const planning = useMemo(
    () =>
      buildWeeklyPlanning({
        scheduledRows: rows,
        correctiveRows: portfolio,
        targetCorrectivesPerTeamPerDay: targetPerTeam,
      }),
    [portfolio, rows, targetPerTeam],
  );

  const dates = planning.days.map((day) => day.date);

  useEffect(() => {
    if (!dates.length || dates.includes(selectedDate)) return;
    const today = todayIso();
    setSelectedDate(dates.includes(today) ? today : dates[0]);
  }, [dates, selectedDate]);

  const dayRows = useMemo(
    () => sortDailyRows(planning.rows.filter((row) => row.date === selectedDate)),
    [planning.rows, selectedDate],
  );

  const teams = useMemo(
    () => Array.from(new Set(dayRows.map((row) => row.team || "Sem equipe"))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [dayRows],
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return dayRows.filter((row) => {
      const completed = completions.has(row.id);
      if (teamFilter !== "todos" && (row.team || "Sem equipe") !== teamFilter) return false;
      if (completionFilter === "concluidas" && !completed) return false;
      if (completionFilter === "pendentes" && completed) return false;
      if (!q) return true;
      return [row.os, row.name, row.team, row.building, row.floor, row.space, row.asset, row.equipment]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(q);
    });
  }, [completionFilter, completions, dayRows, search, teamFilter]);

  const suggestedRows = useMemo(
    () => planning.rows.filter((row) => row.supplementalCorrective && !row.programmedCorrective),
    [planning.rows],
  );

  const selectedCompleted = useMemo(
    () => dayRows.filter((row) => completions.has(row.id)).length,
    [completions, dayRows],
  );
  const selectedPending = Math.max(0, dayRows.length - selectedCompleted);
  const completionRate = dayRows.length ? Math.round((selectedCompleted / dayRows.length) * 100) : 0;

  async function handleFiles(files: FileList | File[] | null) {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    if (!accepted.length) return toast.error("Selecione planilhas .xlsx ou .xls.");

    setImporting(true);
    try {
      const results = await Promise.all(accepted.map(parseScheduleFile));
      const imported = results.flatMap((result) => result.rows);
      if (!imported.length) throw new Error("Nenhuma OS programada foi encontrada nas planilhas.");

      setRows((current) =>
        shouldReplaceSchedule(current, imported)
          ? mergeSchedules([], imported)
          : mergeSchedules(current, imported),
      );

      const importedDates = Array.from(new Set(imported.map((row) => row.date))).sort();
      if (importedDates.length) setSelectedDate(importedDates[0]);
      toast.success(`${imported.length} OS da programação semanal carregadas.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar as planilhas.");
    } finally {
      setImporting(false);
      setDragging(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function confirmSuggestedProgramming() {
    if (!suggestedRows.length || !planning.periodStart || !planning.periodEnd) return;

    const entries = suggestedRows
      .filter((row) => row.sourceCorrectiveId)
      .map((row) => ({
        os_id: row.sourceCorrectiveId,
        numero_os: row.os,
        period_start: planning.periodStart,
        period_end: planning.periodEnd,
        day_index: planning.days.findIndex((day) => day.date === row.date),
        equipe: row.team,
      }))
      .filter((entry) => entry.day_index >= 0);

    if (!entries.length) return toast.error("As sugestões não possuem identificadores válidos para programação.");

    setCommitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("register_corretiva_programacao_batch", {
        _entries: entries,
      });
      if (error) throw error;
      await loadPortfolio(false);
      toast.success(`${Number(data ?? entries.length)} corretiva(s) marcada(s) como Programado.`);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível registrar os encaixes como programados.");
      await loadPortfolio(false);
    } finally {
      setCommitting(false);
    }
  }

  async function toggleCompleted(row: WeeklyPlanningRow) {
    if (completingId) return;
    if (row.supplementalCorrective && !row.programmedCorrective) {
      toast.warning("Confirme este encaixe como Programado antes de marcar a atividade como concluída.");
      return;
    }

    const current = completions.get(row.id);
    setCompletingId(row.id);
    try {
      if (current) {
        const { error } = await (supabase as any)
          .from("relatorio_diario_execucoes")
          .delete()
          .eq("item_key", row.id);
        if (error) throw error;

        setCompletions((map) => {
          const next = new Map(map);
          next.delete(row.id);
          return next;
        });
        toast.success(`OS ${row.os} voltou para pendente no relatório diário.`);
        return;
      }

      const completedAt = new Date().toISOString();
      const record = {
        item_key: row.id,
        atividade_data: row.date,
        os: row.os || "",
        atividade: row.activity,
        equipe: row.team || null,
        descricao: row.name || row.equipment || null,
        concluida_em: completedAt,
        updated_at: completedAt,
      };
      const { data, error } = await (supabase as any)
        .from("relatorio_diario_execucoes")
        .upsert(record, { onConflict: "item_key" })
        .select("item_key,atividade_data,os,atividade,equipe,descricao,concluida_em,concluida_por")
        .single();
      if (error) throw error;

      setCompletions((map) => {
        const next = new Map(map);
        next.set(row.id, data as CompletionRecord);
        return next;
      });
      toast.success(`OS ${row.os} marcada como concluída.`);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível atualizar a execução desta atividade.");
    } finally {
      setCompletingId(null);
    }
  }

  function clearImportedBase() {
    if (!window.confirm("Limpar somente as planilhas semanais importadas desta tela? Os registros de conclusão permanecerão salvos no servidor.")) return;
    setRows([]);
    window.localStorage.removeItem(ROWS_KEY);
    toast.success("Programação importada removida desta tela.");
  }

  async function generatePdf() {
    if (!selectedDate) return;
    if (suggestedRows.length) {
      toast.warning("Confirme os encaixes como Programado antes de gerar o relatório diário.");
      return;
    }

    const pdfRows = sortDailyRows(planning.rows.filter((row) => row.date === selectedDate));
    if (!pdfRows.length) return toast.error("Não há atividades para este dia.");

    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      const margin = 10;
      const completed = pdfRows.filter((row) => completions.has(row.id)).length;
      const pending = pdfRows.length - completed;
      const rate = pdfRows.length ? Math.round((completed / pdfRows.length) * 100) : 0;

      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, width, 24, "F");
      doc.setFillColor(16, 185, 129);
      doc.rect(0, 24, width, 1.5, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(15);
      doc.text("RELATÓRIO DIÁRIO DE ATIVIDADES EXECUTADAS", margin, 10.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.text(`${formatWeekdayBr(selectedDate)} • ${formatDateBr(selectedDate)}`, margin, 17.5);
      doc.text("ApontAuto • acompanhamento de execução", width - margin, 17.5, { align: "right" });

      const metricY = 30;
      const metricW = 43;
      const metricH = 14;
      const metrics = [
        { label: "ATIVIDADES", value: String(pdfRows.length), fill: [241, 245, 249] as [number, number, number], text: [15, 23, 42] as [number, number, number] },
        { label: "CONCLUÍDAS", value: String(completed), fill: [220, 252, 231] as [number, number, number], text: [21, 128, 61] as [number, number, number] },
        { label: "PENDENTES", value: String(pending), fill: [254, 249, 195] as [number, number, number], text: [161, 98, 7] as [number, number, number] },
        { label: "EXECUÇÃO", value: `${rate}%`, fill: [224, 242, 254] as [number, number, number], text: [3, 105, 161] as [number, number, number] },
      ];

      metrics.forEach((metric, index) => {
        const x = margin + index * (metricW + 3);
        doc.setFillColor(...metric.fill);
        doc.roundedRect(x, metricY, metricW, metricH, 1.8, 1.8, "F");
        doc.setTextColor(...metric.text);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.5);
        doc.text(metric.label, x + 3, metricY + 4.5);
        doc.setFontSize(12);
        doc.text(metric.value, x + 3, metricY + 11.2);
      });

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      let infoY = 49;
      if (author.trim()) {
        doc.setFont("helvetica", "bold");
        doc.text("Responsável:", margin, infoY);
        doc.setFont("helvetica", "normal");
        doc.text(author.trim(), margin + 18, infoY);
        infoY += 4;
      }
      if (note.trim()) {
        doc.setFont("helvetica", "bold");
        doc.text("Observação:", margin, infoY);
        doc.setFont("helvetica", "normal");
        doc.text(note.trim(), margin + 17, infoY, { maxWidth: width - margin * 2 - 17 });
        infoY += Math.max(4, doc.getTextDimensions(note.trim(), { maxWidth: width - margin * 2 - 17 }).h + 1);
      }

      doc.setFillColor(220, 252, 231);
      doc.rect(width - margin - 55, metricY, 4, 4, "F");
      doc.setTextColor(22, 101, 52);
      doc.setFontSize(7);
      doc.text("Linha verde = atividade concluída", width - margin - 49, metricY + 3.2);

      autoTable(doc, {
        startY: Math.max(55, infoY + 2),
        margin: { left: margin, right: margin, bottom: 12 },
        head: [["Status", "OS", "Tipo", "Equipe", "Local", "Atividade executada / programada", "Ativo", "SLA"]],
        body: pdfRows.map((row) => {
          const record = completions.get(row.id);
          const status = record ? `CONCLUÍDA${completionTime(record) ? `\n${completionTime(record)}` : ""}` : "PENDENTE";
          return [
            status,
            row.os,
            row.activity,
            row.team || "—",
            locationLabel(row),
            row.name || row.equipment || "—",
            row.asset || "—",
            row.sla ? formatDateBr(row.sla) : "—",
          ];
        }),
        theme: "grid",
        styles: {
          fontSize: 6.8,
          cellPadding: 1.25,
          valign: "middle",
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
          textColor: [30, 41, 59],
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 7,
          cellPadding: 1.5,
        },
        columnStyles: {
          0: { cellWidth: 22, fontStyle: "bold" },
          1: { cellWidth: 24, fontStyle: "bold" },
          2: { cellWidth: 19 },
          3: { cellWidth: 29 },
          4: { cellWidth: 48 },
          5: { cellWidth: 72 },
          6: { cellWidth: 24 },
          7: { cellWidth: 21 },
        },
        didParseCell: (cell) => {
          if (cell.section !== "body") return;
          const row = pdfRows[cell.row.index];
          if (!row) return;
          const isDone = completions.has(row.id);
          if (isDone) {
            cell.cell.styles.fillColor = [220, 252, 231];
            cell.cell.styles.textColor = [20, 83, 45];
            if (cell.column.index === 0) {
              cell.cell.styles.fillColor = [187, 247, 208];
              cell.cell.styles.textColor = [21, 128, 61];
            }
          } else if (cell.column.index === 0) {
            cell.cell.styles.fillColor = [254, 249, 195];
            cell.cell.styles.textColor = [161, 98, 7];
          }
        },
        didDrawPage: () => {
          const page = doc.getCurrentPageInfo().pageNumber;
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, height - 8, width - margin, height - 8);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.5);
          doc.setTextColor(100, 116, 139);
          doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, margin, height - 4.5);
          doc.text(`Página ${page}`, width - margin, height - 4.5, { align: "right" });
        },
      });

      doc.setProperties({
        title: `Relatório Diário de Atividades - ${formatDateBr(selectedDate)}`,
        subject: "Atividades executadas e pendentes do dia",
        author: author.trim() || "ApontAuto",
      });
      doc.save(`RELATORIO_DIARIO_ATIVIDADES_${selectedDate}.pdf`);
      toast.success("Relatório diário gerado com o status das atividades.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setGenerating(false);
    }
  }

  const hasSchedule = rows.length > 0;
  const syncing = loadingPortfolio || loadingExecutions;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-3 px-3 py-3 sm:px-5 lg:px-6 lg:py-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="bg-slate-950 px-4 py-4 text-white sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Controle diário de execução</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Relatório Diário • Atividades executadas</h1>
              <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-300">
                Acompanhe a programação do dia, marque o que foi concluído e gere um PDF compacto com execução e pendências.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void Promise.all([loadPortfolio(true), loadExecutions(false)])}
                disabled={syncing}
                className="gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <RefreshCcw className={cn("h-4 w-4", syncing && "animate-spin")} /> Atualizar
              </Button>
              {hasSchedule && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearImportedBase}
                  className="gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
                >
                  <Trash2 className="h-4 w-4" /> Limpar planilhas
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_360px] sm:p-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(event) => void handleFiles(event.target.files)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              void handleFiles(event.dataTransfer.files);
            }}
            className={cn(
              "flex min-h-[96px] items-center gap-3 rounded-xl border border-dashed p-3 text-left transition-colors",
              dragging ? "border-sky-500 bg-sky-500/5" : "border-border bg-muted/10 hover:bg-muted/25",
            )}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{hasSchedule ? "Atualizar programação semanal" : "Importar programação semanal"}</span>
              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Planilhas .xlsx/.xls. A agenda é combinada com as corretivas abertas.</span>
            </span>
          </button>

          <div className="rounded-xl border border-border bg-background/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-sky-500" />
                  <h2 className="text-sm font-semibold">Encaixe por equipe</h2>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">Meta diária de corretivas.</p>
              </div>
              <Input
                type="number"
                min={1}
                max={10}
                value={targetPerTeam}
                onChange={(event) => setTargetPerTeam(Math.min(10, Math.max(1, Number(event.target.value) || 1)))}
                className="h-9 w-20 text-center"
              />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <MiniStat label="Disponíveis" value={planning.candidateCount} />
              <MiniStat label="Programadas" value={planning.programmedCount} />
              <MiniStat label="Sugestões" value={planning.suggestedCount} />
            </div>
          </div>
        </div>
      </section>

      {!hasSchedule ? (
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <FileSpreadsheet className="mx-auto h-7 w-7 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">Importe a programação para iniciar o relatório diário</h2>
          <p className="mx-auto mt-1 max-w-2xl text-sm text-muted-foreground">Depois você poderá marcar cada atividade como concluída e emitir o PDF de execução.</p>
          <Button className="mt-4 gap-2" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Selecionar planilhas
          </Button>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {planning.days.map((day) => {
                  const done = planning.rows.filter((row) => row.date === day.date && completions.has(row.id)).length;
                  return (
                    <button
                      key={day.date}
                      type="button"
                      onClick={() => setSelectedDate(day.date)}
                      className={cn(
                        "min-w-[122px] rounded-lg border px-3 py-2 text-left transition-colors",
                        day.date === selectedDate
                          ? "border-slate-800 bg-slate-950 text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-950"
                          : "border-border bg-background hover:bg-muted/40",
                      )}
                    >
                      <span className="block text-[9px] font-semibold uppercase">{formatWeekdayBr(day.date, true)}</span>
                      <span className="mt-0.5 block text-xs font-semibold">{formatDateBr(day.date)}</span>
                      <span className="mt-1 block text-[9px] opacity-75">{done}/{day.total} concluídas</span>
                    </button>
                  );
                })}
              </div>

              <Button
                size="sm"
                onClick={() => void confirmSuggestedProgramming()}
                disabled={committing || !suggestedRows.length}
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {suggestedRows.length ? `Programar ${suggestedRows.length} encaixe(s)` : "Encaixes confirmados"}
              </Button>
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_310px]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border p-3">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <h2 className="text-sm font-semibold">Atividades de {formatDateBr(selectedDate)}</h2>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Marque a execução sem alterar o status original da OS.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <div className="relative min-w-[210px] flex-1">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar OS, serviço, local..."
                        className="h-9 pl-9 text-sm"
                      />
                    </div>
                    <select
                      value={teamFilter}
                      onChange={(event) => setTeamFilter(event.target.value)}
                      className="h-9 rounded-md border border-input bg-background px-2.5 text-xs"
                    >
                      <option value="todos">Todas equipes</option>
                      {teams.map((team) => (
                        <option key={team} value={team}>{team}</option>
                      ))}
                    </select>
                    <select
                      value={completionFilter}
                      onChange={(event) => setCompletionFilter(event.target.value as CompletionFilter)}
                      className="h-9 rounded-md border border-input bg-background px-2.5 text-xs"
                    >
                      <option value="todos">Todos status</option>
                      <option value="concluidas">Concluídas</option>
                      <option value="pendentes">Pendentes</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="max-h-[680px] overflow-auto">
                {visibleRows.length ? (
                  <div className="divide-y divide-border">
                    {visibleRows.map((row) => {
                      const record = completions.get(row.id);
                      const completed = Boolean(record);
                      const waitingProgramming = row.supplementalCorrective && !row.programmedCorrective;
                      return (
                        <div
                          key={row.id}
                          className={cn(
                            "grid gap-2 px-3 py-2.5 transition-colors lg:grid-cols-[88px_135px_minmax(0,1fr)_195px] lg:items-center",
                            completed && "bg-emerald-500/[0.06]",
                          )}
                          style={{ borderLeft: `3px solid ${completed ? "#10b981" : equipeHex(row.team)}` }}
                        >
                          <div>
                            <p className="font-mono text-xs font-semibold">{row.os}</p>
                            <p className="mt-0.5 text-[9px] font-semibold uppercase text-muted-foreground">{row.activity}</p>
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold">{row.team || "Sem equipe"}</p>
                            <p className="mt-0.5 text-[9px] text-muted-foreground">{row.area}</p>
                          </div>
                          <div className="min-w-0">
                            <p className={cn("text-xs font-medium", completed && "text-emerald-800 dark:text-emerald-200")}>{row.name || row.equipment || "Serviço sem descrição"}</p>
                            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{locationLabel(row)}</p>
                            <p className="mt-0.5 text-[9px] text-muted-foreground">{planningStatus(row)}{row.sla ? ` • SLA ${formatDateBr(row.sla)}` : ""}</p>
                          </div>
                          <div className="flex items-center justify-end gap-2">
                            {waitingProgramming ? (
                              <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[9px] font-semibold text-amber-700 dark:text-amber-300">AGUARDA PROGRAMAÇÃO</span>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant={completed ? "default" : "outline"}
                                disabled={completingId === row.id}
                                onClick={() => void toggleCompleted(row)}
                                className={cn(
                                  "h-8 min-w-[150px] justify-center gap-1.5 px-2.5 text-[10px]",
                                  completed && "bg-emerald-600 text-white hover:bg-emerald-700",
                                )}
                                title={completed ? "Clique para voltar a atividade para pendente" : "Marcar atividade como concluída"}
                              >
                                {completingId === row.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : completed ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <Circle className="h-3.5 w-3.5" />
                                )}
                                {completed ? `Concluída${completionTime(record) ? ` • ${completionTime(record)}` : ""}` : "Marcar concluída"}
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma atividade encontrada com estes filtros.</div>
                )}
              </div>
            </div>

            <aside className="space-y-3">
              <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Execução do dia</h2>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Stat label="Total" value={dayRows.length} />
                  <Stat label="Concluídas" value={selectedCompleted} tone="done" />
                  <Stat label="Pendentes" value={selectedPending} tone="pending" />
                  <Stat label="Execução" value={`${completionRate}%`} tone="rate" />
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${completionRate}%` }} />
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
                  <h2 className="text-sm font-semibold">Relatório em PDF</h2>
                </div>
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Concluídas aparecem em verde no documento; pendências ficam destacadas separadamente.</p>

                <label className="mt-3 block text-[10px] font-medium text-muted-foreground">Responsável</label>
                <Input
                  className="mt-1 h-9 text-xs"
                  value={author}
                  onChange={(event) => setAuthor(event.target.value)}
                  placeholder="Nome do responsável"
                />
                <label className="mt-2.5 block text-[10px] font-medium text-muted-foreground">Observação do dia</label>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={2}
                  className="mt-1 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs"
                  placeholder="Resumo, ocorrências ou observações"
                />
                {suggestedRows.length > 0 && (
                  <p className="mt-2 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2 text-[10px] leading-4 text-amber-700 dark:text-amber-300">Confirme os encaixes antes de emitir o relatório.</p>
                )}
                <Button
                  onClick={() => void generatePdf()}
                  disabled={generating || suggestedRows.length > 0}
                  className="mt-3 w-full gap-2"
                  size="sm"
                >
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Baixar relatório do dia
                </Button>
              </section>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-2">
      <p className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "done" | "pending" | "rate";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border px-2.5 py-2",
        tone === "done" && "border-emerald-500/20 bg-emerald-500/[0.07]",
        tone === "pending" && "border-amber-500/20 bg-amber-500/[0.07]",
        tone === "rate" && "border-sky-500/20 bg-sky-500/[0.07]",
        tone === "default" && "border-border bg-background",
      )}
    >
      <p className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tracking-tight">{value}</p>
    </div>
  );
}

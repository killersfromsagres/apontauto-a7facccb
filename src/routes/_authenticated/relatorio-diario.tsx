import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileDown,
  FileSpreadsheet,
  Filter,
  RefreshCcw,
  Search,
  Trash2,
  Upload,
  Wrench,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatDateBr,
  formatWeekdayBr,
  mergeSchedules,
  parseScheduleFile,
  summarizeScheduleRows,
  type MaintenanceType,
  type ScheduledMaintenance,
} from "@/features/relatorio-diario/lib/daily-maintenance";

export const Route = createFileRoute("/_authenticated/relatorio-diario")({
  component: DailyMaintenanceReport,
});

const ROWS_KEY = "apontauto:relatorio-diario:programacao:v1";
const EXECUTIONS_KEY = "apontauto:relatorio-diario:execucoes:v2";
const LEGACY_DONE_KEY = "apontauto:relatorio-diario:realizadas:v1";
const AUTHOR_KEY = "apontauto:relatorio-diario:responsavel:v1";

type ExecutionRecord = {
  completedAt: string;
};

type ExecutionMap = Record<string, ExecutionRecord>;
type StatusFilter = "todos" | "concluidas" | "programadas";
type TypeFilter = "todos" | MaintenanceType;
type DayView = "programadas" | "concluidas" | "ambas";

type ImportBatchSummary = {
  files: number;
  records: number;
  dates: number;
  preventive: number;
  corrective: number;
  teams: string[];
  ignoredSheets: number;
  warnings: string[];
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

const maintenanceLocation = (row: ScheduledMaintenance) =>
  [row.building, row.floor, row.space].filter(Boolean).join(" • ") || "Local não informado";

const uniqueRows = (rows: ScheduledMaintenance[]) =>
  Array.from(new Map(rows.map((row) => [row.id, row])).values());

function DailyMaintenanceReport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ScheduledMaintenance[]>([]);
  const [executions, setExecutions] = useState<ExecutionMap>({});
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [dayView, setDayView] = useState<DayView>("programadas");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [teamFilter, setTeamFilter] = useState("todos");
  const [author, setAuthor] = useState("");
  const [dailyNote, setDailyNote] = useState("");
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [lastImport, setLastImport] = useState<ImportBatchSummary | null>(null);

  useEffect(() => {
    const storedRows = safeRead<ScheduledMaintenance[]>(ROWS_KEY, []);
    const storedExecutions = safeRead<ExecutionMap>(EXECUTIONS_KEY, {});
    setRows(storedRows);

    if (Object.keys(storedExecutions).length) {
      setExecutions(storedExecutions);
    } else {
      const legacyDone = safeRead<Record<string, boolean>>(LEGACY_DONE_KEY, {});
      const migrated: ExecutionMap = {};
      storedRows.forEach((row) => {
        if (legacyDone[row.id]) migrated[row.id] = { completedAt: row.date };
      });
      setExecutions(migrated);
    }

    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(ROWS_KEY, JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(EXECUTIONS_KEY, JSON.stringify(executions));
  }, [executions]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(AUTHOR_KEY, author);
  }, [author]);

  const daySummaries = useMemo(() => summarizeScheduleRows(rows), [rows]);
  const dates = useMemo(() => daySummaries.map((day) => day.date), [daySummaries]);
  const daySummaryByDate = useMemo(
    () => new Map(daySummaries.map((day) => [day.date, day])),
    [daySummaries],
  );

  const scheduledRows = useMemo(
    () => rows.filter((row) => row.date === selectedDate),
    [rows, selectedDate],
  );

  const completedOnDate = useMemo(
    () => rows.filter((row) => executions[row.id]?.completedAt === selectedDate),
    [rows, executions, selectedDate],
  );

  const referenceRows = useMemo(() => {
    if (dayView === "programadas") return scheduledRows;
    if (dayView === "concluidas") return completedOnDate;
    return uniqueRows([...scheduledRows, ...completedOnDate]);
  }, [completedOnDate, dayView, scheduledRows]);

  const teams = useMemo(
    () => Array.from(new Set(referenceRows.map((row) => row.team || "Sem equipe"))).sort(),
    [referenceRows],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return referenceRows
      .filter((row) => {
        if (typeFilter !== "todos" && row.activity !== typeFilter) return false;
        if (teamFilter !== "todos" && (row.team || "Sem equipe") !== teamFilter) return false;

        const completed = Boolean(executions[row.id]);
        if (statusFilter === "concluidas" && !completed) return false;
        if (statusFilter === "programadas" && completed) return false;

        if (!query) return true;
        return [
          row.os,
          row.name,
          row.building,
          row.floor,
          row.space,
          row.team,
          row.asset,
          row.equipment,
          row.sourceFile,
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(query);
      })
      .sort((a, b) => a.team.localeCompare(b.team) || a.activity.localeCompare(b.activity) || a.os.localeCompare(b.os));
  }, [executions, referenceRows, search, statusFilter, teamFilter, typeFilter]);

  const completedScheduledEver = useMemo(
    () => scheduledRows.filter((row) => Boolean(executions[row.id])).length,
    [scheduledRows, executions],
  );

  const completedScheduledOnDate = useMemo(
    () => scheduledRows.filter((row) => executions[row.id]?.completedAt === selectedDate).length,
    [scheduledRows, executions, selectedDate],
  );

  const pendingScheduled = scheduledRows.length - completedScheduledEver;
  const reportPreventive = completedOnDate.filter((row) => row.activity === "Preventiva").length;
  const reportCorrective = completedOnDate.filter((row) => row.activity === "Corretiva").length;
  const sameDayCompletionRate = scheduledRows.length
    ? Math.round((completedScheduledOnDate / scheduledRows.length) * 100)
    : 0;

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || !files.length) return;
    const accepted = Array.from(files).filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    if (!accepted.length) {
      toast.error("Selecione arquivos Excel .xlsx ou .xls.");
      return;
    }

    setImporting(true);
    try {
      const results = await Promise.all(accepted.map(parseScheduleFile));
      const imported = results.flatMap((result) => result.rows);
      if (!imported.length) {
        throw new Error("Nenhuma OS de Preventiva ou Corretiva foi encontrada nas abas de programação.");
      }

      const importedDates = Array.from(new Set(imported.map((row) => row.date))).sort();
      const today = todayIso();
      const nextDate = importedDates.includes(today)
        ? today
        : importedDates.includes(selectedDate)
          ? selectedDate
          : importedDates[0];

      setRows((current) => mergeSchedules(current, imported));
      if (nextDate) setSelectedDate(nextDate);
      setDayView("programadas");
      setStatusFilter("todos");
      setTeamFilter("todos");

      const summary: ImportBatchSummary = {
        files: accepted.length,
        records: imported.length,
        dates: importedDates.length,
        preventive: imported.filter((row) => row.activity === "Preventiva").length,
        corrective: imported.filter((row) => row.activity === "Corretiva").length,
        teams: Array.from(new Set(imported.map((row) => row.team).filter(Boolean))).sort(),
        ignoredSheets: results.reduce((total, result) => total + result.ignoredSheets.length, 0),
        warnings: Array.from(new Set(results.flatMap((result) => result.warnings))),
      };
      setLastImport(summary);

      toast.success(
        `${summary.records} OS verificadas • ${summary.dates} dia(s) • ${summary.preventive} preventivas • ${summary.corrective} corretivas.`,
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar a programação.");
    } finally {
      setImporting(false);
      setDragging(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function concludeRow(row: ScheduledMaintenance, date = selectedDate) {
    if (!date) return;
    setExecutions((current) => ({
      ...current,
      [row.id]: { completedAt: date },
    }));
  }

  function reopenRow(id: string) {
    setExecutions((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function updateCompletionDate(id: string, date: string) {
    if (!date) return;
    setExecutions((current) => ({
      ...current,
      [id]: { completedAt: date },
    }));
  }

  function markVisible(value: boolean) {
    setExecutions((current) => {
      const next = { ...current };
      visibleRows.forEach((row) => {
        if (value) {
          if (!next[row.id]) next[row.id] = { completedAt: selectedDate };
        } else {
          delete next[row.id];
        }
      });
      return next;
    });
  }

  function clearBase() {
    if (!window.confirm("Remover a programação importada e todas as confirmações de execução?")) return;
    setRows([]);
    setExecutions({});
    setLastImport(null);
    setSearch("");
    setTeamFilter("todos");
    setTypeFilter("todos");
    setStatusFilter("todos");
    setDayView("programadas");
    setSelectedDate(todayIso());
    window.localStorage.removeItem(ROWS_KEY);
    window.localStorage.removeItem(EXECUTIONS_KEY);
    window.localStorage.removeItem(LEGACY_DONE_KEY);
    toast.success("Base importada removida.");
  }

  async function generatePdf() {
    if (!completedOnDate.length) {
      toast.error("Não há OS concluídas nesta data para gerar o relatório.");
      return;
    }

    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      const margin = 14;
      const titleDate = formatDateBr(selectedDate);

      doc.setFillColor(17, 24, 39);
      doc.rect(0, 0, width, 31, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.text("RELATÓRIO DIÁRIO DE MANUTENÇÃO", margin, 13);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.text(`Execuções concluídas em ${titleDate}`, margin, 21);
      doc.text("Preventivas e corretivas confirmadas no sistema", margin, 26);

      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(String(completedOnDate.length), margin, 44);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("CONCLUÍDAS NO DIA", margin, 49);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(String(reportPreventive), 58, 44);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("PREVENTIVAS", 58, 49);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(String(reportCorrective), 96, 44);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("CORRETIVAS", 96, 49);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(`${sameDayCompletionRate}%`, 134, 44);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("DA PROGRAMAÇÃO CONCLUÍDA NO MESMO DIA", 134, 49);

      const reportTeams = Array.from(new Set(completedOnDate.map((row) => row.team || "Sem equipe"))).sort();
      doc.setFontSize(8.5);
      doc.setTextColor(75, 85, 99);
      doc.text(`Equipes: ${reportTeams.join(" • ")}`, margin, 57, { maxWidth: width - margin * 2 });
      if (author.trim()) doc.text(`Responsável pelo relatório: ${author.trim()}`, margin, 62);
      if (dailyNote.trim()) {
        doc.text(`Observação do dia: ${dailyNote.trim()}`, margin, author.trim() ? 67 : 62, {
          maxWidth: width - margin * 2,
        });
      }

      const sorted = [...completedOnDate].sort(
        (a, b) => a.team.localeCompare(b.team) || a.activity.localeCompare(b.activity) || a.os.localeCompare(b.os),
      );

      autoTable(doc, {
        startY: dailyNote.trim() ? 73 : author.trim() ? 68 : 64,
        margin: { left: margin, right: margin, bottom: 18 },
        head: [["OS", "Tipo", "Equipe", "Programada", "Local", "Serviço / Denominação", "SLA", "Ativo"]],
        body: sorted.map((row) => [
          row.os,
          row.activity,
          row.team || "—",
          formatDateBr(row.date),
          maintenanceLocation(row),
          row.name || row.equipment || "—",
          row.sla || "—",
          row.asset || "—",
        ]),
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 7,
          cellPadding: 2.2,
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
          textColor: [31, 41, 55],
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: {
          fillColor: [30, 41, 59],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 7.2,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 19, fontStyle: "bold" },
          1: { cellWidth: 21 },
          2: { cellWidth: 27 },
          3: { cellWidth: 23 },
          4: { cellWidth: 43 },
          5: { cellWidth: 82 },
          6: { cellWidth: 22 },
          7: { cellWidth: 27 },
        },
        didDrawPage: () => {
          const page = doc.getNumberOfPages();
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, height - 12, width - margin, height - 12);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.2);
          doc.setTextColor(100, 116, 139);
          doc.text(
            "Fontes: programação importada e data de conclusão confirmada no sistema.",
            margin,
            height - 7,
          );
          doc.text(`Página ${page}`, width - margin, height - 7, { align: "right" });
        },
      });

      doc.setProperties({
        title: `Relatório Diário de Manutenção - ${titleDate}`,
        subject: "Preventivas e corretivas concluídas na data selecionada",
        author: author.trim() || "ApontAuto",
        creator: "ApontAuto",
      });
      doc.save(`RELATORIO_DIARIO_MANUTENCAO_${selectedDate}.pdf`);
      toast.success("PDF diário gerado com sucesso.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setGenerating(false);
    }
  }

  const hasBase = rows.length > 0;
  const currentSummary = daySummaryByDate.get(selectedDate);

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-5 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <ClipboardCheck className="h-4 w-4" />
              Controle diário de execução
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Relatório Diário de Manutenção
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Anexe a programação semanal. O sistema identifica automaticamente segunda a sexta,
              separa Preventivas e Corretivas e permite consultar pelo dia programado ou pelo dia em que a OS foi concluída.
            </p>
          </div>

          {hasBase && (
            <Button variant="outline" onClick={clearBase} className="gap-2 text-muted-foreground">
              <Trash2 className="h-4 w-4" />
              Limpar base
            </Button>
          )}
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            multiple
            className="hidden"
            onChange={(event) => handleFiles(event.target.files)}
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
            disabled={importing}
            className={`group flex min-h-[150px] w-full items-center gap-4 rounded-xl border border-dashed px-5 py-5 text-left transition-colors ${
              dragging
                ? "border-primary bg-primary/5"
                : "border-border bg-muted/20 hover:border-primary/50 hover:bg-muted/35"
            }`}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
              {importing ? (
                <RefreshCcw className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-foreground" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-foreground">
                {importing ? "Verificando a programação..." : hasBase ? "Adicionar outra programação" : "Anexar programação semanal"}
              </span>
              <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                Arraste ou selecione arquivos .xlsx/.xls. A aba PROGRAMAÇÃO é lida automaticamente e as abas auxiliares são ignoradas.
              </span>
              <span className="mt-2 inline-flex rounded-md border border-border bg-background px-2.5 py-1 text-[11px] font-medium text-foreground">
                Selecionar planilha
              </span>
            </span>
          </button>

          <div className="rounded-xl border border-border bg-background/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Verificação automática
            </p>

            {lastImport ? (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="OS lidas" value={lastImport.records} />
                  <MiniStat label="Dias" value={lastImport.dates} />
                  <MiniStat label="Preventivas" value={lastImport.preventive} />
                  <MiniStat label="Corretivas" value={lastImport.corrective} />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">
                  {lastImport.files} arquivo(s) • {lastImport.teams.join(" • ") || "Equipe não identificada"} •{" "}
                  {lastImport.ignoredSheets} aba(s) auxiliar(es) ignorada(s)
                </p>
                {lastImport.warnings.length > 0 && (
                  <p className="mt-2 text-[11px] leading-5 text-amber-600 dark:text-amber-400">
                    {lastImport.warnings.join(" ")}
                  </p>
                )}
              </div>
            ) : hasBase ? (
              <div className="mt-3">
                <div className="grid grid-cols-2 gap-2">
                  <MiniStat label="OS na base" value={rows.length} />
                  <MiniStat label="Dias" value={dates.length} />
                  <MiniStat
                    label="Preventivas"
                    value={rows.filter((row) => row.activity === "Preventiva").length}
                  />
                  <MiniStat
                    label="Corretivas"
                    value={rows.filter((row) => row.activity === "Corretiva").length}
                  />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">Base restaurada deste navegador.</p>
              </div>
            ) : (
              <p className="mt-3 text-xs leading-5 text-muted-foreground">
                O sistema valida os blocos de segunda a sexta, a coluna OS, o tipo de atividade e as datas programadas antes de incluir os registros.
              </p>
            )}
          </div>
        </div>
      </section>

      {!hasBase ? (
        <section className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background">
            <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-base font-semibold">Use a planilha da Programação Semanal</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            O formato com faixas “SEGUNDA-FEIRA • data • equipe”, seguido das colunas OS, Atividade,
            Término SLA e Equipe, é reconhecido automaticamente. Preventivas e Corretivas podem estar no mesmo arquivo.
          </p>
          <Button className="mt-5 gap-2" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Selecionar planilha
          </Button>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="grid gap-4 xl:grid-cols-[minmax(250px,0.8fr)_minmax(260px,0.8fr)_minmax(0,2.4fr)] xl:items-end">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Dia de referência</span>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="date"
                    value={selectedDate}
                    onChange={(event) => setSelectedDate(event.target.value)}
                    className="pl-9"
                  />
                </div>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">O que mostrar neste dia</span>
                <select
                  value={dayView}
                  onChange={(event) => {
                    setDayView(event.target.value as DayView);
                    setStatusFilter("todos");
                  }}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  <option value="programadas">OS programadas para o dia</option>
                  <option value="concluidas">OS concluídas no dia</option>
                  <option value="ambas">Programadas + concluídas</option>
                </select>
              </label>

              <div className="min-w-0">
                <span className="text-xs font-medium text-muted-foreground">Dias encontrados na planilha</span>
                <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
                  {daySummaries.map((day) => {
                    const active = day.date === selectedDate;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => setSelectedDate(day.date)}
                        className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${
                          active
                            ? "border-primary bg-primary/5 text-foreground"
                            : "border-border bg-background hover:bg-muted/45"
                        }`}
                      >
                        <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {formatWeekdayBr(day.date, true)}
                        </span>
                        <span className="mt-0.5 block text-sm font-semibold">{formatDateBr(day.date)}</span>
                        <span className="mt-0.5 block text-[10px] text-muted-foreground">
                          {day.total} OS • {day.corrective} corretiva{day.corrective === 1 ? "" : "s"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <span>
                <strong className="font-semibold text-foreground">{rows.length}</strong> registros na base
              </span>
              <span>
                <strong className="font-semibold text-foreground">{dates.length}</strong> dias identificados
              </span>
              <span>
                <strong className="font-semibold text-foreground">
                  {new Set(rows.map((row) => row.sourceFile)).size}
                </strong>{" "}
                arquivos de origem
              </span>
              {currentSummary && (
                <span>
                  {currentSummary.teams.join(" • ")} • {currentSummary.preventive} preventivas • {currentSummary.corrective} corretivas
                </span>
              )}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Programadas no dia" value={scheduledRows.length} detail={`${formatWeekdayBr(selectedDate)} • ${formatDateBr(selectedDate)}`} />
            <Metric label="Concluídas no dia" value={completedOnDate.length} detail="pela data de conclusão" accent />
            <Metric label="Da programação concluídas" value={completedScheduledEver} detail={`${pendingScheduled} ainda pendente(s)`} />
            <Metric label="Concluídas no mesmo dia" value={completedScheduledOnDate} detail={`${sameDayCompletionRate}% da programação`} />
            <Metric label="Corretivas concluídas" value={reportCorrective} detail={`${reportPreventive} preventiva(s) concluída(s)`} />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="font-semibold">
                      {dayView === "programadas"
                        ? `Programadas para ${formatDateBr(selectedDate)}`
                        : dayView === "concluidas"
                          ? `Concluídas em ${formatDateBr(selectedDate)}`
                          : `Programadas ou concluídas em ${formatDateBr(selectedDate)}`}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Ao concluir uma OS, informe a data real de execução. Ela passará a aparecer no filtro “OS concluídas no dia”.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => markVisible(true)}
                      disabled={!visibleRows.length}
                      className="gap-1.5"
                    >
                      <Check className="h-3.5 w-3.5" />
                      Concluir visíveis em {formatDateBr(selectedDate)}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => markVisible(false)}
                      disabled={!visibleRows.length}
                    >
                      Reabrir visíveis
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_190px_170px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Buscar OS, prédio, atividade..."
                      className="pl-9"
                    />
                  </div>

                  <select
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value as TypeFilter)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="todos">Todos os tipos</option>
                    <option value="Preventiva">Preventivas</option>
                    <option value="Corretiva">Corretivas</option>
                  </select>

                  <select
                    value={teamFilter}
                    onChange={(event) => setTeamFilter(event.target.value)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="todos">Todas as equipes</option>
                    {teams.map((team) => (
                      <option key={team} value={team}>
                        {team}
                      </option>
                    ))}
                  </select>

                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
                  >
                    <option value="todos">Todos os status</option>
                    <option value="concluidas">Já concluídas</option>
                    <option value="programadas">Ainda programadas</option>
                  </select>
                </div>
              </div>

              <div className="max-h-[680px] overflow-auto">
                {visibleRows.length ? (
                  <div className="divide-y divide-border">
                    {visibleRows.map((row) => {
                      const execution = executions[row.id];
                      const completed = Boolean(execution);
                      const movedDay = completed && execution.completedAt !== row.date;

                      return (
                        <div
                          key={row.id}
                          className={`grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[34px_105px_minmax(0,1fr)_165px_190px] ${
                            completed ? "bg-emerald-500/[0.045]" : ""
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => (completed ? reopenRow(row.id) : concludeRow(row))}
                            aria-label={completed ? `Reabrir OS ${row.os}` : `Concluir OS ${row.os}`}
                            className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                              completed
                                ? "border-emerald-500 bg-emerald-500 text-white"
                                : "border-border bg-background hover:border-primary/60"
                            }`}
                          >
                            {completed && <Check className="h-4 w-4" />}
                          </button>

                          <div>
                            <span className="block font-mono text-sm font-semibold text-foreground">{row.os}</span>
                            <span
                              className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                row.activity === "Corretiva"
                                  ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                                  : "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                              }`}
                            >
                              {row.activity}
                            </span>
                          </div>

                          <div className="min-w-0">
                            <span className="block text-sm font-medium text-foreground">
                              {row.name || row.equipment || "Serviço sem denominação"}
                            </span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
                              {maintenanceLocation(row)}
                            </span>
                            {(row.asset || row.sla) && (
                              <span className="mt-1 block text-[11px] text-muted-foreground">
                                {row.asset ? `Ativo ${row.asset}` : ""}
                                {row.asset && row.sla ? " • " : ""}
                                {row.sla ? `SLA ${row.sla}` : ""}
                              </span>
                            )}
                          </div>

                          <div>
                            <span className="block text-xs font-medium text-foreground">{row.team || "Sem equipe"}</span>
                            <span className="mt-1 block text-[11px] text-muted-foreground">
                              Programada: {formatDateBr(row.date)}
                            </span>
                            {movedDay && (
                              <span className="mt-1 block text-[10px] font-medium text-amber-600 dark:text-amber-400">
                                Executada em dia diferente
                              </span>
                            )}
                          </div>

                          <div className="rounded-lg border border-border bg-background/70 p-2.5">
                            {completed ? (
                              <>
                                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Concluída
                                </div>
                                <label className="mt-2 block">
                                  <span className="mb-1 block text-[10px] font-medium text-muted-foreground">
                                    Data real de conclusão
                                  </span>
                                  <Input
                                    type="date"
                                    value={execution.completedAt}
                                    onChange={(event) => updateCompletionDate(row.id, event.target.value)}
                                    className="h-8 text-xs"
                                  />
                                </label>
                                <button
                                  type="button"
                                  onClick={() => reopenRow(row.id)}
                                  className="mt-2 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                                >
                                  Reabrir OS
                                </button>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                                  <CalendarCheck2 className="h-3.5 w-3.5" />
                                  Programada
                                </div>
                                <button
                                  type="button"
                                  onClick={() => concludeRow(row)}
                                  className="mt-2 w-full rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-2 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-500/10 dark:text-emerald-300"
                                >
                                  Concluir em {formatDateBr(selectedDate)}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-6 py-14 text-center">
                    <Filter className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">Nenhuma OS encontrada para estes filtros.</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Confira o dia, o modo “Programadas/Concluídas” ou ajuste os filtros.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <FileDown className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-semibold">Fechamento do dia</h2>
                </div>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  O PDF usa a <strong className="font-semibold text-foreground">data real de conclusão</strong>.
                  Assim, uma OS programada na segunda e concluída na terça entra no relatório de terça.
                </p>

                <div className="mt-5 space-y-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Responsável pelo relatório</span>
                    <Input
                      value={author}
                      onChange={(event) => setAuthor(event.target.value)}
                      placeholder="Nome do responsável"
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Observação do dia</span>
                    <textarea
                      value={dailyNote}
                      onChange={(event) => setDailyNote(event.target.value)}
                      placeholder="Opcional: intercorrências, destaques ou observações gerais"
                      rows={4}
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                  </label>
                </div>

                <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Concluídas em {formatDateBr(selectedDate)}</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight">{completedOnDate.length}</p>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">
                      {reportPreventive} preventivas
                      <br />
                      {reportCorrective} corretivas
                    </p>
                  </div>

                  <div className="mt-4 border-t border-border pt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Programação concluída no mesmo dia</span>
                      <span className="font-semibold text-foreground">{sameDayCompletionRate}%</span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                        style={{ width: `${sameDayCompletionRate}%` }}
                      />
                    </div>
                  </div>
                </div>

                <Button
                  onClick={generatePdf}
                  disabled={!completedOnDate.length || generating}
                  className="mt-5 w-full gap-2"
                >
                  {generating ? (
                    <RefreshCcw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Gerar PDF de {formatDateBr(selectedDate)}
                </Button>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 text-xs leading-5 text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground">
                  <Wrench className="h-4 w-4" />
                  Regra de execução
                </div>
                <p className="mt-2">
                  “Programada” vem automaticamente da planilha. “Concluída” só é registrada quando você confirma a OS
                  e informa a data real da execução.
                </p>
              </section>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  accent = false,
}: {
  label: string;
  value: number;
  detail: string;
  accent?: boolean;
}) {
  return (
    <div className={`rounded-xl border bg-card px-4 py-4 shadow-sm ${accent ? "border-emerald-500/30" : "border-border"}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-1.5 text-2xl font-semibold tracking-tight ${
          accent ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-foreground">{value}</p>
    </div>
  );
}

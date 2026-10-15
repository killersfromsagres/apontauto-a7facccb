import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  ClipboardList,
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

const ROWS_KEY = "apontauto:relatorio-diario:programacao:v1";
const TARGET_KEY = "apontauto:relatorio-diario:meta-equipe:v2";
const AUTHOR_KEY = "apontauto:relatorio-diario:responsavel:v1";
const NOTE_KEY = "apontauto:relatorio-diario:observacao-programacao:v1";

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
  if (row.planningOrigin === "planilha-semanal") return "Programado • planilha";
  if (row.programmedCorrective) return "Programado";
  return "Sugestão de encaixe";
};

export function WeeklyProgrammingBoard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ScheduledMaintenance[]>([]);
  const [portfolio, setPortfolio] = useState<WeeklyCorrectiveSourceRow[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [targetPerTeam, setTargetPerTeam] = useState(2);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState("todos");
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [importing, setImporting] = useState(false);
  const [committing, setCommitting] = useState(false);
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

  useEffect(() => {
    const storedRows = mergeSchedules([], safeRead<ScheduledMaintenance[]>(ROWS_KEY, []));
    setRows(storedRows);
    const storedTarget = Number(window.localStorage.getItem(TARGET_KEY) ?? "2");
    setTargetPerTeam(Number.isFinite(storedTarget) ? Math.min(10, Math.max(1, storedTarget)) : 2);
    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");
    setNote(window.localStorage.getItem(NOTE_KEY) ?? "");
    void loadPortfolio(false);
  }, [loadPortfolio]);

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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadPortfolio]);

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
    () => planning.rows.filter((row) => row.date === selectedDate),
    [planning.rows, selectedDate],
  );

  const teams = useMemo(
    () => Array.from(new Set(dayRows.map((row) => row.team || "Sem equipe"))).sort((a, b) => a.localeCompare(b, "pt-BR")),
    [dayRows],
  );

  const visibleRows = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("pt-BR");
    return dayRows
      .filter((row) => teamFilter === "todos" || (row.team || "Sem equipe") === teamFilter)
      .filter((row) => {
        if (!q) return true;
        return [row.os, row.name, row.team, row.building, row.floor, row.space, row.asset, row.equipment]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(q);
      })
      .sort(
        (a, b) =>
          maintenanceAreaRank(a.area) - maintenanceAreaRank(b.area) ||
          a.team.localeCompare(b.team, "pt-BR") ||
          a.activity.localeCompare(b.activity) ||
          a.os.localeCompare(b.os),
      );
  }, [dayRows, search, teamFilter]);

  const suggestedRows = useMemo(
    () => planning.rows.filter((row) => row.supplementalCorrective && !row.programmedCorrective),
    [planning.rows],
  );

  const teamSummary = useMemo(() => {
    const grouped = new Map<string, { total: number; programmed: number; suggested: number }>();
    planning.rows
      .filter((row) => row.activity === "Corretiva")
      .forEach((row) => {
        const key = row.team || "Sem equipe";
        const current = grouped.get(key) ?? { total: 0, programmed: 0, suggested: 0 };
        current.total += 1;
        if (row.programmedCorrective || row.planningOrigin === "planilha-semanal") current.programmed += 1;
        if (row.supplementalCorrective && !row.programmedCorrective) current.suggested += 1;
        grouped.set(key, current);
      });
    return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  }, [planning.rows]);

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

    if (!entries.length) {
      toast.error("As sugestões não possuem identificadores válidos para programação.");
      return;
    }

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

  function clearImportedBase() {
    if (!window.confirm("Limpar somente as planilhas semanais importadas desta tela? As corretivas já programadas no banco não serão alteradas.")) return;
    setRows([]);
    window.localStorage.removeItem(ROWS_KEY);
    toast.success("Programação importada removida desta tela.");
  }

  async function generatePdf() {
    if (!selectedDate) return;
    if (suggestedRows.length) {
      toast.warning("Confirme os encaixes como Programado antes de gerar o PDF para o cliente.");
      return;
    }

    const pdfRows = planning.rows.filter((row) => row.date === selectedDate);
    if (!pdfRows.length) return toast.error("Não há programação para este dia.");

    setGenerating(true);
    try {
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const width = doc.internal.pageSize.getWidth();
      const margin = 12;
      doc.setFillColor(15, 23, 42);
      doc.rect(0, 0, width, 27, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("PROGRAMAÇÃO DIÁRIA DE MANUTENÇÃO", margin, 11);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`${formatWeekdayBr(selectedDate)} • ${formatDateBr(selectedDate)}`, margin, 18);
      doc.text(`Meta de encaixe: até ${targetPerTeam} corretiva(s) por equipe/dia`, width - margin, 18, { align: "right" });

      const correctives = pdfRows.filter((row) => row.activity === "Corretiva").length;
      const preventives = pdfRows.filter((row) => row.activity === "Preventiva").length;
      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(`${pdfRows.length} OS programadas`, margin, 36);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`${preventives} preventivas • ${correctives} corretivas`, margin, 42);
      if (author.trim()) doc.text(`Responsável: ${author.trim()}`, margin, 48);
      if (note.trim()) doc.text(`Observação: ${note.trim()}`, margin, author.trim() ? 54 : 48, { maxWidth: width - margin * 2 });

      autoTable(doc, {
        startY: note.trim() ? 60 : author.trim() ? 54 : 49,
        margin: { left: margin, right: margin },
        head: [["OS", "Tipo", "Equipe", "Status", "Local", "Serviço", "Ativo", "SLA"]],
        body: pdfRows.map((row) => [
          row.os,
          row.activity,
          row.team || "—",
          "PROGRAMADO",
          locationLabel(row),
          row.name || row.equipment || "—",
          row.asset || "—",
          row.sla ? formatDateBr(row.sla) : "—",
        ]),
        theme: "grid",
        styles: { fontSize: 7, cellPadding: 1.6, valign: "middle" },
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
        didParseCell: (cell) => {
          if (cell.section !== "body") return;
          const row = pdfRows[cell.row.index];
          if (!row) return;
          const hex = equipeHex(row.team).replace("#", "");
          const rgb = [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16) || 148);
          cell.cell.styles.fillColor = rgb.map((value) => Math.round(255 - (255 - value) * 0.07)) as [number, number, number];
        },
      });

      doc.setProperties({
        title: `Programação de Manutenção - ${formatDateBr(selectedDate)}`,
        subject: "Programação diária de manutenção",
        author: author.trim() || "ApontAuto",
      });
      doc.save(`PROGRAMACAO_MANUTENCAO_${selectedDate}.pdf`);
      toast.success("PDF da programação gerado.");
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setGenerating(false);
    }
  }

  const selectedSummary = planning.days.find((day) => day.date === selectedDate);
  const hasSchedule = rows.length > 0;

  return (
    <main className="mx-auto w-full max-w-[1540px] space-y-5 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="bg-slate-950 px-5 py-6 text-white sm:px-7">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-300">Programação para o cliente</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Relatório Diário • Programação + Encaixes</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-300">
                Consolida as planilhas da semana e distribui corretivas pendentes por equipe. As sugestões só viram Programado após sua confirmação.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void loadPortfolio(true)} disabled={loadingPortfolio} className="gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                <RefreshCcw className={`h-4 w-4 ${loadingPortfolio ? "animate-spin" : ""}`} /> Atualizar carteira
              </Button>
              {hasSchedule && (
                <Button variant="outline" onClick={clearImportedBase} className="gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                  <Trash2 className="h-4 w-4" /> Limpar planilhas
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.25fr)_420px] sm:p-6">
          <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden" onChange={(event) => void handleFiles(event.target.files)} />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(event) => { event.preventDefault(); setDragging(false); void handleFiles(event.dataTransfer.files); }}
            className={`flex min-h-[165px] items-center gap-4 rounded-2xl border border-dashed p-5 text-left transition-all ${dragging ? "border-sky-500 bg-sky-500/5" : "border-border bg-muted/15 hover:bg-muted/30"}`}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
              {importing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            </span>
            <span>
              <span className="block font-semibold">{hasSchedule ? "Atualizar planilhas da semana" : "Importar planilhas da programação semanal"}</span>
              <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">O sistema usa os dias das planilhas e completa a agenda com chamados corretivos ainda pendentes.</span>
            </span>
          </button>

          <div className="rounded-2xl border border-border bg-background/70 p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-sky-500" />
              <h2 className="text-sm font-semibold">Meta de encaixe</h2>
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Quantidade desejada de corretivas por equipe em cada dia. Não há limite de 2; você pode trabalhar com até 10.</p>
            <div className="mt-3 flex items-center gap-3">
              <Input type="number" min={1} max={10} value={targetPerTeam} onChange={(event) => setTargetPerTeam(Math.min(10, Math.max(1, Number(event.target.value) || 1)))} className="w-24" />
              <span className="text-sm font-medium">corretivas / equipe / dia</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <Stat label="Disponíveis" value={planning.candidateCount} />
              <Stat label="Já programadas" value={planning.programmedCount} />
              <Stat label="Sugestões novas" value={planning.suggestedCount} />
              <Stat label="Encaixes na semana" value={planning.supplementalCount} />
            </div>
          </div>
        </div>
      </section>

      {!hasSchedule ? (
        <section className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <FileSpreadsheet className="mx-auto h-8 w-8 text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Importe as planilhas da semana</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm text-muted-foreground">Os encaixes dependem do período e dos dias definidos nas planilhas semanais.</p>
          <Button className="mt-5 gap-2" onClick={() => inputRef.current?.click()}><Upload className="h-4 w-4" /> Selecionar planilhas</Button>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {planning.days.map((day) => (
                  <button key={day.date} type="button" onClick={() => setSelectedDate(day.date)} className={`min-w-[132px] rounded-xl border px-3 py-2 text-left ${day.date === selectedDate ? "border-slate-800 bg-slate-950 text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-950" : "border-border bg-background hover:bg-muted/40"}`}>
                    <span className="block text-[10px] font-semibold uppercase">{formatWeekdayBr(day.date, true)}</span>
                    <span className="mt-0.5 block text-sm font-semibold">{formatDateBr(day.date)}</span>
                    <span className="mt-1 block text-[10px] opacity-75">{day.corrective} corretivas • {day.preventive} preventivas</span>
                    {day.suggestedCorrective > 0 && <span className="mt-1 block text-[10px] font-semibold text-amber-300">{day.suggestedCorrective} aguardando confirmação</span>}
                  </button>
                ))}
              </div>

              <Button onClick={() => void confirmSuggestedProgramming()} disabled={committing || !suggestedRows.length} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700">
                {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {suggestedRows.length ? `Programar ${suggestedRows.length} encaixe(s)` : "Encaixes programados"}
              </Button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
              {teamSummary.map(([team, summary]) => (
                <span key={team} className="rounded-full border border-border bg-background px-3 py-1.5 text-[11px]">
                  <strong>{team}</strong> • {summary.total} corretivas{summary.suggested ? ` • ${summary.suggested} sugestão` : ""}
                </span>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border p-4 sm:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="font-semibold">Programação de {formatDateBr(selectedDate)}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Planilha semanal + corretivas já programadas + sugestões de encaixe.</p>
                  </div>
                  <div className="flex gap-2">
                    <div className="relative min-w-[220px]">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar OS, serviço, local..." className="pl-9" />
                    </div>
                    <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
                      <option value="todos">Todas equipes</option>
                      {teams.map((team) => <option key={team} value={team}>{team}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="max-h-[760px] overflow-auto">
                {visibleRows.length ? (
                  <div className="divide-y divide-border">
                    {visibleRows.map((row) => (
                      <div key={row.id} className="grid gap-3 p-4 lg:grid-cols-[92px_160px_minmax(0,1fr)_180px]" style={{ borderLeft: `3px solid ${equipeHex(row.team)}` }}>
                        <div>
                          <p className="font-mono text-sm font-semibold">{row.os}</p>
                          <p className="mt-1 text-[10px] font-semibold uppercase text-muted-foreground">{row.activity}</p>
                        </div>
                        <div>
                          <p className="text-xs font-semibold">{row.team || "Sem equipe"}</p>
                          <p className="mt-1 text-[10px] text-muted-foreground">{row.area}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{row.name || row.equipment || "Serviço sem descrição"}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{locationLabel(row)}</p>
                          {row.sla && <p className="mt-1 text-[10px] text-muted-foreground">SLA: {formatDateBr(row.sla)}</p>}
                        </div>
                        <div>
                          <StatusBadge row={row} />
                          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">{planningStatus(row)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-10 text-center text-sm text-muted-foreground">Nenhuma OS encontrada com estes filtros.</div>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <h2 className="font-semibold">Resumo do dia</h2>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <Stat label="Total" value={selectedSummary?.total ?? 0} />
                  <Stat label="Corretivas" value={selectedSummary?.corrective ?? 0} />
                  <Stat label="Preventivas" value={selectedSummary?.preventive ?? 0} />
                  <Stat label="Programadas banco" value={selectedSummary?.programmedCorrective ?? 0} />
                </div>
                <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3 text-xs leading-5 text-muted-foreground">
                  A meta conta também as corretivas que já vieram na planilha. Se uma equipe já tiver a quantidade desejada, o sistema não cria encaixe extra desnecessário.
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2"><ClipboardList className="h-4 w-4 text-muted-foreground" /><h2 className="font-semibold">PDF cliente</h2></div>
                <label className="mt-4 block text-xs font-medium text-muted-foreground">Responsável</label>
                <Input className="mt-1.5" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Nome do responsável" />
                <label className="mt-4 block text-xs font-medium text-muted-foreground">Observação</label>
                <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={3} className="mt-1.5 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm" placeholder="Observações da programação" />
                {suggestedRows.length > 0 && (
                  <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-500/5 p-2.5 text-[11px] leading-4 text-amber-700 dark:text-amber-300">Confirme os encaixes como Programado antes de emitir o PDF.</p>
                )}
                <Button onClick={() => void generatePdf()} disabled={generating || suggestedRows.length > 0} className="mt-4 w-full gap-2">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar programação do dia
                </Button>
              </section>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function StatusBadge({ row }: { row: WeeklyPlanningRow }) {
  if (row.planningOrigin === "planilha-semanal") {
    return <span className="inline-flex rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-1 text-[10px] font-semibold text-sky-700 dark:text-sky-300">PROGRAMADO • PLANILHA</span>;
  }
  if (row.programmedCorrective) {
    return <span className="inline-flex rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">PROGRAMADO</span>;
  }
  return <span className="inline-flex rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">SUGESTÃO DE ENCAIXE</span>;
}

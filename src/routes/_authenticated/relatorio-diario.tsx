import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
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
  mergeSchedules,
  parseScheduleFile,
  type MaintenanceType,
  type ScheduledMaintenance,
} from "@/features/relatorio-diario/lib/daily-maintenance";

export const Route = createFileRoute("/_authenticated/relatorio-diario")({
  component: DailyMaintenanceReport,
});

const ROWS_KEY = "apontauto:relatorio-diario:programacao:v1";
const DONE_KEY = "apontauto:relatorio-diario:realizadas:v1";
const AUTHOR_KEY = "apontauto:relatorio-diario:responsavel:v1";

type DoneMap = Record<string, boolean>;
type StatusFilter = "todos" | "realizadas" | "pendentes";
type TypeFilter = "todos" | MaintenanceType;

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

function DailyMaintenanceReport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ScheduledMaintenance[]>([]);
  const [done, setDone] = useState<DoneMap>({});
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [teamFilter, setTeamFilter] = useState("todos");
  const [author, setAuthor] = useState("");
  const [dailyNote, setDailyNote] = useState("");
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    setRows(safeRead(ROWS_KEY, []));
    setDone(safeRead(DONE_KEY, {}));
    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(ROWS_KEY, JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(DONE_KEY, JSON.stringify(done));
  }, [done]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(AUTHOR_KEY, author);
  }, [author]);

  const dates = useMemo(() => Array.from(new Set(rows.map((row) => row.date))).sort(), [rows]);
  const dayRows = useMemo(() => rows.filter((row) => row.date === selectedDate), [rows, selectedDate]);
  const teams = useMemo(
    () => Array.from(new Set(dayRows.map((row) => row.team || "Sem equipe"))).sort(),
    [dayRows],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return dayRows.filter((row) => {
      if (typeFilter !== "todos" && row.activity !== typeFilter) return false;
      if (teamFilter !== "todos" && (row.team || "Sem equipe") !== teamFilter) return false;
      const completed = Boolean(done[row.id]);
      if (statusFilter === "realizadas" && !completed) return false;
      if (statusFilter === "pendentes" && completed) return false;
      if (!query) return true;
      return [row.os, row.name, row.building, row.floor, row.space, row.team, row.asset, row.equipment]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(query);
    });
  }, [dayRows, done, search, statusFilter, teamFilter, typeFilter]);

  const completedRows = useMemo(() => dayRows.filter((row) => done[row.id]), [dayRows, done]);
  const preventiveDone = completedRows.filter((row) => row.activity === "Preventiva").length;
  const correctiveDone = completedRows.filter((row) => row.activity === "Corretiva").length;
  const completionRate = dayRows.length ? Math.round((completedRows.length / dayRows.length) * 100) : 0;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const accepted = Array.from(files).filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    if (!accepted.length) {
      toast.error("Selecione arquivos Excel .xlsx ou .xls.");
      return;
    }

    setImporting(true);
    try {
      const results = await Promise.all(accepted.map(parseScheduleFile));
      const imported = results.flatMap((result) => result.rows);
      if (!imported.length) throw new Error("Nenhuma OS de Preventiva ou Corretiva foi encontrada nas abas de programação.");

      setRows((current) => mergeSchedules(current, imported));
      const importedDates = Array.from(new Set(imported.map((row) => row.date))).sort();
      if (!importedDates.includes(selectedDate) && importedDates.length) setSelectedDate(importedDates[0]);
      toast.success(`${imported.length} registros lidos de ${accepted.length} planilha(s).`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar a programação.");
    } finally {
      setImporting(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function toggleDone(id: string) {
    setDone((current) => ({ ...current, [id]: !current[id] }));
  }

  function markVisible(value: boolean) {
    setDone((current) => {
      const next = { ...current };
      visibleRows.forEach((row) => {
        if (value) next[row.id] = true;
        else delete next[row.id];
      });
      return next;
    });
  }

  function clearBase() {
    if (!window.confirm("Remover a programação importada e todas as confirmações de execução?")) return;
    setRows([]);
    setDone({});
    setSearch("");
    setTeamFilter("todos");
    setTypeFilter("todos");
    setStatusFilter("todos");
    window.localStorage.removeItem(ROWS_KEY);
    window.localStorage.removeItem(DONE_KEY);
    toast.success("Base importada removida.");
  }

  async function generatePdf() {
    if (!completedRows.length) {
      toast.error("Marque ao menos uma OS como realizada para gerar o relatório.");
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
      doc.text(`Execuções confirmadas • ${titleDate}`, margin, 21);
      doc.text("Preventivas e corretivas programadas", margin, 26);

      doc.setTextColor(17, 24, 39);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(String(completedRows.length), margin, 44);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("REALIZADAS", margin, 49);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(String(preventiveDone), 51, 44);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("PREVENTIVAS", 51, 49);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(String(correctiveDone), 88, 44);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("CORRETIVAS", 88, 49);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text(`${completionRate}%`, 125, 44);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("DA PROGRAMAÇÃO DO DIA", 125, 49);

      const reportTeams = Array.from(new Set(completedRows.map((row) => row.team || "Sem equipe"))).sort();
      doc.setFontSize(8.5);
      doc.setTextColor(75, 85, 99);
      doc.text(`Equipes: ${reportTeams.join(" • ")}`, margin, 57, { maxWidth: width - margin * 2 });
      if (author.trim()) doc.text(`Responsável pelo relatório: ${author.trim()}`, margin, 62);
      if (dailyNote.trim()) doc.text(`Observação do dia: ${dailyNote.trim()}`, margin, author.trim() ? 67 : 62, { maxWidth: width - margin * 2 });

      const sorted = [...completedRows].sort((a, b) =>
        a.activity.localeCompare(b.activity) || a.team.localeCompare(b.team) || a.os.localeCompare(b.os),
      );

      autoTable(doc, {
        startY: dailyNote.trim() ? 73 : author.trim() ? 68 : 64,
        margin: { left: margin, right: margin, bottom: 18 },
        head: [["OS", "Tipo", "Equipe", "Local", "Serviço / Denominação", "SLA", "Ativo"]],
        body: sorted.map((row) => [
          row.os,
          row.activity,
          row.team || "—",
          maintenanceLocation(row),
          row.name || row.equipment || "—",
          row.sla || "—",
          row.asset || "—",
        ]),
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 7.2,
          cellPadding: 2.4,
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
          fontSize: 7.4,
        },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        columnStyles: {
          0: { cellWidth: 22, fontStyle: "bold" },
          1: { cellWidth: 23 },
          2: { cellWidth: 31 },
          3: { cellWidth: 48 },
          4: { cellWidth: 91 },
          5: { cellWidth: 23 },
          6: { cellWidth: 30 },
        },
        didDrawPage: () => {
          const page = doc.getNumberOfPages();
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, height - 12, width - margin, height - 12);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7.2);
          doc.setTextColor(100, 116, 139);
          doc.text("Fontes: programações importadas e confirmações de execução registradas no sistema.", margin, height - 7);
          doc.text(`Página ${page}`, width - margin, height - 7, { align: "right" });
        },
      });

      doc.setProperties({
        title: `Relatório Diário de Manutenção - ${titleDate}`,
        subject: "Preventivas e corretivas realizadas",
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

  return (
    <main className="mx-auto w-full max-w-[1480px] space-y-5 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
      <section className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 border-b border-border px-5 py-5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <ClipboardCheck className="h-4 w-4" />
              Controle diário de execução
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Relatório Diário de Manutenção</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Importe as programações do mês, selecione o dia e confirme somente as OS realmente executadas. O PDF é montado com preventivas e corretivas realizadas.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls"
              multiple
              className="hidden"
              onChange={(event) => handleFiles(event.target.files)}
            />
            <Button onClick={() => inputRef.current?.click()} disabled={importing} className="gap-2">
              {importing ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {hasBase ? "Adicionar planilhas" : "Importar programação"}
            </Button>
            {hasBase && (
              <Button variant="outline" onClick={clearBase} className="gap-2 text-muted-foreground">
                <Trash2 className="h-4 w-4" />
                Limpar base
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 px-5 py-4 md:grid-cols-[minmax(190px,230px)_1fr] md:items-center">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Data do relatório</span>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="pl-9" />
            </div>
          </label>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span><strong className="font-semibold text-foreground">{rows.length}</strong> registros na base</span>
            <span><strong className="font-semibold text-foreground">{dates.length}</strong> dias identificados</span>
            <span><strong className="font-semibold text-foreground">{new Set(rows.map((row) => row.sourceFile)).size}</strong> arquivos de origem</span>
            <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5" /> Dados mantidos neste navegador</span>
          </div>
        </div>
      </section>

      {!hasBase ? (
        <section className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background">
            <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-base font-semibold">Comece pela programação do mês</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Você pode selecionar várias planilhas de Civil, Elétrica e Refrigeração de uma única vez. O sistema lê a aba “PROGRAMAÇÃO” e ignora abas auxiliares para evitar duplicidade.
          </p>
          <Button className="mt-5 gap-2" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Selecionar planilhas
          </Button>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Programadas" value={dayRows.length} detail="OS previstas no dia" />
            <Metric label="Realizadas" value={completedRows.length} detail={`${completionRate}% da programação`} accent />
            <Metric label="Preventivas" value={preventiveDone} detail="confirmadas" />
            <Metric label="Corretivas" value={correctiveDone} detail="confirmadas" />
            <Metric label="Equipes" value={new Set(completedRows.map((row) => row.team).filter(Boolean)).size} detail="com execução confirmada" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="font-semibold">Programação de {formatDateBr(selectedDate)}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">Marque como realizada apenas após confirmar a execução em campo.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => markVisible(true)} disabled={!visibleRows.length} className="gap-1.5">
                      <Check className="h-3.5 w-3.5" /> Marcar visíveis
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => markVisible(false)} disabled={!visibleRows.length}>Limpar visíveis</Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-[minmax(220px,1fr)_160px_190px_160px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar OS, prédio, atividade..." className="pl-9" />
                  </div>
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <option value="todos">Todos os tipos</option>
                    <option value="Preventiva">Preventivas</option>
                    <option value="Corretiva">Corretivas</option>
                  </select>
                  <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <option value="todos">Todas as equipes</option>
                    {teams.map((team) => <option key={team} value={team}>{team}</option>)}
                  </select>
                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <option value="todos">Todos os status</option>
                    <option value="realizadas">Realizadas</option>
                    <option value="pendentes">Pendentes</option>
                  </select>
                </div>
              </div>

              <div className="max-h-[650px] overflow-auto">
                {visibleRows.length ? (
                  <div className="divide-y divide-border">
                    {visibleRows.map((row) => {
                      const completed = Boolean(done[row.id]);
                      return (
                        <button
                          type="button"
                          key={row.id}
                          onClick={() => toggleDone(row.id)}
                          className={`group grid w-full gap-3 px-4 py-4 text-left transition-colors sm:grid-cols-[28px_100px_minmax(0,1fr)_160px] sm:px-5 ${completed ? "bg-emerald-500/[0.055] hover:bg-emerald-500/[0.085]" : "hover:bg-muted/45"}`}
                        >
                          <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-md border ${completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-border bg-background"}`}>
                            {completed && <Check className="h-4 w-4" />}
                          </span>
                          <span>
                            <span className="block font-mono text-sm font-semibold text-foreground">{row.os}</span>
                            <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${row.activity === "Corretiva" ? "bg-amber-500/10 text-amber-600 dark:text-amber-400" : "bg-sky-500/10 text-sky-600 dark:text-sky-400"}`}>{row.activity}</span>
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-foreground">{row.name || row.equipment || "Serviço sem denominação"}</span>
                            <span className="mt-1 block text-xs leading-5 text-muted-foreground">{maintenanceLocation(row)}</span>
                            {(row.asset || row.sla) && <span className="mt-1 block text-[11px] text-muted-foreground">{row.asset ? `Ativo ${row.asset}` : ""}{row.asset && row.sla ? " • " : ""}{row.sla ? `SLA ${row.sla}` : ""}</span>}
                          </span>
                          <span className="sm:text-right">
                            <span className="block text-xs font-medium text-foreground">{row.team || "Sem equipe"}</span>
                            <span className={`mt-2 inline-flex items-center gap-1 text-[11px] font-semibold ${completed ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                              {completed ? <><CheckCircle2 className="h-3.5 w-3.5" /> Realizada</> : "Pendente de confirmação"}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-6 py-14 text-center">
                    <Filter className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">Nenhuma OS encontrada para estes filtros.</p>
                    <p className="mt-1 text-xs text-muted-foreground">Confira a data selecionada ou ajuste os filtros.</p>
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
                <p className="mt-2 text-xs leading-5 text-muted-foreground">O documento final contém somente as OS marcadas como realizadas.</p>

                <div className="mt-5 space-y-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Responsável pelo relatório</span>
                    <Input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Nome do responsável" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Observação do dia</span>
                    <textarea value={dailyNote} onChange={(event) => setDailyNote(event.target.value)} placeholder="Opcional: intercorrências, destaques ou observações gerais" rows={4} className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20" />
                  </label>
                </div>

                <div className="mt-5 rounded-xl border border-border bg-muted/30 p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Conclusão</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight">{completionRate}%</p>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">{completedRows.length} de {dayRows.length}<br />OS confirmadas</p>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-500 transition-[width] duration-300" style={{ width: `${completionRate}%` }} />
                  </div>
                </div>

                <Button onClick={generatePdf} disabled={!completedRows.length || generating} className="mt-5 w-full gap-2">
                  {generating ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Gerar PDF profissional
                </Button>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 text-xs leading-5 text-muted-foreground">
                <div className="flex items-center gap-2 font-medium text-foreground"><Wrench className="h-4 w-4" /> Regra de execução</div>
                <p className="mt-2">A programação importada indica o que estava previsto. O sistema não considera uma OS realizada automaticamente: a confirmação é manual para evitar reportes incorretos.</p>
              </section>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ label, value, detail, accent = false }: { label: string; value: number; detail: string; accent?: boolean }) {
  return (
    <div className={`rounded-xl border bg-card px-4 py-4 shadow-sm ${accent ? "border-emerald-500/30" : "border-border"}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tracking-tight ${accent ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  ClipboardList,
  Download,
  FileSpreadsheet,
  RefreshCcw,
  Search,
  ShieldCheck,
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
  type MaintenanceArea,
  type MaintenanceType,
  type ScheduledMaintenance,
} from "@/features/relatorio-diario/lib/daily-maintenance";
import { shouldReplaceSchedule } from "@/features/relatorio-diario/lib/corrective-report";
import {
  buildWeeklyPlanning,
  planningWeekDates,
  type WeeklyCorrectiveSourceRow,
  type WeeklyPlanningRow,
} from "@/features/relatorio-diario/lib/weekly-planning";
import { supabase } from "@/integrations/supabase/client";
import { equipeHex, equipeStyles } from "@/lib/corretiva/equipe";

const ROWS_KEY = "apontauto:relatorio-diario:programacao:v1";
const AUTHOR_KEY = "apontauto:relatorio-diario:responsavel:v1";
const NOTE_KEY = "apontauto:relatorio-diario:observacao-programacao:v1";
const MIN_CORRECTIVES_KEY = "apontauto:relatorio-diario:min-corretivas:v1";

type TypeFilter = "todos" | MaintenanceType;
type AreaFilter = "todas" | MaintenanceArea;

type LoadedLogo = {
  data: string;
  ratio: number;
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

const areaBadgeClass = (area: MaintenanceArea) => {
  if (area === "Elétrica") return "border-amber-500/25 bg-amber-500/8 text-amber-700 dark:text-amber-300";
  if (area.startsWith("Refrigeração")) return "border-sky-500/25 bg-sky-500/8 text-sky-700 dark:text-sky-300";
  if (area === "Civil / Hidráulica") return "border-emerald-500/25 bg-emerald-500/8 text-emerald-700 dark:text-emerald-300";
  return "border-border bg-muted/35 text-muted-foreground";
};

const loadLogo = (src: string): Promise<LoadedLogo | null> =>
  new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const context = canvas.getContext("2d");
        if (!context || !image.naturalHeight) return resolve(null);
        context.drawImage(image, 0, 0);
        resolve({
          data: canvas.toDataURL("image/png"),
          ratio: image.naturalWidth / image.naturalHeight,
        });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace("#", "").padEnd(6, "0").slice(0, 6);
  return [
    Number.parseInt(normalized.slice(0, 2), 16) || 148,
    Number.parseInt(normalized.slice(2, 4), 16) || 163,
    Number.parseInt(normalized.slice(4, 6), 16) || 184,
  ];
};

const subtleTeamTint = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex);
  const blend = (value: number) => Math.round(255 - (255 - value) * 0.09);
  return [blend(r), blend(g), blend(b)];
};

const darkTeamText = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex);
  return [Math.round(r * 0.62), Math.round(g * 0.62), Math.round(b * 0.62)];
};

export function WeeklyPlanningReport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ScheduledMaintenance[]>([]);
  const [correctivePortfolio, setCorrectivePortfolio] = useState<WeeklyCorrectiveSourceRow[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("todas");
  const [teamFilter, setTeamFilter] = useState("todos");
  const [minimumCorrectives, setMinimumCorrectives] = useState(1);
  const [author, setAuthor] = useState("");
  const [dailyNote, setDailyNote] = useState("");
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");

  const loadCorrectivePortfolio = useCallback(async (notify = false) => {
    setSyncing(true);
    setSyncError("");
    try {
      const { data, error } = await supabase
        .from("corretiva_os")
        .select(
          "id,numero_os,status,data_programada,data_criacao,data_sla,equipe,nome_os,equipamento,ativo,patrimonio,predio,andar,local,programacao_status,tipo_importacao,updated_at",
        )
        .in("status", ["aberta", "em_andamento"])
        .order("updated_at", { ascending: false })
        .limit(10000);

      if (error) throw error;
      const portfolio = (data ?? []) as WeeklyCorrectiveSourceRow[];
      setCorrectivePortfolio(portfolio);
      if (notify) toast.success(`${portfolio.length} corretiva(s) não concluída(s) sincronizada(s).`);
    } catch (error: any) {
      const message = error?.message || "Não foi possível carregar a carteira de corretivas abertas.";
      setSyncError(message);
      if (notify) toast.error(message);
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    const storedRows = safeRead<ScheduledMaintenance[]>(ROWS_KEY, []);
    const hydratedRows = mergeSchedules([], storedRows);
    setRows(hydratedRows);
    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");
    setDailyNote(window.localStorage.getItem(NOTE_KEY) ?? "");
    const storedMinimum = Number(window.localStorage.getItem(MIN_CORRECTIVES_KEY) ?? "1");
    setMinimumCorrectives(Number.isFinite(storedMinimum) ? Math.min(5, Math.max(1, storedMinimum)) : 1);
    void loadCorrectivePortfolio(false);
  }, [loadCorrectivePortfolio]);

  useEffect(() => {
    const channel = supabase
      .channel("relatorio-diario-programacao-corretivas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "corretiva_os" },
        () => void loadCorrectivePortfolio(false),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadCorrectivePortfolio]);

  useEffect(() => {
    window.localStorage.setItem(ROWS_KEY, JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    window.localStorage.setItem(AUTHOR_KEY, author);
  }, [author]);

  useEffect(() => {
    window.localStorage.setItem(NOTE_KEY, dailyNote);
  }, [dailyNote]);

  useEffect(() => {
    window.localStorage.setItem(MIN_CORRECTIVES_KEY, String(minimumCorrectives));
  }, [minimumCorrectives]);

  const planning = useMemo(
    () =>
      buildWeeklyPlanning({
        scheduledRows: rows,
        correctiveRows: correctivePortfolio,
        minimumCorrectivesPerDay: minimumCorrectives,
      }),
    [correctivePortfolio, minimumCorrectives, rows],
  );

  const dates = useMemo(() => planning.days.map((day) => day.date), [planning.days]);

  useEffect(() => {
    if (!dates.length || dates.includes(selectedDate)) return;
    const today = todayIso();
    setSelectedDate(dates.includes(today) ? today : dates[0]);
  }, [dates, selectedDate]);

  const selectedDay = planning.days.find((day) => day.date === selectedDate);
  const dayRows = useMemo(
    () => planning.rows.filter((row) => row.date === selectedDate),
    [planning.rows, selectedDate],
  );

  const teams = useMemo(
    () => Array.from(new Set(dayRows.map((row) => row.team || "Sem equipe"))).sort(),
    [dayRows],
  );

  const areas = useMemo(
    () =>
      Array.from(new Set(dayRows.map((row) => row.area))).sort(
        (a, b) => maintenanceAreaRank(a) - maintenanceAreaRank(b),
      ),
    [dayRows],
  );

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return dayRows.filter((row) => {
      if (typeFilter !== "todos" && row.activity !== typeFilter) return false;
      if (areaFilter !== "todas" && row.area !== areaFilter) return false;
      if (teamFilter !== "todos" && (row.team || "Sem equipe") !== teamFilter) return false;
      if (!query) return true;
      return [
        row.os,
        row.name,
        row.building,
        row.floor,
        row.space,
        row.team,
        row.area,
        row.asset,
        row.equipment,
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(query);
    });
  }, [areaFilter, dayRows, search, teamFilter, typeFilter]);

  const groupedRows = useMemo(() => {
    const groups = new Map<MaintenanceArea, WeeklyPlanningRow[]>();
    visibleRows.forEach((row) => {
      const current = groups.get(row.area) ?? [];
      current.push(row);
      groups.set(row.area, current);
    });
    return Array.from(groups.entries()).sort(
      ([a], [b]) => maintenanceAreaRank(a) - maintenanceAreaRank(b),
    );
  }, [visibleRows]);

  const sourceSummaries = useMemo(() => {
    const grouped = new Map<string, ScheduledMaintenance[]>();
    rows.forEach((row) => {
      const current = grouped.get(row.sourceFile) ?? [];
      current.push(row);
      grouped.set(row.sourceFile, current);
    });
    return Array.from(grouped.entries())
      .map(([fileName, sourceRows]) => ({
        fileName,
        records: sourceRows.length,
        preventive: sourceRows.filter((row) => row.activity === "Preventiva").length,
        corrective: sourceRows.filter((row) => row.activity === "Corretiva").length,
      }))
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
  }, [rows]);

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || !files.length) return;
    const selectedFiles = Array.from(files);
    const accepted = selectedFiles.filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    if (!accepted.length) return toast.error("Selecione planilhas Excel .xlsx ou .xls.");

    setImporting(true);
    try {
      const settled = await Promise.allSettled(accepted.map(parseScheduleFile));
      const successful = settled.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const imported = successful.flatMap((result) => result.rows);
      const failures = settled.length - successful.length;

      if (!imported.length) {
        throw new Error("Nenhuma OS de Preventiva ou Corretiva foi encontrada nas planilhas selecionadas.");
      }

      const incomingWeek = planningWeekDates(imported);
      setRows((current) =>
        shouldReplaceSchedule(current, imported)
          ? mergeSchedules([], imported)
          : mergeSchedules(current, imported),
      );
      setSelectedDate(incomingWeek.includes(todayIso()) ? todayIso() : incomingWeek[0] || imported[0].date);
      setSearch("");
      setTypeFilter("todos");
      setAreaFilter("todas");
      setTeamFilter("todos");

      const warningCount = successful.reduce((total, result) => total + result.warnings.length, 0);
      const message = `${successful.length} planilha(s) • ${imported.length} OS programadas • ${incomingWeek.length} dia(s) útil(eis).`;
      if (failures || warningCount) toast.warning(`${message} Há ${failures + warningCount} aviso(s) para revisar.`);
      else toast.success(message);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar as programações.");
    } finally {
      setImporting(false);
      setDragging(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function clearBase() {
    if (!window.confirm("Remover as planilhas da programação semanal deste relatório?")) return;
    setRows([]);
    setSearch("");
    setTypeFilter("todos");
    setAreaFilter("todas");
    setTeamFilter("todos");
    window.localStorage.removeItem(ROWS_KEY);
    toast.success("Programação semanal removida do relatório.");
  }

  async function generatePdf() {
    if (!dayRows.length) return toast.error("Não há OS programadas para esta data.");
    setGenerating(true);
    try {
      const titleDate = formatDateBr(selectedDate);
      const preventive = dayRows.filter((row) => row.activity === "Preventiva").length;
      const corrective = dayRows.filter((row) => row.activity === "Corretiva").length;
      const supplemental = dayRows.filter((row) => row.supplementalCorrective).length;
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      const margin = 14;
      const [gpsLogo, swLogo] = await Promise.all([
        loadLogo("/logos/gps-logo.png"),
        loadLogo("/logos/sw-logo.png"),
      ]);

      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, width, 29, "F");
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, 28, width - margin, 28);

      if (gpsLogo) {
        const logoHeight = 9;
        doc.addImage(gpsLogo.data, "PNG", margin, 8, Math.min(34, logoHeight * gpsLogo.ratio), logoHeight);
      }
      if (swLogo) {
        const logoHeight = 10;
        const logoWidth = Math.min(37, logoHeight * swLogo.ratio);
        doc.addImage(swLogo.data, "PNG", width - margin - logoWidth, 7, logoWidth, logoHeight);
      }

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("PROGRAMAÇÃO DIÁRIA DE MANUTENÇÃO", width / 2, 12, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Grupo GPS • Sherwin-Williams • Planejamento previsto para ${titleDate}`, width / 2, 19, {
        align: "center",
      });

      const kpis = [
        { x: margin, value: dayRows.length, label: "PROGRAMADAS" },
        { x: 47, value: preventive, label: "PREVENTIVAS" },
        { x: 78, value: corrective, label: "CORRETIVAS" },
        { x: 109, value: supplemental, label: "COMPLEMENTARES" },
      ];
      kpis.forEach((kpi) => {
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(17);
        doc.text(String(kpi.value), kpi.x, 40);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.8);
        doc.text(kpi.label, kpi.x, 45);
      });

      if (author.trim()) {
        doc.setFontSize(8.2);
        doc.setTextColor(71, 85, 105);
        doc.text(`Responsável: ${author.trim()}`, margin, 53);
      }
      if (dailyNote.trim()) {
        doc.setFontSize(8.2);
        doc.setTextColor(71, 85, 105);
        doc.text(`Observação: ${dailyNote.trim()}`, margin, author.trim() ? 58 : 53, {
          maxWidth: width - margin * 2,
        });
      }

      const sorted = [...dayRows].sort(
        (a, b) =>
          maintenanceAreaRank(a.area) - maintenanceAreaRank(b.area) ||
          a.team.localeCompare(b.team) ||
          a.activity.localeCompare(b.activity) ||
          a.os.localeCompare(b.os),
      );

      autoTable(doc, {
        startY: dailyNote.trim() ? 64 : author.trim() ? 59 : 53,
        margin: { left: margin, right: margin, bottom: 18 },
        head: [["OS", "Tipo", "Área", "Equipe", "Origem", "Local", "Serviço / Denominação", "SLA", "Ativo"]],
        body: sorted.map((row) => [
          row.os,
          row.activity,
          row.area,
          row.team || "—",
          row.supplementalCorrective ? "Corretiva complementar" : "Planilha semanal",
          maintenanceLocation(row),
          row.name || row.equipment || "—",
          row.sla ? formatDateBr(row.sla) : "—",
          row.asset || "—",
        ]),
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 7,
          cellPadding: 1.6,
          lineColor: [226, 232, 240],
          lineWidth: 0.15,
          textColor: [31, 41, 55],
          overflow: "linebreak",
          valign: "middle",
        },
        headStyles: {
          fillColor: [15, 23, 42],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 7,
        },
        columnStyles: {
          0: { cellWidth: 16, fontStyle: "bold" },
          1: { cellWidth: 18 },
          2: { cellWidth: 27 },
          3: { cellWidth: 28 },
          4: { cellWidth: 32 },
          5: { cellWidth: 43 },
          6: { cellWidth: width - margin * 2 - 207 },
          7: { cellWidth: 19 },
          8: { cellWidth: 24 },
        },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const row = sorted[data.row.index];
          if (!row) return;
          const color = equipeHex(row.team);
          data.cell.styles.fillColor = subtleTeamTint(color);
          if (data.column.index === 3) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = darkTeamText(color);
          }
        },
        didDrawPage: () => {
          const page = doc.getNumberOfPages();
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, height - 12, width - margin, height - 12);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text("Programação prevista; sujeita a ajustes operacionais de campo.", margin, height - 7);
          doc.text(`Página ${page}`, width - margin, height - 7, { align: "right" });
        },
      });

      doc.setProperties({
        title: `Programação Diária de Manutenção - ${titleDate}`,
        subject: "Programação prevista de manutenção",
        author: author.trim() || "Grupo GPS / Sherwin-Williams",
        creator: "ApontAuto",
      });
      doc.save(`PROGRAMACAO_DIARIA_MANUTENCAO_${selectedDate}.pdf`);
      toast.success(`Programação de ${titleDate} gerada com ${dayRows.length} OS.`);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar a programação em PDF.");
    } finally {
      setGenerating(false);
    }
  }

  const hasBase = rows.length > 0;

  return (
    <main className="mx-auto w-full max-w-[1540px] space-y-5 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="bg-slate-950 px-5 py-6 text-white sm:px-6 lg:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/10 sm:flex">
                <CalendarRange className="h-7 w-7 text-sky-300" />
              </div>
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-300">
                  Planejamento semanal • comunicação com o cliente
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Programação Diária de Manutenção
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
                  Mostra o que está programado nas planilhas da semana. Quando um dia fica sem corretivas,
                  o sistema encaixa chamados abertos disponíveis para manter uma programação equilibrada.
                </p>
              </div>
            </div>

            {hasBase && (
              <Button
                variant="outline"
                onClick={clearBase}
                className="shrink-0 gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Trash2 className="h-4 w-4" /> Limpar semana
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(340px,0.75fr)] sm:p-6">
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
            className={`flex min-h-[164px] items-center gap-4 rounded-2xl border border-dashed px-5 py-5 text-left transition-all ${
              dragging
                ? "border-sky-500 bg-sky-500/5 shadow-[0_0_0_4px_rgba(14,165,233,0.08)]"
                : "border-border bg-muted/15 hover:border-slate-400 hover:bg-muted/30"
            }`}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background shadow-sm">
              {importing ? <RefreshCcw className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            </span>
            <span>
              <span className="block text-base font-semibold text-foreground">
                {importing ? "Lendo a programação semanal..." : hasBase ? "Atualizar planilhas da semana" : "Anexar planilhas da semana"}
              </span>
              <span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
                O sistema lê os blocos de segunda a sexta, preserva Preventivas e Corretivas da planilha
                e complementa somente os dias que precisam de mais corretivas.
              </span>
              <span className="mt-3 inline-flex rounded-lg bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-950">
                Selecionar planilhas
              </span>
            </span>
          </button>

          <div className="rounded-2xl border border-border bg-background/60 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Carteira para encaixe</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{planning.candidateCount} corretivas disponíveis</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">
                  Somente abertas e não reservadas. Concluídas, canceladas e Backorder Mensal ficam fora.
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <MiniStat label="Planilhas" value={sourceSummaries.length} />
              <MiniStat label="OS da semana" value={rows.length} />
              <MiniStat label="Encaixes" value={planning.supplementalCount} />
              <MiniStat label="Dias úteis" value={planning.days.length} />
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadCorrectivePortfolio(true)}
              disabled={syncing}
              className="mt-3 w-full gap-2"
            >
              <RefreshCcw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              Atualizar carteira de corretivas
            </Button>
            {syncError && <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">{syncError}</p>}
          </div>
        </div>
      </section>

      {!hasBase ? (
        <section className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-14 text-center">
          <FileSpreadsheet className="mx-auto h-7 w-7 text-muted-foreground" />
          <h2 className="mt-4 text-base font-semibold">Carregue a programação da semana</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Esta tela agora informa somente o planejamento. Conclusões e execução em campo não fazem parte do relatório do cliente.
          </p>
          <Button className="mt-5 gap-2" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Selecionar planilhas
          </Button>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="grid gap-4 xl:grid-cols-[220px_230px_minmax(0,1fr)] xl:items-end">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Dia a informar ao cliente</span>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="pl-9" />
                </div>
              </label>

              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Mínimo de corretivas por dia</span>
                <select
                  value={minimumCorrectives}
                  onChange={(event) => setMinimumCorrectives(Number(event.target.value))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                >
                  {[1, 2, 3, 4, 5].map((value) => (
                    <option key={value} value={value}>{value} corretiva{value === 1 ? "" : "s"}</option>
                  ))}
                </select>
              </label>

              <div className="min-w-0">
                <span className="text-xs font-medium text-muted-foreground">Semana da programação</span>
                <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
                  {planning.days.map((day) => {
                    const active = day.date === selectedDate;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => setSelectedDate(day.date)}
                        className={`min-w-[150px] shrink-0 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                          active
                            ? "border-slate-700 bg-slate-950 text-white dark:border-slate-300 dark:bg-slate-100 dark:text-slate-950"
                            : "border-border bg-background hover:bg-muted/45"
                        }`}
                      >
                        <span className={`block text-[10px] font-semibold uppercase tracking-wide ${active ? "text-slate-300 dark:text-slate-600" : "text-muted-foreground"}`}>
                          {formatWeekdayBr(day.date, true)}
                        </span>
                        <span className="mt-0.5 block text-sm font-semibold">{formatDateBr(day.date)}</span>
                        <span className={`mt-1 block text-[10px] ${active ? "text-slate-300 dark:text-slate-600" : "text-muted-foreground"}`}>
                          {day.total} OS • {day.corrective} corretiva{day.corrective === 1 ? "" : "s"}
                        </span>
                        {day.supplementalCorrective > 0 && (
                          <span className={`mt-0.5 block text-[10px] font-semibold ${active ? "text-amber-200 dark:text-amber-700" : "text-amber-700 dark:text-amber-300"}`}>
                            +{day.supplementalCorrective} encaixe{day.supplementalCorrective === 1 ? "" : "s"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {planning.daysWithoutCorrective.length > 0 && (
              <div className="mt-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/8 p-3 text-sm text-amber-800 dark:text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Carteira insuficiente para preencher todos os dias.</p>
                  <p className="mt-0.5 text-xs opacity-90">
                    Sem corretiva disponível em: {planning.daysWithoutCorrective.map(formatDateBr).join(", ")}.
                  </p>
                </div>
              </div>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Metric label="Programadas" value={dayRows.length} detail={formatDateBr(selectedDate)} />
            <Metric label="Preventivas" value={selectedDay?.preventive ?? 0} detail="da programação" />
            <Metric label="Corretivas" value={selectedDay?.corrective ?? 0} detail="programadas no dia" warning />
            <Metric label="Da planilha" value={selectedDay?.nativeCorrective ?? 0} detail="corretivas originais" />
            <Metric label="Complementares" value={selectedDay?.supplementalCorrective ?? 0} detail="encaixadas do backlog" accent />
            <Metric label="Equipes" value={selectedDay?.teams.length ?? 0} detail="atuando no dia" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <div>
                  <h2 className="font-semibold text-foreground">Programação de {formatDateBr(selectedDate)}</h2>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Lista exclusiva do que está previsto para o dia. Não mostra conclusão, realizado ou percentual de execução.
                  </p>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(210px,1fr)_190px_160px_180px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar OS, local, serviço..." className="pl-9" />
                  </div>
                  <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value as AreaFilter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <option value="todas">Todas as áreas</option>
                    {areas.map((area) => <option key={area} value={area}>{area}</option>)}
                  </select>
                  <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as TypeFilter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <option value="todos">Todos os tipos</option>
                    <option value="Preventiva">Preventivas</option>
                    <option value="Corretiva">Corretivas</option>
                  </select>
                  <select value={teamFilter} onChange={(event) => setTeamFilter(event.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <option value="todos">Todas as equipes</option>
                    {teams.map((team) => <option key={team} value={team}>{team}</option>)}
                  </select>
                </div>
              </div>

              <div className="max-h-[760px] overflow-auto bg-muted/5">
                {groupedRows.length ? (
                  <div className="space-y-3 p-3 sm:p-4">
                    {groupedRows.map(([area, areaRows]) => (
                      <section key={area} className="overflow-hidden rounded-xl border border-border bg-card">
                        <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3">
                          <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${areaBadgeClass(area)}`}>{area}</span>
                          <span className="text-xs text-muted-foreground">{areaRows.length} OS</span>
                        </div>
                        <div className="divide-y divide-border">
                          {areaRows.map((row) => {
                            const teamStyle = equipeStyles(row.team);
                            return (
                              <div
                                key={row.id}
                                className={`grid gap-3 px-4 py-4 lg:grid-cols-[108px_minmax(0,1fr)_190px_190px] ${row.supplementalCorrective ? "bg-amber-500/[0.025]" : ""}`}
                                style={{ borderLeftColor: equipeHex(row.team), borderLeftWidth: 3 }}
                              >
                                <div>
                                  <span className="block font-mono text-sm font-semibold text-foreground">{row.os}</span>
                                  <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${row.activity === "Corretiva" ? "border-amber-500/25 bg-amber-500/8 text-amber-700 dark:text-amber-300" : "border-sky-500/25 bg-sky-500/8 text-sky-700 dark:text-sky-300"}`}>
                                    {row.activity}
                                  </span>
                                </div>

                                <div className="min-w-0">
                                  <span className="block text-sm font-medium text-foreground">{row.name || row.equipment || "Serviço sem denominação"}</span>
                                  <span className="mt-1 block text-xs leading-5 text-muted-foreground">{maintenanceLocation(row)}</span>
                                  <span className="mt-1 block text-[11px] text-muted-foreground">
                                    {row.asset ? `Ativo ${row.asset}` : "Ativo não informado"}{row.sla ? ` • SLA ${formatDateBr(row.sla)}` : ""}
                                  </span>
                                </div>

                                <div>
                                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${teamStyle.badge}`}>
                                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: equipeHex(row.team) }} />
                                    {row.team || row.area}
                                  </span>
                                  <p className="mt-2 text-[10px] text-muted-foreground">Programada para {formatDateBr(row.date)}</p>
                                </div>

                                <div className={`rounded-lg border p-3 ${row.supplementalCorrective ? "border-amber-500/25 bg-amber-500/8" : "border-border bg-background/70"}`}>
                                  <p className={`text-[11px] font-semibold ${row.supplementalCorrective ? "text-amber-800 dark:text-amber-200" : "text-foreground"}`}>
                                    {row.supplementalCorrective ? "Corretiva complementar" : "Planilha semanal"}
                                  </p>
                                  <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                                    {row.supplementalCorrective
                                      ? "Chamado aberto encaixado para manter corretiva programada neste dia."
                                      : row.sourceFile}
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </section>
                    ))}
                  </div>
                ) : (
                  <div className="px-6 py-16 text-center text-sm text-muted-foreground">Nenhuma OS encontrada para os filtros selecionados.</div>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950 text-white dark:bg-slate-100 dark:text-slate-950">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Resumo para o cliente</p>
                    <h2 className="font-semibold text-foreground">{formatDateBr(selectedDate)}</h2>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <MiniStat label="Programadas" value={dayRows.length} />
                  <MiniStat label="Preventivas" value={selectedDay?.preventive ?? 0} />
                  <MiniStat label="Corretivas" value={selectedDay?.corrective ?? 0} />
                  <MiniStat label="Complementares" value={selectedDay?.supplementalCorrective ?? 0} />
                </div>

                <div className="mt-5 space-y-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Responsável pela programação</span>
                    <Input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Nome do responsável" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Observação para o cliente</span>
                    <textarea
                      value={dailyNote}
                      onChange={(event) => setDailyNote(event.target.value)}
                      placeholder="Destaques, restrições ou observações da programação"
                      rows={4}
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                  </label>
                </div>

                <Button onClick={generatePdf} disabled={generating || !dayRows.length} className="mt-5 w-full gap-2 bg-slate-950 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white">
                  {generating ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Gerar programação do dia
                </Button>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <FileSpreadsheet className="h-4 w-4 text-muted-foreground" /> Planilhas da semana
                </div>
                <div className="mt-3 space-y-2">
                  {sourceSummaries.map((source) => (
                    <div key={source.fileName} className="rounded-xl border border-border bg-background/60 p-3">
                      <p className="truncate text-xs font-semibold text-foreground" title={source.fileName}>{source.fileName}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {source.records} OS • {source.preventive} preventivas • {source.corrective} corretivas
                      </p>
                    </div>
                  ))}
                </div>
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
  warning = false,
}: {
  label: string;
  value: number;
  detail: string;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${accent ? "border-emerald-500/25 bg-emerald-500/[0.035]" : warning ? "border-amber-500/25 bg-amber-500/[0.035]" : "border-border bg-card"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  FolderOpen,
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
  buildCompletedReportRows,
  buildReportDaySummaries,
  mapCompletedCorrectives,
  type CorrectiveReportSourceRow,
} from "@/features/relatorio-diario/lib/corrective-report";
import {
  formatDateBr,
  formatWeekdayBr,
  inferMaintenanceArea,
  maintenanceAreaRank,
  mergeSchedules,
  normalizeOs,
  parseScheduleFile,
  PRIMARY_MAINTENANCE_AREAS,
  type MaintenanceArea,
  type MaintenanceType,
  type ScheduledMaintenance,
} from "@/features/relatorio-diario/lib/daily-maintenance";
import { supabase } from "@/integrations/supabase/client";
import { equipeHex, equipeStyles } from "@/lib/corretiva/equipe";

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
type StatusFilter = "todos" | "concluidas" | "pendentes";
type TypeFilter = "todos" | MaintenanceType;
type AreaFilter = "todas" | MaintenanceArea;
type DayView = "programadas" | "concluidas" | "ambas";

type ImportedFileSummary = {
  fileName: string;
  records: number;
  preventive: number;
  corrective: number;
  areas: MaintenanceArea[];
};

type ImportBatchSummary = {
  requestedFiles: number;
  importedFiles: number;
  failedFiles: number;
  records: number;
  dates: number;
  preventive: number;
  corrective: number;
  ignoredSheets: number;
  warnings: string[];
  errors: string[];
  files: ImportedFileSummary[];
};

type LoadedLogo = {
  data: string;
  ratio: number;
};

type ResolvedCompletion = {
  completedAt: string;
  source: "relatorio-diario" | "corretiva-novo";
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

const rowArea = (row: ScheduledMaintenance): MaintenanceArea =>
  row.area ?? inferMaintenanceArea(row.team, row.sourceFile, row.name);

const osKey = (value: unknown) => normalizeOs(value).trim().toUpperCase();

const uniqueRows = (rows: ScheduledMaintenance[]) => {
  const unique = new Map<string, ScheduledMaintenance>();
  rows.forEach((row) => {
    const key = osKey(row.os) || row.id;
    if (!unique.has(key)) unique.set(key, row);
  });
  return Array.from(unique.values());
};

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
        if (!context || !image.naturalHeight) {
          resolve(null);
          return;
        }
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

const reportOriginLabel = (row: ScheduledMaintenance) => {
  if (row.programmingSource === "extra-dia") return "Extra do dia";
  if (row.programmingSource === "corretiva-novo") return "Programada no Corretiva Novo";
  return "Programação semanal";
};

function DailyMaintenanceReport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const externalInitialDateResolved = useRef(false);
  const [rows, setRows] = useState<ScheduledMaintenance[]>([]);
  const [executions, setExecutions] = useState<ExecutionMap>({});
  const [correctiveRows, setCorrectiveRows] = useState<CorrectiveReportSourceRow[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [dayView, setDayView] = useState<DayView>("programadas");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("todos");
  const [areaFilter, setAreaFilter] = useState<AreaFilter>("todas");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todos");
  const [teamFilter, setTeamFilter] = useState("todos");
  const [author, setAuthor] = useState("");
  const [dailyNote, setDailyNote] = useState("");
  const [importing, setImporting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [syncingCorrectives, setSyncingCorrectives] = useState(false);
  const [correctiveSyncError, setCorrectiveSyncError] = useState("");
  const [lastImport, setLastImport] = useState<ImportBatchSummary | null>(null);

  const loadCorrectiveCompletions = useCallback(async (notify = false) => {
    setSyncingCorrectives(true);
    setCorrectiveSyncError("");
    try {
      const { data, error } = await supabase
        .from("corretiva_os")
        .select(
          "id,numero_os,status,fim,data_programada,data_criacao,data_sla,equipe,nome_os,equipamento,ativo,patrimonio,predio,andar,local,observacao_conclusao",
        )
        .not("fim", "is", null)
        .order("fim", { ascending: false })
        .limit(5000);

      if (error) throw error;
      const loaded = (data ?? []) as CorrectiveReportSourceRow[];
      setCorrectiveRows(loaded);
      if (notify) {
        toast.success(`${mapCompletedCorrectives(loaded).length} corretiva(s) concluída(s) sincronizada(s).`);
      }
      return loaded;
    } catch (error: any) {
      const message = error?.message || "Não foi possível sincronizar as corretivas concluídas.";
      setCorrectiveSyncError(message);
      if (notify) toast.error(message);
      return null;
    } finally {
      setSyncingCorrectives(false);
    }
  }, []);

  useEffect(() => {
    const storedRows = safeRead<ScheduledMaintenance[]>(ROWS_KEY, []);
    const hydratedRows = mergeSchedules([], storedRows);
    const storedExecutions = safeRead<ExecutionMap>(EXECUTIONS_KEY, {});
    setRows(hydratedRows);

    if (hydratedRows.length) {
      const availableDates = Array.from(new Set(hydratedRows.map((row) => row.date))).sort();
      const today = todayIso();
      setSelectedDate(availableDates.includes(today) ? today : availableDates[0]);
      externalInitialDateResolved.current = true;
    }

    if (Object.keys(storedExecutions).length) {
      setExecutions(storedExecutions);
    } else {
      const legacyDone = safeRead<Record<string, boolean>>(LEGACY_DONE_KEY, {});
      const migrated: ExecutionMap = {};
      hydratedRows.forEach((row) => {
        if (legacyDone[row.id]) migrated[row.id] = { completedAt: row.date };
      });
      setExecutions(migrated);
    }

    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");
    void loadCorrectiveCompletions(false);
  }, [loadCorrectiveCompletions]);

  useEffect(() => {
    const channel = supabase
      .channel("relatorio-diario-corretivas")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "corretiva_os" },
        () => void loadCorrectiveCompletions(false),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loadCorrectiveCompletions]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(ROWS_KEY, JSON.stringify(rows));
  }, [rows]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(EXECUTIONS_KEY, JSON.stringify(executions));
  }, [executions]);

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem(AUTHOR_KEY, author);
  }, [author]);

  const syncedCorrectiveRows = useMemo(() => mapCompletedCorrectives(correctiveRows), [correctiveRows]);

  useEffect(() => {
    if (externalInitialDateResolved.current || rows.length || !syncedCorrectiveRows.length) return;
    const availableDates = Array.from(
      new Set(syncedCorrectiveRows.map((row) => row.completedAt).filter(Boolean) as string[]),
    ).sort();
    if (!availableDates.length) return;
    const today = todayIso();
    setSelectedDate(availableDates.includes(today) ? today : availableDates[availableDates.length - 1]);
    externalInitialDateResolved.current = true;
  }, [rows.length, syncedCorrectiveRows]);

  const externalCompletionByOs = useMemo(() => {
    const map = new Map<string, ScheduledMaintenance>();
    syncedCorrectiveRows.forEach((row) => {
      const key = osKey(row.os);
      if (key && !map.has(key)) map.set(key, row);
    });
    return map;
  }, [syncedCorrectiveRows]);

  const resolveCompletion = useCallback(
    (row: ScheduledMaintenance): ResolvedCompletion | null => {
      const official = externalCompletionByOs.get(osKey(row.os));
      if (official?.completedAt) {
        return { completedAt: official.completedAt, source: "corretiva-novo" };
      }
      if (row.completedAt && row.completionSource === "corretiva-novo") {
        return { completedAt: row.completedAt, source: "corretiva-novo" };
      }
      const local = executions[row.id];
      if (local?.completedAt) return { completedAt: local.completedAt, source: "relatorio-diario" };
      if (row.completedAt) {
        return {
          completedAt: row.completedAt,
          source: row.completionSource === "corretiva-novo" ? "corretiva-novo" : "relatorio-diario",
        };
      }
      return null;
    },
    [executions, externalCompletionByOs],
  );

  const daySummaries = useMemo(
    () => buildReportDaySummaries({ scheduledRows: rows, executions, correctiveRows }),
    [correctiveRows, executions, rows],
  );
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
    () => buildCompletedReportRows({ scheduledRows: rows, executions, correctiveRows, selectedDate }),
    [correctiveRows, executions, rows, selectedDate],
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

  const areaOptions = useMemo(() => {
    const present = Array.from(new Set([...rows, ...syncedCorrectiveRows].map(rowArea))).sort(
      (a, b) => maintenanceAreaRank(a) - maintenanceAreaRank(b),
    );
    return Array.from(new Set([...PRIMARY_MAINTENANCE_AREAS, ...present]));
  }, [rows, syncedCorrectiveRows]);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return referenceRows
      .filter((row) => {
        const area = rowArea(row);
        if (areaFilter !== "todas" && area !== areaFilter) return false;
        if (typeFilter !== "todos" && row.activity !== typeFilter) return false;
        if (teamFilter !== "todos" && (row.team || "Sem equipe") !== teamFilter) return false;

        const completed = Boolean(resolveCompletion(row));
        if (statusFilter === "concluidas" && !completed) return false;
        if (statusFilter === "pendentes" && completed) return false;

        if (!query) return true;
        return [
          row.os,
          row.name,
          row.building,
          row.floor,
          row.space,
          row.team,
          area,
          row.asset,
          row.equipment,
          row.sourceFile,
        ]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(query);
      })
      .sort(
        (a, b) =>
          maintenanceAreaRank(rowArea(a)) - maintenanceAreaRank(rowArea(b)) ||
          a.activity.localeCompare(b.activity) ||
          a.team.localeCompare(b.team) ||
          a.os.localeCompare(b.os),
      );
  }, [areaFilter, referenceRows, resolveCompletion, search, statusFilter, teamFilter, typeFilter]);

  const groupedVisibleRows = useMemo(() => {
    const grouped = new Map<MaintenanceArea, ScheduledMaintenance[]>();
    visibleRows.forEach((row) => {
      const area = rowArea(row);
      const current = grouped.get(area) ?? [];
      current.push(row);
      grouped.set(area, current);
    });
    return Array.from(grouped.entries()).sort(
      ([areaA], [areaB]) => maintenanceAreaRank(areaA) - maintenanceAreaRank(areaB),
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
        areas: Array.from(new Set(sourceRows.map(rowArea))).sort(
          (a, b) => maintenanceAreaRank(a) - maintenanceAreaRank(b),
        ),
      }))
      .sort((a, b) => a.fileName.localeCompare(b.fileName));
  }, [rows]);

  const areaBaseSummary = useMemo(
    () =>
      areaOptions.map((area) => {
        const scheduleAreaRows = rows.filter((row) => rowArea(row) === area);
        const completedAreaRows = syncedCorrectiveRows.filter((row) => rowArea(row) === area);
        const areaRows = uniqueRows([...scheduleAreaRows, ...completedAreaRows]);
        return {
          area,
          total: areaRows.length,
          preventive: areaRows.filter((row) => row.activity === "Preventiva").length,
          corrective: areaRows.filter((row) => row.activity === "Corretiva").length,
          files: new Set(scheduleAreaRows.map((row) => row.sourceFile)).size,
        };
      }),
    [areaOptions, rows, syncedCorrectiveRows],
  );

  const completedScheduledEver = useMemo(
    () => scheduledRows.filter((row) => Boolean(resolveCompletion(row))).length,
    [resolveCompletion, scheduledRows],
  );

  const completedScheduledOnDate = useMemo(
    () => scheduledRows.filter((row) => resolveCompletion(row)?.completedAt === selectedDate).length,
    [resolveCompletion, scheduledRows, selectedDate],
  );

  const pendingScheduled = Math.max(0, scheduledRows.length - completedScheduledEver);
  const scheduledPreventive = scheduledRows.filter((row) => row.activity === "Preventiva").length;
  const scheduledCorrective = scheduledRows.filter((row) => row.activity === "Corretiva").length;
  const reportPreventive = completedOnDate.filter((row) => row.activity === "Preventiva").length;
  const reportCorrective = completedOnDate.filter((row) => row.activity === "Corretiva").length;
  const extraCorrectiveCount = completedOnDate.filter((row) => row.extraCorrective).length;
  const correctiveNovoCount = completedOnDate.filter((row) => row.completionSource === "corretiva-novo").length;
  const sameDayCompletionRate = scheduledRows.length
    ? Math.round((completedScheduledOnDate / scheduledRows.length) * 100)
    : 0;

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || !files.length) return;

    const selectedFiles = Array.from(files);
    const accepted = selectedFiles.filter((file) => /\.(xlsx|xls)$/i.test(file.name));
    const rejectedCount = selectedFiles.length - accepted.length;

    if (!accepted.length) {
      toast.error("Selecione uma ou mais planilhas Excel .xlsx ou .xls.");
      return;
    }

    setImporting(true);
    try {
      const settled = await Promise.allSettled(accepted.map(parseScheduleFile));
      const successful = settled.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      const errors = settled.flatMap((result, index) => {
        if (result.status === "fulfilled") return [];
        const message = result.reason instanceof Error ? result.reason.message : "Falha na leitura da planilha.";
        return [`${accepted[index].name}: ${message}`];
      });

      const imported = successful.flatMap((result) => result.rows);
      if (!imported.length) {
        throw new Error(errors[0] ?? "Nenhuma OS de Preventiva ou Corretiva foi encontrada nas planilhas selecionadas.");
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
      externalInitialDateResolved.current = true;
      setDayView("programadas");
      setStatusFilter("todos");
      setTeamFilter("todos");
      setAreaFilter("todas");

      const warnings = Array.from(new Set(successful.flatMap((result) => result.warnings)));
      if (rejectedCount) warnings.push(`${rejectedCount} arquivo(s) não Excel foram ignorados.`);

      const summary: ImportBatchSummary = {
        requestedFiles: selectedFiles.length,
        importedFiles: successful.length,
        failedFiles: errors.length + rejectedCount,
        records: imported.length,
        dates: importedDates.length,
        preventive: imported.filter((row) => row.activity === "Preventiva").length,
        corrective: imported.filter((row) => row.activity === "Corretiva").length,
        ignoredSheets: successful.reduce((total, result) => total + result.ignoredSheets.length, 0),
        warnings,
        errors,
        files: successful.map((result) => ({
          fileName: result.fileName,
          records: result.rows.length,
          preventive: result.preventive,
          corrective: result.corrective,
          areas: result.areas,
        })),
      };
      setLastImport(summary);

      if (summary.failedFiles) {
        toast.warning(
          `${summary.importedFiles} planilha(s) importada(s) e ${summary.failedFiles} arquivo(s) ignorado(s) ou com erro.`,
        );
      } else {
        toast.success(
          `${summary.importedFiles} planilha(s) • ${summary.records} OS • ${summary.preventive} preventivas • ${summary.corrective} corretivas.`,
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível importar as programações.");
    } finally {
      setImporting(false);
      setDragging(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  function concludeRow(row: ScheduledMaintenance, date = selectedDate) {
    if (!date || resolveCompletion(row)?.source === "corretiva-novo") return;
    setExecutions((current) => ({ ...current, [row.id]: { completedAt: date } }));
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
    setExecutions((current) => ({ ...current, [id]: { completedAt: date } }));
  }

  function markVisible(value: boolean) {
    setExecutions((current) => {
      const next = { ...current };
      visibleRows.forEach((row) => {
        const official = externalCompletionByOs.has(osKey(row.os)) || row.completionSource === "corretiva-novo";
        if (official) return;
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
    if (!window.confirm("Remover as programações importadas e as confirmações locais? As conclusões do Corretiva Novo serão preservadas.")) return;
    setRows([]);
    setExecutions({});
    setLastImport(null);
    setSearch("");
    setTeamFilter("todos");
    setAreaFilter("todas");
    setTypeFilter("todos");
    setStatusFilter("todos");
    setDayView("concluidas");
    externalInitialDateResolved.current = false;
    window.localStorage.removeItem(ROWS_KEY);
    window.localStorage.removeItem(EXECUTIONS_KEY);
    window.localStorage.removeItem(LEGACY_DONE_KEY);
    toast.success("Base importada removida. As corretivas concluídas do Corretiva Novo foram preservadas.");
  }

  async function generatePdf() {
    setGenerating(true);
    try {
      const latestCorrectiveRows = await loadCorrectiveCompletions(false);
      const sourceCorrectives = latestCorrectiveRows ?? correctiveRows;
      const pdfRows = buildCompletedReportRows({
        scheduledRows: rows,
        executions,
        correctiveRows: sourceCorrectives,
        selectedDate,
      });

      if (!pdfRows.length) {
        toast.error("Não há OS concluídas nesta data para gerar o relatório.");
        return;
      }

      const pdfPreventive = pdfRows.filter((row) => row.activity === "Preventiva").length;
      const pdfCorrective = pdfRows.filter((row) => row.activity === "Corretiva").length;
      const pdfExtraCorrective = pdfRows.filter((row) => row.extraCorrective).length;
      const pdfCompletedScheduledOnDate = scheduledRows.filter((scheduled) => {
        const key = osKey(scheduled.os);
        const reportRow = pdfRows.find((row) => osKey(row.os) === key);
        return Boolean(reportRow && !reportRow.extraCorrective && reportRow.completedAt === selectedDate);
      }).length;
      const pdfSameDayRate = scheduledRows.length
        ? Math.round((pdfCompletedScheduledOnDate / scheduledRows.length) * 100)
        : 0;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      const margin = 14;
      const titleDate = formatDateBr(selectedDate);
      const [gpsLogo, swLogo] = await Promise.all([
        loadLogo("/logos/gps-logo.png"),
        loadLogo("/logos/sw-logo.png"),
      ]);

      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, width, 32, "F");
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, 31, width - margin, 31);

      if (gpsLogo) {
        const logoHeight = 9;
        const logoWidth = Math.min(34, logoHeight * gpsLogo.ratio);
        doc.addImage(gpsLogo.data, "PNG", margin, 8, logoWidth, logoHeight);
      }
      if (swLogo) {
        const logoHeight = 10;
        const logoWidth = Math.min(37, logoHeight * swLogo.ratio);
        doc.addImage(swLogo.data, "PNG", width - margin - logoWidth, 7, logoWidth, logoHeight);
      }

      doc.setTextColor(15, 23, 42);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text("RELATÓRIO DIÁRIO DE MANUTENÇÃO", width / 2, 12, { align: "center" });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(71, 85, 105);
      doc.text(`Grupo GPS • Sherwin-Williams • Execuções concluídas em ${titleDate}`, width / 2, 19, {
        align: "center",
      });
      doc.text("Civil/Hidráulica → Refrigeração → Outros serviços → Elétrica", width / 2, 24, {
        align: "center",
      });

      const kpis = [
        { x: margin, value: pdfRows.length, label: "CONCLUÍDAS" },
        { x: 48, value: pdfPreventive, label: "PREVENTIVAS" },
        { x: 82, value: pdfCorrective, label: "CORRETIVAS" },
        { x: 116, value: pdfExtraCorrective, label: "EXTRAS DO DIA" },
        { x: 156, value: `${pdfSameDayRate}%`, label: "PROGRAMAÇÃO CONCLUÍDA NO DIA" },
      ];

      kpis.forEach((kpi) => {
        doc.setTextColor(15, 23, 42);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.text(String(kpi.value), kpi.x, 43);
        doc.setFontSize(7.2);
        doc.setFont("helvetica", "normal");
        doc.text(kpi.label, kpi.x, 48);
      });

      const reportAreas = Array.from(new Set(pdfRows.map(rowArea))).sort(
        (a, b) => maintenanceAreaRank(a) - maintenanceAreaRank(b),
      );
      doc.setFontSize(8.2);
      doc.setTextColor(71, 85, 105);
      doc.text(`Áreas: ${reportAreas.join(" • ")}`, margin, 56, { maxWidth: width - margin * 2 });
      if (author.trim()) doc.text(`Responsável: ${author.trim()}`, margin, 61);
      if (dailyNote.trim()) {
        doc.text(`Observação: ${dailyNote.trim()}`, margin, author.trim() ? 66 : 61, {
          maxWidth: width - margin * 2,
        });
      }

      const sorted = [...pdfRows].sort(
        (a, b) =>
          maintenanceAreaRank(rowArea(a)) - maintenanceAreaRank(rowArea(b)) ||
          a.team.localeCompare(b.team) ||
          a.activity.localeCompare(b.activity) ||
          a.os.localeCompare(b.os),
      );

      autoTable(doc, {
        startY: dailyNote.trim() ? 72 : author.trim() ? 67 : 63,
        margin: { left: margin, right: margin, bottom: 18 },
        head: [[
          "OS",
          "Tipo",
          "Área",
          "Equipe",
          "Programada",
          "Concluída",
          "Origem",
          "Local",
          "Serviço / Denominação",
          "Ativo",
        ]],
        body: sorted.map((row) => [
          row.os,
          row.activity,
          rowArea(row),
          row.team || "—",
          row.extraCorrective ? "—" : formatDateBr(row.date),
          formatDateBr(row.completedAt || selectedDate),
          reportOriginLabel(row),
          maintenanceLocation(row),
          row.name || row.equipment || "—",
          row.asset || "—",
        ]),
        theme: "grid",
        styles: {
          font: "helvetica",
          fontSize: 6.2,
          cellPadding: 1.8,
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
          fontSize: 6.4,
        },
        columnStyles: {
          0: { cellWidth: 16, fontStyle: "bold" },
          1: { cellWidth: 17 },
          2: { cellWidth: 28 },
          3: { cellWidth: 24 },
          4: { cellWidth: 20 },
          5: { cellWidth: 20 },
          6: { cellWidth: 27 },
          7: { cellWidth: 34 },
          8: { cellWidth: 57 },
          9: { cellWidth: 20 },
        },
        didParseCell: (data) => {
          if (data.section !== "body") return;
          const reportRow = sorted[data.row.index];
          if (!reportRow) return;
          const color = equipeHex(reportRow.team);
          data.cell.styles.fillColor = subtleTeamTint(color);
          if (data.column.index === 3) {
            data.cell.styles.fontStyle = "bold";
            data.cell.styles.textColor = darkTeamText(color);
          }
          if (data.column.index === 6 && reportRow.extraCorrective) {
            data.cell.styles.fontStyle = "bold";
          }
        },
        didDrawPage: () => {
          const page = doc.getNumberOfPages();
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, height - 12, width - margin, height - 12);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(7);
          doc.setTextColor(100, 116, 139);
          doc.text(
            "Programação consolidada + corretivas concluídas no Corretiva Novo; chamados extras do dia identificados automaticamente.",
            margin,
            height - 7,
          );
          doc.text(`Página ${page}`, width - margin, height - 7, { align: "right" });
        },
      });

      doc.setProperties({
        title: `Relatório Diário de Manutenção - ${titleDate}`,
        subject: "Preventivas e corretivas concluídas, incluindo chamados extras realizados no dia",
        author: author.trim() || "Grupo GPS / Sherwin-Williams",
        creator: "ApontAuto",
      });
      doc.save(`RELATORIO_DIARIO_MANUTENCAO_${selectedDate}.pdf`);
      toast.success(`PDF gerado com ${pdfRows.length} execução(ões), incluindo ${pdfExtraCorrective} corretiva(s) extra(s).`);
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível gerar o PDF.");
    } finally {
      setGenerating(false);
    }
  }

  const hasBase = rows.length > 0;
  const hasReportData = hasBase || syncedCorrectiveRows.length > 0;
  const currentSummary = daySummaryByDate.get(selectedDate);

  return (
    <main className="mx-auto w-full max-w-[1540px] space-y-5 px-3 py-4 sm:px-5 lg:px-7 lg:py-6">
      <section className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">
        <div className="bg-slate-950 px-5 py-5 text-white sm:px-6 lg:px-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex shrink-0 items-center gap-2.5">
                <div className="flex h-14 w-[104px] items-center justify-center rounded-xl bg-white px-3 shadow-sm">
                  <img src="/logos/gps-logo.png" alt="Grupo GPS" className="max-h-10 max-w-full object-contain" />
                </div>
                <div className="flex h-14 w-[118px] items-center justify-center rounded-xl bg-white px-3 shadow-sm">
                  <img src="/logos/sw-logo.png" alt="Sherwin-Williams" className="max-h-10 max-w-full object-contain" />
                </div>
              </div>

              <div className="min-w-0 border-white/10 sm:border-l sm:pl-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                  Gestão integrada de manutenção
                </div>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                  Relatório Diário de Manutenção
                </h1>
                <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-300">
                  Consolidação da programação semanal com as corretivas efetivamente concluídas no Corretiva Novo,
                  incluindo Chaveiro e demais equipes, chamadas programadas e atendimentos extras realizados no dia.
                </p>
              </div>
            </div>

            {hasBase && (
              <Button
                variant="outline"
                onClick={clearBase}
                className="shrink-0 gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Trash2 className="h-4 w-4" />
                Limpar base importada
              </Button>
            )}
          </div>
        </div>

        <div className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)] sm:p-6">
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
            className={`group flex min-h-[168px] w-full items-center gap-4 rounded-2xl border border-dashed px-5 py-5 text-left transition-colors ${
              dragging
                ? "border-slate-500 bg-slate-500/5"
                : "border-border bg-muted/15 hover:border-slate-400 hover:bg-muted/30"
            }`}
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-border bg-background shadow-sm">
              {importing ? (
                <RefreshCcw className="h-5 w-5 animate-spin text-muted-foreground" />
              ) : (
                <Upload className="h-5 w-5 text-foreground" />
              )}
            </span>
            <span className="min-w-0">
              <span className="block text-base font-semibold text-foreground">
                {importing
                  ? "Lendo e organizando as planilhas..."
                  : hasBase
                    ? "Adicionar mais planilhas à consolidação"
                    : "Anexar as planilhas da programação semanal"}
              </span>
              <span className="mt-1.5 block max-w-2xl text-xs leading-5 text-muted-foreground">
                As planilhas continuam sendo a referência da programação. As conclusões e os chamados corretivos extras
                são sincronizados automaticamente do Corretiva Novo.
              </span>
              <span className="mt-3 inline-flex rounded-lg bg-slate-950 px-3 py-1.5 text-[11px] font-semibold text-white dark:bg-slate-100 dark:text-slate-950">
                Selecionar várias planilhas
              </span>
            </span>
          </button>

          <div className="rounded-2xl border border-border bg-background/60 p-4 sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Fontes do relatório</p>
                <p className="mt-1 text-sm font-medium text-foreground">
                  {hasBase ? `${sourceSummaries.length} planilha(s) + Corretiva Novo` : "Corretiva Novo conectado"}
                </p>
              </div>
              <ShieldCheck className="h-5 w-5 text-muted-foreground" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <MiniStat label="OS programadas" value={rows.length} />
              <MiniStat label="Dias no report" value={dates.length} />
              <MiniStat label="Corretivas concluídas" value={syncedCorrectiveRows.length} />
              <MiniStat label="Equipes concluídas" value={new Set(syncedCorrectiveRows.map((row) => row.team).filter(Boolean)).size} />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-foreground">Sincronização de corretivas realizadas</p>
                <p className="mt-0.5 text-[10px] text-muted-foreground">Usa status concluído + data real do campo “fim”.</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2.5 text-xs"
                onClick={() => void loadCorrectiveCompletions(true)}
                disabled={syncingCorrectives}
              >
                <RefreshCcw className={`h-3.5 w-3.5 ${syncingCorrectives ? "animate-spin" : ""}`} />
                Atualizar
              </Button>
            </div>

            {correctiveSyncError && (
              <p className="mt-2 text-[11px] leading-4 text-red-600 dark:text-red-400">{correctiveSyncError}</p>
            )}

            {lastImport && (lastImport.warnings.length > 0 || lastImport.errors.length > 0) && (
              <div className="mt-3 space-y-1.5 text-[11px] leading-4">
                {lastImport.warnings.slice(0, 2).map((warning) => (
                  <p key={warning} className="text-amber-700 dark:text-amber-300">{warning}</p>
                ))}
                {lastImport.errors.slice(0, 2).map((error) => (
                  <p key={error} className="text-red-600 dark:text-red-400">{error}</p>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              Estrutura do report por área
            </div>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Ordem do PDF: Civil/Hidráulica, Refrigeração, demais equipes e por último Elétrica.
            </p>
          </div>
          {hasReportData && (
            <button
              type="button"
              onClick={() => setAreaFilter("todas")}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              Mostrar todas as áreas
            </button>
          )}
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {areaBaseSummary
            .filter((summary) => PRIMARY_MAINTENANCE_AREAS.includes(summary.area) || summary.total > 0)
            .map((summary) => (
              <AreaOverviewCard
                key={summary.area}
                area={summary.area}
                total={summary.total}
                preventive={summary.preventive}
                corrective={summary.corrective}
                files={summary.files}
                active={areaFilter === summary.area}
                onClick={() => setAreaFilter(areaFilter === summary.area ? "todas" : summary.area)}
              />
            ))}
        </div>
      </section>

      {hasBase && (
        <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <FolderOpen className="h-4 w-4 text-muted-foreground" />
            Planilhas carregadas
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {sourceSummaries.map((source) => (
              <div key={source.fileName} className="rounded-xl border border-border bg-background/55 p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate text-xs font-semibold text-foreground" title={source.fileName}>{source.fileName}</p>
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground">{source.records} OS</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {source.areas.map((area) => (
                    <span key={area} className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${areaBadgeClass(area)}`}>
                      {area}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {source.preventive} preventivas • {source.corrective} corretivas
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {!hasReportData ? (
        <section className="rounded-2xl border border-dashed border-border bg-card/50 px-6 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-background">
            <FileSpreadsheet className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-base font-semibold">Aguardando programação ou corretivas concluídas</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Importe as planilhas da programação semanal. O sistema também consulta automaticamente as corretivas concluídas
            no Corretiva Novo para incluir os atendimentos realizados fora da programação.
          </p>
          <Button className="mt-5 gap-2" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Selecionar planilhas
          </Button>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
            <div className="grid gap-4 xl:grid-cols-[220px_260px_minmax(0,1fr)] xl:items-end">
              <label className="space-y-1.5">
                <span className="text-xs font-medium text-muted-foreground">Dia de referência</span>
                <div className="relative">
                  <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="pl-9" />
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
                <span className="text-xs font-medium text-muted-foreground">Dias programados ou apontados como concluídos</span>
                <div className="mt-1.5 flex gap-2 overflow-x-auto pb-1">
                  {daySummaries.map((day) => {
                    const active = day.date === selectedDate;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => setSelectedDate(day.date)}
                        className={`shrink-0 rounded-lg border px-3 py-2 text-left transition-colors ${
                          active ? "border-slate-700 bg-slate-950 text-white dark:border-slate-300 dark:bg-slate-100 dark:text-slate-950" : "border-border bg-background hover:bg-muted/45"
                        }`}
                      >
                        <span className={`block text-[10px] font-semibold uppercase tracking-wide ${active ? "text-slate-300 dark:text-slate-600" : "text-muted-foreground"}`}>
                          {formatWeekdayBr(day.date, true)}
                        </span>
                        <span className="mt-0.5 block text-sm font-semibold">{formatDateBr(day.date)}</span>
                        <span className={`mt-0.5 block text-[10px] ${active ? "text-slate-300 dark:text-slate-600" : "text-muted-foreground"}`}>
                          {day.total} programada{day.total === 1 ? "" : "s"} • {day.completed} concluída{day.completed === 1 ? "" : "s"}
                        </span>
                        {day.extraCorrective > 0 && (
                          <span className={`mt-0.5 block text-[10px] font-semibold ${active ? "text-amber-200 dark:text-amber-700" : "text-amber-700 dark:text-amber-300"}`}>
                            +{day.extraCorrective} corretiva{day.extraCorrective === 1 ? "" : "s"} extra{day.extraCorrective === 1 ? "" : "s"}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
              <span><strong className="font-semibold text-foreground">{rows.length}</strong> OS programadas na base</span>
              <span><strong className="font-semibold text-foreground">{syncedCorrectiveRows.length}</strong> corretivas concluídas sincronizadas</span>
              <span><strong className="font-semibold text-foreground">{dates.length}</strong> dias identificados</span>
              {currentSummary && (
                <span>
                  {currentSummary.areas.join(" • ") || "Sem área programada"} • {currentSummary.completed} concluídas • {currentSummary.extraCorrective} extras
                </span>
              )}
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
            <Metric label="Programadas" value={scheduledRows.length} detail={formatDateBr(selectedDate)} />
            <Metric label="Preventivas" value={scheduledPreventive} detail="programadas no dia" />
            <Metric label="Corretivas" value={scheduledCorrective} detail="programadas no dia" warning />
            <Metric label="Concluídas" value={completedOnDate.length} detail={`${correctiveNovoCount} via Corretiva Novo`} accent />
            <Metric label="Extras do dia" value={extraCorrectiveCount} detail="fora da programação" warning />
            <Metric label="Pendentes" value={pendingScheduled} detail="da programação" />
            <Metric label="Mesmo dia" value={completedScheduledOnDate} detail={`${sameDayCompletionRate}% da programação`} />
          </section>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
            <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-4 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h2 className="font-semibold text-foreground">
                      {dayView === "programadas"
                        ? `Programadas para ${formatDateBr(selectedDate)}`
                        : dayView === "concluidas"
                          ? `Concluídas em ${formatDateBr(selectedDate)}`
                          : `Programadas ou concluídas em ${formatDateBr(selectedDate)}`}
                    </h2>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      As equipes recebem uma cor discreta. Conclusões do Corretiva Novo são oficiais e ficam bloqueadas para edição nesta tela.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => markVisible(true)} disabled={!visibleRows.length} className="gap-1.5">
                      <Check className="h-3.5 w-3.5" /> Concluir programadas visíveis
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => markVisible(false)} disabled={!visibleRows.length}>
                      Reabrir confirmações locais
                    </Button>
                  </div>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(210px,1fr)_185px_150px_180px_155px]">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar OS, local, serviço..." className="pl-9" />
                  </div>

                  <select value={areaFilter} onChange={(event) => setAreaFilter(event.target.value as AreaFilter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <option value="todas">Todas as áreas</option>
                    {areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
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

                  <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground">
                    <option value="todos">Todos os status</option>
                    <option value="concluidas">Concluídas</option>
                    <option value="pendentes">Pendentes</option>
                  </select>
                </div>
              </div>

              <div className="max-h-[760px] overflow-auto bg-muted/5">
                {groupedVisibleRows.length ? (
                  <div className="space-y-3 p-3 sm:p-4">
                    {groupedVisibleRows.map(([area, areaRows]) => {
                      const preventive = areaRows.filter((row) => row.activity === "Preventiva").length;
                      const corrective = areaRows.filter((row) => row.activity === "Corretiva").length;
                      return (
                        <section key={area} className="overflow-hidden rounded-xl border border-border bg-card">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/20 px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${areaBadgeClass(area)}`}>{area}</span>
                              <span className="text-xs text-muted-foreground">{areaRows.length} OS</span>
                            </div>
                            <div className="flex gap-3 text-[11px] text-muted-foreground">
                              <span><strong className="font-semibold text-foreground">{preventive}</strong> preventivas</span>
                              <span><strong className="font-semibold text-foreground">{corrective}</strong> corretivas</span>
                            </div>
                          </div>

                          <div className="divide-y divide-border">
                            {areaRows.map((row) => {
                              const completion = resolveCompletion(row);
                              const completed = Boolean(completion);
                              const official = completion?.source === "corretiva-novo";
                              const movedDay = completed && completion?.completedAt !== row.date;
                              const teamStyle = equipeStyles(row.team);
                              const sourceLabel = row.extraCorrective
                                ? "Chamado extra do dia"
                                : row.programmingSource === "corretiva-novo"
                                  ? "Programada no Corretiva Novo"
                                  : "Programação semanal";

                              return (
                                <div
                                  key={row.id}
                                  className={`grid gap-3 px-4 py-4 lg:grid-cols-[34px_108px_minmax(0,1fr)_185px_205px] ${completed ? "bg-emerald-500/[0.025]" : ""}`}
                                  style={{ borderLeftColor: equipeHex(row.team), borderLeftWidth: 3 }}
                                >
                                  <button
                                    type="button"
                                    disabled={official}
                                    onClick={() => (completed ? reopenRow(row.id) : concludeRow(row))}
                                    aria-label={official ? `OS ${row.os} concluída no Corretiva Novo` : completed ? `Reabrir OS ${row.os}` : `Concluir OS ${row.os}`}
                                    className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                                      completed
                                        ? official
                                          ? "cursor-default border-emerald-500/40 bg-emerald-600/90 text-white"
                                          : "border-emerald-600 bg-emerald-600 text-white"
                                        : "border-border bg-background hover:border-slate-500"
                                    }`}
                                  >
                                    {completed && <Check className="h-4 w-4" />}
                                  </button>

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
                                      {row.asset ? `Ativo ${row.asset}` : "Ativo não informado"}
                                      {row.sla ? ` • SLA ${row.sla}` : ""}
                                    </span>
                                    {row.observation && (
                                      <span className="mt-1 block truncate text-[10px] text-muted-foreground" title={row.observation}>Obs.: {row.observation}</span>
                                    )}
                                  </div>

                                  <div>
                                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold ${teamStyle.badge}`}>
                                      <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: equipeHex(row.team) }} />
                                      {row.team || area}
                                    </span>
                                    <span className="mt-2 block text-[11px] text-muted-foreground">
                                      {row.extraCorrective ? "Sem programação prévia" : `Programada: ${formatDateBr(row.date)}`}
                                    </span>
                                    <span className="mt-1 block text-[10px] font-medium text-muted-foreground">{sourceLabel}</span>
                                    {movedDay && <span className="mt-1 block text-[10px] font-medium text-amber-700 dark:text-amber-300">Executada em dia diferente</span>}
                                  </div>

                                  <div className="rounded-lg border border-border bg-background/70 p-2.5">
                                    {completed ? (
                                      official ? (
                                        <>
                                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Concluída no Corretiva Novo
                                          </div>
                                          <p className="mt-2 text-[10px] text-muted-foreground">Data real de conclusão</p>
                                          <p className="mt-0.5 text-xs font-semibold text-foreground">{formatDateBr(completion.completedAt)}</p>
                                          <p className="mt-2 text-[10px] leading-4 text-muted-foreground">Registro sincronizado do atendimento de campo.</p>
                                        </>
                                      ) : (
                                        <>
                                          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Concluída localmente
                                          </div>
                                          <label className="mt-2 block text-[10px] font-medium text-muted-foreground">Data real de conclusão</label>
                                          <Input type="date" value={completion.completedAt} onChange={(event) => updateCompletionDate(row.id, event.target.value)} className="mt-1 h-8 text-xs" />
                                          <button type="button" onClick={() => reopenRow(row.id)} className="mt-2 text-[10px] font-medium text-muted-foreground hover:text-foreground">Reabrir confirmação local</button>
                                        </>
                                      )
                                    ) : (
                                      <>
                                        <p className="text-[11px] font-semibold text-foreground">Pendente</p>
                                        <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Confirme somente após a execução em campo.</p>
                                        <button type="button" onClick={() => concludeRow(row)} className="mt-2 text-[10px] font-semibold text-foreground underline-offset-4 hover:underline">Concluir em {formatDateBr(selectedDate)}</button>
                                      </>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                ) : (
                  <div className="px-6 py-16 text-center">
                    <Filter className="mx-auto h-6 w-6 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">Nenhuma OS encontrada para estes filtros.</p>
                    <p className="mt-1 text-xs text-muted-foreground">Confira a data, a área, o tipo ou o status selecionado.</p>
                  </div>
                )}
              </div>
            </div>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Fechamento do dia</p>
                    <h2 className="mt-1 font-semibold text-foreground">{formatDateBr(selectedDate)}</h2>
                  </div>
                  <span className="rounded-full border border-border bg-muted/25 px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">PDF cliente</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <MiniStat label="Concluídas" value={completedOnDate.length} />
                  <MiniStat label="Extras do dia" value={extraCorrectiveCount} />
                  <MiniStat label="Preventivas" value={reportPreventive} />
                  <MiniStat label="Corretivas" value={reportCorrective} />
                </div>

                <div className="mt-5 space-y-4">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Responsável pelo relatório</span>
                    <Input value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Nome do responsável" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Observação do dia</span>
                    <textarea
                      value={dailyNote}
                      onChange={(event) => setDailyNote(event.target.value)}
                      placeholder="Intercorrências, destaques ou observações gerais"
                      rows={4}
                      className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/20"
                    />
                  </label>
                </div>

                <div className="mt-5 rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Programação concluída no dia</p>
                      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{sameDayCompletionRate}%</p>
                    </div>
                    <p className="text-right text-xs text-muted-foreground">{completedScheduledOnDate} de {scheduledRows.length}<br />OS programadas</p>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-600 transition-[width] duration-300" style={{ width: `${sameDayCompletionRate}%` }} />
                  </div>
                </div>

                <Button onClick={generatePdf} disabled={generating} className="mt-5 w-full gap-2 bg-slate-950 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-white">
                  {generating ? <RefreshCcw className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Gerar relatório consolidado
                </Button>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 text-xs leading-5 text-muted-foreground">
                <div className="flex items-center gap-2 font-semibold text-foreground"><ShieldCheck className="h-4 w-4" /> Regra de consolidação</div>
                <p className="mt-2">
                  A programação semanal permanece como referência. O Corretiva Novo informa a data real de conclusão e inclui automaticamente Chaveiro e demais equipes. Chamados concluídos sem programação são marcados como “Extra do dia” no PDF.
                </p>
              </section>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-foreground">{value}</p>
    </div>
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
    <div className={`rounded-xl border bg-card px-4 py-4 shadow-sm ${accent ? "border-emerald-500/30" : warning ? "border-amber-500/25" : "border-border"}`}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-semibold tracking-tight ${accent ? "text-emerald-700 dark:text-emerald-300" : warning ? "text-amber-700 dark:text-amber-300" : "text-foreground"}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function AreaOverviewCard({
  area,
  total,
  preventive,
  corrective,
  files,
  active,
  onClick,
}: {
  area: MaintenanceArea;
  total: number;
  preventive: number;
  corrective: number;
  files: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl border p-4 text-left transition-colors ${active ? "border-slate-600 bg-slate-950 text-white dark:border-slate-300 dark:bg-slate-100 dark:text-slate-950" : "border-border bg-background/55 hover:border-slate-400 hover:bg-muted/25"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-xs font-semibold">{area}</span>
        {total > 0 ? <CheckCircle2 className={`h-4 w-4 ${active ? "text-emerald-300 dark:text-emerald-700" : "text-emerald-600"}`} /> : <span className={`text-[10px] ${active ? "text-slate-300 dark:text-slate-600" : "text-muted-foreground"}`}>aguardando</span>}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{total}</p>
      <p className={`mt-1 text-[11px] ${active ? "text-slate-300 dark:text-slate-600" : "text-muted-foreground"}`}>
        {preventive} preventivas • {corrective} corretivas
      </p>
      <p className={`mt-2 text-[10px] ${active ? "text-slate-400 dark:text-slate-500" : "text-muted-foreground"}`}>
        {files ? `${files} arquivo(s) de programação` : "Dados do Corretiva Novo"}
      </p>
    </button>
  );
}

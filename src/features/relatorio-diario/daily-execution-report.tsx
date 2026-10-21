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
  normalizeOs,
  parseScheduleFile,
  type ScheduledMaintenance,
} from "@/features/relatorio-diario/lib/daily-maintenance";
import {
  isCompletedCorrectiveStatus,
  shouldReplaceSchedule,
} from "@/features/relatorio-diario/lib/corrective-report";
import {
  buildWeeklyPlanning,
  type WeeklyCorrectiveSourceRow,
  type WeeklyPlanningRow,
} from "@/features/relatorio-diario/lib/weekly-planning";
import { supabase } from "@/integrations/supabase/client";
import { equipeHex } from "@/lib/corretiva/equipe";
import { cn } from "@/lib/utils";

const ROWS_KEY = "apontauto:relatorio-diario:programacao:v1";
const ROWS_MIGRATED_KEY = "apontauto:relatorio-diario:programacao-cloud-migrated:v1";
const TARGET_KEY = "apontauto:relatorio-diario:meta-equipe:v2";
const AUTHOR_KEY = "apontauto:relatorio-diario:responsavel:v1";
const NOTE_KEY = "apontauto:relatorio-diario:observacao-programacao:v1";

// Artes institucionais já carregadas no projeto Lovable. O PDF usa exatamente
// esses arquivos, preservando os pixels, transparência e proporção originais.
const SHERWIN_WILLIAMS_LOGO_URL =
  "/__l5e/assets-v1/76b6660e-a690-4ff2-8943-c6f831b5ded6/sherwin-williams.png";
const GRUPO_GPS_LOGO_URL =
  "/__l5e/assets-v1/d386a336-b420-4782-9d48-85d30cbb6fee/grupo-gps.png";

type CompletionFilter = "todos" | "concluidas" | "verificacao" | "pendentes";
type RowCompletionState = "pendente" | "pendente_verificacao" | "concluida";

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

type CorrectiveProgrammingHistory = {
  os_id: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  dia_indice: number | null;
  equipe: string | null;
  created_at: string;
};

type PdfLogo = {
  dataUrl: string;
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

const correctiveOsKey = (value: unknown) => normalizeOs(value).trim().toUpperCase();

const isCorrectiveActivity = (row: WeeklyPlanningRow) =>
  String(row.activity ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase() === "corretiva";

const rowTimestamp = (row?: WeeklyCorrectiveSourceRow) => {
  if (!row) return 0;
  for (const candidate of [row.updated_at, row.fim, row.data_programada, row.data_criacao]) {
    const value = new Date(String(candidate ?? "")).getTime();
    if (Number.isFinite(value)) return value;
  }
  return 0;
};

const buildCorrectiveByOs = (rows: WeeklyCorrectiveSourceRow[]) => {
  const map = new Map<string, WeeklyCorrectiveSourceRow>();
  rows.forEach((row) => {
    const key = correctiveOsKey(row.numero_os);
    if (!key) return;
    const current = map.get(key);
    if (!current || rowTimestamp(row) >= rowTimestamp(current)) map.set(key, row);
  });
  return map;
};

const rowCompletionState = (
  row: WeeklyPlanningRow,
  executionMap: Map<string, CompletionRecord>,
  correctiveByOs: Map<string, WeeklyCorrectiveSourceRow>,
): RowCompletionState => {
  const manualExecution = executionMap.has(row.id);

  if (isCorrectiveActivity(row)) {
    const canonical = correctiveByOs.get(correctiveOsKey(row.os));
    if (canonical) {
      const canonicalCompleted = isCompletedCorrectiveStatus(canonical.status);
      if (canonicalCompleted && manualExecution) return "concluida";
      if (canonicalCompleted || manualExecution) return "pendente_verificacao";
      return "pendente";
    }
  }

  return manualExecution ? "concluida" : "pendente";
};

const rowIsCompleted = (
  row: WeeklyPlanningRow,
  executionMap: Map<string, CompletionRecord>,
  correctiveByOs: Map<string, WeeklyCorrectiveSourceRow>,
) => rowCompletionState(row, executionMap, correctiveByOs) !== "pendente";

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Não foi possível ler a logo."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Não foi possível ler a logo."));
    reader.readAsDataURL(blob);
  });

const loadHtmlImage = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Não foi possível carregar a logo."));
    image.src = src;
  });

async function loadPdfLogo(url: string): Promise<PdfLogo> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error("Não foi possível carregar as logos do relatório.");

  const sourceDataUrl = await blobToDataUrl(await response.blob());
  const image = await loadHtmlImage(sourceDataUrl);
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.naturalWidth || image.width;
  sourceCanvas.height = image.naturalHeight || image.height;
  const context = sourceCanvas.getContext("2d", { willReadFrequently: true });

  if (!context || !sourceCanvas.width || !sourceCanvas.height) {
    return {
      dataUrl: sourceDataUrl,
      ratio: (image.naturalWidth || image.width || 1) / (image.naturalHeight || image.height || 1),
    };
  }

  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
  let minX = sourceCanvas.width;
  let minY = sourceCanvas.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < sourceCanvas.height; y += 1) {
    for (let x = 0; x < sourceCanvas.width; x += 1) {
      const alpha = pixels[(y * sourceCanvas.width + x) * 4 + 3];
      if (alpha < 12) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return { dataUrl: sourceDataUrl, ratio: sourceCanvas.width / sourceCanvas.height };
  }

  const cropWidth = maxX - minX + 1;
  const cropHeight = maxY - minY + 1;
  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = cropWidth;
  targetCanvas.height = cropHeight;
  const targetContext = targetCanvas.getContext("2d");
  if (!targetContext) return { dataUrl: sourceDataUrl, ratio: sourceCanvas.width / sourceCanvas.height };

  targetContext.drawImage(
    sourceCanvas,
    minX,
    minY,
    cropWidth,
    cropHeight,
    0,
    0,
    cropWidth,
    cropHeight,
  );

  return {
    dataUrl: targetCanvas.toDataURL("image/png"),
    ratio: cropWidth / cropHeight,
  };
}

function drawContainedLogo(
  doc: jsPDF,
  logo: PdfLogo,
  x: number,
  y: number,
  boxWidth: number,
  boxHeight: number,
) {
  const boxRatio = boxWidth / boxHeight;
  const width = logo.ratio >= boxRatio ? boxWidth : boxHeight * logo.ratio;
  const height = logo.ratio >= boxRatio ? boxWidth / logo.ratio : boxHeight;
  doc.addImage(
    logo.dataUrl,
    "PNG",
    x + (boxWidth - width) / 2,
    y + (boxHeight - height) / 2,
    width,
    height,
    undefined,
    "FAST",
  );
}

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
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [importing, setImporting] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [dragging, setDragging] = useState(false);

  const loadPortfolio = useCallback(async (notify = false) => {
    setLoadingPortfolio(true);
    try {
      const [osResult, historyResult] = await Promise.all([
        supabase
          .from("corretiva_os")
          .select(
            "id,numero_os,status,fim,observacao_conclusao,data_programada,data_criacao,data_sla,equipe,nome_os,equipamento,ativo,patrimonio,predio,andar,local,programacao_status,programacao_periodo_inicio,programacao_periodo_fim,programacao_dia_indice,programacao_equipe,programacao_tentativas,tipo_importacao,updated_at",
          )
          .order("updated_at", { ascending: false })
          .limit(10000),
        (supabase as any).rpc("get_relatorio_diario_latest_programacao"),
      ]);

      if (osResult.error) throw osResult.error;
      if (historyResult.error) throw historyResult.error;

      const latestProgramming = new Map<string, CorrectiveProgrammingHistory>();
      ((historyResult.data ?? []) as CorrectiveProgrammingHistory[]).forEach((record) => {
        const key = String(record.os_id ?? "").trim();
        if (key && !latestProgramming.has(key)) latestProgramming.set(key, record);
      });

      const next = ((osResult.data ?? []) as WeeklyCorrectiveSourceRow[]).map((row) => {
        if (!isCompletedCorrectiveStatus(row.status)) return row;
        if (
          row.programacao_status === "em_programacao" &&
          row.programacao_periodo_inicio &&
          row.programacao_periodo_fim &&
          Number.isInteger(Number(row.programacao_dia_indice))
        ) {
          return row;
        }

        const historical = latestProgramming.get(String(row.id ?? "").trim());
        if (!historical?.periodo_inicio || !historical.periodo_fim) return row;
        const dayIndex = Number(historical.dia_indice);
        if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 4) return row;

        return {
          ...row,
          programacao_status: "em_programacao",
          programacao_periodo_inicio: historical.periodo_inicio,
          programacao_periodo_fim: historical.periodo_fim,
          programacao_dia_indice: dayIndex,
          programacao_equipe: historical.equipe || row.equipe,
        };
      });
      setPortfolio(next);
      if (notify) toast.success(`${next.length} corretiva(s) sincronizadas com o status atual.`);
      return next;
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar o status atual das corretivas.");
      return null;
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
      return next;
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar as atividades concluídas.");
      return null;
    } finally {
      setLoadingExecutions(false);
    }
  }, []);

  const loadSharedSchedule = useCallback(async (notify = false, migrateLocal = false) => {
    setLoadingSchedule(true);
    const cachedRows = mergeSchedules(
      [],
      safeRead<ScheduledMaintenance[]>(ROWS_KEY, []),
    );

    try {
      const { data, error } = await (supabase as any)
        .from("relatorio_diario_programacao_rows")
        .select("payload,atividade_data")
        .order("atividade_data", { ascending: true })
        .limit(20000);

      if (error) throw error;

      let nextRows = mergeSchedules(
        [],
        ((data ?? []) as Array<{ payload?: ScheduledMaintenance | null }>)
          .map((record) => record.payload)
          .filter((row): row is ScheduledMaintenance => Boolean(row?.id && row?.date)),
      );

      const migrationDone = window.localStorage.getItem(ROWS_MIGRATED_KEY) === "1";
      if (!nextRows.length && migrateLocal && !migrationDone && cachedRows.length) {
        const { error: migrationError } = await (supabase as any).rpc(
          "save_relatorio_diario_programacao",
          { _rows: cachedRows, _replace: false },
        );
        if (migrationError) throw migrationError;
        nextRows = cachedRows;
        toast.success("Programação deste computador migrada para a base compartilhada.");
      }

      window.localStorage.setItem(ROWS_MIGRATED_KEY, "1");
      window.localStorage.setItem(ROWS_KEY, JSON.stringify(nextRows));
      setRows(nextRows);
      if (notify) {
        toast.success(
          nextRows.length
            ? `Programação compartilhada atualizada: ${nextRows.length} OS.`
            : "A programação compartilhada está vazia.",
        );
      }
      return nextRows;
    } catch (error: any) {
      console.error("[RelatorioDiario] Falha ao carregar programação compartilhada:", error);
      if (cachedRows.length) {
        setRows(cachedRows);
        if (notify) {
          toast.warning("Nuvem indisponível. Exibindo a última programação salva neste computador.");
        }
      } else if (notify) {
        toast.error(error?.message || "Não foi possível carregar a programação compartilhada.");
      }
      return null;
    } finally {
      setLoadingSchedule(false);
    }
  }, []);

  useEffect(() => {
    const cachedRows = mergeSchedules([], safeRead<ScheduledMaintenance[]>(ROWS_KEY, []));
    setRows(cachedRows);
    const storedTarget = Number(window.localStorage.getItem(TARGET_KEY) ?? "2");
    setTargetPerTeam(Number.isFinite(storedTarget) ? Math.min(10, Math.max(1, storedTarget)) : 2);
    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");
    setNote(window.localStorage.getItem(NOTE_KEY) ?? "");
    void Promise.all([
      loadSharedSchedule(false, true),
      loadPortfolio(false),
      loadExecutions(false),
    ]);
  }, [loadExecutions, loadPortfolio, loadSharedSchedule]);

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
    let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
    let executionTimer: ReturnType<typeof setTimeout> | null = null;
    const refreshSharedSchedule = () => {
      if (scheduleTimer) clearTimeout(scheduleTimer);
      scheduleTimer = setTimeout(() => void loadSharedSchedule(false, false), 180);
    };
    const refreshExecutions = () => {
      if (executionTimer) clearTimeout(executionTimer);
      executionTimer = setTimeout(() => void loadExecutions(false), 120);
    };

    const channel = supabase
      .channel("relatorio-diario-sync-real")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "corretiva_os" },
        () => void loadPortfolio(false),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "relatorio_diario_programacao_rows" },
        refreshSharedSchedule,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "relatorio_diario_execucoes" },
        refreshExecutions,
      )
      .subscribe();

    const refreshAll = () => {
      void loadSharedSchedule(false, false);
      void loadPortfolio(false);
      void loadExecutions(false);
    };
    window.addEventListener("focus", refreshAll);

    return () => {
      if (scheduleTimer) clearTimeout(scheduleTimer);
      if (executionTimer) clearTimeout(executionTimer);
      window.removeEventListener("focus", refreshAll);
      void supabase.removeChannel(channel);
    };
  }, [loadExecutions, loadPortfolio, loadSharedSchedule]);

  const planning = useMemo(
    () =>
      buildWeeklyPlanning({
        scheduledRows: rows,
        correctiveRows: portfolio,
        targetCorrectivesPerTeamPerDay: targetPerTeam,
      }),
    [portfolio, rows, targetPerTeam],
  );

  const correctiveByOs = useMemo(() => buildCorrectiveByOs(portfolio), [portfolio]);
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
      const completionState = rowCompletionState(row, completions, correctiveByOs);
      const completed = completionState !== "pendente";
      if (teamFilter !== "todos" && (row.team || "Sem equipe") !== teamFilter) return false;
      if (completionFilter === "concluidas" && !completed) return false;
      if (completionFilter === "verificacao" && completionState !== "pendente_verificacao") return false;
      if (completionFilter === "pendentes" && completionState !== "pendente") return false;
      if (!q) return true;
      return [row.os, row.name, row.team, row.building, row.floor, row.space, row.asset, row.equipment]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(q);
    });
  }, [completionFilter, completions, correctiveByOs, dayRows, search, teamFilter]);

  const suggestedRows = useMemo(
    () => planning.rows.filter((row) => row.supplementalCorrective && !row.programmedCorrective),
    [planning.rows],
  );

  const selectedCompleted = useMemo(
    () => dayRows.filter((row) => rowIsCompleted(row, completions, correctiveByOs)).length,
    [completions, correctiveByOs, dayRows],
  );
  const selectedPendingVerification = useMemo(
    () =>
      dayRows.filter(
        (row) => rowCompletionState(row, completions, correctiveByOs) === "pendente_verificacao",
      ).length,
    [completions, correctiveByOs, dayRows],
  );
  const selectedPending = useMemo(
    () =>
      dayRows.filter(
        (row) => rowCompletionState(row, completions, correctiveByOs) === "pendente",
      ).length,
    [completions, correctiveByOs, dayRows],
  );
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

      const replaceCurrent = shouldReplaceSchedule(rows, imported);
      const nextRows = replaceCurrent
        ? mergeSchedules([], imported)
        : mergeSchedules(rows, imported);

      const { error: sharedError } = await (supabase as any).rpc(
        "save_relatorio_diario_programacao",
        { _rows: imported, _replace: replaceCurrent },
      );
      if (sharedError) {
        throw new Error(
          `A planilha foi lida, mas não pôde ser compartilhada: ${sharedError.message || "erro de sincronização"}.`,
        );
      }

      setRows(nextRows);
      window.localStorage.setItem(ROWS_KEY, JSON.stringify(nextRows));
      window.localStorage.setItem(ROWS_MIGRATED_KEY, "1");

      const importedDates = Array.from(new Set(imported.map((row) => row.date))).sort();
      if (importedDates.length) setSelectedDate(importedDates[0]);
      toast.success(`${imported.length} OS carregadas na programação compartilhada.`);
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

    const canonicalCorrective = isCorrectiveActivity(row)
      ? correctiveByOs.get(correctiveOsKey(row.os))
      : undefined;
    const canonicalCompleted = Boolean(
      canonicalCorrective && isCompletedCorrectiveStatus(canonicalCorrective.status),
    );

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
        toast.success(
          canonicalCompleted
            ? `Verificação da OS ${row.os} desfeita no Relatório Diário. A conclusão do Corretiva Novo continua registrada e voltou a aguardar verificação.`
            : canonicalCorrective
              ? `OS ${row.os} voltou para pendente e deixou de aguardar confirmação do Corretiva Novo.`
              : `OS ${row.os} voltou para pendente no relatório diário.`,
        );
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
      toast.success(
        canonicalCompleted
          ? `OS ${row.os} verificada no Relatório Diário. A conclusão já estava registrada no Corretiva Novo.`
          : canonicalCorrective
            ? `OS ${row.os} marcada como concluída no Relatório Diário. Agora aguarda confirmação do Corretiva Novo.`
            : `OS ${row.os} marcada como concluída.`,
      );
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível atualizar a execução desta atividade.");
    } finally {
      setCompletingId(null);
    }
  }

  async function clearImportedBase() {
    if (
      !window.confirm(
        "Limpar a programação semanal compartilhada? Ela será removida para todos os usuários e computadores com acesso ao Relatório Diário. Os registros de conclusão permanecerão salvos.",
      )
    ) return;

    setLoadingSchedule(true);
    try {
      const { error } = await (supabase as any).rpc(
        "save_relatorio_diario_programacao",
        { _rows: [], _replace: true },
      );
      if (error) throw error;
      setRows([]);
      window.localStorage.removeItem(ROWS_KEY);
      window.localStorage.setItem(ROWS_MIGRATED_KEY, "1");
      toast.success("Programação compartilhada removida para todos os usuários autorizados.");
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível limpar a programação compartilhada.");
    } finally {
      setLoadingSchedule(false);
    }
  }

  async function generatePdf() {
    if (!selectedDate) return;

    setGenerating(true);
    try {
      // O PDF nunca depende apenas do estado em memória. Antes de emitir, valida
      // de novo o Corretiva Novo e as execuções, inclusive para refletir reaberturas.
      const [freshPortfolio, freshCompletions] = await Promise.all([
        loadPortfolio(false),
        loadExecutions(false),
      ]);

      if (!freshPortfolio || !freshCompletions) {
        throw new Error("Não foi possível validar o status atual das OS antes de gerar o PDF.");
      }

      const freshPlanning = buildWeeklyPlanning({
        scheduledRows: rows,
        correctiveRows: freshPortfolio,
        targetCorrectivesPerTeamPerDay: targetPerTeam,
      });
      const freshSuggestedRows = freshPlanning.rows.filter(
        (row) => row.supplementalCorrective && !row.programmedCorrective,
      );
      if (freshSuggestedRows.length) {
        toast.warning("Confirme os encaixes como Programado antes de gerar o relatório diário.");
        return;
      }

      const pdfRows = sortDailyRows(freshPlanning.rows.filter((row) => row.date === selectedDate));
      if (!pdfRows.length) return toast.error("Não há atividades para este dia.");

      const [sherwinLogo, gpsLogo] = await Promise.all([
        loadPdfLogo(SHERWIN_WILLIAMS_LOGO_URL),
        loadPdfLogo(GRUPO_GPS_LOGO_URL),
      ]);

      const freshCorrectiveByOs = buildCorrectiveByOs(freshPortfolio);
      const completionStateOf = (row: WeeklyPlanningRow) =>
        rowCompletionState(row, freshCompletions, freshCorrectiveByOs);
      const isDone = (row: WeeklyPlanningRow) => completionStateOf(row) !== "pendente";

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      const margin = 10;
      const completed = pdfRows.filter(isDone).length;
      const pendingVerification = pdfRows.filter(
        (row) => completionStateOf(row) === "pendente_verificacao",
      ).length;
      const pending = pdfRows.filter((row) => completionStateOf(row) === "pendente").length;
      const rate = pdfRows.length ? Math.round((completed / pdfRows.length) * 100) : 0;
      const generatedAt = new Date().toLocaleString("pt-BR");

      const drawHeader = () => {
        // Cabeçalho institucional premium, sem marca interna do sistema.
        doc.setFillColor(10, 18, 35);
        doc.rect(0, 0, width, 29, "F");
        doc.setFillColor(15, 118, 110);
        doc.rect(0, 29, width, 1.15, "F");

        // Divisores discretos ajudam a organizar logo / título / logo.
        doc.setDrawColor(51, 65, 85);
        doc.setLineWidth(0.25);
        doc.line(56, 5, 56, 24);
        doc.line(width - 58, 5, width - 58, 24);

        drawContainedLogo(doc, sherwinLogo, margin, 3.1, 40, 20.5);
        drawContainedLogo(doc, gpsLogo, width - margin - 48, 5.1, 48, 16.3);

        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13.2);
        doc.text("RELATÓRIO DIÁRIO DE ATIVIDADES EXECUTADAS", width / 2, 11, {
          align: "center",
        });
        doc.setTextColor(203, 213, 225);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.4);
        doc.text(`${formatDateBr(selectedDate)}  •  Acompanhamento de execução`, width / 2, 18.2, {
          align: "center",
        });
        doc.setFontSize(6.2);
        doc.setTextColor(148, 163, 184);
        doc.text("Sherwin-Williams  •  Grupo GPS", width / 2, 23.6, { align: "center" });
      };

      const metricY = 35;
      const metricGap = 3.5;
      const metricW = (width - margin * 2 - metricGap * 3) / 4;
      const metricH = 14.5;
      void pendingVerification;
      const metrics = [
        {
          label: "ATIVIDADES",
          value: String(pdfRows.length),
          fill: [248, 250, 252] as [number, number, number],
          border: [226, 232, 240] as [number, number, number],
          text: [15, 23, 42] as [number, number, number],
          accent: [71, 85, 105] as [number, number, number],
        },
        {
          label: "CONCLUÍDAS",
          value: String(completed),
          fill: [236, 253, 245] as [number, number, number],
          border: [209, 250, 229] as [number, number, number],
          text: [5, 150, 105] as [number, number, number],
          accent: [5, 150, 105] as [number, number, number],
        },
        {
          label: "PENDENTES",
          value: String(pending),
          fill: [255, 251, 235] as [number, number, number],
          border: [254, 243, 199] as [number, number, number],
          text: [180, 83, 9] as [number, number, number],
          accent: [217, 119, 6] as [number, number, number],
        },
        {
          label: "EXECUÇÃO",
          value: `${rate}%`,
          fill: [239, 246, 255] as [number, number, number],
          border: [219, 234, 254] as [number, number, number],
          text: [3, 105, 161] as [number, number, number],
          accent: [2, 132, 199] as [number, number, number],
        },
      ];

      metrics.forEach((metric, index) => {
        const x = margin + index * (metricW + metricGap);
        doc.setFillColor(...metric.fill);
        doc.setDrawColor(...metric.border);
        doc.roundedRect(x, metricY, metricW, metricH, 1.4, 1.4, "FD");
        doc.setFillColor(...metric.accent);
        doc.roundedRect(x, metricY, 1.8, metricH, 0.8, 0.8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.2);
        doc.setTextColor(100, 116, 139);
        doc.text(metric.label, x + 4.5, metricY + 4.5);
        doc.setTextColor(...metric.text);
        doc.setFontSize(13);
        doc.text(metric.value, x + 4.5, metricY + 11.8);
      });

      const infoY = 53.5;
      const infoH = 14.5;
      const infoW = width - margin * 2;
      const ownerW = infoW * 0.30;
      const noteW = infoW * 0.38;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, infoY, infoW, infoH, 1.2, 1.2, "FD");
      doc.line(margin + ownerW, infoY, margin + ownerW, infoY + infoH);
      doc.line(margin + ownerW + noteW, infoY, margin + ownerW + noteW, infoY + infoH);

      const infoLabelY = infoY + 4.3;
      const infoValueY = infoY + 9.1;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.1);
      doc.setTextColor(100, 116, 139);
      doc.text("RESPONSÁVEL", margin + 3, infoLabelY);
      doc.text("OBSERVAÇÃO", margin + ownerW + 3, infoLabelY);
      doc.text("LEGENDA", margin + ownerW + noteW + 3, infoLabelY);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(30, 41, 59);
      doc.text(author.trim() || "—", margin + 3, infoValueY, { maxWidth: ownerW - 6 });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      const noteLines = doc.splitTextToSize(note.trim() || "—", noteW - 6).slice(0, 2);
      doc.text(noteLines, margin + ownerW + 3, infoValueY, { maxWidth: noteW - 6 });

      const legendX = margin + ownerW + noteW + 4;
      doc.setFillColor(5, 150, 105);
      doc.circle(legendX, infoValueY - 0.9, 1, "F");
      doc.setTextColor(71, 85, 105);
      doc.text("Concluído", legendX + 2.4, infoValueY);
      doc.setFillColor(2, 132, 199);
      doc.circle(legendX + 20, infoValueY - 0.9, 1, "F");
      doc.text("A verificar", legendX + 22.4, infoValueY);
      doc.setFillColor(217, 119, 6);
      doc.circle(legendX + 43, infoValueY - 0.9, 1, "F");
      doc.text("Pendente", legendX + 45.4, infoValueY);

      autoTable(doc, {
        startY: infoY + infoH + 3,
        margin: { left: margin, right: margin, top: 35, bottom: 12 },
        head: [["Status", "OS", "Tipo", "Equipe", "Local", "Atividade executada / programada", "Ativo", "SLA"]],
        body: pdfRows.map((row) => [
          completionStateOf(row) === "concluida"
            ? "CONCLUÍDO"
            : completionStateOf(row) === "pendente_verificacao"
              ? "A VERIFICAR"
              : "PENDENTE",
          row.os,
          row.activity,
          row.team || "—",
          locationLabel(row),
          row.name || row.equipment || "—",
          row.asset || "—",
          row.sla ? formatDateBr(row.sla) : "—",
        ]),
        theme: "grid",
        styles: {
          fontSize: 5.8,
          cellPadding: 1.05,
          valign: "middle",
          lineColor: [226, 232, 240],
          lineWidth: 0.12,
          textColor: [30, 41, 59],
          overflow: "linebreak",
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252],
        },
        headStyles: {
          fillColor: [10, 18, 35],
          textColor: [255, 255, 255],
          fontStyle: "bold",
          fontSize: 6.2,
          cellPadding: 1.45,
          lineColor: [51, 65, 85],
        },
        columnStyles: {
          0: { cellWidth: 22, fontStyle: "bold", halign: "center" },
          1: { cellWidth: 20, fontStyle: "bold" },
          2: { cellWidth: 22 },
          3: { cellWidth: 30 },
          4: { cellWidth: 50 },
          5: { cellWidth: 82 },
          6: { cellWidth: 31 },
          7: { cellWidth: 20 },
        },
        didParseCell: (cell) => {
          if (cell.section !== "body") return;
          const row = pdfRows[cell.row.index];
          if (!row) return;
          const completionState = completionStateOf(row);
          if (completionState === "concluida") {
            cell.cell.styles.fillColor = [240, 253, 247];
            cell.cell.styles.textColor = [30, 41, 59];
            if (cell.column.index === 0) {
              cell.cell.styles.fillColor = [209, 250, 229];
              cell.cell.styles.textColor = [5, 150, 105];
            }
          } else if (completionState === "pendente_verificacao") {
            cell.cell.styles.fillColor = [239, 246, 255];
            cell.cell.styles.textColor = [30, 41, 59];
            if (cell.column.index === 0) {
              cell.cell.styles.fillColor = [219, 234, 254];
              cell.cell.styles.textColor = [2, 132, 199];
            }
          } else if (cell.column.index === 0) {
            cell.cell.styles.fillColor = [254, 249, 195];
            cell.cell.styles.textColor = [180, 83, 9];
          }
        },
        willDrawPage: () => {
          drawHeader();
        },
        didDrawPage: () => {
          const page = doc.getCurrentPageInfo().pageNumber;
          doc.setDrawColor(226, 232, 240);
          doc.line(margin, height - 8, width - margin, height - 8);
          doc.setFont("helvetica", "normal");
          doc.setFontSize(6.2);
          doc.setTextColor(100, 116, 139);
          doc.text(`Gerado em ${generatedAt}`, margin, height - 4.5);
          doc.text(`Página ${page}`, width - margin, height - 4.5, { align: "right" });
        },
      });

      doc.setProperties({
        title: `Relatório Diário de Atividades - ${formatDateBr(selectedDate)}`,
        subject: "Relatório diário de atividades executadas e pendentes",
        author: author.trim() || "Sherwin-Williams • Grupo GPS",
        creator: "Sherwin-Williams • Grupo GPS",
        keywords: "relatório diário, manutenção, facilities, Sherwin-Williams, Grupo GPS",
      });
      doc.save(`RELATORIO_DIARIO_ATIVIDADES_${selectedDate}.pdf`);
      toast.success("Relatório corporativo gerado após validar o status atual das corretivas.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setGenerating(false);
    }
  }

  const hasSchedule = rows.length > 0;
  const syncing = loadingPortfolio || loadingExecutions || loadingSchedule;

  return (
    <main className="mx-auto w-full max-w-[1500px] space-y-3 px-3 py-3 sm:px-5 lg:px-6 lg:py-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="bg-slate-950 px-4 py-4 text-white sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Controle diário de execução</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Relatório Diário • Atividades executadas</h1>
              <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-300">
                Corretivas usam verificação em duas vias: concluir aqui ou no Corretiva Novo marca a atividade como concluída e pendente de verificação; quando as duas confirmações existem, ela passa para concluída e verificada.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void Promise.all([loadSharedSchedule(true, false), loadPortfolio(true), loadExecutions(false)])}
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
              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">Planilhas .xlsx/.xls. A programação fica compartilhada na nuvem e aparece para todos os usuários autorizados.</span>
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
          <p className="mx-auto mt-1 max-w-2xl text-sm text-muted-foreground">Depois você poderá acompanhar automaticamente corretivas e marcar manualmente apenas as demais atividades.</p>
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
                  const done = planning.rows.filter(
                    (row) =>
                      row.date === day.date && rowIsCompleted(row, completions, correctiveByOs),
                  ).length;
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
                    <p className="mt-0.5 text-[11px] text-muted-foreground">Todas as corretivas exibidas podem ser marcadas como concluídas, inclusive encaixes ainda não confirmados como Programado. A conclusão é sincronizada nos dois sentidos: se concluir primeiro no Corretiva Novo, a OS entra aqui como concluída e pendente de verificação; se concluir primeiro aqui, ela aguarda a confirmação do Corretiva Novo.</p>
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
                      <option value="verificacao">Pendente de verificação</option>
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
                      const canonicalCorrective = isCorrectiveActivity(row)
                        ? correctiveByOs.get(correctiveOsKey(row.os))
                        : undefined;
                      const syncedCorrective = Boolean(canonicalCorrective);
                      const completionState = rowCompletionState(row, completions, correctiveByOs);
                      const completed = completionState !== "pendente";
                      const pendingVerification = completionState === "pendente_verificacao";
                      const canonicalCompleted = Boolean(
                        canonicalCorrective && isCompletedCorrectiveStatus(canonicalCorrective.status),
                      );
                      const manualCompleted = Boolean(record);
                      const verifiedCorrective =
                        syncedCorrective && completionState === "concluida";
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
                            {verifiedCorrective ? (
                              <span
                                className="inline-flex min-w-[150px] items-center justify-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-2 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300"
                                title="Conclusão confirmada no Corretiva Novo e verificada no Relatório Diário"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Concluída • verificada
                              </span>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                variant={completed ? "default" : "outline"}
                                disabled={completingId === row.id}
                                onClick={() => void toggleCompleted(row)}
                                className={cn(
                                  "h-8 min-w-[150px] justify-center gap-1.5 px-2.5 text-[10px]",
                                  pendingVerification &&
                                    "border-sky-500/35 bg-sky-600 text-white hover:bg-sky-700",
                                  completed &&
                                    !pendingVerification &&
                                    "bg-emerald-600 text-white hover:bg-emerald-700",
                                )}
                                title={
                                  pendingVerification
                                    ? canonicalCompleted && !manualCompleted
                                      ? "Concluída no Corretiva Novo e pendente de verificação no Relatório Diário. Clique para verificar."
                                      : "Concluída no Relatório Diário e aguardando confirmação do Corretiva Novo. Clique para desfazer."
                                    : completed
                                      ? "Clique para voltar a atividade para pendente"
                                      : syncedCorrective
                                        ? "Marcar corretiva como concluída no Relatório Diário; ficará pendente de confirmação do Corretiva Novo"
                                        : "Marcar atividade como concluída"
                                }
                              >
                                {completingId === row.id ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : completed ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <Circle className="h-3.5 w-3.5" />
                                )}
                                {pendingVerification
                                  ? canonicalCompleted && !manualCompleted
                                    ? "Concluída • verificar"
                                    : "Concluída • aguarda confirmação"
                                  : completed
                                    ? `Concluída${completionTime(record) ? ` • ${completionTime(record)}` : ""}`
                                    : "Marcar concluída"}
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
                  <Stat label="A verificar" value={selectedPendingVerification} tone="rate" />
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
                <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Antes de baixar, o sistema valida novamente os status atuais. O PDF usa somente as marcas Sherwin-Williams e Grupo GPS e exibe “CONCLUÍDO” sem horário.</p>

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

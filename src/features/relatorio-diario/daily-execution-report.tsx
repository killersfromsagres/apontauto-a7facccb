import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  Cloud,
  CloudRain,
  CloudSun,
  Download,
  FileSpreadsheet,
  Loader2,
  RefreshCcw,
  Save,
  Search,
  Sun,
  Thermometer,
  Upload,
  UserRound,
  Wrench,
  X,
} from "lucide-react";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatDateBr,
  formatWeekdayBr,
  inferMaintenanceArea,
  normalizeOs,
  parseScheduleFile,
  type ScheduledMaintenance,
} from "@/features/relatorio-diario/lib/daily-maintenance";
import {
  dailyCorrectiveItemKey,
  filterDailyCorrectives,
  isOperationalCorrective,
  normalizeDailyFilterText,
} from "@/features/relatorio-diario/lib/daily-report-correctives";
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
const AUTHOR_KEY = "apontauto:relatorio-diario:responsavel:v1";
const NOTE_KEY = "apontauto:relatorio-diario:observacao-programacao:v1";
const WEATHER_KEY = "apontauto:relatorio-diario:clima:v1";
const CATALOG_RENDER_LIMIT = 300;

const SHERWIN_WILLIAMS_LOGO_URL =
  "/__l5e/assets-v1/76b6660e-a690-4ff2-8943-c6f831b5ded6/sherwin-williams.png";
const GRUPO_GPS_LOGO_URL =
  "/__l5e/assets-v1/d386a336-b420-4782-9d48-85d30cbb6fee/grupo-gps.png";

type RowCompletionState = "pendente" | "pendente_verificacao" | "concluida";

type CompletionRecord = {
  item_key: string;
  atividade_data: string;
  os: string;
  atividade: string;
  equipe: string | null;
  descricao: string | null;
  observacao?: string | null;
  concluida_em: string;
  concluida_por?: string | null;
};

type CorrectiveCatalogSource = WeeklyCorrectiveSourceRow & {
  solicitante?: string | null;
};

type DailyReportRow = WeeklyPlanningRow & {
  requester?: string;
  sourceStatus?: string;
  originalCorrectiveName?: string;
};

type CorrectiveProgrammingHistory = {
  os_id: string;
  periodo_inicio: string | null;
  periodo_fim: string | null;
  dia_indice: number | null;
  equipe: string | null;
  created_at: string;
};

type PdfLogo = { dataUrl: string; ratio: number };

type WeatherCondition = "ensolarado" | "parcialmente_nublado" | "nublado" | "chuva" | "chuva_forte";

type DailyWeather = {
  condition: WeatherCondition;
  temperature: string;
  rained: boolean;
};

const DEFAULT_WEATHER: DailyWeather = { condition: "ensolarado", temperature: "", rained: false };

const WEATHER_OPTIONS: Array<{ value: WeatherCondition; label: string }> = [
  { value: "ensolarado", label: "Ensolarado" },
  { value: "parcialmente_nublado", label: "Parcialmente nublado" },
  { value: "nublado", label: "Nublado" },
  { value: "chuva", label: "Chovendo" },
  { value: "chuva_forte", label: "Chuva forte" },
];

const weatherConditionLabel = (condition: WeatherCondition) =>
  WEATHER_OPTIONS.find((option) => option.value === condition)?.label ?? "Clima não informado";

const isRainyWeather = (condition: WeatherCondition) => condition === "chuva" || condition === "chuva_forte";

const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace("#", "").trim();
  if (!/^[0-9a-f]{6}$/i.test(normalized)) return [100, 116, 139];
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16),
  ];
};

const tintRgb = (rgb: [number, number, number], amount = 0.88): [number, number, number] =>
  rgb.map((channel) => Math.round(channel + (255 - channel) * amount)) as [number, number, number];

const darkenRgb = (rgb: [number, number, number], amount = 0.62): [number, number, number] =>
  rgb.map((channel) => Math.max(0, Math.round(channel * amount))) as [number, number, number];

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

const stableMergeSchedules = (
  current: ScheduledMaintenance[],
  incoming: ScheduledMaintenance[],
) => {
  const merged = new Map<string, ScheduledMaintenance>();
  current.forEach((row) => merged.set(row.id, row));
  incoming.forEach((row) => merged.set(row.id, row));
  return Array.from(merged.values());
};

const activityKey = (value: unknown) => normalizeDailyFilterText(value);
const isCorrectiveActivity = (row: { activity?: unknown }) => activityKey(row.activity) === "corretiva";
const isPreventiveActivity = (row: { activity?: unknown }) => activityKey(row.activity) === "preventiva";
const correctiveOsKey = (value: unknown) => normalizeOs(value).trim().toUpperCase();
const executionDayOsKey = (date: string, os: unknown) => `${date}|${correctiveOsKey(os)}`;

const locationLabel = (row: { building?: string; floor?: string; space?: string }) =>
  [row.building, row.floor, row.space].filter(Boolean).join(" • ") || "Local não informado";

const normalizePdfTeam = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const preventivePdfTeamPriority = (value: unknown) => {
  const team = normalizePdfTeam(value);
  if (team.includes("civil")) return 0;
  if (team.includes("hidraul")) return 1;
  if (team.includes("climat") || team.includes("refriger")) {
    if (/(^|\s)1(\s|$)/.test(team)) return 2;
    if (/(^|\s)2(\s|$)/.test(team)) return 3;
    if (/(^|\s)3(\s|$)/.test(team)) return 4;
  }
  if (team.includes("eletric")) return 5;
  return 6;
};

const orderPdfRows = <T extends WeeklyPlanningRow>(rows: T[]) =>
  rows
    .map((row, index) => ({
      row,
      index,
      category: isPreventiveActivity(row) ? 0 : isCorrectiveActivity(row) ? 2 : 1,
      teamPriority: isPreventiveActivity(row) ? preventivePdfTeamPriority(row.team) : 0,
    }))
    .sort((a, b) =>
      a.category - b.category ||
      a.teamPriority - b.teamPriority ||
      a.index - b.index,
    )
    .map(({ row }) => row);

const rowTimestamp = (row?: CorrectiveCatalogSource) => {
  if (!row) return 0;
  for (const candidate of [row.updated_at, row.fim, row.data_programada, row.data_criacao]) {
    const value = new Date(String(candidate ?? "")).getTime();
    if (Number.isFinite(value)) return value;
  }
  return 0;
};

const buildCorrectiveByOs = (rows: CorrectiveCatalogSource[]) => {
  const map = new Map<string, CorrectiveCatalogSource>();
  rows.forEach((row) => {
    const key = correctiveOsKey(row.numero_os);
    if (!key) return;
    const current = map.get(key);
    if (!current || rowTimestamp(row) >= rowTimestamp(current)) map.set(key, row);
  });
  return map;
};

const buildExecutionByDayOs = (records: Map<string, CompletionRecord>) => {
  const map = new Map<string, CompletionRecord>();
  records.forEach((record) => {
    if (activityKey(record.atividade) !== "corretiva") return;
    const key = executionDayOsKey(record.atividade_data, record.os);
    if (key.endsWith("|")) return;
    const current = map.get(key);
    const currentTime = new Date(current?.concluida_em ?? "").getTime() || 0;
    const nextTime = new Date(record.concluida_em).getTime() || 0;
    if (!current || nextTime >= currentTime) map.set(key, record);
  });
  return map;
};

const buildCorrectiveExecutionByOs = (records: Map<string, CompletionRecord>) => {
  const map = new Map<string, CompletionRecord>();
  records.forEach((record) => {
    if (activityKey(record.atividade) !== "corretiva") return;
    const key = correctiveOsKey(record.os);
    if (!key) return;
    const current = map.get(key);
    if (!current) {
      map.set(key, record);
      return;
    }
    const currentDate = String(current.atividade_data || "9999-12-31");
    const nextDate = String(record.atividade_data || "9999-12-31");
    const currentTime = new Date(current.concluida_em ?? "").getTime() || 0;
    const nextTime = new Date(record.concluida_em ?? "").getTime() || 0;
    if (nextDate < currentDate || (nextDate === currentDate && nextTime < currentTime)) {
      map.set(key, record);
    }
  });
  return map;
};

const rowCompletionState = (
  row: WeeklyPlanningRow,
  executionMap: Map<string, CompletionRecord>,
  correctiveByOs: Map<string, CorrectiveCatalogSource>,
): RowCompletionState => {
  const manualExecution = executionMap.has(row.id);
  if (isCorrectiveActivity(row)) {
    const canonical = correctiveByOs.get(correctiveOsKey(row.os));
    if (canonical) {
      const canonicalCompleted = isCompletedCorrectiveStatus(canonical.status);
      // Registrar no Relatório Diário conclui esta linha no relatório, mas não
      // altera o status oficial do chamado no Corretiva Novo.
      if (manualExecution) return "concluida";
      if (canonicalCompleted) return "pendente_verificacao";
      return "pendente";
    }
  }
  return manualExecution ? "concluida" : "pendente";
};

const reportCorrectivesForDate = (planningRows: WeeklyPlanningRow[], date: string) =>
  planningRows.filter(
    (row) =>
      row.date === date &&
      isCorrectiveActivity(row) &&
      (!row.supplementalCorrective || row.programmedCorrective),
  );

function sourceToDailyRow(
  source: CorrectiveCatalogSource,
  date: string,
  id: string,
  base?: WeeklyPlanningRow,
): DailyReportRow {
  const os = normalizeOs(source.numero_os) || base?.os || String(source.id ?? "");
  const name = String(source.nome_os ?? "").trim() || base?.name || "Chamado corretivo";
  const equipment = String(source.equipamento ?? "").trim() || base?.equipment || "";
  const team = String(source.equipe ?? "").trim() || base?.team || "Sem equipe";
  const building = String(source.predio ?? "").trim() || base?.building || "";
  const floor = String(source.andar ?? "").trim() || base?.floor || "";
  const space = String(source.local ?? "").trim() || base?.space || "";
  const sla = String(source.data_sla ?? "").trim() || base?.sla || "";

  return {
    ...(base ?? {
      id,
      date,
      os,
      name,
      building,
      floor,
      space,
      activity: "Corretiva" as const,
      sla,
      team,
      area: inferMaintenanceArea(team, "Corretiva Novo", `${name} ${equipment}`),
      asset: String(source.ativo ?? "").trim(),
      equipment,
      observation: "",
      sourceFile: "Corretiva Novo",
    }),
    id,
    date,
    os,
    name,
    originalCorrectiveName: name,
    building,
    floor,
    space,
    activity: "Corretiva",
    sla,
    team,
    area: inferMaintenanceArea(team, "Corretiva Novo", `${name} ${equipment}`),
    asset: String(source.ativo ?? "").trim() || base?.asset || "",
    equipment,
    requester: String(source.solicitante ?? "").trim(),
    sourceStatus: String(source.status ?? "").trim(),
    sourceCorrectiveId: String(source.id ?? "").trim() || base?.sourceCorrectiveId,
    planningOrigin: base?.planningOrigin,
    programmedCorrective: base?.programmedCorrective,
    supplementalCorrective: base?.supplementalCorrective,
  };
}

function buildDailyRows({
  date,
  scheduleRows,
  portfolio,
  completions,
}: {
  date: string;
  scheduleRows: ScheduledMaintenance[];
  portfolio: CorrectiveCatalogSource[];
  completions: Map<string, CompletionRecord>;
}) {
  const canonicalByOs = buildCorrectiveByOs(portfolio);
  const preventives: DailyReportRow[] = scheduleRows
    .filter((row) => row.date === date && isPreventiveActivity(row))
    .map((row) => ({ ...row, planningOrigin: "planilha-semanal" as const }));

  // Corretivas programadas servem apenas como referência no catálogo.
  // Elas entram no Relatório Diário/PDF somente depois de o usuário clicar
  // em "Adicionar e concluir", o que cria um registro de execução do dia.
  const correctiveRows: DailyReportRow[] = [];
  const knownItemKeys = new Set<string>();
  const knownOs = new Set<string>();

  completions.forEach((record) => {
    if (record.atividade_data !== date || activityKey(record.atividade) !== "corretiva") return;
    const osKey = correctiveOsKey(record.os);
    if (knownItemKeys.has(record.item_key) || (osKey && knownOs.has(osKey))) return;

    const source = canonicalByOs.get(osKey);
    if (source) {
      correctiveRows.push(sourceToDailyRow(source, date, record.item_key));
    } else {
      const team = record.equipe || "Sem equipe";
      correctiveRows.push({
        id: record.item_key,
        date,
        os: record.os,
        name: record.descricao || "Corretiva registrada no Relatório Diário",
        originalCorrectiveName: record.descricao || "",
        building: "",
        floor: "",
        space: "",
        activity: "Corretiva",
        sla: "",
        team,
        area: inferMaintenanceArea(team, "Relatório Diário", record.descricao || ""),
        asset: "",
        equipment: "",
        observation: record.observacao || "",
        sourceFile: "Relatório Diário",
        requester: "",
        sourceStatus: "",
      });
    }
    knownItemKeys.add(record.item_key);
    if (osKey) knownOs.add(osKey);
  });

  return [...preventives, ...correctiveRows];
}

const formatSourceStatus = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "Sem status";
  const spaced = raw.replace(/_/g, " ");
  return spaced.charAt(0).toLocaleUpperCase("pt-BR") + spaced.slice(1);
};

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      typeof reader.result === "string"
        ? resolve(reader.result)
        : reject(new Error("Não foi possível ler a logo."));
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
  return {
    dataUrl: sourceDataUrl,
    ratio: (image.naturalWidth || image.width || 1) / (image.naturalHeight || image.height || 1),
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

function drawPdfWeatherIcon(doc: jsPDF, condition: WeatherCondition, x: number, y: number) {
  const rainy = isRainyWeather(condition);
  const cloudy = condition !== "ensolarado";
  const partlyCloudy = condition === "parcialmente_nublado";

  if (!cloudy || partlyCloudy) {
    doc.setDrawColor(217, 119, 6);
    doc.setFillColor(245, 158, 11);
    const sunX = partlyCloudy ? x - 1.3 : x;
    const sunY = partlyCloudy ? y - 0.8 : y;
    doc.circle(sunX, sunY, 2.1, "F");
    doc.setLineWidth(0.45);
    for (let angle = 0; angle < 360; angle += 45) {
      const radians = (angle * Math.PI) / 180;
      doc.line(
        sunX + Math.cos(radians) * 3.1,
        sunY + Math.sin(radians) * 3.1,
        sunX + Math.cos(radians) * 4.1,
        sunY + Math.sin(radians) * 4.1,
      );
    }
  }

  if (cloudy) {
    const cloudX = partlyCloudy ? x + 1.5 : x;
    const cloudY = partlyCloudy ? y + 1.2 : y;
    doc.setFillColor(rainy ? 14 : 100, rainy ? 165 : 116, rainy ? 233 : 139);
    doc.circle(cloudX - 2.2, cloudY + 0.2, 1.8, "F");
    doc.circle(cloudX, cloudY - 0.8, 2.25, "F");
    doc.circle(cloudX + 2.4, cloudY + 0.15, 1.75, "F");
    doc.roundedRect(cloudX - 3.8, cloudY, 7.6, 2.4, 1, 1, "F");
    if (rainy) {
      doc.setDrawColor(2, 132, 199);
      doc.setLineWidth(0.45);
      const drops = condition === "chuva_forte" ? [-2.4, -0.8, 0.8, 2.4] : [-1.7, 0, 1.7];
      drops.forEach((offset, index) => {
        const dropY = cloudY + 3.4 + (index % 2) * 0.5;
        doc.line(cloudX + offset, dropY, cloudX + offset - 0.55, dropY + 1.35);
      });
    }
  }
}

function WeatherUiIcon({ condition, className }: { condition: WeatherCondition; className?: string }) {
  if (condition === "ensolarado") return <Sun className={className} />;
  if (condition === "parcialmente_nublado") return <CloudSun className={className} />;
  if (isRainyWeather(condition)) return <CloudRain className={className} />;
  return <Cloud className={className} />;
}

export function DailyExecutionReport() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ScheduledMaintenance[]>([]);
  const [portfolio, setPortfolio] = useState<CorrectiveCatalogSource[]>([]);
  const [completions, setCompletions] = useState<Map<string, CompletionRecord>>(new Map());
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [correctiveSearch, setCorrectiveSearch] = useState("");
  const [buildingFilter, setBuildingFilter] = useState("todos");
  const [requesterFilter, setRequesterFilter] = useState("");
  const [correctiveTeamFilter, setCorrectiveTeamFilter] = useState("todos");
  const [sourceStatusFilter, setSourceStatusFilter] = useState("todos");
  const [workDrafts, setWorkDrafts] = useState<Record<string, string>>({});
  const [observationDrafts, setObservationDrafts] = useState<Record<string, string>>({});
  const [author, setAuthor] = useState("");
  const [note, setNote] = useState("");
  const [weatherByDate, setWeatherByDate] = useState<Record<string, DailyWeather>>({});
  const [loadingPortfolio, setLoadingPortfolio] = useState(false);
  const [loadingExecutions, setLoadingExecutions] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [importing, setImporting] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savingPreventives, setSavingPreventives] = useState<Set<string>>(() => new Set());
  const [savingObservations, setSavingObservations] = useState<Set<string>>(() => new Set());
  const [savingAllPreventives, setSavingAllPreventives] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dragging, setDragging] = useState(false);
  const weather = weatherByDate[selectedDate] ?? DEFAULT_WEATHER;

  const updateWeather = (patch: Partial<DailyWeather>) => {
    setWeatherByDate((current) => ({
      ...current,
      [selectedDate]: { ...(current[selectedDate] ?? DEFAULT_WEATHER), ...patch },
    }));
  };

  const loadPortfolio = useCallback(async (notify = false) => {
    setLoadingPortfolio(true);
    try {
      const [osResult, historyResult] = await Promise.all([
        supabase
          .from("corretiva_os")
          .select(
            "id,numero_os,status,fim,observacao_conclusao,data_programada,data_criacao,data_sla,equipe,nome_os,equipamento,ativo,patrimonio,predio,andar,local,solicitante,programacao_status,programacao_periodo_inicio,programacao_periodo_fim,programacao_dia_indice,programacao_equipe,programacao_tentativas,tipo_importacao,updated_at",
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

      const next = ((osResult.data ?? []) as CorrectiveCatalogSource[]).map((row) => {
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
      if (notify) toast.success(`${next.length} corretiva(s) sincronizadas com o Corretiva Novo.`);
      return next;
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível carregar os chamados do Corretiva Novo.");
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
        .select("item_key,atividade_data,os,atividade,equipe,descricao,observacao,concluida_em,concluida_por")
        .order("atividade_data", { ascending: false })
        .limit(10000);
      if (error) throw error;
      const next = new Map<string, CompletionRecord>();
      ((data ?? []) as CompletionRecord[]).forEach((record) => next.set(record.item_key, record));
      setCompletions(next);
      if (notify) toast.success("Execuções do Relatório Diário atualizadas.");
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
    const cachedRows = safeRead<ScheduledMaintenance[]>(ROWS_KEY, []);
    try {
      const { data, error } = await (supabase as any)
        .from("relatorio_diario_programacao_rows")
        .select("payload,atividade_data,source_file,created_at")
        .order("atividade_data", { ascending: true })
        .order("created_at", { ascending: true })
        .limit(20000);
      if (error) throw error;

      let nextRows = stableMergeSchedules(
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
      }

      window.localStorage.setItem(ROWS_MIGRATED_KEY, "1");
      window.localStorage.setItem(ROWS_KEY, JSON.stringify(nextRows));
      setRows(nextRows);
      if (notify) {
        toast.success(
          nextRows.length
            ? `Programação fixa atualizada: ${nextRows.length} atividade(s).`
            : "A programação compartilhada está vazia.",
        );
      }
      return nextRows;
    } catch (error: any) {
      console.error("[RelatorioDiario] Falha ao carregar programação compartilhada:", error);
      if (cachedRows.length) {
        setRows(cachedRows);
        if (notify) toast.warning("Nuvem indisponível. Exibindo a última programação salva.");
      } else if (notify) {
        toast.error(error?.message || "Não foi possível carregar a programação compartilhada.");
      }
      return null;
    } finally {
      setLoadingSchedule(false);
    }
  }, []);

  useEffect(() => {
    setRows(safeRead<ScheduledMaintenance[]>(ROWS_KEY, []));
    setAuthor(window.localStorage.getItem(AUTHOR_KEY) ?? "");
    setNote(window.localStorage.getItem(NOTE_KEY) ?? "");
    setWeatherByDate(safeRead<Record<string, DailyWeather>>(WEATHER_KEY, {}));
    void Promise.all([
      loadSharedSchedule(false, true),
      loadPortfolio(false),
      loadExecutions(false),
    ]);
  }, [loadExecutions, loadPortfolio, loadSharedSchedule]);

  useEffect(() => window.localStorage.setItem(ROWS_KEY, JSON.stringify(rows)), [rows]);
  useEffect(() => window.localStorage.setItem(AUTHOR_KEY, author), [author]);
  useEffect(() => window.localStorage.setItem(NOTE_KEY, note), [note]);
  useEffect(() => window.localStorage.setItem(WEATHER_KEY, JSON.stringify(weatherByDate)), [weatherByDate]);

  useEffect(() => {
    let scheduleTimer: ReturnType<typeof setTimeout> | null = null;
    let executionTimer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase
      .channel("relatorio-diario-operacional-v3")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "corretiva_os" },
        () => void loadPortfolio(false),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "relatorio_diario_programacao_rows" },
        () => {
          if (scheduleTimer) clearTimeout(scheduleTimer);
          scheduleTimer = setTimeout(() => void loadSharedSchedule(false, false), 180);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "relatorio_diario_execucoes" },
        () => {
          if (executionTimer) clearTimeout(executionTimer);
          executionTimer = setTimeout(() => void loadExecutions(false), 120);
        },
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
        targetCorrectivesPerTeamPerDay: 1,
      }),
    [portfolio, rows],
  );
  const correctiveByOs = useMemo(() => buildCorrectiveByOs(portfolio), [portfolio]);
  const executionByDayOs = useMemo(() => buildExecutionByDayOs(completions), [completions]);
  const correctiveExecutionByOs = useMemo(() => buildCorrectiveExecutionByOs(completions), [completions]);
  const dates = planning.days.map((day) => day.date);

  useEffect(() => {
    if (!dates.length || dates.includes(selectedDate)) return;
    const today = todayIso();
    setSelectedDate(dates.includes(today) ? today : dates[0]);
  }, [dates, selectedDate]);

  const fixedPreventives = useMemo(
    () => rows.filter((row) => row.date === selectedDate && isPreventiveActivity(row)),
    [rows, selectedDate],
  );
  const scheduledCorrectives = useMemo(
    () => reportCorrectivesForDate(planning.rows, selectedDate),
    [planning.rows, selectedDate],
  );
  const dailyRows = useMemo(
    () =>
      buildDailyRows({
        date: selectedDate,
        scheduleRows: rows,
        portfolio,
        completions,
      }),
    [completions, planning.rows, portfolio, rows, selectedDate],
  );
  const reportCorrectives = useMemo(() => dailyRows.filter(isCorrectiveActivity), [dailyRows]);

  const operationalCatalog = useMemo(
    () => Array.from(correctiveByOs.values()).filter(isOperationalCorrective),
    [correctiveByOs],
  );
  const buildingOptions = useMemo(
    () =>
      Array.from(new Set(operationalCatalog.map((row) => String(row.predio ?? "").trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "pt-BR", { numeric: true }),
      ),
    [operationalCatalog],
  );
  const teamOptions = useMemo(
    () =>
      Array.from(new Set(operationalCatalog.map((row) => String(row.equipe ?? "").trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [operationalCatalog],
  );
  const statusOptions = useMemo(
    () =>
      Array.from(new Set(operationalCatalog.map((row) => String(row.status ?? "").trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b, "pt-BR"),
      ),
    [operationalCatalog],
  );

  const filteredCorrectives = useMemo(
    () =>
      filterDailyCorrectives(operationalCatalog, {
        search: correctiveSearch,
        building: buildingFilter,
        requester: requesterFilter,
        team: correctiveTeamFilter,
        status: sourceStatusFilter,
      }),
    [buildingFilter, correctiveSearch, correctiveTeamFilter, operationalCatalog, requesterFilter, sourceStatusFilter],
  );

  const scheduledByOs = useMemo(() => {
    const map = new Map<string, WeeklyPlanningRow>();
    scheduledCorrectives.forEach((row) => {
      const key = correctiveOsKey(row.os);
      if (key && !map.has(key)) map.set(key, row);
    });
    return map;
  }, [scheduledCorrectives]);

  const selectedPerformed = dailyRows.filter(
    (row) => rowCompletionState(row, completions, correctiveByOs) !== "pendente",
  ).length;
  const selectedCompleted = dailyRows.filter(
    (row) => rowCompletionState(row, completions, correctiveByOs) === "concluida",
  ).length;
  const selectedAwaiting = dailyRows.filter(
    (row) => rowCompletionState(row, completions, correctiveByOs) === "pendente_verificacao",
  ).length;
  const selectedPending = dailyRows.filter(
    (row) => rowCompletionState(row, completions, correctiveByOs) === "pendente",
  ).length;
  const completionRate = dailyRows.length ? Math.round((selectedPerformed / dailyRows.length) * 100) : 0;

  const daySummary = useCallback(
    (date: string) => {
      const dayRows = buildDailyRows({ date, scheduleRows: rows, portfolio, completions });
      return {
        total: dayRows.length,
        done: dayRows.filter((row) => rowCompletionState(row, completions, correctiveByOs) !== "pendente").length,
      };
    },
    [completions, correctiveByOs, planning.rows, portfolio, rows],
  );

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
      const nextRows = replaceCurrent ? stableMergeSchedules([], imported) : stableMergeSchedules(rows, imported);
      const { error } = await (supabase as any).rpc("save_relatorio_diario_programacao", {
        _rows: imported,
        _replace: replaceCurrent,
      });
      if (error) throw error;
      setRows(nextRows);
      window.localStorage.setItem(ROWS_MIGRATED_KEY, "1");
      const importedDates = Array.from(new Set(imported.map((row) => row.date)));
      if (importedDates.length) setSelectedDate(importedDates[0]);
      toast.success(`${imported.length} atividade(s) carregadas mantendo a ordem das planilhas.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha ao importar as planilhas.");
    } finally {
      setImporting(false);
      setDragging(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function upsertExecution(
    row: WeeklyPlanningRow,
    description: string | null,
    observation?: string | null,
  ) {
    const current = completions.get(row.id);
    const completedAt = current?.concluida_em || new Date().toISOString();
    const normalizedObservation = observation === undefined
      ? current?.observacao ?? null
      : observation?.trim() || null;
    const payload = {
      item_key: row.id,
      atividade_data: row.date,
      os: row.os || "",
      atividade: row.activity,
      equipe: row.team || null,
      descricao: description,
      observacao: normalizedObservation,
      concluida_em: completedAt,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await (supabase as any)
      .from("relatorio_diario_execucoes")
      .upsert(payload, { onConflict: "item_key" })
      .select("item_key,atividade_data,os,atividade,equipe,descricao,observacao,concluida_em,concluida_por")
      .single();
    if (error) throw error;
    setCompletions((map) => {
      const next = new Map(map);
      next.set(row.id, data as CompletionRecord);
      return next;
    });
    return data as CompletionRecord;
  }

  async function deleteExecution(row: WeeklyPlanningRow) {
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
  }

  const observationDraftValue = (row: WeeklyPlanningRow) =>
    observationDrafts[row.id] ?? completions.get(row.id)?.observacao ?? row.observation ?? "";

  async function saveCompletedObservation(row: WeeklyPlanningRow) {
    const current = completions.get(row.id);
    if (!current || savingObservations.has(row.id)) return;
    const nextObservation = observationDraftValue(row).trim();
    const currentObservation = String(current.observacao ?? "").trim();
    if (nextObservation === currentObservation) return;

    setSavingObservations((saving) => new Set(saving).add(row.id));
    try {
      await upsertExecution(row, current.descricao, nextObservation || null);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar a observação.");
    } finally {
      setSavingObservations((saving) => {
        const next = new Set(saving);
        next.delete(row.id);
        return next;
      });
    }
  }

  async function togglePreventive(row: WeeklyPlanningRow) {
    if (savingAllPreventives || savingPreventives.has(row.id)) return;

    const previous = completions.get(row.id);
    const completing = !previous;
    const optimistic: CompletionRecord = {
      item_key: row.id,
      atividade_data: row.date,
      os: row.os || "",
      atividade: row.activity,
      equipe: row.team || null,
      descricao: row.name || row.equipment || null,
      observacao: observationDraftValue(row).trim() || previous?.observacao || null,
      concluida_em: previous?.concluida_em || new Date().toISOString(),
      concluida_por: previous?.concluida_por ?? null,
    };

    setSavingPreventives((current) => {
      const next = new Set(current);
      next.add(row.id);
      return next;
    });

    // Atualização otimista: o clique aparece na tela imediatamente.
    setCompletions((current) => {
      const next = new Map(current);
      if (completing) next.set(row.id, optimistic);
      else next.delete(row.id);
      return next;
    });

    try {
      if (completing) {
        await upsertExecution(row, optimistic.descricao, optimistic.observacao ?? null);
        toast.success(`Preventiva ${row.os} marcada como concluída.`);
      } else {
        await deleteExecution(row);
        toast.success(`Preventiva ${row.os} voltou para pendente.`);
      }
    } catch (error: any) {
      // Se o servidor falhar, restaura exatamente o estado anterior.
      setCompletions((current) => {
        const next = new Map(current);
        if (previous) next.set(row.id, previous);
        else next.delete(row.id);
        return next;
      });
      toast.error(error?.message || "Não foi possível atualizar esta preventiva. A alteração foi desfeita.");
    } finally {
      setSavingPreventives((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    }
  }

  async function markAllPreventivesCompleted() {
    if (savingAllPreventives || !fixedPreventives.length) return;
    const pendingRows = fixedPreventives.filter((row) => !completions.has(row.id));
    if (!pendingRows.length) {
      toast.info("Todas as preventivas deste dia já estão concluídas.");
      return;
    }

    const now = new Date().toISOString();
    const optimisticRecords = pendingRows.map<CompletionRecord>((row) => ({
      item_key: row.id,
      atividade_data: row.date,
      os: row.os || "",
      atividade: row.activity,
      equipe: row.team || null,
      descricao: row.name || row.equipment || null,
      observacao: observationDraftValue(row).trim() || null,
      concluida_em: now,
      concluida_por: null,
    }));
    const ids = new Set(pendingRows.map((row) => row.id));

    setSavingAllPreventives(true);
    setSavingPreventives((current) => new Set([...current, ...ids]));
    setCompletions((current) => {
      const next = new Map(current);
      optimisticRecords.forEach((record) => next.set(record.item_key, record));
      return next;
    });

    try {
      const payload = optimisticRecords.map(({ concluida_por: _ignored, ...record }) => ({
        ...record,
        updated_at: now,
      }));
      const { data, error } = await (supabase as any)
        .from("relatorio_diario_execucoes")
        .upsert(payload, { onConflict: "item_key" })
        .select("item_key,atividade_data,os,atividade,equipe,descricao,observacao,concluida_em,concluida_por");
      if (error) throw error;

      setCompletions((current) => {
        const next = new Map(current);
        ((data ?? []) as CompletionRecord[]).forEach((record) => next.set(record.item_key, record));
        return next;
      });
      toast.success(`${pendingRows.length} preventiva(s) marcada(s) como concluída(s).`);
    } catch (error: any) {
      setCompletions((current) => {
        const next = new Map(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      toast.error(error?.message || "Não foi possível concluir todas as preventivas. Nenhuma alteração foi mantida.");
      void loadExecutions(false);
    } finally {
      setSavingPreventives((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
      setSavingAllPreventives(false);
    }
  }

  const draftValue = (row: WeeklyPlanningRow) =>
    workDrafts[row.id] ?? completions.get(row.id)?.descricao ?? "";

  async function addCorrectiveToDailyReport(row: DailyReportRow, source?: CorrectiveCatalogSource) {
    if (savingKey === row.id || completions.has(row.id)) return;
    const previousExecution = correctiveExecutionByOs.get(correctiveOsKey(row.os));
    if (previousExecution) {
      toast.info(
        `OS ${row.os} já foi adicionada ao Relatório Diário em ${formatDateBr(previousExecution.atividade_data)}. Para usar novamente, desfaça primeiro o registro original.`,
      );
      return;
    }
    const description =
      draftValue(row).trim() ||
      String(source?.observacao_conclusao ?? "").trim() ||
      String(row.name ?? "").trim() ||
      String(row.equipment ?? "").trim() ||
      "Concluída via Relatório Diário";
    const observation = observationDraftValue(row).trim() || null;
    const optimistic: CompletionRecord = {
      item_key: row.id,
      atividade_data: row.date,
      os: row.os || "",
      atividade: "Corretiva",
      equipe: row.team || null,
      descricao: description,
      observacao: observation,
      concluida_em: new Date().toISOString(),
      concluida_por: null,
    };

    setSavingKey(row.id);
    setWorkDrafts((current) => ({ ...current, [row.id]: description }));
    // Resposta imediata ao clique: a OS já aparece como concluída e entra no
    // relatório/PDF. Se o banco falhar, o estado otimista é revertido.
    setCompletions((current) => {
      const next = new Map(current);
      next.set(row.id, optimistic);
      return next;
    });

    try {
      await upsertExecution(row, description, observation);
      toast.success(
        `OS ${row.os} adicionada e concluída via Relatório Diário. Ela já aparece no Corretiva Histórico com essa origem.`,
      );
    } catch (error: any) {
      setCompletions((current) => {
        const next = new Map(current);
        next.delete(row.id);
        return next;
      });
      if (error?.code === "23505") {
        void loadExecutions(false);
        toast.warning(error?.message || `A OS ${row.os} já foi adicionada ao Relatório Diário anteriormente.`);
      } else {
        toast.error(error?.message || "Não foi possível adicionar e concluir esta corretiva. A alteração foi desfeita.");
      }
    } finally {
      setSavingKey(null);
    }
  }

  async function saveCorrectiveDescription(row: DailyReportRow) {
    const current = completions.get(row.id);
    if (!current) return;
    const description = draftValue(row).trim();
    if (!description) return toast.warning("O campo “O que foi feito” não pode ficar vazio.");
    const observation = observationDraftValue(row).trim() || null;
    setSavingKey(row.id);
    try {
      await upsertExecution(row, description, observation);
      toast.success(`OS ${row.os} atualizada.`);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível salvar a descrição e a observação.");
    } finally {
      setSavingKey(null);
    }
  }

  async function undoCorrective(row: DailyReportRow) {
    if (savingKey || !completions.has(row.id)) return;
    setSavingKey(row.id);
    try {
      await deleteExecution(row);
      toast.success(`Registro diário da OS ${row.os} desfeito. O Corretiva Novo não foi alterado.`);
    } catch (error: any) {
      toast.error(error?.message || "Não foi possível desfazer esta execução.");
    } finally {
      setSavingKey(null);
    }
  }

  const clearCorrectiveFilters = () => {
    setCorrectiveSearch("");
    setBuildingFilter("todos");
    setRequesterFilter("");
    setCorrectiveTeamFilter("todos");
    setSourceStatusFilter("todos");
  };

  async function generatePdf() {
    if (!selectedDate) return;
    setGenerating(true);
    try {
      const [freshPortfolio, freshCompletions] = await Promise.all([
        loadPortfolio(false),
        loadExecutions(false),
      ]);
      if (!freshPortfolio || !freshCompletions) {
        throw new Error("Não foi possível validar os dados atuais antes de gerar o PDF.");
      }
      const pdfRows = buildDailyRows({
        date: selectedDate,
        scheduleRows: rows,
        portfolio: freshPortfolio,
        completions: freshCompletions,
      });
      if (!pdfRows.length) return toast.error("Não há atividades para este dia.");
      const orderedPdfRows = orderPdfRows(pdfRows);

      const [sherwinLogo, gpsLogo] = await Promise.all([
        loadPdfLogo(SHERWIN_WILLIAMS_LOGO_URL),
        loadPdfLogo(GRUPO_GPS_LOGO_URL),
      ]);
      const freshCorrectiveByOs = buildCorrectiveByOs(freshPortfolio);
      const stateOf = (row: WeeklyPlanningRow) => rowCompletionState(row, freshCompletions, freshCorrectiveByOs);
      const performed = pdfRows.filter((row) => stateOf(row) !== "pendente").length;
      const rate = pdfRows.length ? Math.round((performed / pdfRows.length) * 100) : 0;

      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const width = doc.internal.pageSize.getWidth();
      const height = doc.internal.pageSize.getHeight();
      const margin = 10;
      const generatedAt = new Date().toLocaleString("pt-BR");

      const drawHeader = () => {
        doc.setFillColor(10, 18, 35);
        doc.rect(0, 0, width, 29, "F");
        doc.setFillColor(15, 118, 110);
        doc.rect(0, 29, width, 1.15, "F");
        doc.setDrawColor(51, 65, 85);
        doc.setLineWidth(0.25);
        doc.line(56, 5, 56, 24);
        doc.line(width - 58, 5, width - 58, 24);
        drawContainedLogo(doc, sherwinLogo, margin, 3.1, 40, 20.5);
        drawContainedLogo(doc, gpsLogo, width - margin - 48, 5.1, 48, 16.3);
        doc.setTextColor(255, 255, 255);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13.2);
        doc.text("RELATÓRIO DIÁRIO DE ATIVIDADES EXECUTADAS", width / 2, 11, { align: "center" });
        doc.setTextColor(203, 213, 225);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7.4);
        doc.text(`${formatDateBr(selectedDate)}  •  Acompanhamento de execução`, width / 2, 18.2, { align: "center" });
        doc.setFontSize(6.2);
        doc.setTextColor(148, 163, 184);
        doc.text("Sherwin-Williams  •  Grupo GPS", width / 2, 23.6, { align: "center" });
      };

      const metricY = 35;
      const metricGap = 3.5;
      const metricH = 17.5;
      const metricW = (width - margin * 2 - metricGap * 2) / 3;
      const metrics = [
        ["ATIVIDADES", String(pdfRows.length), [248, 250, 252], [71, 85, 105]],
        ["EXECUÇÃO", `${rate}%`, [239, 246, 255], [2, 132, 199]],
      ] as const;
      metrics.forEach(([label, value, fill, accent], index) => {
        const x = margin + index * (metricW + metricGap);
        doc.setFillColor(fill[0], fill[1], fill[2]);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, metricY, metricW, metricH, 1.4, 1.4, "FD");
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.roundedRect(x, metricY, 1.8, metricH, 0.8, 0.8, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(6.2);
        doc.setTextColor(100, 116, 139);
        doc.text(label, x + 4.5, metricY + 4.5);
        doc.setTextColor(accent[0], accent[1], accent[2]);
        doc.setFontSize(13);
        doc.text(value, x + 4.5, metricY + 12.7);
      });

      const climateX = margin + 2 * (metricW + metricGap);
      const climateRain = weather.rained || isRainyWeather(weather.condition);
      const climateAccent: [number, number, number] = climateRain
        ? [2, 132, 199]
        : weather.condition === "ensolarado"
          ? [217, 119, 6]
          : [71, 85, 105];
      const climateFill: [number, number, number] = climateRain
        ? [240, 249, 255]
        : weather.condition === "ensolarado"
          ? [255, 251, 235]
          : [248, 250, 252];
      const climateTemperature = weather.temperature.trim()
        ? `${weather.temperature.trim().replace(".", ",")} °C`
        : "Temperatura não informada";
      doc.setFillColor(climateFill[0], climateFill[1], climateFill[2]);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(climateX, metricY, metricW, metricH, 1.4, 1.4, "FD");
      doc.setFillColor(climateAccent[0], climateAccent[1], climateAccent[2]);
      doc.roundedRect(climateX, metricY, 1.8, metricH, 0.8, 0.8, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(6.2);
      doc.setTextColor(100, 116, 139);
      doc.text("CLIMA", climateX + 4.5, metricY + 4.4);
      doc.setTextColor(climateAccent[0], climateAccent[1], climateAccent[2]);
      doc.setFontSize(9.2);
      doc.text(weatherConditionLabel(weather.condition), climateX + 4.5, metricY + 9.8, { maxWidth: metricW - 21 });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.9);
      doc.setTextColor(71, 85, 105);
      doc.text(
        `${climateTemperature}${climateRain ? " • Chuva registrada" : ""}`,
        climateX + 4.5,
        metricY + 14.4,
        { maxWidth: metricW - 21 },
      );
      drawPdfWeatherIcon(doc, weather.condition, climateX + metricW - 10.2, metricY + 8.6);

      const infoY = 56.5;
      const infoH = 14.5;
      const infoW = width - margin * 2;
      const ownerW = infoW * 0.3;
      const noteW = infoW * 0.45;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(margin, infoY, infoW, infoH, 1.2, 1.2, "FD");
      doc.line(margin + ownerW, infoY, margin + ownerW, infoY + infoH);
      doc.line(margin + ownerW + noteW, infoY, margin + ownerW + noteW, infoY + infoH);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.1);
      doc.setTextColor(100, 116, 139);
      doc.text("RESPONSÁVEL", margin + 3, infoY + 4.3);
      doc.text("OBSERVAÇÃO", margin + ownerW + 3, infoY + 4.3);
      doc.text("COMPOSIÇÃO", margin + ownerW + noteW + 3, infoY + 4.3);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(7.2);
      doc.setTextColor(30, 41, 59);
      doc.text(author.trim() || "—", margin + 3, infoY + 9.1, { maxWidth: ownerW - 6 });
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.text(doc.splitTextToSize(note.trim() || "—", noteW - 6).slice(0, 2), margin + ownerW + 3, infoY + 9.1);
      const preventiveCount = pdfRows.filter(isPreventiveActivity).length;
      const correctiveCount = pdfRows.filter(isCorrectiveActivity).length;
      doc.text(`${preventiveCount} preventiva(s) • ${correctiveCount} corretiva(s)`, margin + ownerW + noteW + 3, infoY + 9.1);

      autoTable(doc, {
        startY: infoY + infoH + 3,
        margin: { left: margin, right: margin, top: 35, bottom: 12 },
        head: [["Status", "OS", "Tipo", "Equipe", "Local", "Atividade / O que foi feito", "Observação"]],
        body: orderedPdfRows.map((row) => {
          const execution = freshCompletions.get(row.id) ??
            buildExecutionByDayOs(freshCompletions).get(executionDayOsKey(row.date, row.os));
          const original = row.originalCorrectiveName || row.name || row.equipment || "—";
          const activityText = isCorrectiveActivity(row) && execution?.descricao
            ? `Executado: ${execution.descricao}${normalizeDailyFilterText(execution.descricao) !== normalizeDailyFilterText(original) ? `\nChamado: ${original}` : ""}`
            : original;
          const executionObservation = String(execution?.observacao ?? row.observation ?? "").trim();
          return [
            stateOf(row) === "concluida" ? "CONCLUÍDO" : stateOf(row) === "pendente_verificacao" ? "A VERIFICAR" : "PENDENTE",
            row.os,
            row.activity,
            row.team || "—",
            locationLabel(row),
            activityText,
            executionObservation || "—",
          ];
        }),
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
        alternateRowStyles: { fillColor: [248, 250, 252] },
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
          2: { cellWidth: 22, fontStyle: "bold" },
          3: { cellWidth: 30, fontStyle: "bold" },
          4: { cellWidth: 45, fontStyle: "bold" },
          5: { cellWidth: 80 },
          6: { cellWidth: 58 },
        },
        didParseCell: (cell) => {
          if (cell.section !== "body") return;
          const row = orderedPdfRows[cell.row.index];
          if (!row) return;
          const state = stateOf(row);
          if (state === "concluida") {
            cell.cell.styles.fillColor = [240, 253, 247];
            if (cell.column.index === 0) {
              cell.cell.styles.fillColor = [209, 250, 229];
              cell.cell.styles.textColor = [5, 150, 105];
            }
          } else if (state === "pendente_verificacao") {
            cell.cell.styles.fillColor = [239, 246, 255];
            if (cell.column.index === 0) {
              cell.cell.styles.fillColor = [219, 234, 254];
              cell.cell.styles.textColor = [2, 132, 199];
            }
          } else if (cell.column.index === 0) {
            cell.cell.styles.fillColor = [254, 249, 195];
            cell.cell.styles.textColor = [180, 83, 9];
          }

          if ([1, 2, 3, 4].includes(cell.column.index)) {
            cell.cell.styles.fontStyle = "bold";
          }

          if (cell.column.index === 3) {
            const teamRgb = hexToRgb(equipeHex(row.team));
            cell.cell.styles.fillColor = tintRgb(teamRgb);
            cell.cell.styles.textColor = darkenRgb(teamRgb);
            cell.cell.styles.fontStyle = "bold";
          }

          if (cell.column.index === 2 && isCorrectiveActivity(row)) {
            cell.cell.styles.fillColor = [254, 249, 195];
            cell.cell.styles.textColor = [161, 98, 7];
            cell.cell.styles.fontStyle = "bold";
          }
        },
        willDrawPage: drawHeader,
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
      toast.success("Relatório corporativo gerado com preventivas e corretivas do dia.");
    } catch (error) {
      console.error(error);
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setGenerating(false);
    }
  }

  const hasSchedule = rows.length > 0;
  const pendingPreventivesCount = fixedPreventives.filter((row) => !completions.has(row.id)).length;
  const syncing = loadingPortfolio || loadingExecutions || loadingSchedule;
  const filtersActive =
    Boolean(correctiveSearch.trim()) ||
    buildingFilter !== "todos" ||
    Boolean(requesterFilter.trim()) ||
    correctiveTeamFilter !== "todos" ||
    sourceStatusFilter !== "todos";

  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-4 px-3 py-3 sm:px-5 lg:px-6 lg:py-4">
      <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="bg-slate-950 px-4 py-4 text-white sm:px-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-300">Controle diário de execução</p>
              <h1 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl">Relatório Diário • Preventivas e Corretivas</h1>
              <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-300">
                Preventivas fixas por dia e catálogo corretivo compacto. Adicionar uma corretiva à planilha conclui somente o Relatório Diário; o chamado original permanece com seu status no Corretiva Novo.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void Promise.all([loadSharedSchedule(true, false), loadPortfolio(true), loadExecutions(true)])}
              disabled={syncing}
              className="gap-2 border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
            >
              <RefreshCcw className={cn("h-4 w-4", syncing && "animate-spin")} /> Atualizar tudo
            </Button>
          </div>
        </div>

        <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_380px] sm:p-4">
          <div className="rounded-xl border border-border bg-background/60 p-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-emerald-500" />
              <h2 className="text-sm font-semibold">Programação fixa da semana</h2>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
              {hasSchedule
                ? `${rows.filter(isPreventiveActivity).length} preventivas fixas carregadas. A ordem recebida da programação compartilhada é preservada.`
                : "Nenhuma programação compartilhada foi encontrada."}
            </p>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              {planning.days.map((day) => {
                const summary = daySummary(day.date);
                return (
                  <button
                    key={day.date}
                    type="button"
                    onClick={() => setSelectedDate(day.date)}
                    className={cn(
                      "min-w-[125px] rounded-lg border px-3 py-2 text-left transition-colors",
                      day.date === selectedDate
                        ? "border-slate-800 bg-slate-950 text-white dark:border-slate-200 dark:bg-slate-100 dark:text-slate-950"
                        : "border-border bg-card hover:bg-muted/40",
                    )}
                  >
                    <span className="block text-[9px] font-semibold uppercase">{formatWeekdayBr(day.date, true)}</span>
                    <span className="mt-0.5 block text-xs font-semibold">{formatDateBr(day.date)}</span>
                    <span className="mt-1 block text-[9px] opacity-75">{summary.done}/{summary.total} realizadas</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-border bg-background/60 p-3">
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
                "flex w-full items-center gap-3 rounded-lg border border-dashed p-3 text-left transition-colors",
                dragging ? "border-sky-500 bg-sky-500/5" : "border-border hover:bg-muted/30",
              )}
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              </span>
              <span>
                <span className="block text-xs font-semibold">Atualizar planilhas da programação</span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">A ordem de leitura das planilhas é mantida.</span>
              </span>
            </button>
          </div>
        </div>
      </section>

      {!hasSchedule ? (
        <section className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
          <FileSpreadsheet className="mx-auto h-7 w-7 text-muted-foreground" />
          <h2 className="mt-3 font-semibold">Programação preventiva não encontrada</h2>
          <p className="mx-auto mt-1 max-w-2xl text-sm text-muted-foreground">Importe as planilhas da semana para criar a lista fixa de segunda a sexta.</p>
          <Button className="mt-4 gap-2" onClick={() => inputRef.current?.click()}>
            <Upload className="h-4 w-4" /> Selecionar planilhas
          </Button>
        </section>
      ) : (
        <>
          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-2 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <h2 className="text-sm font-semibold">Preventivas fixas • {formatDateBr(selectedDate)}</h2>
                </div>
                <p className="mt-1 text-[10px] text-muted-foreground">Lista fixa do dia na sequência da programação compartilhada.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-border bg-muted/30 px-2.5 py-1 text-[10px] font-semibold">
                  {fixedPreventives.length} preventivas • {pendingPreventivesCount} pendente(s)
                </span>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void markAllPreventivesCompleted()}
                  disabled={!pendingPreventivesCount || savingAllPreventives}
                  className="h-8 gap-1.5 bg-emerald-600 px-3 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:bg-emerald-600/50"
                >
                  {savingAllPreventives ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  {savingAllPreventives ? "Salvando todas..." : pendingPreventivesCount ? `Concluir todas (${pendingPreventivesCount})` : "Todas concluídas"}
                </Button>
              </div>
            </div>

            <div className="max-h-[480px] overflow-auto">
              {fixedPreventives.length ? (
                <div className="divide-y divide-border">
                  {fixedPreventives.map((row, index) => {
                    const completed = completions.has(row.id);
                    const savingPreventive = savingPreventives.has(row.id);
                    const savingObservation = savingObservations.has(row.id);
                    return (
                      <div
                        key={row.id}
                        className={cn(
                          "grid gap-2 border-l-[3px] px-3 py-2 lg:grid-cols-[42px_90px_145px_minmax(0,1fr)_minmax(170px,230px)_155px] lg:items-center",
                          completed && "bg-emerald-500/[0.06]",
                        )}
                        style={{ borderLeftColor: completed ? "#10b981" : equipeHex(row.team) }}
                      >
                        <span className="text-center text-[9px] font-semibold text-muted-foreground">#{index + 1}</span>
                        <span className="font-mono text-[11px] font-semibold">{row.os}</span>
                        <div className="flex items-center gap-2 text-[10px] font-semibold">
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: equipeHex(row.team) }} />
                          {row.team || "Sem equipe"}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-medium">{row.name || row.equipment || "Preventiva sem descrição"}</p>
                          <p className="mt-0.5 truncate text-[9px] text-muted-foreground">{locationLabel(row)}</p>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-[8px] font-semibold text-muted-foreground">Observação</label>
                            {savingObservation && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                          </div>
                          <textarea
                            value={observationDraftValue(row)}
                            onChange={(event) => setObservationDrafts((current) => ({ ...current, [row.id]: event.target.value }))}
                            onBlur={() => void saveCompletedObservation(row)}
                            rows={1}
                            maxLength={240}
                            disabled={savingObservation}
                            className="mt-0.5 h-7 w-full resize-none rounded-md border border-input bg-background px-2 py-1 text-[9px] leading-4"
                            placeholder="Ex.: Concluída; aguardando peça."
                          />
                        </div>
                        <Button
                          size="sm"
                          variant={completed ? "default" : "outline"}
                          disabled={savingPreventive || savingAllPreventives}
                          onClick={() => void togglePreventive(row)}
                          className={cn(
                            "h-7 gap-1.5 text-[9px] transition-all",
                            completed && "bg-emerald-600 text-white hover:bg-emerald-700",
                          )}
                        >
                          {savingPreventive ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : completed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                          {savingPreventive ? "Sincronizando..." : completed ? "Concluída" : "Marcar concluída"}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">Não há preventivas programadas para este dia.</div>
              )}
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border p-3">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-start xl:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-sky-500" />
                    <h2 className="text-sm font-semibold">Catálogo de corretivas</h2>
                    {loadingPortfolio && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  <p className="mt-1 max-w-4xl text-[10px] leading-4 text-muted-foreground">
                    Pesquisa rápida do Corretiva Novo. A programação não inclui a OS automaticamente no relatório: somente “Adicionar e concluir” coloca a corretiva no dia selecionado e registra a conclusão via Relatório Diário.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-[10px]">
                  <span className="rounded-full border border-sky-500/20 bg-sky-500/[0.06] px-2 py-0.5 font-semibold text-sky-700 dark:text-sky-300">{filteredCorrectives.length} encontrada(s)</span>
                  <span className="rounded-full border border-border bg-muted/20 px-2 py-0.5">{reportCorrectives.length} no dia</span>
                </div>
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(220px,1.4fr)_170px_minmax(180px,1fr)_170px_160px_auto]">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={correctiveSearch} onChange={(event) => setCorrectiveSearch(event.target.value)} placeholder="OS, descrição, ativo, local..." className="h-8 pl-9 text-[11px]" />
                </div>
                <select value={buildingFilter} onChange={(event) => setBuildingFilter(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-[11px]">
                  <option value="todos">Todos os prédios</option>
                  {buildingOptions.map((building) => <option key={building} value={building}>{building}</option>)}
                </select>
                <div className="relative">
                  <UserRound className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input value={requesterFilter} onChange={(event) => setRequesterFilter(event.target.value)} placeholder="Nome do solicitante" className="h-8 pl-9 text-[11px]" />
                </div>
                <select value={correctiveTeamFilter} onChange={(event) => setCorrectiveTeamFilter(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-[11px]">
                  <option value="todos">Todas equipes</option>
                  {teamOptions.map((team) => <option key={team} value={team}>{team}</option>)}
                </select>
                <select value={sourceStatusFilter} onChange={(event) => setSourceStatusFilter(event.target.value)} className="h-8 rounded-md border border-input bg-background px-2 text-[11px]">
                  <option value="todos">Todos status</option>
                  {statusOptions.map((status) => <option key={status} value={status}>{formatSourceStatus(status)}</option>)}
                </select>
                <Button type="button" size="sm" variant="outline" disabled={!filtersActive} onClick={clearCorrectiveFilters} className="h-8 gap-1 px-2 text-[10px]">
                  <X className="h-3 w-3" /> Limpar
                </Button>
              </div>
            </div>

            <div className="max-h-[760px] overflow-auto">
              {filteredCorrectives.length ? (
                <div className="divide-y divide-border/70">
                  {filteredCorrectives.slice(0, CATALOG_RENDER_LIMIT).map((source) => {
                    const osKey = correctiveOsKey(source.numero_os);
                    const scheduled = scheduledByOs.get(osKey);
                    const existingExecution = executionByDayOs.get(executionDayOsKey(selectedDate, source.numero_os));
                    const previousExecution = correctiveExecutionByOs.get(osKey);
                    const itemKey = existingExecution?.item_key || scheduled?.id || dailyCorrectiveItemKey(rows, selectedDate, source.numero_os);
                    const row = sourceToDailyRow(source, selectedDate, itemKey, scheduled);
                    const record = completions.get(row.id) ?? existingExecution;
                    const historicalRecord = record ? null : previousExecution;
                    const effectiveRow = record && record.item_key !== row.id
                      ? sourceToDailyRow(source, selectedDate, record.item_key, scheduled)
                      : row;
                    const state = record
                      ? rowCompletionState(effectiveRow, completions, correctiveByOs)
                      : historicalRecord
                        ? "concluida"
                        : rowCompletionState(effectiveRow, completions, correctiveByOs);
                    const text = record
                      ? workDrafts[effectiveRow.id] ?? record.descricao ?? ""
                      : historicalRecord?.descricao ?? workDrafts[effectiveRow.id] ?? "";
                    const observationText = observationDrafts[effectiveRow.id]
                      ?? record?.observacao
                      ?? historicalRecord?.observacao
                      ?? effectiveRow.observation
                      ?? "";
                    const teamColor = equipeHex(effectiveRow.team);

                    return (
                      <div
                        key={`${source.id ?? effectiveRow.os}:${effectiveRow.id}`}
                        className={cn("border-l-[3px] px-3 py-2", (record || historicalRecord) && "bg-emerald-500/[0.035]")}
                        style={{ borderLeftColor: record || historicalRecord ? "#10b981" : teamColor }}
                      >
                        <div className="grid gap-2 xl:grid-cols-[minmax(0,1fr)_280px_240px_168px] xl:items-center">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-mono text-[11px] font-bold">OS {effectiveRow.os}</span>
                              <span
                                className="inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold"
                                style={{ borderColor: `${teamColor}55`, backgroundColor: `${teamColor}12`, color: teamColor }}
                              >
                                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: teamColor }} />
                                {effectiveRow.team || "Sem equipe"}
                              </span>
                              <span className="rounded-full border border-border bg-muted/25 px-1.5 py-0.5 text-[8px] font-medium">{formatSourceStatus(source.status)}</span>
                              {scheduled && <span className="rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-1.5 py-0.5 text-[8px] font-semibold text-emerald-700 dark:text-emerald-300">Programada</span>}
                              {record && <span className="rounded-full border border-sky-500/25 bg-sky-500/[0.08] px-1.5 py-0.5 text-[8px] font-bold text-sky-700 dark:text-sky-300">Na planilha • concluída via Relatório Diário</span>}
                              {historicalRecord && (
                                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/[0.08] px-1.5 py-0.5 text-[8px] font-bold text-emerald-700 dark:text-emerald-300">
                                  Já adicionada ao relatório • {formatDateBr(historicalRecord.atividade_data)}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 truncate text-[11px] font-semibold" title={effectiveRow.name}>{effectiveRow.name || "Chamado sem descrição"}</p>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> {String(source.predio ?? "").trim() || "Prédio não informado"}</span>
                              <span>{[source.andar, source.local].filter(Boolean).join(" • ") || "Local não informado"}</span>
                              <span className="inline-flex items-center gap-1"><UserRound className="h-3 w-3" /> {String(source.solicitante ?? "").trim() || "Solicitante não informado"}</span>
                              {source.data_sla && <span>SLA {formatDateBr(String(source.data_sla))}</span>}
                            </div>
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-[9px] font-semibold text-muted-foreground">O que foi feito</label>
                              <span className={cn("text-[8px] font-semibold", state === "concluida" ? "text-emerald-600" : state === "pendente_verificacao" ? "text-sky-600" : "text-muted-foreground")}>
                                {historicalRecord
                                  ? `Já adicionada em ${formatDateBr(historicalRecord.atividade_data)}`
                                  : state === "concluida"
                                    ? "Concluída no relatório"
                                    : state === "pendente_verificacao"
                                      ? "Concluída no Corretiva Novo"
                                      : "Pendente"}
                              </span>
                            </div>
                            <textarea
                              value={text}
                              onChange={(event) => setWorkDrafts((current) => ({ ...current, [effectiveRow.id]: event.target.value }))}
                              rows={1}
                              readOnly={Boolean(historicalRecord)}
                              className={cn(
                                "mt-1 h-8 w-full resize-none rounded-md border border-input px-2 py-1.5 text-[10px] leading-4",
                                historicalRecord ? "cursor-default bg-emerald-500/[0.04] text-muted-foreground" : "bg-background",
                              )}
                              placeholder={String(source.observacao_conclusao ?? "").trim() ? `Sugestão: ${String(source.observacao_conclusao).trim()}` : "Serviço executado (opcional)"}
                            />
                          </div>

                          <div className="min-w-0">
                            <label className="text-[9px] font-semibold text-muted-foreground">Observação</label>
                            <textarea
                              value={observationText}
                              onChange={(event) => setObservationDrafts((current) => ({ ...current, [effectiveRow.id]: event.target.value }))}
                              rows={1}
                              maxLength={240}
                              readOnly={Boolean(historicalRecord)}
                              className={cn(
                                "mt-1 h-8 w-full resize-none rounded-md border border-input px-2 py-1.5 text-[10px] leading-4",
                                historicalRecord ? "cursor-default bg-emerald-500/[0.04] text-muted-foreground" : "bg-background",
                              )}
                              placeholder="Ex.: Concluída; aguardando peça."
                            />
                          </div>

                          <div className="flex items-center justify-end gap-1.5">
                            {record ? (
                              <>
                                <Button type="button" size="sm" variant="outline" disabled={savingKey === effectiveRow.id} onClick={() => void undoCorrective(effectiveRow)} className="h-7 px-2 text-[9px]">Desfazer</Button>
                                <Button type="button" size="sm" disabled={savingKey === effectiveRow.id} onClick={() => void saveCorrectiveDescription(effectiveRow)} className="h-7 gap-1 px-2 text-[9px]">
                                  {savingKey === effectiveRow.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Salvar
                                </Button>
                              </>
                            ) : historicalRecord ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled
                                className="h-8 gap-1.5 border-emerald-500/30 bg-emerald-500/[0.07] px-2.5 text-[9px] font-semibold text-emerald-700 opacity-100 dark:text-emerald-300"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Já adicionada {formatDateBr(historicalRecord.atividade_data)}
                              </Button>
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                disabled={savingKey === effectiveRow.id}
                                onClick={() => void addCorrectiveToDailyReport(effectiveRow, source)}
                                className="h-8 gap-1.5 bg-sky-600 px-3 text-[10px] font-semibold text-white hover:bg-sky-700"
                              >
                                {savingKey === effectiveRow.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                {savingKey === effectiveRow.id ? "Adicionando..." : "Adicionar e concluir"}
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filteredCorrectives.length > CATALOG_RENDER_LIMIT && (
                    <div className="p-3 text-center text-[10px] text-muted-foreground">Mostrando os primeiros {CATALOG_RENDER_LIMIT} de {filteredCorrectives.length}. Use os filtros para refinar a pesquisa.</div>
                  )}
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">Nenhuma corretiva encontrada com estes filtros.</div>
              )}
            </div>
          </section>

          <section className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <h2 className="text-sm font-semibold">Resumo de {formatDateBr(selectedDate)}</h2>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Total" value={dailyRows.length} />
                <Stat label="Preventivas" value={fixedPreventives.length} />
                <Stat label="Corretivas" value={reportCorrectives.length} />
                <Stat label="Realizadas" value={selectedPerformed} tone="done" />
                <Stat label="A verificar" value={selectedAwaiting} tone="rate" />
                <Stat label="Pendentes" value={selectedPending} tone="pending" />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${completionRate}%` }} /></div>
                <span className="text-xs font-semibold">{completionRate}%</span>
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">{selectedCompleted} atividade(s) concluída(s) diretamente no Relatório Diário. Registrar aqui não altera o status no Corretiva Novo.</p>
            </div>

            <aside className="rounded-2xl border border-border bg-card p-3 shadow-sm">
              <div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-muted-foreground" /><h2 className="text-sm font-semibold">Relatório em PDF</h2></div>
              <p className="mt-1 text-[10px] leading-4 text-muted-foreground">Inclui as preventivas fixas e somente as corretivas adicionadas e concluídas via Relatório Diário neste dia.</p>
              <label className="mt-3 block text-[10px] font-medium text-muted-foreground">Responsável</label>
              <Input className="mt-1 h-9 text-xs" value={author} onChange={(event) => setAuthor(event.target.value)} placeholder="Nome do responsável" />
              <label className="mt-2.5 block text-[10px] font-medium text-muted-foreground">Observação do dia</label>
              <textarea value={note} onChange={(event) => setNote(event.target.value)} rows={2} className="mt-1 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-xs" placeholder="Resumo, ocorrências ou observações" />

              <div className="mt-3 rounded-xl border border-border bg-muted/20 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-background text-sky-600">
                    <WeatherUiIcon condition={weather.condition} className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-[10px] font-semibold">Clima do relatório</p>
                    <p className="text-[9px] text-muted-foreground">Salvo separadamente para cada dia.</p>
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-[minmax(0,1fr)_92px] gap-2">
                  <div>
                    <label className="block text-[9px] font-medium text-muted-foreground">Condição</label>
                    <select
                      value={weather.condition}
                      onChange={(event) => {
                        const condition = event.target.value as WeatherCondition;
                        updateWeather({
                          condition,
                          rained: isRainyWeather(condition) ? true : weather.rained,
                        });
                      }}
                      className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-[10px]"
                    >
                      {WEATHER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[9px] font-medium text-muted-foreground">Temperatura</label>
                    <div className="relative mt-1">
                      <Thermometer className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        type="number"
                        step="0.1"
                        value={weather.temperature}
                        onChange={(event) => updateWeather({ temperature: event.target.value })}
                        className="h-8 pl-7 pr-6 text-[10px]"
                        placeholder="27"
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-semibold text-muted-foreground">°C</span>
                    </div>
                  </div>
                </div>

                <label className="mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2 text-[10px] font-medium">
                  <input
                    type="checkbox"
                    checked={weather.rained || isRainyWeather(weather.condition)}
                    disabled={isRainyWeather(weather.condition)}
                    onChange={(event) => updateWeather({ rained: event.target.checked })}
                    className="h-3.5 w-3.5 rounded border-input"
                  />
                  <CloudRain className="h-3.5 w-3.5 text-sky-600" />
                  Choveu no período
                </label>
              </div>

              <Button onClick={() => void generatePdf()} disabled={generating} className="mt-3 w-full gap-2" size="sm">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Baixar relatório do dia
              </Button>
            </aside>
          </section>
        </>
      )}
    </main>
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

import { businessDaysUntil, isoDate } from "./business-days";
import type { WeekBucket, WeekInfo } from "./capacity";
import {
  REFRIG_1,
  REFRIG_2,
  REFRIG_3,
  type Equipe,
  type TriagedOS,
} from "./triage";

export const META_MINUTOS_DIA = 9 * 60;
export const CORRETIVAS_MINIMAS_DIA = 2;

export const MINUTOS_PADRAO_POR_EQUIPE: Record<Equipe, 30 | 60> = {
  CHAVEIRO: 30,
  CIVIL: 30,
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 1": 60,
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 2": 60,
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 3": 60,
  ELÉTRICA: 30,
  HIDRÁULICA: 60,
  CORRETIVA: 60,
};

export interface CorrectiveProblem {
  gravidade?: "observacao" | "falha" | "critico" | string | null;
  status_gestor?:
    "pendente" | "aprovado" | "rejeitado" | "concluido" | string | null;
}

export interface CorrectiveSourceRow {
  id?: string;
  numero_os?: string | null;
  nome_os?: string | null;
  tipo?: string | null;
  ativo?: string | null;
  equipamento?: string | null;
  solicitante?: string | null;
  predio?: string | null;
  andar?: string | null;
  local?: string | null;
  equipe?: string | null;
  status?: string | null;
  data_criacao?: string | null;
  data_programada?: string | null;
  data_sla?: string | null;
  tipo_importacao?: string | null;
  corretiva_problemas?: CorrectiveProblem[] | null;
}

export interface CorrectiveMappingResult {
  items: TriagedOS[];
  unassigned: CorrectiveSourceRow[];
  backorders: number;
  critical: number;
}

export interface DailyTeamLoad {
  date: Date;
  dateKey: string;
  dayIndex: number;
  preventiveCount: number;
  correctiveCount: number;
  scheduledMinutes: number;
  remainingMinutes: number;
  targetMinutes: number;
  correctiveDeficit: number;
}

export interface TeamMonthlySchedule {
  buckets: WeekBucket[];
  loadsByWeek: DailyTeamLoad[][];
  overflowPreventivas: TriagedOS[];
  overflowCorretivas: TriagedOS[];
  scheduledPreventivas: number;
  scheduledCorretivas: number;
}

const norm = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function sameBuilding(predio: string, buildings: string[]): boolean {
  const normalized = norm(predio);
  return buildings.some((candidate) => {
    const target = norm(candidate);
    return normalized === target || normalized.startsWith(target);
  });
}

function refrigeracaoTeam(predio: string): Equipe {
  if (sameBuilding(predio, REFRIG_2)) return "CLIMATIZAÇÃO E REFRIGERAÇÃO 2";
  if (sameBuilding(predio, REFRIG_3)) return "CLIMATIZAÇÃO E REFRIGERAÇÃO 3";
  if (sameBuilding(predio, REFRIG_1)) return "CLIMATIZAÇÃO E REFRIGERAÇÃO 1";
  return "CLIMATIZAÇÃO E REFRIGERAÇÃO 1";
}

export function resolveCorrectiveTeam(row: CorrectiveSourceRow): Equipe | null {
  const explicit = norm(row.equipe);
  const context = norm(
    `${row.equipe ?? ""} ${row.nome_os ?? ""} ${row.tipo ?? ""} ${row.ativo ?? ""} ${row.equipamento ?? ""}`,
  );

  if (explicit.includes("CHAVE")) return "CHAVEIRO";
  if (explicit.includes("HIDR")) return "HIDRÁULICA";
  if (explicit.includes("ELETR")) return "ELÉTRICA";
  if (explicit.includes("REFRIG") || explicit.includes("CLIMAT")) {
    if (/\b1\b/.test(explicit)) return "CLIMATIZAÇÃO E REFRIGERAÇÃO 1";
    if (/\b2\b/.test(explicit)) return "CLIMATIZAÇÃO E REFRIGERAÇÃO 2";
    if (/\b3\b/.test(explicit)) return "CLIMATIZAÇÃO E REFRIGERAÇÃO 3";
    return refrigeracaoTeam(row.predio ?? "");
  }
  if (explicit.includes("CIVIL") || explicit.includes("PINTURA"))
    return "CIVIL";

  if (context.includes("CHAVE") || context.includes("FECHADURA"))
    return "CHAVEIRO";
  if (
    context.includes("HIDR") ||
    context.includes("TUBUL") ||
    context.includes("VAZAMENTO")
  ) {
    return "HIDRÁULICA";
  }
  if (
    context.includes("ELETR") ||
    context.includes("LUMINARIA") ||
    context.includes("PAINEL")
  ) {
    return "ELÉTRICA";
  }
  if (
    context.includes("REFRIG") ||
    context.includes("CLIMAT") ||
    context.includes("AR CONDIC") ||
    context.includes("FANCOIL") ||
    context.includes("CHILLER")
  ) {
    return refrigeracaoTeam(row.predio ?? "");
  }
  if (
    context.includes("CIVIL") ||
    context.includes("PINTURA") ||
    context.includes("ALVENARIA")
  ) {
    return "CIVIL";
  }
  return null;
}

function validDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
      12,
    );
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function problemSeverity(row: CorrectiveSourceRow): 0 | 1 | 2 {
  const activeProblems = (row.corretiva_problemas ?? []).filter(
    (problem) =>
      !["rejeitado", "concluido"].includes(
        norm(problem.status_gestor).toLowerCase(),
      ),
  );
  if (activeProblems.some((problem) => norm(problem.gravidade) === "CRITICO"))
    return 0;
  if (activeProblems.some((problem) => norm(problem.gravidade) === "FALHA"))
    return 1;
  return 2;
}

function dueDate(row: CorrectiveSourceRow): Date | null {
  return validDate(row.data_sla) ?? validDate(row.data_programada);
}

export function isCorrectiveBackorder(
  row: CorrectiveSourceRow,
  referenceDate: Date,
): boolean {
  const due = dueDate(row);
  if (!due) return false;
  const reference = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate(),
  );
  return due.getTime() < reference.getTime();
}

function priorityLabel(row: CorrectiveSourceRow, referenceDate: Date): string {
  const severity = problemSeverity(row);
  const backorder = isCorrectiveBackorder(row, referenceDate);
  const parts: string[] = [];
  if (severity === 0) parts.push("Crítica");
  else if (severity === 1) parts.push("Falha");
  if (backorder) parts.push("Backorder");
  return parts.join(" • ") || "Corretiva aberta";
}

export function sortCorrectiveRows(
  rows: CorrectiveSourceRow[],
  referenceDate: Date,
): CorrectiveSourceRow[] {
  return [...rows].sort((a, b) => {
    const backorder =
      Number(!isCorrectiveBackorder(a, referenceDate)) -
      Number(!isCorrectiveBackorder(b, referenceDate));
    if (backorder !== 0) return backorder;

    const bothBackorder =
      isCorrectiveBackorder(a, referenceDate) &&
      isCorrectiveBackorder(b, referenceDate);
    if (bothBackorder) {
      const severity = problemSeverity(a) - problemSeverity(b);
      if (severity !== 0) return severity;
    }

    const dueA = dueDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const dueB = dueDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;

    if (!bothBackorder) {
      const severity = problemSeverity(a) - problemSeverity(b);
      if (severity !== 0) return severity;
    }

    const createdA =
      validDate(a.data_criacao)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const createdB =
      validDate(b.data_criacao)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return createdA - createdB;
  });
}

function sortBySlaThenLocation(items: TriagedOS[]): TriagedOS[] {
  return [...items].sort((a, b) => {
    if (a.terminoSLATs !== b.terminoSLATs)
      return a.terminoSLATs - b.terminoSLATs;
    return (
      String(a.predio).localeCompare(String(b.predio), "pt-BR") ||
      String(a.andar).localeCompare(String(b.andar), "pt-BR", {
        numeric: true,
      }) ||
      String(a.local).localeCompare(String(b.local), "pt-BR") ||
      String(a.os).localeCompare(String(b.os), "pt-BR", { numeric: true })
    );
  });
}

function sortCorrectiveItems(items: TriagedOS[]): TriagedOS[] {
  return [...items].sort((a, b) => {
    const backorderA = Boolean(a.raw?.programacaoBackorder);
    const backorderB = Boolean(b.raw?.programacaoBackorder);
    if (backorderA !== backorderB) return backorderA ? -1 : 1;
    const severityA = Number(a.raw?.programacaoGravidade ?? 2);
    const severityB = Number(b.raw?.programacaoGravidade ?? 2);
    if (backorderA && severityA !== severityB) return severityA - severityB;
    if (a.terminoSLATs !== b.terminoSLATs)
      return a.terminoSLATs - b.terminoSLATs;
    return severityA - severityB;
  });
}

function requiredByDeadline(
  remainingItems: TriagedOS[],
  businessDays: Date[],
  dayPosition: number,
): number {
  if (remainingItems.length === 0) return 0;
  const remainingDays = businessDays.slice(dayPosition);
  const deadlines = [
    ...new Set(
      remainingItems
        .map((item) => item.terminoSLATs)
        .filter(
          (timestamp) =>
            Number.isFinite(timestamp) && timestamp < Number.MAX_SAFE_INTEGER,
        ),
    ),
  ].sort((a, b) => a - b);

  let requiredToday = 0;
  for (const deadline of deadlines) {
    const dueCount = remainingItems.filter(
      (item) => item.terminoSLATs <= deadline,
    ).length;
    const dueDate = new Date(deadline);
    const deadlineEnd = new Date(
      dueDate.getFullYear(),
      dueDate.getMonth(),
      dueDate.getDate(),
      23,
      59,
      59,
      999,
    ).getTime();
    const availableDays = remainingDays.filter((date) => {
      const endOfDay = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        23,
        59,
        59,
        999,
      );
      return endOfDay.getTime() <= deadlineEnd;
    }).length;
    requiredToday = Math.max(
      requiredToday,
      availableDays > 0 ? Math.ceil(dueCount / availableDays) : dueCount,
    );
  }
  return requiredToday;
}

export function mapCorrectives(
  rows: CorrectiveSourceRow[],
  referenceDate: Date,
): CorrectiveMappingResult {
  const items: TriagedOS[] = [];
  const unassigned: CorrectiveSourceRow[] = [];
  let backorders = 0;
  let critical = 0;

  for (const row of sortCorrectiveRows(rows, referenceDate)) {
    const equipe = resolveCorrectiveTeam(row);
    if (!equipe) {
      unassigned.push(row);
      continue;
    }

    const severity = problemSeverity(row);
    const backorder = isCorrectiveBackorder(row, referenceDate);
    if (severity === 0) critical += 1;
    if (backorder) backorders += 1;

    const due = dueDate(row);
    items.push({
      arquivo: "Programação de Corretivas",
      os: String(row.numero_os ?? row.id ?? "").trim(),
      chamado: String(row.numero_os ?? "").trim(),
      tipo: "Corretiva",
      nomeOS: row.nome_os || "Corretiva em aberto",
      descricao: row.nome_os || "",
      categoria: equipe.startsWith("CLIMAT")
        ? "CLIMATIZAÇÃO E REFRIGERAÇÃO"
        : equipe === "ELÉTRICA"
          ? "ELÉTRICA"
          : "CIVIL",
      criticidade: priorityLabel(row, referenceDate),
      unidadeNegocio: "",
      ativo: row.ativo || "",
      solicitante: row.solicitante || "Sistema",
      inicioSLA: row.data_criacao || "",
      dataLimite: row.data_sla || row.data_programada || "",
      dataPrevistaMaxima: row.data_programada || "",
      status: row.status || "aberta",
      dataStatus: "",
      site: "DEMARCHI",
      predio: row.predio || "",
      andar: row.andar || "",
      local: row.local || "",
      equipamento: row.equipamento || "",
      terminoSLA: due?.toISOString() || "",
      terminoSLATs: due?.getTime() ?? Number.MAX_SAFE_INTEGER,
      dataConclusao: "",
      raw: {
        ...row,
        programacaoTipo: "corretiva",
        programacaoBackorder: backorder,
        programacaoGravidade: severity,
      },
      equipe,
    });
  }

  return { items, unassigned, backorders, critical };
}

export function isCorrective(item: TriagedOS): boolean {
  return (
    norm(item.tipo).includes("CORRET") ||
    item.raw?.programacaoTipo === "corretiva"
  );
}

function weekIndexForDate(date: Date, weeks: WeekInfo[]): number {
  const timestamp = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ).getTime();
  return weeks.findIndex((week) => {
    const monday = new Date(
      week.monday.getFullYear(),
      week.monday.getMonth(),
      week.monday.getDate(),
    ).getTime();
    const friday = new Date(
      week.friday.getFullYear(),
      week.friday.getMonth(),
      week.friday.getDate(),
      23,
      59,
      59,
      999,
    ).getTime();
    return timestamp >= monday && timestamp <= friday;
  });
}

export function scheduleTeamMonth(options: {
  equipe: Equipe;
  preventivas: TriagedOS[];
  corretivas: TriagedOS[];
  weeks: WeekInfo[];
  from: Date;
  until: Date;
  minutosPorOS: 30 | 60;
  targetMinutes?: number;
  minCorrectivesPerDay?: number;
}): TeamMonthlySchedule {
  const targetMinutes = options.targetMinutes ?? META_MINUTOS_DIA;
  const minCorrectives = options.minCorrectivesPerDay ?? CORRETIVAS_MINIMAS_DIA;
  const capSlots = Math.max(
    1,
    Math.floor(targetMinutes / options.minutosPorOS),
  );
  const buckets: WeekBucket[] = options.weeks.map((week) => ({
    week,
    os: [],
    porDia: [[], [], [], [], []],
  }));
  const loadsByWeek: DailyTeamLoad[][] = options.weeks.map(() => []);
  const preventivas = sortBySlaThenLocation(options.preventivas);
  const corretivas = sortCorrectiveItems(options.corretivas);
  const businessDays = businessDaysUntil(options.from, options.until);

  let preventivaIndex = 0;
  let corretivaIndex = 0;

  businessDays.forEach((date, dayPosition) => {
    const weekIndex = weekIndexForDate(date, options.weeks);
    if (weekIndex < 0) return;
    const dow = date.getDay() - 1;
    if (dow < 0 || dow > 4) return;

    const remainingDays = Math.max(1, businessDays.length - dayPosition);
    const remainingCorretivas = corretivas.length - corretivaIndex;
    const remainingPreventivas = preventivas.length - preventivaIndex;

    const desiredCorrectivas = Math.max(
      minCorrectives,
      Math.ceil(Math.max(0, remainingCorretivas) / remainingDays),
      requiredByDeadline(
        corretivas.slice(corretivaIndex),
        businessDays,
        dayPosition,
      ),
    );
    const correctiveCount = Math.min(
      capSlots,
      Math.max(0, remainingCorretivas),
      desiredCorrectivas,
    );
    const availableForPreventivas = capSlots - correctiveCount;
    const desiredPreventivas = Math.max(
      Math.ceil(Math.max(0, remainingPreventivas) / remainingDays),
      requiredByDeadline(
        preventivas.slice(preventivaIndex),
        businessDays,
        dayPosition,
      ),
    );
    const preventiveCount = Math.min(
      availableForPreventivas,
      Math.max(0, remainingPreventivas),
      desiredPreventivas,
    );

    const dayItems: TriagedOS[] = [];
    for (let index = 0; index < correctiveCount; index += 1) {
      dayItems.push(corretivas[corretivaIndex++]);
    }
    for (let index = 0; index < preventiveCount; index += 1) {
      dayItems.push(preventivas[preventivaIndex++]);
    }

    buckets[weekIndex].porDia[dow].push(...dayItems);
    buckets[weekIndex].os.push(...dayItems);

    const scheduledMinutes = dayItems.length * options.minutosPorOS;
    loadsByWeek[weekIndex].push({
      date: new Date(date),
      dateKey: isoDate(date),
      dayIndex: dow,
      preventiveCount,
      correctiveCount,
      scheduledMinutes,
      remainingMinutes: Math.max(0, targetMinutes - scheduledMinutes),
      targetMinutes,
      correctiveDeficit: Math.max(0, minCorrectives - correctiveCount),
    });
  });

  return {
    buckets,
    loadsByWeek,
    overflowPreventivas: preventivas.slice(preventivaIndex),
    overflowCorretivas: corretivas.slice(corretivaIndex),
    scheduledPreventivas: preventivaIndex,
    scheduledCorretivas: corretivaIndex,
  };
}

export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${String(hoursPart).padStart(2, "0")}:${String(minutesPart).padStart(2, "0")}`;
}

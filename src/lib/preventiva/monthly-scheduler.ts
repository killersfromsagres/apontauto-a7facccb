import {
  businessDaysUntil,
  isoDate,
  previousBusinessDay,
} from "./business-days";
import {
  classifyPriority,
  comparePriority,
  isBackorderCorrective,
} from "@/lib/corretiva/priority-classifier";
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
    | "pendente"
    | "aprovado"
    | "rejeitado"
    | "concluido"
    | string
    | null;
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
  programacao_status?: "disponivel" | "em_programacao" | "reprogramacao_pendente" | string | null;
  programacao_tentativas?: number | null;
  programacao_periodo_inicio?: string | null;
  programacao_periodo_fim?: string | null;
  programacao_dia_indice?: number | null;
  programacao_equipe?: string | null;
  programacao_nao_realizada_motivo?: string | null;
  programacao_nao_realizada_observacao?: string | null;
  programacao_retorno_fila_em?: string | null;
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
  /** Quantidade máxima de corretivas que ainda cabe no dia sem ultrapassar 09:00. */
  correctiveCapacity?: number;
}

export interface TeamMonthlySchedule {
  buckets: WeekBucket[];
  loadsByWeek: DailyTeamLoad[][];
  overflowPreventivas: TriagedOS[];
  overflowCorretivas: TriagedOS[];
  scheduledPreventivas: number;
  scheduledCorretivas: number;
  slaManagedPreventivas: number;
  slaOnTimePreventivas: number;
  slaAtRiskPreventivas: TriagedOS[];
  preventiveDaysCovered: number;
  preventiveDaysWithoutWork: string[];
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
  if (explicit.includes("CIVIL") || explicit.includes("PINTURA")) return "CIVIL";

  if (context.includes("CHAVE") || context.includes("FECHADURA")) return "CHAVEIRO";
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
  if (activeProblems.some((problem) => norm(problem.gravidade) === "CRITICO")) return 0;
  if (activeProblems.some((problem) => norm(problem.gravidade) === "FALHA")) return 1;
  return 2;
}

function dueDate(row: CorrectiveSourceRow): Date | null {
  return validDate(row.data_sla) ?? validDate(row.data_programada);
}

export function isCorrectiveBackorder(
  row: CorrectiveSourceRow,
  _referenceDate: Date,
): boolean {
  return isBackorderCorrective(row);
}

function priorityLabel(row: CorrectiveSourceRow, referenceDate: Date): string {
  const priority = classifyPriority(row, referenceDate);
  const parts = [`${priority.level} · ${priority.score}`];
  if (priority.isBackorder) parts.push("Backorder");
  return parts.join(" • ");
}

export function sortCorrectiveRows(
  rows: CorrectiveSourceRow[],
  referenceDate: Date,
): CorrectiveSourceRow[] {
  return [...rows].sort((a, b) => {
    const priorityOrder = comparePriority(
      classifyPriority(a, referenceDate),
      classifyPriority(b, referenceDate),
    );
    if (priorityOrder !== 0) return priorityOrder;

    const dueA = dueDate(a)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const dueB = dueDate(b)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (dueA !== dueB) return dueA - dueB;

    const createdA = validDate(a.data_criacao)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const createdB = validDate(b.data_criacao)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return createdA - createdB;
  });
}

function naturalText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function compareNatural(a: unknown, b: unknown): number {
  return naturalText(a).localeCompare(naturalText(b), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function canonicalLocationText(value: unknown): string {
  return naturalText(value)
    .toUpperCase()
    .replace(/[º°ª]/g, "")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildingSortKey(value: unknown): [number, string] {
  const normalized = canonicalLocationText(value).replace(
    /^(?:PREDIO|BLOCO|EDIFICIO)\s+/,
    "",
  );
  if (!normalized) return [2, ""];
  return [/^[A-Z]/.test(normalized) ? 0 : 1, normalized];
}

function compareBuildings(a: unknown, b: unknown): number {
  const left = buildingSortKey(a);
  const right = buildingSortKey(b);
  return left[0] - right[0] || compareNatural(left[1], right[1]);
}

function floorSortKey(value: unknown): [number, number, string] {
  const normalized = canonicalLocationText(value);
  if (!normalized) return [9, 0, ""];
  const basement =
    normalized.match(/(?:^| )(\d+) SUB ?SOLO(?: |$)/) ??
    normalized.match(/(?:^| )SUB ?SOLO (\d+)(?: |$)/) ??
    normalized.match(/^S(?:S)? ?(\d+)$/);
  if (basement) return [0, Number(basement[1]), normalized];
  if (/^(?:SUB ?SOLO|SS|S)$/.test(normalized)) return [0, 1, normalized];
  if (/\bTERREO\b/.test(normalized)) return [1, 0, normalized];
  if (/\bMEZANINO\b/.test(normalized)) return [2, 0, normalized];
  const floor =
    normalized.match(/(?:^| )(\d+) (?:ANDAR|PAVIMENTO|PAV|PISO)(?: |$)/) ??
    normalized.match(/^(\d+)$/);
  if (floor) return [3, Number(floor[1]), normalized];
  if (/\bCOBERTURA\b/.test(normalized)) return [7, 0, normalized];
  return [8, 0, normalized];
}

function compareFloors(a: unknown, b: unknown): number {
  const left = floorSortKey(a);
  const right = floorSortKey(b);
  return (
    left[0] - right[0] ||
    left[1] - right[1] ||
    compareNatural(left[2], right[2])
  );
}

function sortByLocation(items: TriagedOS[]): TriagedOS[] {
  return [...items].sort((a, b) => {
    const buildingOrder = compareBuildings(a.predio, b.predio);
    if (buildingOrder !== 0) return buildingOrder;
    const floorOrder = compareFloors(a.andar, b.andar);
    if (floorOrder !== 0) return floorOrder;
    return (
      compareNatural(a.local, b.local) ||
      compareNatural(a.os, b.os) ||
      compareNatural(a.nomeOS, b.nomeOS)
    );
  });
}

function preventiveSlaDate(item: TriagedOS): Date | null {
  const parsed = validDate(item.terminoSLA);
  if (parsed) return parsed;

  const timestamp = Number(item.terminoSLATs);
  if (
    !Number.isFinite(timestamp) ||
    timestamp <= 0 ||
    timestamp >= Number.MAX_SAFE_INTEGER
  ) {
    return null;
  }

  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Data operacional máxima para execução da preventiva: D-1 útil do Término SLA.
 * Ex.: SLA 02/10/2026 (sexta) => execução até 01/10/2026 (quinta).
 * Se o SLA cair numa segunda, a execução máxima passa para a sexta anterior.
 */
export function preventiveExecutionDeadline(item: TriagedOS): Date | null {
  if (isCorrective(item)) return null;
  const sla = preventiveSlaDate(item);
  return sla ? previousBusinessDay(sla) : null;
}

/** Toda preventiva com Término SLA válido entra no controle D-1. */
export function isPreventiveSlaPriority(item: TriagedOS): boolean {
  return Boolean(preventiveExecutionDeadline(item));
}

function preventiveDeadlineTimestamp(item: TriagedOS): number {
  return (
    preventiveExecutionDeadline(item)?.getTime() ??
    Number.MAX_SAFE_INTEGER
  );
}

function compareDeadlineRoute(a: TriagedOS, b: TriagedOS): number {
  const deadlineOrder =
    preventiveDeadlineTimestamp(a) - preventiveDeadlineTimestamp(b);
  if (deadlineOrder !== 0) return deadlineOrder;

  const buildingOrder = compareBuildings(a.predio, b.predio);
  if (buildingOrder !== 0) return buildingOrder;

  const floorOrder = compareFloors(a.andar, b.andar);
  if (floorOrder !== 0) return floorOrder;

  return (
    compareNatural(a.local, b.local) ||
    compareNatural(a.os, b.os) ||
    compareNatural(a.nomeOS, b.nomeOS)
  );
}

/**
 * Fila de referência: SLA D-1 primeiro; em empates, rota física.
 * O agendamento final usa o deadline individual de cada OS e pode deslocar
 * uma atividade para um dia anterior somente quando a capacidade do D-1 lotar.
 */
export function buildPreventiveExecutionQueue(items: TriagedOS[]): TriagedOS[] {
  const withSla = items
    .filter(isPreventiveSlaPriority)
    .sort(compareDeadlineRoute)
    .map((item) => {
      const deadline = preventiveExecutionDeadline(item);
      return {
        ...item,
        raw: {
          ...item.raw,
          programacaoTemSLA: true,
          programacaoSLAD1: deadline ? isoDate(deadline) : "",
        },
      };
    });

  const withoutSla = sortByLocation(
    items.filter((item) => !isPreventiveSlaPriority(item)),
  ).map((item) => ({
    ...item,
    raw: {
      ...item.raw,
      programacaoTemSLA: false,
    },
  }));

  return [...withSla, ...withoutSla];
}

function annotatePreventiveSchedule(
  item: TriagedOS,
  scheduledDate: Date,
  deadline: Date | null,
  atRisk: boolean,
): TriagedOS {
  return {
    ...item,
    raw: {
      ...item.raw,
      programacaoTemSLA: Boolean(deadline),
      programacaoSLAPrioritaria: Boolean(deadline),
      programacaoSLAD1: deadline ? isoDate(deadline) : "",
      programacaoDataAgendada: isoDate(scheduledDate),
      programacaoSLARisco: atRisk,
      programacaoSLAMotivo: deadline
        ? "Execução programada para não ultrapassar D-1 útil do Término SLA"
        : "",
    },
  };
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

    const priority = classifyPriority(row, referenceDate);
    const severity = problemSeverity(row);
    const backorder = priority.isBackorder;
    if (priority.level === "CRÍTICA") critical += 1;
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
        programacaoPrioridade: priority.level,
        programacaoScore: priority.score,
      },
      equipe,
    });
  }

  return { items, unassigned, backorders, critical };
}

export function isCorrective(item: TriagedOS): boolean {
  return norm(item.tipo).includes("CORRET") || item.raw?.programacaoTipo === "corretiva";
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

function balancedQuotasForCapacities(
  total: number,
  capacities: number[],
): number[] {
  const quotas = new Array(capacities.length).fill(0) as number[];
  const schedulable = Math.max(
    0,
    Math.min(
      total,
      capacities.reduce((sum, capacity) => sum + Math.max(0, capacity), 0),
    ),
  );

  for (let assigned = 0; assigned < schedulable; assigned += 1) {
    let bestDay = -1;
    let bestRatio = Number.POSITIVE_INFINITY;

    for (let day = 0; day < capacities.length; day += 1) {
      const capacity = Math.max(0, capacities[day] ?? 0);
      if (capacity <= 0 || quotas[day] >= capacity) continue;

      const ratio = quotas[day] / capacity;
      if (ratio < bestRatio) {
        bestRatio = ratio;
        bestDay = day;
      }
    }

    if (bestDay < 0) break;
    quotas[bestDay] += 1;
  }

  return quotas;
}

function lastBusinessDayIndexOnOrBefore(
  businessDays: Date[],
  deadline: Date,
): number {
  const target = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();

  for (let index = businessDays.length - 1; index >= 0; index -= 1) {
    if (businessDays[index].getTime() <= target) return index;
  }
  return -1;
}

function firstAvailableDay(
  counts: number[],
  capacity: number,
  fromIndex = 0,
): number {
  for (let index = Math.max(0, fromIndex); index < counts.length; index += 1) {
    if (counts[index] < capacity) return index;
  }
  return -1;
}

function latestAvailableDayOnOrBefore(
  counts: number[],
  capacity: number,
  targetIndex: number,
): number {
  for (
    let index = Math.min(targetIndex, counts.length - 1);
    index >= 0;
    index -= 1
  ) {
    if (counts[index] < capacity) return index;
  }
  return -1;
}

function canSchedulePreventiveOnDate(item: TriagedOS, date: Date): boolean {
  const deadline = preventiveExecutionDeadline(item);
  if (!deadline) return true;
  const scheduled = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  ).getTime();
  const limit = new Date(
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate(),
    23,
    59,
    59,
    999,
  ).getTime();
  return scheduled <= limit;
}

/**
 * Garante presença preventiva ao longo dos dias úteis quando há volume
 * suficiente. A redistribuição nunca move uma OS para depois do D-1 do SLA.
 */
function ensureDailyPreventiveCoverage(
  scheduledByDay: TriagedOS[][],
  businessDays: Date[],
  capacityPerDay: number,
): void {
  const totalScheduled = scheduledByDay.reduce(
    (sum, items) => sum + items.length,
    0,
  );
  if (totalScheduled < businessDays.length) return;

  for (let targetIndex = 0; targetIndex < scheduledByDay.length; targetIndex += 1) {
    if (scheduledByDay[targetIndex].length > 0) continue;
    if (scheduledByDay[targetIndex].length >= capacityPerDay) continue;

    const targetDate = businessDays[targetIndex];
    let donorIndex = -1;
    let donorItemIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;

    for (let sourceIndex = 0; sourceIndex < scheduledByDay.length; sourceIndex += 1) {
      if (sourceIndex === targetIndex) continue;
      const source = scheduledByDay[sourceIndex];
      if (source.length <= 1) continue;

      for (let itemIndex = source.length - 1; itemIndex >= 0; itemIndex -= 1) {
        const item = source[itemIndex];
        if (Boolean(item.raw?.programacaoSLARisco)) continue;
        if (!canSchedulePreventiveOnDate(item, targetDate)) continue;

        // Preferimos trazer uma OS de um dia posterior (adiantamento seguro).
        // Em empate, escolhemos o dia mais próximo para preservar a rota mensal.
        const directionPenalty = sourceIndex > targetIndex ? 0 : 1000;
        const distance = Math.abs(sourceIndex - targetIndex);
        const slaPenalty = preventiveExecutionDeadline(item) ? 10 : 0;
        const score = directionPenalty + distance + slaPenalty;

        if (score < bestScore) {
          bestScore = score;
          donorIndex = sourceIndex;
          donorItemIndex = itemIndex;
        }
      }
    }

    if (donorIndex < 0 || donorItemIndex < 0) continue;

    const [moved] = scheduledByDay[donorIndex].splice(donorItemIndex, 1);
    const deadline = preventiveExecutionDeadline(moved);
    scheduledByDay[targetIndex].push(
      annotatePreventiveSchedule(moved, targetDate, deadline, false),
    );
  }
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
  /** Reserva capacidade para corretivas que serão anexadas pelo alocador externo. */
  reserveCorrectiveSlots?: boolean;
}): TeamMonthlySchedule {
  const targetMinutes = options.targetMinutes ?? META_MINUTOS_DIA;
  const maxCorrectivesPerDay = Math.max(
    0,
    options.minCorrectivesPerDay ?? CORRETIVAS_MINIMAS_DIA,
  );
  const capSlots = Math.max(1, Math.floor(targetMinutes / options.minutosPorOS));
  const buckets: WeekBucket[] = options.weeks.map((week) => ({
    week,
    os: [],
    porDia: [[], [], [], [], []],
  }));
  const loadsByWeek: DailyTeamLoad[][] = options.weeks.map(() => []);
  const businessDays = businessDaysUntil(options.from, options.until);

  const intendedCorrectiveReserve =
    options.reserveCorrectiveSlots || options.corretivas.length > 0
      ? Math.min(maxCorrectivesPerDay, capSlots)
      : 0;
  const standardPreventiveCapacity = Math.max(
    0,
    capSlots - intendedCorrectiveReserve,
  );

  const scheduledPreventivesByDay = businessDays.map(
    () => [] as TriagedOS[],
  );
  const preventiveCountsByDay = businessDays.map(() => 0);
  const overflowPreventivas: TriagedOS[] = [];
  const slaAtRiskPreventivas: TriagedOS[] = [];

  const horizonEnd = new Date(
    options.until.getFullYear(),
    options.until.getMonth(),
    options.until.getDate(),
    23,
    59,
    59,
    999,
  );

  const allPreventives = buildPreventiveExecutionQueue(options.preventivas);
  const deadlineControlled: TriagedOS[] = [];
  const standardPreventives: TriagedOS[] = [];

  for (const item of allPreventives) {
    const deadline = preventiveExecutionDeadline(item);
    if (deadline && deadline.getTime() <= horizonEnd.getTime()) {
      deadlineControlled.push(item);
    } else {
      standardPreventives.push(item);
    }
  }

  deadlineControlled.sort(compareDeadlineRoute);

  // Cada OS com SLA tenta ocupar exatamente seu D-1 útil. Se o dia estiver
  // cheio, ela retrocede para o dia útil anterior. Só depois disso usa um dia
  // posterior, marcado explicitamente como risco de SLA.
  for (const item of deadlineControlled) {
    const deadline = preventiveExecutionDeadline(item);
    if (!deadline || businessDays.length === 0) {
      overflowPreventivas.push(item);
      continue;
    }

    const targetIndex = lastBusinessDayIndexOnOrBefore(
      businessDays,
      deadline,
    );

    let selectedIndex =
      targetIndex >= 0
        ? latestAvailableDayOnOrBefore(
            preventiveCountsByDay,
            capSlots,
            targetIndex,
          )
        : -1;

    let atRisk = false;

    if (selectedIndex < 0) {
      selectedIndex = firstAvailableDay(
        preventiveCountsByDay,
        capSlots,
        Math.max(0, targetIndex + 1),
      );
      atRisk = true;
    }

    if (selectedIndex < 0) {
      overflowPreventivas.push(
        annotatePreventiveSchedule(
          item,
          businessDays[businessDays.length - 1] ?? options.until,
          deadline,
          true,
        ),
      );
      slaAtRiskPreventivas.push(item);
      continue;
    }

    const scheduledDate = businessDays[selectedIndex];
    if (scheduledDate.getTime() > deadline.getTime()) atRisk = true;

    const annotated = annotatePreventiveSchedule(
      item,
      scheduledDate,
      deadline,
      atRisk,
    );
    scheduledPreventivesByDay[selectedIndex].push(annotated);
    preventiveCountsByDay[selectedIndex] += 1;

    if (atRisk) slaAtRiskPreventivas.push(annotated);
  }

  // OS sem SLA dentro do horizonte usam apenas a capacidade preventiva normal,
  // preservando a meta de corretivas. O SLA pode consumir a reserva corretiva
  // somente quando isso for necessário para não atrasar.
  const remainingStandardCapacity = preventiveCountsByDay.map((used) =>
    Math.max(0, standardPreventiveCapacity - used),
  );
  const orderedStandard = sortByLocation(standardPreventives);
  const standardQuotas = balancedQuotasForCapacities(
    orderedStandard.length,
    remainingStandardCapacity,
  );

  let standardIndex = 0;
  standardQuotas.forEach((quota, dayIndex) => {
    if (quota <= 0) return;
    const slice = orderedStandard.slice(
      standardIndex,
      standardIndex + quota,
    );
    standardIndex += slice.length;

    slice.forEach((item) => {
      const scheduledDate = businessDays[dayIndex];
      const deadline = preventiveExecutionDeadline(item);
      scheduledPreventivesByDay[dayIndex].push(
        annotatePreventiveSchedule(
          item,
          scheduledDate,
          deadline,
          false,
        ),
      );
      preventiveCountsByDay[dayIndex] += 1;
    });
  });
  overflowPreventivas.push(...orderedStandard.slice(standardIndex));

  // Mesmo com vários SLAs concentrados em poucos dias, a equipe precisa de
  // preventivas todos os dias. Se houver quantidade suficiente, redistribuímos
  // uma preventiva para cada dia útil sem jamais ultrapassar o D-1 do SLA.
  ensureDailyPreventiveCoverage(
    scheduledPreventivesByDay,
    businessDays,
    capSlots,
  );
  preventiveCountsByDay.splice(
    0,
    preventiveCountsByDay.length,
    ...scheduledPreventivesByDay.map((items) => items.length),
  );

  const corretivas = sortByLocation(options.corretivas);
  const internalCorrectiveCapacities = preventiveCountsByDay.map((used) =>
    options.reserveCorrectiveSlots
      ? 0
      : Math.min(
          maxCorrectivesPerDay,
          Math.max(0, capSlots - used),
        ),
  );
  const correctiveQuotas = balancedQuotasForCapacities(
    corretivas.length,
    internalCorrectiveCapacities,
  );
  let corretivaIndex = 0;

  businessDays.forEach((date, dayPosition) => {
    const weekIndex = weekIndexForDate(date, options.weeks);
    if (weekIndex < 0) return;
    const dow = date.getDay() - 1;
    if (dow < 0 || dow > 4) return;

    const dayPreventivas = [...scheduledPreventivesByDay[dayPosition]].sort(
      (a, b) => {
        const priorityOrder =
          Number(Boolean(b.raw?.programacaoSLAPrioritaria)) -
          Number(Boolean(a.raw?.programacaoSLAPrioritaria));
        if (priorityOrder !== 0) return priorityOrder;

        const buildingOrder = compareBuildings(a.predio, b.predio);
        if (buildingOrder !== 0) return buildingOrder;
        const floorOrder = compareFloors(a.andar, b.andar);
        if (floorOrder !== 0) return floorOrder;
        return (
          compareNatural(a.local, b.local) ||
          compareNatural(a.os, b.os)
        );
      },
    );

    const correctiveCount = correctiveQuotas[dayPosition] ?? 0;
    const dayCorretivas = corretivas.slice(
      corretivaIndex,
      corretivaIndex + correctiveCount,
    );
    corretivaIndex += dayCorretivas.length;

    const dayItems = [...dayPreventivas, ...dayCorretivas];
    buckets[weekIndex].porDia[dow].push(...dayItems);
    buckets[weekIndex].os.push(...dayItems);

    const scheduledMinutes = dayItems.length * options.minutosPorOS;
    const availableSlotsAfterPreventives = Math.max(
      0,
      capSlots - dayPreventivas.length,
    );
    const correctiveCapacity = Math.min(
      maxCorrectivesPerDay,
      availableSlotsAfterPreventives,
    );

    loadsByWeek[weekIndex].push({
      date: new Date(date),
      dateKey: isoDate(date),
      dayIndex: dow,
      preventiveCount: dayPreventivas.length,
      correctiveCount: dayCorretivas.length,
      scheduledMinutes,
      remainingMinutes: Math.max(0, targetMinutes - scheduledMinutes),
      targetMinutes,
      correctiveDeficit: Math.max(
        0,
        maxCorrectivesPerDay - dayCorretivas.length,
      ),
      correctiveCapacity,
    });
  });

  const scheduledPreventivas = preventiveCountsByDay.reduce(
    (sum, count) => sum + count,
    0,
  );
  const slaManagedPreventivas = deadlineControlled.length;
  const slaOnTimePreventivas = Math.max(
    0,
    slaManagedPreventivas - slaAtRiskPreventivas.length,
  );
  const preventiveDaysWithoutWork = businessDays
    .filter((_, index) => scheduledPreventivesByDay[index].length === 0)
    .map(isoDate);
  const preventiveDaysCovered =
    businessDays.length - preventiveDaysWithoutWork.length;

  return {
    buckets,
    loadsByWeek,
    overflowPreventivas,
    overflowCorretivas: corretivas.slice(corretivaIndex),
    scheduledPreventivas,
    scheduledCorretivas: corretivaIndex,
    slaManagedPreventivas,
    slaOnTimePreventivas,
    slaAtRiskPreventivas,
    preventiveDaysCovered,
    preventiveDaysWithoutWork,
  };
}

export function formatMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hoursPart = Math.floor(minutes / 60);
  const minutesPart = minutes % 60;
  return `${String(hoursPart).padStart(2, "0")}:${String(minutesPart).padStart(2, "0")}`;
}

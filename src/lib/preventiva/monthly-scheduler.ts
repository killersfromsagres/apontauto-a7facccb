import { businessDaysUntil, isoDate } from "./business-days";
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

/** Distribui o total mensal de forma uniforme por todos os dias úteis. */
function balancedDailyQuota(
  total: number,
  dayPosition: number,
  dayCount: number,
  dailyCapacity: number,
): number {
  if (total <= 0 || dayCount <= 0 || dailyCapacity <= 0) return 0;
  const schedulable = Math.min(total, dayCount * dailyCapacity);
  const base = Math.floor(schedulable / dayCount);
  const remainder = schedulable % dayCount;
  const before = Math.floor((dayPosition * remainder) / dayCount);
  const after = Math.floor(((dayPosition + 1) * remainder) / dayCount);
  return Math.min(dailyCapacity, base + (after > before ? 1 : 0));
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

  // Preventivas seguem a ordem operacional geográfica.
  const preventivas = sortByLocation(options.preventivas);
  // Quando usadas diretamente por este scheduler, corretivas também permanecem determinísticas.
  // Na tela Programação, a seleção prioritária é feita pelo alocador externo antes de anexá-las.
  const corretivas = sortByLocation(options.corretivas);
  const businessDays = businessDaysUntil(options.from, options.until);

  // Na Programação real reservamos exatamente 2 vagas por dia para corretivas.
  const reservedExternalCorrectives = options.reserveCorrectiveSlots
    ? Math.min(maxCorrectivesPerDay, capSlots)
    : 0;
  const preventiveCapacityPerDay = Math.max(
    0,
    capSlots - reservedExternalCorrectives,
  );
  const internalCorrectiveCapacityPerDay = options.reserveCorrectiveSlots
    ? 0
    : Math.min(maxCorrectivesPerDay, capSlots);

  const scheduledPreventiveTarget = Math.min(
    preventivas.length,
    businessDays.length * preventiveCapacityPerDay,
  );
  const scheduledCorrectiveTarget = Math.min(
    corretivas.length,
    businessDays.length * internalCorrectiveCapacityPerDay,
  );

  let preventivaIndex = 0;
  let corretivaIndex = 0;

  businessDays.forEach((date, dayPosition) => {
    const weekIndex = weekIndexForDate(date, options.weeks);
    if (weekIndex < 0) return;
    const dow = date.getDay() - 1;
    if (dow < 0 || dow > 4) return;

    const preventiveCount = balancedDailyQuota(
      scheduledPreventiveTarget,
      dayPosition,
      businessDays.length,
      preventiveCapacityPerDay,
    );
    const correctiveCount = balancedDailyQuota(
      scheduledCorrectiveTarget,
      dayPosition,
      businessDays.length,
      internalCorrectiveCapacityPerDay,
    );

    const dayPreventivas = preventivas.slice(
      preventivaIndex,
      preventivaIndex + preventiveCount,
    );
    preventivaIndex += dayPreventivas.length;

    const dayCorretivas = corretivas.slice(
      corretivaIndex,
      corretivaIndex + correctiveCount,
    );
    corretivaIndex += dayCorretivas.length;

    // Ordem obrigatória no dia: primeiro preventivas, depois corretivas.
    const dayItems = [...dayPreventivas, ...dayCorretivas];
    buckets[weekIndex].porDia[dow].push(...dayItems);
    buckets[weekIndex].os.push(...dayItems);

    const scheduledMinutes = dayItems.length * options.minutosPorOS;
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

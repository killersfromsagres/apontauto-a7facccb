import { classifyPriority, PRIORITY_ORDER } from "@/lib/corretiva/priority-classifier";
import type { CorrectiveSourceRow } from "./monthly-scheduler";
import {
  isCorrectiveBackorder,
  resolveCorrectiveTeam,
} from "./monthly-scheduler";
import type { Equipe } from "./triage";

const STORAGE_KEY = "apontauto.corrective-program-reservations.v1";
export const CORRECTIVE_RESERVATIONS_EVENT =
  "apontauto:corrective-program-reservations";

/** Meta operacional: 2 corretivas por dia útil, 5 dias => 10 por semana/equipe. */
export const CORRECTIVES_PER_DAY = 2;
export const BUSINESS_DAYS_PER_WEEK = 5;
export const CORRECTIVES_PER_WEEK = CORRECTIVES_PER_DAY * BUSINESS_DAYS_PER_WEEK;

const DAY_LABELS = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
] as const;

export function reservationDayLabel(dayIndex?: number | null): string {
  if (typeof dayIndex !== "number") return "";
  return DAY_LABELS[dayIndex] ?? "";
}

export interface CorrectiveProgramReservation {
  id: string;
  numeroOs: string;
  equipe: Equipe;
  periodStart: string;
  periodEnd: string;
  reservedAt: string;
  source: "programacao";
  /** 0 = segunda ... 4 = sexta. Opcional para compatibilidade com reservas antigas. */
  dayIndex?: number;
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizePriorityText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function rowKeys(row: Pick<CorrectiveSourceRow, "id" | "numero_os">): string[] {
  return [normalizeKey(row.id), normalizeKey(row.numero_os)].filter(Boolean);
}

function reservationKeys(reservation: CorrectiveProgramReservation): string[] {
  return [normalizeKey(reservation.id), normalizeKey(reservation.numeroOs)].filter(
    Boolean,
  );
}

function hasSharedKey(
  left: Pick<CorrectiveSourceRow, "id" | "numero_os">,
  right: CorrectiveProgramReservation,
): boolean {
  const rightKeys = new Set(reservationKeys(right));
  return rowKeys(left).some((key) => rightKeys.has(key));
}

function prioritySeverity(row: CorrectiveSourceRow): number {
  let rank = 2;
  for (const problem of row.corretiva_problemas ?? []) {
    const managerStatus = normalizePriorityText(problem?.status_gestor);
    if (
      managerStatus.includes("REJEIT") ||
      managerStatus.includes("CONCLUID") ||
      managerStatus.includes("FECHAD") ||
      managerStatus.includes("ENCERRAD")
    ) {
      continue;
    }
    const severity = normalizePriorityText(problem?.gravidade);
    if (severity.includes("CRITIC")) return 0;
    if (severity.includes("FALHA")) rank = Math.min(rank, 1);
  }
  return rank;
}

function priorityDate(value: unknown): number {
  const text = normalizeKey(value);
  if (!text) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(text).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.MAX_SAFE_INTEGER;
}

function comparePriorityOs(a: unknown, b: unknown): number {
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

/**
 * Ordem operacional para reservar corretivas na Programação:
 * 1) backorder vencido; 2) crítico/falha; 3) prioridade inteligente (classificador);
 * 4) SLA/data programada mais próxima; 5) chamado mais antigo; 6) número da OS.
 */
function sortReservationCandidates(
  rows: CorrectiveSourceRow[],
  referenceDate: Date,
): CorrectiveSourceRow[] {
  const priorityCache = new Map<CorrectiveSourceRow, ReturnType<typeof classifyPriority>>();
  const priorityOf = (row: CorrectiveSourceRow) => {
    const cached = priorityCache.get(row);
    if (cached) return cached;
    const value = classifyPriority(row, referenceDate);
    priorityCache.set(row, value);
    return value;
  };

  return [...rows].sort((a, b) => {
    const backorderOrder =
      Number(isCorrectiveBackorder(b, referenceDate)) -
      Number(isCorrectiveBackorder(a, referenceDate));
    if (backorderOrder !== 0) return backorderOrder;

    const severityOrder = prioritySeverity(a) - prioritySeverity(b);
    if (severityOrder !== 0) return severityOrder;

    const left = priorityOf(a);
    const right = priorityOf(b);
    const levelOrder =
      PRIORITY_ORDER[left.level] - PRIORITY_ORDER[right.level];
    if (levelOrder !== 0) return levelOrder;
    if (left.score !== right.score) return right.score - left.score;

    const dueOrder =
      priorityDate(a.data_sla ?? a.data_programada) -
      priorityDate(b.data_sla ?? b.data_programada);
    if (dueOrder !== 0) return dueOrder;

    const createdOrder =
      priorityDate(a.data_criacao) - priorityDate(b.data_criacao);
    if (createdOrder !== 0) return createdOrder;

    return comparePriorityOs(a.numero_os, b.numero_os);
  });
}

function readStorage(): CorrectiveProgramReservation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is CorrectiveProgramReservation =>
        Boolean(item) &&
        typeof item.id === "string" &&
        typeof item.numeroOs === "string" &&
        typeof item.equipe === "string" &&
        typeof item.periodStart === "string" &&
        typeof item.periodEnd === "string",
    );
  } catch (error) {
    console.warn("[CorrectiveReservations] Falha ao ler reservas:", error);
    return [];
  }
}

function writeStorage(reservations: CorrectiveProgramReservation[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
    window.dispatchEvent(
      new CustomEvent(CORRECTIVE_RESERVATIONS_EVENT, {
        detail: reservations,
      }),
    );
  } catch (error) {
    console.warn("[CorrectiveReservations] Falha ao salvar reservas:", error);
  }
}

export function listCorrectiveProgramReservations(): CorrectiveProgramReservation[] {
  return readStorage();
}

export function reservationForCorrective(
  id?: unknown,
  numeroOs?: unknown,
): CorrectiveProgramReservation | undefined {
  const keys = new Set([normalizeKey(id), normalizeKey(numeroOs)].filter(Boolean));
  if (keys.size === 0) return undefined;
  return readStorage().find((reservation) =>
    reservationKeys(reservation).some((key) => keys.has(key)),
  );
}

export function isCorrectiveReserved(id?: unknown, numeroOs?: unknown): boolean {
  return Boolean(reservationForCorrective(id, numeroOs));
}

export function releaseCorrectiveProgramReservation(
  id?: unknown,
  numeroOs?: unknown,
): void {
  const keys = new Set([normalizeKey(id), normalizeKey(numeroOs)].filter(Boolean));
  if (keys.size === 0) return;
  const current = readStorage();
  const next = current.filter(
    (reservation) =>
      !reservationKeys(reservation).some((key) => keys.has(key)),
  );
  if (next.length !== current.length) writeStorage(next);
}

/**
 * Remove reservas órfãs (OS que não existem mais na base) preservando todas as
 * que continuam existentes. Deve ser chamado após recarregar/importar a base.
 */
export function pruneCorrectiveProgramReservations(
  openRows: Array<Pick<CorrectiveSourceRow, "id" | "numero_os">>,
): CorrectiveProgramReservation[] {
  const current = readStorage();
  if (current.length === 0) return current;
  const existingKeys = new Set(openRows.flatMap(rowKeys));
  if (existingKeys.size === 0) return current;
  const next = current.filter((reservation) =>
    reservationKeys(reservation).some((key) => existingKeys.has(key)),
  );
  if (next.length !== current.length) writeStorage(next);
  return next;
}

export function setReservationsForWeekTeam(
  periodStart: string,
  periodEnd: string,
  equipe: Equipe,
  rows: CorrectiveSourceRow[],
  dayIndexByRowKey?: Map<string, number>,
): CorrectiveProgramReservation[] {
  const selectedKeys = new Set(rows.flatMap(rowKeys));
  const current = readStorage();
  const next = current.filter((reservation) => {
    const sameWeekTeam =
      reservation.periodStart === periodStart && reservation.equipe === equipe;
    const selectedElsewhere = reservationKeys(reservation).some((key) =>
      selectedKeys.has(key),
    );
    return !sameWeekTeam && !selectedElsewhere;
  });

  const reservedAt = new Date().toISOString();
  const additions = rows.map<CorrectiveProgramReservation>((row, index) => {
    const keys = rowKeys(row);
    const mapped = keys
      .map((key) => dayIndexByRowKey?.get(key))
      .find((value) => typeof value === "number");
    return {
      id: normalizeKey(row.id ?? row.numero_os),
      numeroOs: normalizeKey(row.numero_os ?? row.id),
      equipe,
      periodStart,
      periodEnd,
      reservedAt,
      source: "programacao",
      dayIndex:
        typeof mapped === "number"
          ? mapped
          : Math.floor(index / CORRECTIVES_PER_DAY) % BUSINESS_DAYS_PER_WEEK,
    };
  });
  writeStorage([...next, ...additions]);
  return additions;
}

export interface WeekTeamAllocation {
  /** Lista plana, já ordenada por prioridade. */
  rows: CorrectiveSourceRow[];
  /** 5 posições (segunda..sexta), no máximo `perDay` em cada. */
  byDay: CorrectiveSourceRow[][];
}

/**
 * Seleciona e reserva as corretivas da semana para uma equipe, distribuindo-as
 * entre segunda e sexta (no máximo `perDay` por dia). Reservas já existentes
 * para a mesma semana/equipe são reaproveitadas; OS reservadas em outra
 * semana/equipe nunca são reaproveitadas (sem duplicidade).
 */
export function allocateCorrectivesForWeekTeam(options: {
  rows: CorrectiveSourceRow[];
  equipe: Equipe;
  periodStart: string;
  periodEnd: string;
  referenceDate: Date;
  perDay?: number;
  businessDays?: number;
}): WeekTeamAllocation {
  const {
    rows,
    equipe,
    periodStart,
    periodEnd,
    referenceDate,
    perDay = CORRECTIVES_PER_DAY,
    businessDays = BUSINESS_DAYS_PER_WEEK,
  } = options;

  const limit = Math.max(0, perDay * businessDays);
  const reservations = readStorage();
  const currentReservations = reservations.filter(
    (reservation) =>
      reservation.periodStart === periodStart && reservation.equipe === equipe,
  );

  const selected: CorrectiveSourceRow[] = [];
  const selectedKeys = new Set<string>();
  const pushSelected = (row: CorrectiveSourceRow) => {
    const keys = rowKeys(row);
    if (keys.some((key) => selectedKeys.has(key))) return;
    selected.push(row);
    keys.forEach((key) => selectedKeys.add(key));
  };

  for (const reservation of currentReservations) {
    if (selected.length >= limit) break;
    const row = rows.find((candidate) => hasSharedKey(candidate, reservation));
    if (!row || resolveCorrectiveTeam(row) !== equipe) continue;
    pushSelected(row);
  }

  const reservedElsewhereKeys = new Set(
    reservations
      .filter(
        (reservation) =>
          !(
            reservation.periodStart === periodStart &&
            reservation.equipe === equipe
          ),
      )
      .flatMap(reservationKeys),
  );

  if (selected.length < limit) {
    const candidates = sortReservationCandidates(
      rows.filter((row) => {
        if (resolveCorrectiveTeam(row) !== equipe) return false;
        const keys = rowKeys(row);
        if (keys.length === 0) return false;
        if (keys.some((key) => selectedKeys.has(key))) return false;
        return !keys.some((key) => reservedElsewhereKeys.has(key));
      }),
      referenceDate,
    );

    for (const candidate of candidates) {
      if (selected.length >= limit) break;
      pushSelected(candidate);
    }
  }

  const finalRows = selected.slice(0, limit);

  // Distribuição balanceada: round-robin pelos dias úteis, respeitando o teto
  // diário. Com menos de `limit` OS, elas se espalham entre os dias em vez de
  // concentrarem na sexta.
  const byDay: CorrectiveSourceRow[][] = Array.from(
    { length: businessDays },
    () => [],
  );
  const dayIndexByRowKey = new Map<string, number>();
  finalRows.forEach((row, index) => {
    const day = index % businessDays;
    byDay[day].push(row);
    rowKeys(row).forEach((key) => dayIndexByRowKey.set(key, day));
  });

  setReservationsForWeekTeam(
    periodStart,
    periodEnd,
    equipe,
    finalRows,
    dayIndexByRowKey,
  );

  return { rows: finalRows, byDay };
}

/** Compatibilidade: devolve apenas a lista plana já reservada. */
export function selectCorrectiveRowsForWeekTeam(options: {
  rows: CorrectiveSourceRow[];
  equipe: Equipe;
  periodStart: string;
  periodEnd: string;
  referenceDate: Date;
  limit?: number;
  perDay?: number;
}): CorrectiveSourceRow[] {
  const perDay = options.perDay ?? CORRECTIVES_PER_DAY;
  const businessDays =
    typeof options.limit === "number"
      ? Math.max(1, Math.ceil(options.limit / perDay))
      : BUSINESS_DAYS_PER_WEEK;
  const allocation = allocateCorrectivesForWeekTeam({
    ...options,
    perDay,
    businessDays,
  });
  return typeof options.limit === "number"
    ? allocation.rows.slice(0, options.limit)
    : allocation.rows;
}

export function subscribeCorrectiveProgramReservations(
  listener: (reservations: CorrectiveProgramReservation[]) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleCustom = () => listener(readStorage());
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener(readStorage());
  };
  window.addEventListener(CORRECTIVE_RESERVATIONS_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CORRECTIVE_RESERVATIONS_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}

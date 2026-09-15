import {
  classifyPriority,
  PRIORITY_ORDER,
} from "@/lib/corretiva/priority-classifier";
import type { CorrectiveSourceRow } from "./monthly-scheduler";
import {
  isCorrectiveBackorder,
  resolveCorrectiveTeam,
} from "./monthly-scheduler";
import type { Equipe } from "./triage";

// v2 zera as marcações antigas de "EM PROGRAMAÇÃO" sem afetar futuras reservas.
// A chave v1 é removida quando este módulo é lido no navegador.
const STORAGE_KEY = "apontauto.corrective-program-reservations.v2";
const LEGACY_STORAGE_KEY = "apontauto.corrective-program-reservations.v1";

export const CORRECTIVE_RESERVATIONS_EVENT =
  "apontauto:corrective-program-reservations";

export const CORRECTIVES_PER_DAY = 2;
export const BUSINESS_DAYS_PER_WEEK = 5;
export const CORRECTIVES_PER_WEEK =
  CORRECTIVES_PER_DAY * BUSINESS_DAYS_PER_WEEK;

const DAY_LABELS = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
] as const;

export interface CorrectiveProgramReservation {
  id: string;
  numeroOs: string;
  equipe: Equipe;
  periodStart: string;
  periodEnd: string;
  reservedAt: string;
  source: "programacao";
  dayIndex?: number;
}

export interface WeekTeamAllocation {
  rows: CorrectiveSourceRow[];
  byDay: CorrectiveSourceRow[][];
}

export function reservationDayLabel(dayIndex?: number | null): string {
  if (typeof dayIndex !== "number") return "";
  return DAY_LABELS[dayIndex] ?? "";
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim().toUpperCase();
}

function rowKeys(
  row: Pick<CorrectiveSourceRow, "id" | "numero_os">,
): string[] {
  return [normalizeKey(row.id), normalizeKey(row.numero_os)].filter(Boolean);
}

function reservationKeys(
  reservation: CorrectiveProgramReservation,
): string[] {
  return [
    normalizeKey(reservation.id),
    normalizeKey(reservation.numeroOs),
  ].filter(Boolean);
}

function sharesKey(
  row: Pick<CorrectiveSourceRow, "id" | "numero_os">,
  reservation: CorrectiveProgramReservation,
): boolean {
  const keys = new Set(reservationKeys(reservation));
  return rowKeys(row).some((key) => keys.has(key));
}

function dateRank(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp)
    ? timestamp
    : Number.MAX_SAFE_INTEGER;
}

function compareOs(a: unknown, b: unknown): number {
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortCandidates(
  rows: CorrectiveSourceRow[],
  referenceDate: Date,
): CorrectiveSourceRow[] {
  const priorityCache = new Map<
    CorrectiveSourceRow,
    ReturnType<typeof classifyPriority>
  >();

  const priorityOf = (row: CorrectiveSourceRow) => {
    const cached = priorityCache.get(row);
    if (cached) return cached;
    const priority = classifyPriority(row, referenceDate);
    priorityCache.set(row, priority);
    return priority;
  };

  return [...rows].sort((a, b) => {
    // Backorders continuam entrando primeiro.
    const backorderOrder =
      Number(isCorrectiveBackorder(b, referenceDate)) -
      Number(isCorrectiveBackorder(a, referenceDate));
    if (backorderOrder !== 0) return backorderOrder;

    const aPriority = priorityOf(a);
    const bPriority = priorityOf(b);
    const priorityOrder =
      PRIORITY_ORDER[aPriority.level] - PRIORITY_ORDER[bPriority.level] ||
      bPriority.score - aPriority.score;
    if (priorityOrder !== 0) return priorityOrder;

    const dueOrder =
      dateRank(a.data_sla ?? a.data_programada) -
      dateRank(b.data_sla ?? b.data_programada);
    if (dueOrder !== 0) return dueOrder;

    const createdOrder = dateRank(a.data_criacao) - dateRank(b.data_criacao);
    if (createdOrder !== 0) return createdOrder;

    return compareOs(a.numero_os, b.numero_os);
  });
}

function cleanupLegacyStorage(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Sem ação: armazenamento pode estar indisponível em modo privado restrito.
  }
}

function readStorage(): CorrectiveProgramReservation[] {
  if (typeof window === "undefined") return [];
  cleanupLegacyStorage();

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
  cleanupLegacyStorage();

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
    window.dispatchEvent(
      new CustomEvent(CORRECTIVE_RESERVATIONS_EVENT, { detail: reservations }),
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
  const keys = new Set(
    [normalizeKey(id), normalizeKey(numeroOs)].filter(Boolean),
  );
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
  const keys = new Set(
    [normalizeKey(id), normalizeKey(numeroOs)].filter(Boolean),
  );
  if (keys.size === 0) return;

  const current = readStorage();
  const next = current.filter(
    (reservation) =>
      !reservationKeys(reservation).some((key) => keys.has(key)),
  );
  if (next.length !== current.length) writeStorage(next);
}

export function pruneCorrectiveProgramReservations(
  rows: Array<Pick<CorrectiveSourceRow, "id" | "numero_os">>,
): CorrectiveProgramReservation[] {
  const current = readStorage();
  if (current.length === 0) return current;

  const existingKeys = new Set(rows.flatMap(rowKeys));
  if (existingKeys.size === 0) {
    writeStorage([]);
    return [];
  }

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
      reservation.periodStart === periodStart &&
      reservation.periodEnd === periodEnd &&
      reservation.equipe === equipe;
    const selectedHere = reservationKeys(reservation).some((key) =>
      selectedKeys.has(key),
    );
    return !sameWeekTeam && !selectedHere;
  });

  const reservedAt = new Date().toISOString();
  const additions = rows.map<CorrectiveProgramReservation>((row, index) => {
    const keys = rowKeys(row);
    const mappedDay = keys
      .map((key) => dayIndexByRowKey?.get(key))
      .find((value): value is number => typeof value === "number");

    return {
      id: String(row.id ?? row.numero_os ?? "").trim(),
      numeroOs: String(row.numero_os ?? row.id ?? "").trim(),
      equipe,
      periodStart,
      periodEnd,
      reservedAt,
      source: "programacao",
      dayIndex:
        mappedDay ??
        Math.min(
          BUSINESS_DAYS_PER_WEEK - 1,
          Math.floor(index / CORRECTIVES_PER_DAY),
        ),
    };
  });

  writeStorage([...next, ...additions]);
  return additions;
}

function totalAllocated(byDay: CorrectiveSourceRow[][]): number {
  return byDay.reduce((total, day) => total + day.length, 0);
}

function nextAvailableDay(
  byDay: CorrectiveSourceRow[][],
  perDay: number,
): number {
  // Preenche 2 por dia em sequência: SEG 2, TER 2, QUA 2, QUI 2, SEX 2.
  for (let dayIndex = 0; dayIndex < byDay.length; dayIndex += 1) {
    if (byDay[dayIndex].length < perDay) return dayIndex;
  }
  return -1;
}

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
  const sameWeekReservations = reservations.filter(
    (reservation) =>
      reservation.periodStart === periodStart &&
      reservation.periodEnd === periodEnd &&
      reservation.equipe === equipe,
  );

  const reservedElsewhereKeys = new Set(
    reservations
      .filter(
        (reservation) =>
          !(
            reservation.periodStart === periodStart &&
            reservation.periodEnd === periodEnd &&
            reservation.equipe === equipe
          ),
      )
      .flatMap(reservationKeys),
  );

  const eligible = sortCandidates(
    rows.filter((row) => {
      if (resolveCorrectiveTeam(row) !== equipe) return false;
      const keys = rowKeys(row);
      return (
        keys.length > 0 &&
        !keys.some((key) => reservedElsewhereKeys.has(key))
      );
    }),
    referenceDate,
  );

  const byDay = Array.from(
    { length: businessDays },
    () => [] as CorrectiveSourceRow[],
  );
  const selectedKeys = new Set<string>();

  // Mantém reservas da mesma semana quando existirem, respeitando sempre 2/dia.
  for (const reservation of sameWeekReservations) {
    if (totalAllocated(byDay) >= limit) break;
    const row = eligible.find((candidate) => sharesKey(candidate, reservation));
    if (!row) continue;

    const keys = rowKeys(row);
    if (keys.some((key) => selectedKeys.has(key))) continue;

    const preferredDay =
      typeof reservation.dayIndex === "number" &&
      reservation.dayIndex >= 0 &&
      reservation.dayIndex < businessDays &&
      byDay[reservation.dayIndex].length < perDay
        ? reservation.dayIndex
        : nextAvailableDay(byDay, perDay);

    if (preferredDay < 0) break;
    byDay[preferredDay].push(row);
    keys.forEach((key) => selectedKeys.add(key));
  }

  // Completa cada dia até 2 corretivas antes de avançar ao dia seguinte.
  for (const row of eligible) {
    if (totalAllocated(byDay) >= limit) break;
    const keys = rowKeys(row);
    if (keys.some((key) => selectedKeys.has(key))) continue;

    const dayIndex = nextAvailableDay(byDay, perDay);
    if (dayIndex < 0) break;

    byDay[dayIndex].push(row);
    keys.forEach((key) => selectedKeys.add(key));
  }

  const finalRows = byDay.flat();
  const dayIndexByRowKey = new Map<string, number>();
  byDay.forEach((dayRows, dayIndex) => {
    dayRows.forEach((row) => {
      rowKeys(row).forEach((key) => dayIndexByRowKey.set(key, dayIndex));
    });
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

export function selectCorrectiveRowsForWeekTeam(options: {
  rows: CorrectiveSourceRow[];
  equipe: Equipe;
  periodStart: string;
  periodEnd: string;
  referenceDate: Date;
  limit?: number;
  perDay?: number;
}): CorrectiveSourceRow[] {
  const requested = options.limit;
  if (typeof requested !== "number") {
    return allocateCorrectivesForWeekTeam(options).rows;
  }

  const perDay = options.perDay ?? CORRECTIVES_PER_DAY;
  const allocation = allocateCorrectivesForWeekTeam({
    ...options,
    perDay,
    businessDays: Math.max(1, Math.ceil(requested / perDay)),
  });
  return allocation.rows.slice(0, requested);
}

export function subscribeCorrectiveProgramReservations(
  listener: (reservations: CorrectiveProgramReservation[]) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handleCustom = () => listener(readStorage());
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === LEGACY_STORAGE_KEY) {
      listener(readStorage());
    }
  };

  window.addEventListener(CORRECTIVE_RESERVATIONS_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CORRECTIVE_RESERVATIONS_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}

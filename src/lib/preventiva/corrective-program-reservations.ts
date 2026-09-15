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

const STORAGE_KEY = "apontauto.corrective-program-reservations.v1";
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
  dayIndex?: number;
}

export interface WeekTeamAllocation {
  rows: CorrectiveSourceRow[];
  byDay: CorrectiveSourceRow[][];
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

function hasSharedKey(
  row: Pick<CorrectiveSourceRow, "id" | "numero_os">,
  reservation: CorrectiveProgramReservation,
) {
  const keys = new Set(reservationKeys(reservation));
  return rowKeys(row).some((key) => keys.has(key));
}

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function problemSeverity(row: CorrectiveSourceRow): number {
  let rank = 2;
  for (const problem of row.corretiva_problemas ?? []) {
    const manager = normalized(problem?.status_gestor);
    if (
      manager.includes("REJEIT") ||
      manager.includes("CONCLUID") ||
      manager.includes("FECHAD") ||
      manager.includes("ENCERRAD")
    )
      continue;

    const severity = normalized(problem?.gravidade);
    if (severity.includes("CRITIC")) return 0;
    if (severity.includes("FALHA")) rank = Math.min(rank, 1);
  }
  return rank;
}

function dateRank(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const timestamp = new Date(raw).getTime();
  return Number.isFinite(timestamp)
    ? timestamp
    : Number.MAX_SAFE_INTEGER;
}

function compareOs(a: unknown, b: unknown) {
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortCandidates(
  rows: CorrectiveSourceRow[],
  referenceDate: Date,
): CorrectiveSourceRow[] {
  const priorities = new Map<
    CorrectiveSourceRow,
    ReturnType<typeof classifyPriority>
  >();
  const priorityOf = (row: CorrectiveSourceRow) => {
    const cached = priorities.get(row);
    if (cached) return cached;
    const priority = classifyPriority(row, referenceDate);
    priorities.set(row, priority);
    return priority;
  };

  return [...rows].sort((a, b) => {
    const backorder =
      Number(isCorrectiveBackorder(b, referenceDate)) -
      Number(isCorrectiveBackorder(a, referenceDate));
    if (backorder !== 0) return backorder;

    const severity = problemSeverity(a) - problemSeverity(b);
    if (severity !== 0) return severity;

    const pa = priorityOf(a);
    const pb = priorityOf(b);
    const priority =
      PRIORITY_ORDER[pa.level] - PRIORITY_ORDER[pb.level] ||
      pb.score - pa.score;
    if (priority !== 0) return priority;

    const due =
      dateRank(a.data_sla ?? a.data_programada) -
      dateRank(b.data_sla ?? b.data_programada);
    if (due !== 0) return due;

    const created = dateRank(a.data_criacao) - dateRank(b.data_criacao);
    if (created !== 0) return created;
    return compareOs(a.numero_os, b.numero_os);
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
      new CustomEvent(CORRECTIVE_RESERVATIONS_EVENT, { detail: reservations }),
    );
  } catch (error) {
    console.warn("[CorrectiveReservations] Falha ao salvar reservas:", error);
  }
}

export function listCorrectiveProgramReservations() {
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

export function isCorrectiveReserved(id?: unknown, numeroOs?: unknown) {
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

/** Remove somente reservas cujas OS deixaram de existir na base atual. */
export function pruneCorrectiveProgramReservations(
  rows: Array<Pick<CorrectiveSourceRow, "id" | "numero_os">>,
): CorrectiveProgramReservation[] {
  const current = readStorage();
  if (current.length === 0) return current;

  const existingKeys = new Set(rows.flatMap(rowKeys));
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
    const mapped = keys
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
        mapped ??
        Math.min(
          BUSINESS_DAYS_PER_WEEK - 1,
          Math.floor(index / CORRECTIVES_PER_DAY),
        ),
    };
  });

  writeStorage([...next, ...additions]);
  return additions;
}

function nextAvailableDay(byDay: CorrectiveSourceRow[][], perDay: number) {
  let best = -1;
  let bestCount = Number.MAX_SAFE_INTEGER;
  byDay.forEach((items, index) => {
    if (items.length >= perDay) return;
    if (items.length < bestCount) {
      best = index;
      bestCount = items.length;
    }
  });
  return best;
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
  const currentReservations = reservations.filter(
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

  const eligible = rows.filter((row) => {
    if (resolveCorrectiveTeam(row) !== equipe) return false;
    const keys = rowKeys(row);
    return (
      keys.length > 0 &&
      !keys.some((key) => reservedElsewhereKeys.has(key))
    );
  });
  const sorted = sortCandidates(eligible, referenceDate);
  const byDay = Array.from({ length: businessDays }, () => [] as CorrectiveSourceRow[]);
  const selectedKeys = new Set<string>();

  // Reaproveita reservas da mesma semana e mantém o dia quando possível.
  currentReservations.forEach((reservation) => {
    if ([...selectedKeys].length >= limit) return;
    const row = sorted.find((candidate) => hasSharedKey(candidate, reservation));
    if (!row) return;
    const keys = rowKeys(row);
    if (keys.some((key) => selectedKeys.has(key))) return;
    const preferred =
      typeof reservation.dayIndex === "number" &&
      reservation.dayIndex >= 0 &&
      reservation.dayIndex < businessDays &&
      byDay[reservation.dayIndex].length < perDay
        ? reservation.dayIndex
        : nextAvailableDay(byDay, perDay);
    if (preferred < 0) return;
    byDay[preferred].push(row);
    keys.forEach((key) => selectedKeys.add(key));
  });

  for (const row of sorted) {
    if (byDay.reduce((total, day) => total + day.length, 0) >= limit) break;
    const keys = rowKeys(row);
    if (keys.some((key) => selectedKeys.has(key))) continue;
    const day = nextAvailableDay(byDay, perDay);
    if (day < 0) break;
    byDay[day].push(row);
    keys.forEach((key) => selectedKeys.add(key));
  }

  const finalRows = byDay.flat();
  const dayIndexByRowKey = new Map<string, number>();
  byDay.forEach((dayRows, dayIndex) => {
    dayRows.forEach((row) =>
      rowKeys(row).forEach((key) => dayIndexByRowKey.set(key, dayIndex)),
    );
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

/** Compatibilidade com fluxos antigos que solicitam um limite semanal explícito. */
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
    if (event.key === STORAGE_KEY) listener(readStorage());
  };
  window.addEventListener(CORRECTIVE_RESERVATIONS_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);
  return () => {
    window.removeEventListener(CORRECTIVE_RESERVATIONS_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}

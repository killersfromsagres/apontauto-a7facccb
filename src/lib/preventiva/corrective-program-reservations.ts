import type { CorrectiveSourceRow } from "./monthly-scheduler";
import { resolveCorrectiveTeam, sortCorrectiveRows } from "./monthly-scheduler";
import type { Equipe } from "./triage";

const STORAGE_KEY = "apontauto.corrective-program-reservations.v1";
export const CORRECTIVE_RESERVATIONS_EVENT =
  "apontauto:corrective-program-reservations";

export interface CorrectiveProgramReservation {
  id: string;
  numeroOs: string;
  equipe: Equipe;
  periodStart: string;
  periodEnd: string;
  reservedAt: string;
  source: "programacao";
}

function normalizeKey(value: unknown): string {
  return String(value ?? "").trim();
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

export function pruneCorrectiveProgramReservations(
  openRows: CorrectiveSourceRow[],
): CorrectiveProgramReservation[] {
  const current = readStorage();
  const next = current.filter((reservation) =>
    openRows.some((row) => hasSharedKey(row, reservation)),
  );
  if (next.length !== current.length) writeStorage(next);
  return next;
}

export function setReservationsForWeekTeam(
  periodStart: string,
  periodEnd: string,
  equipe: Equipe,
  rows: CorrectiveSourceRow[],
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
  const additions = rows.map<CorrectiveProgramReservation>((row) => ({
    id: normalizeKey(row.id ?? row.numero_os),
    numeroOs: normalizeKey(row.numero_os ?? row.id),
    equipe,
    periodStart,
    periodEnd,
    reservedAt,
    source: "programacao",
  }));
  writeStorage([...next, ...additions]);
  return additions;
}

export function selectCorrectiveRowsForWeekTeam(options: {
  rows: CorrectiveSourceRow[];
  equipe: Equipe;
  periodStart: string;
  periodEnd: string;
  referenceDate: Date;
  limit?: number;
}): CorrectiveSourceRow[] {
  const {
    rows,
    equipe,
    periodStart,
    periodEnd,
    referenceDate,
    limit = 2,
  } = options;

  const reservations = readStorage();
  const currentReservations = reservations.filter(
    (reservation) =>
      reservation.periodStart === periodStart && reservation.equipe === equipe,
  );

  const selected: CorrectiveSourceRow[] = [];
  for (const reservation of currentReservations) {
    const row = rows.find((candidate) => hasSharedKey(candidate, reservation));
    if (!row || resolveCorrectiveTeam(row) !== equipe) continue;
    if (!selected.some((candidate) => rowKeys(candidate).some((key) => rowKeys(row).includes(key)))) {
      selected.push(row);
    }
    if (selected.length >= limit) break;
  }

  const selectedKeys = new Set(selected.flatMap(rowKeys));
  const reservedElsewhere = reservations.filter(
    (reservation) =>
      !(reservation.periodStart === periodStart && reservation.equipe === equipe),
  );
  const reservedElsewhereKeys = new Set(reservedElsewhere.flatMap(reservationKeys));

  if (selected.length < limit) {
    const candidates = sortCorrectiveRows(
      rows.filter((row) => {
        if (resolveCorrectiveTeam(row) !== equipe) return false;
        const keys = rowKeys(row);
        if (keys.some((key) => selectedKeys.has(key))) return false;
        return !keys.some((key) => reservedElsewhereKeys.has(key));
      }),
      referenceDate,
    );

    for (const candidate of candidates) {
      selected.push(candidate);
      rowKeys(candidate).forEach((key) => selectedKeys.add(key));
      if (selected.length >= limit) break;
    }
  }

  setReservationsForWeekTeam(
    periodStart,
    periodEnd,
    equipe,
    selected.slice(0, limit),
  );
  return selected.slice(0, limit);
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

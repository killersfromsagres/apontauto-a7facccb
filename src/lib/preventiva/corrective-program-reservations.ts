import {
  classifyPriority,
  PRIORITY_ORDER,
} from "@/lib/corretiva/priority-classifier";
import type { CorrectiveSourceRow } from "./monthly-scheduler";
import { resolveCorrectiveTeam } from "./monthly-scheduler";
import {
  REFRIG_1,
  REFRIG_2,
  REFRIG_3,
  type Equipe,
} from "./triage";

// v5 mantém a última distribuição visual por semana/equipe.
// HISTORY_STORAGE_KEY registra toda OS corretiva já enviada para uma programação
// neste navegador. Enquanto o chamado continuar aberto, ele não volta para uma
// nova programação automática; ao liberar a reserva, ele fica elegível novamente.
const STORAGE_KEY = "apontauto.corrective-program-reservations.v5";
const HISTORY_STORAGE_KEY = "apontauto.corrective-program-history.v1";
const LEGACY_STORAGE_KEYS = [
  "apontauto.corrective-program-reservations.v4",
  "apontauto.corrective-program-reservations.v3",
  "apontauto.corrective-program-reservations.v2",
  "apontauto.corrective-program-reservations.v1",
] as const;

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

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function programmingStatus(row: Pick<CorrectiveSourceRow, "programacao_status">): string {
  return String(row.programacao_status ?? "").trim().toLowerCase();
}

function isPersistentlyProgrammed(
  row: Pick<CorrectiveSourceRow, "programacao_status">,
): boolean {
  return programmingStatus(row) === "em_programacao";
}

function isPendingReprogramming(
  row: Pick<CorrectiveSourceRow, "programacao_status">,
): boolean {
  return programmingStatus(row) === "reprogramacao_pendente";
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

function uniqueRows(rows: CorrectiveSourceRow[]): CorrectiveSourceRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const keys = rowKeys(row);
    const stableKey = keys[1] || keys[0];
    if (!stableKey || seen.has(stableKey)) return false;
    seen.add(stableKey);
    return true;
  });
}

function buildingMatches(predio: unknown, buildings: readonly string[]): boolean {
  const current = normalizeText(predio);
  if (!current) return false;
  return buildings.some((building) => {
    const target = normalizeText(building);
    return current === target || current.startsWith(`${target} `);
  });
}

/**
 * Na Programação, corretivas de Refrigeração obedecem primeiro à matriz de
 * prédios das equipes 1/2/3. Para as demais especialidades usa a classificação
 * normal do chamado.
 */
function resolveProgramCorrectiveTeam(row: CorrectiveSourceRow): Equipe | null {
  const resolved = resolveCorrectiveTeam(row);
  const context = normalizeText(
    `${row.equipe ?? ""} ${row.nome_os ?? ""} ${row.tipo ?? ""} ${row.ativo ?? ""} ${row.equipamento ?? ""}`,
  );
  const isRefrigeration =
    Boolean(resolved?.startsWith("CLIMATIZAÇÃO E REFRIGERAÇÃO")) ||
    context.includes("REFRIG") ||
    context.includes("CLIMAT") ||
    context.includes("AR CONDIC") ||
    context.includes("FANCOIL") ||
    context.includes("CHILLER");

  if (!isRefrigeration) return resolved;
  if (buildingMatches(row.predio, REFRIG_2)) {
    return "CLIMATIZAÇÃO E REFRIGERAÇÃO 2";
  }
  if (buildingMatches(row.predio, REFRIG_3)) {
    return "CLIMATIZAÇÃO E REFRIGERAÇÃO 3";
  }
  if (buildingMatches(row.predio, REFRIG_1)) {
    return "CLIMATIZAÇÃO E REFRIGERAÇÃO 1";
  }
  return resolved;
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

const DUE_ORDER = {
  OVERDUE: 0,
  DUE_SOON: 1,
  DUE_WEEK: 2,
  ON_TIME: 3,
  NO_DUE: 4,
} as const;

function hydraulicUrgencyScore(row: CorrectiveSourceRow): number {
  const team = resolveProgramCorrectiveTeam(row);
  if (team !== "HIDRÁULICA") return 0;

  const text = normalizeText(
    `${row.nome_os ?? ""} ${row.tipo ?? ""} ${row.ativo ?? ""} ${row.equipamento ?? ""} ${row.predio ?? ""} ${row.andar ?? ""} ${row.local ?? ""}`,
  );

  let score = 0;
  if (/ENTUP|DESENTUP|ESGOTO|RETORNO DE ESGOTO/.test(text)) score += 100;
  if (/BANHEIRO|SANITARIO|VASO|MICTORIO/.test(text)) score += 70;
  if (/COZINHA/.test(text)) score += 55;
  if (/\bC70\b/.test(text)) score += 45;
  if (/VAZAMENTO|ROMPIMENTO|ALAGAMENTO/.test(text)) score += 35;
  if (/PIA|TORNEIRA|RALO/.test(text)) score += 20;
  return score;
}

/**
 * Ordem operacional da fila:
 * 1. Reprogramações pendentes ("não realizado");
 * 2. Backorders;
 * 3. urgências hidráulicas operacionais (entupimento, banheiro, cozinha/C70 etc.);
 * 4. SLA/data programada mais urgente (vencido → vence logo → semana);
 * 5. criticidade e score;
 * 6. chamados mais antigos;
 * 7. número da OS como desempate estável.
 */
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
    const aPriority = priorityOf(a);
    const bPriority = priorityOf(b);

    // OS devolvidas como "não realizado" voltam ao topo da próxima programação.
    // Isso impede que uma tentativa frustrada fique esquecida atrás de chamados novos.
    const reprogramOrder =
      Number(isPendingReprogramming(b)) - Number(isPendingReprogramming(a));
    if (reprogramOrder !== 0) return reprogramOrder;

    const backorderOrder =
      Number(bPriority.isBackorder) - Number(aPriority.isBackorder);
    if (backorderOrder !== 0) return backorderOrder;

    // Dentro da Hidráulica, falhas que impactam sanitários e operação
    // (entupimentos, banheiros, cozinha/C70, vazamentos) sobem antes das
    // corretivas hidráulicas comuns.
    const hydraulicOrder =
      hydraulicUrgencyScore(b) - hydraulicUrgencyScore(a);
    if (hydraulicOrder !== 0) return hydraulicOrder;

    const dueStateOrder =
      DUE_ORDER[aPriority.dueState] - DUE_ORDER[bPriority.dueState];
    if (dueStateOrder !== 0) return dueStateOrder;

    const daysToDueA = aPriority.daysToDue ?? Number.MAX_SAFE_INTEGER;
    const daysToDueB = bPriority.daysToDue ?? Number.MAX_SAFE_INTEGER;
    if (daysToDueA !== daysToDueB) return daysToDueA - daysToDueB;

    const dueOrder =
      dateRank(a.data_sla ?? a.data_programada) -
      dateRank(b.data_sla ?? b.data_programada);
    if (dueOrder !== 0) return dueOrder;

    const priorityOrder =
      PRIORITY_ORDER[aPriority.level] - PRIORITY_ORDER[bPriority.level] ||
      bPriority.score - aPriority.score;
    if (priorityOrder !== 0) return priorityOrder;

    if (aPriority.ageDays !== bPriority.ageDays) {
      return bPriority.ageDays - aPriority.ageDays;
    }

    const createdOrder = dateRank(a.data_criacao) - dateRank(b.data_criacao);
    if (createdOrder !== 0) return createdOrder;

    return compareOs(a.numero_os, b.numero_os);
  });
}

function cleanupLegacyStorage(): void {
  if (typeof window === "undefined") return;
  try {
    LEGACY_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
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

function readHistory(): CorrectiveProgramReservation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY);
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
    console.warn("[CorrectiveReservations] Falha ao ler histórico:", error);
    return [];
  }
}

function writeHistory(reservations: CorrectiveProgramReservation[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(reservations));
  } catch (error) {
    console.warn("[CorrectiveReservations] Falha ao salvar histórico:", error);
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

  const history = readHistory();
  const nextHistory = history.filter(
    (reservation) =>
      !reservationKeys(reservation).some((key) => keys.has(key)),
  );
  if (nextHistory.length !== history.length) writeHistory(nextHistory);
}

export function pruneCorrectiveProgramReservations(
  rows: Array<Pick<CorrectiveSourceRow, "id" | "numero_os">>,
): CorrectiveProgramReservation[] {
  const current = readStorage();
  const history = readHistory();
  const existingKeys = new Set(rows.flatMap(rowKeys));

  if (existingKeys.size === 0) {
    if (current.length > 0) writeStorage([]);
    if (history.length > 0) writeHistory([]);
    return [];
  }

  const next = current.filter((reservation) =>
    reservationKeys(reservation).some((key) => existingKeys.has(key)),
  );
  const nextHistory = history.filter((reservation) =>
    reservationKeys(reservation).some((key) => existingKeys.has(key)),
  );

  if (next.length !== current.length) writeStorage(next);
  if (nextHistory.length !== history.length) writeHistory(nextHistory);
  return next;
}

export function setReservationsForWeekTeam(
  periodStart: string,
  periodEnd: string,
  equipe: Equipe,
  rows: CorrectiveSourceRow[],
  dayIndexByRowKey?: Map<string, number>,
): CorrectiveProgramReservation[] {
  const current = readStorage();

  // Mantém somente a distribuição visual mais recente desta semana/equipe.
  // O histórico permanente de OS já programadas é salvo separadamente para
  // impedir que a mesma corretiva volte automaticamente em uma nova geração.
  const next = current.filter(
    (reservation) =>
      !(
        reservation.periodStart === periodStart &&
        reservation.periodEnd === periodEnd &&
        reservation.equipe === equipe
      ),
  );

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

  // Se a mesma OS voltou como reprogramação, substitui qualquer reserva local
  // antiga dela (inclusive de outra semana). O histórico auditável definitivo
  // fica no banco; aqui mantemos apenas a fotografia corrente do navegador.
  const additionKeys = new Set(additions.flatMap(reservationKeys));
  const currentWithoutReprogrammedDuplicates = next.filter(
    (reservation) =>
      !reservationKeys(reservation).some((key) => additionKeys.has(key)),
  );
  writeStorage([...currentWithoutReprogrammedDuplicates, ...additions]);

  const history = readHistory();
  const historyKeys = new Set(history.flatMap(reservationKeys));
  const freshHistory = additions.filter(
    (reservation) =>
      !reservationKeys(reservation).some((key) => historyKeys.has(key)),
  );
  if (freshHistory.length > 0) writeHistory([...history, ...freshHistory]);

  return additions;
}

export function allocateCorrectivesForWeekTeam(options: {
  rows: CorrectiveSourceRow[];
  equipe: Equipe;
  periodStart: string;
  periodEnd: string;
  referenceDate: Date;
  perDay?: number;
  businessDays?: number;
  /** Limite real por dia após a proteção de SLA das preventivas. */
  perDayCapacities?: number[];
}): WeekTeamAllocation {
  const {
    rows,
    equipe,
    periodStart,
    periodEnd,
    referenceDate,
    perDay = CORRECTIVES_PER_DAY,
    businessDays = BUSINESS_DAYS_PER_WEEK,
    perDayCapacities,
  } = options;

  const capacities = Array.from({ length: businessDays }, (_, dayIndex) =>
    Math.max(
      0,
      Math.min(
        perDay,
        Math.floor(perDayCapacities?.[dayIndex] ?? perDay),
      ),
    ),
  );
  const limit = capacities.reduce((sum, value) => sum + value, 0);

  // Fonte de verdade: chamados que continuam abertos em Corretiva-Novo.
  // Programações atuais passam a ser persistidas no banco. O histórico local é
  // mantido como compatibilidade, enquanto OS marcadas como "não realizado"
  // recebem prioridade e ficam elegíveis novamente na próxima geração.
  const currentReservations = readStorage();
  const history = readHistory();
  const historyKeys = new Set(history.flatMap(reservationKeys));
  const legacyCurrent = currentReservations.filter(
    (reservation) =>
      !reservationKeys(reservation).some((key) => historyKeys.has(key)),
  );
  if (legacyCurrent.length > 0) writeHistory([...history, ...legacyCurrent]);

  const consumedKeys = new Set(
    [...history, ...currentReservations].flatMap(reservationKeys),
  );
  const eligible = sortCandidates(
    uniqueRows(
      rows.filter((row) => {
        if (resolveProgramCorrectiveTeam(row) !== equipe) return false;

        // Fonte persistente do servidor: uma OS já "em programação" não pode
        // entrar em outra programação, mesmo em outro navegador/computador.
        if (isPersistentlyProgrammed(row)) return false;

        // "Não realizado" é uma liberação explícita para reprogramar. Ela vence
        // o histórico local antigo e volta imediatamente a ser elegível.
        if (isPendingReprogramming(row)) return true;

        return !rowKeys(row).some((key) => consumedKeys.has(key));
      }),
    ),
    referenceDate,
  ).map((row) => ({ ...row, equipe }));

  const selected = eligible.slice(0, limit);
  const byDay = Array.from(
    { length: businessDays },
    () => [] as CorrectiveSourceRow[],
  );

  // Distribuição balanceada em rodadas respeitando a capacidade real de
  // cada dia. Quando uma preventiva precisa ocupar a reserva para cumprir SLA
  // D-1, a corretiva daquele dia é automaticamente reduzida, sem estourar 09:00.
  let cursor = 0;
  const maxRounds = Math.max(0, ...capacities);
  for (
    let round = 0;
    round < maxRounds && cursor < selected.length;
    round += 1
  ) {
    for (
      let dayIndex = 0;
      dayIndex < businessDays && cursor < selected.length;
      dayIndex += 1
    ) {
      if (byDay[dayIndex].length >= capacities[dayIndex]) continue;
      byDay[dayIndex].push(selected[cursor++]);
    }
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
    if (
      event.key === STORAGE_KEY ||
      LEGACY_STORAGE_KEYS.includes(event.key as (typeof LEGACY_STORAGE_KEYS)[number])
    ) {
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

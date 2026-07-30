// Cálculo de capacidade semanal e fatiamento de OS em semanas.

import type { TriagedOS, Equipe } from "./triage";
import {
  businessDaysUntilEndOfMonth,
  businessDaysUntil,
  isBusinessDay,
  brHolidays,
} from "./business-days";

export const DEFAULT_MINUTOS_POR_OS = 60;
export const MINUTOS_UTEIS_DIA = 480; // 08-12 + 13-17
export const DIAS_UTEIS_SEMANA = 5;

export interface WeekInfo {
  isoWeek: number;
  year: number;
  monday: Date;
  friday: Date;
  label: string; // "Semana 29"
}

/** Segunda-feira da semana que contém `d` (0=domingo). */
function mondayOf(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = c.getDay(); // 0..6
  const diff = day === 0 ? -6 : 1 - day;
  c.setDate(c.getDate() + diff);
  return c;
}

/** ISO week number (1..53). */
export function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Retorna as semanas ISO restantes até o último dia do mês corrente,
 * começando da semana que contém `hoje`.
 */
export function weeksUntilEndOfMonth(hoje: Date = new Date()): WeekInfo[] {
  const lastDay = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0);
  return weeksBetween(hoje, lastDay);
}

/** Gera WeekInfo[] cobrindo a semana que contém `from` até a semana que contém `until`. */
export function weeksBetween(from: Date, until: Date): WeekInfo[] {
  const weeks: WeekInfo[] = [];
  let cursor = mondayOf(from);
  const endMonday = mondayOf(until);
  while (cursor <= endMonday) {
    const friday = new Date(cursor);
    friday.setDate(friday.getDate() + 4);
    const iso = isoWeekNumber(cursor);
    weeks.push({
      isoWeek: iso,
      year: cursor.getFullYear(),
      monday: new Date(cursor),
      friday,
      label: `Semana ${iso}`,
    });
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() + 7);
  }
  if (weeks.length === 0) {
    const m = mondayOf(from);
    const f = new Date(m);
    f.setDate(f.getDate() + 4);
    weeks.push({
      isoWeek: isoWeekNumber(m),
      year: m.getFullYear(),
      monday: m,
      friday: f,
      label: `Semana ${isoWeekNumber(m)}`,
    });
  }
  return weeks;
}

/**
 * Gera semanas suficientes a partir de `from` para caber pelo menos
 * `businessDaysNeeded` dias úteis. Estende além do fim do mês quando preciso.
 */
export function weeksToCoverAll(
  from: Date,
  businessDaysNeeded: number,
): { weeks: WeekInfo[]; until: Date } {
  const fromMid = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  let until = new Date(from.getFullYear(), from.getMonth() + 1, 0);
  if (until < fromMid) until = new Date(fromMid);
  let guard = 0;
  while (businessDaysUntil(fromMid, until).length < Math.max(1, businessDaysNeeded)) {
    until = new Date(until);
    until.setDate(until.getDate() + 7);
    if (++guard > 260) break; // ~5 anos, segurança
  }
  return { weeks: weeksBetween(fromMid, until), until };
}

export interface WeekBucket {
  week: WeekInfo;
  os: TriagedOS[];
  /** OS por dia da semana (0=SEG..4=SEX) */
  porDia: TriagedOS[][];
}

export interface SliceOptions {
  minutosPorOS?: number;
  tecnicosPorEquipe?: Record<Equipe, number>;
  tecnicosDefault?: number;
}

/**
 * Fatia uma lista de OS de UMA equipe em N semanas, respeitando capacidade
 * diária. Se sobrar OS, retorna também `overflow`.
 */
export function sliceIntoWeeks(
  os: TriagedOS[],
  weeks: WeekInfo[],
  opts: SliceOptions = {},
): { buckets: WeekBucket[]; overflow: TriagedOS[] } {
  const minPorOS = opts.minutosPorOS ?? DEFAULT_MINUTOS_POR_OS;
  const tecs = (eq: Equipe) => opts.tecnicosPorEquipe?.[eq] ?? opts.tecnicosDefault ?? 1;
  const buckets: WeekBucket[] = weeks.map((w) => ({
    week: w,
    os: [],
    porDia: [[], [], [], [], []],
  }));

  let cursorWeek = 0;
  let cursorDay = 0;
  let cursorMin = 0;

  for (const item of os) {
    if (cursorWeek >= buckets.length) break;
    const nTec = Math.max(1, tecs(item.equipe));
    // capacidade por dia da equipe: MIN_DIA * n técnicos
    const capDia = MINUTOS_UTEIS_DIA * nTec;
    if (cursorMin + minPorOS > capDia) {
      cursorDay++;
      cursorMin = 0;
      if (cursorDay >= DIAS_UTEIS_SEMANA) {
        cursorWeek++;
        cursorDay = 0;
        if (cursorWeek >= buckets.length) break;
      }
    }
    buckets[cursorWeek].os.push(item);
    buckets[cursorWeek].porDia[cursorDay].push(item);
    cursorMin += minPorOS;
  }

  const consumed = buckets.reduce((s, b) => s + b.os.length, 0);
  const overflow = os.slice(consumed);
  return { buckets, overflow };
}

/** Extrai número do andar para ordenação natural ("2º andar" → 2). */
function andarNum(s: string): number {
  const m = String(s ?? "").match(/-?\d+/);
  return m ? parseInt(m[0], 10) : Number.POSITIVE_INFINITY;
}

/** Ordena por Prédio → Andar (numérico) → Término SLA, minimizando deslocamento. */
export function sortByLocation<T extends TriagedOS>(list: T[]): T[] {
  return [...list].sort((a, b) => {
    const pa = String(a.predio ?? "").localeCompare(String(b.predio ?? ""), "pt-BR");
    if (pa !== 0) return pa;
    const na = andarNum(a.andar);
    const nb = andarNum(b.andar);
    if (na !== nb) return na - nb;
    const aa = String(a.andar ?? "").localeCompare(String(b.andar ?? ""), "pt-BR");
    if (aa !== 0) return aa;
    return a.terminoSLATs - b.terminoSLATs;
  });
}

export interface DistributeResult {
  buckets: WeekBucket[];
  overflow: TriagedOS[];
  perDay: number;
  businessDaysCount: number;
  capPerDay: number;
}

export interface DistributeOptions extends SliceOptions {
  from?: Date;
  /** Data limite (inclusive) — padrão: último dia do mês de `from`. */
  until?: Date;
}

/**
 * Distribui OS de UMA equipe de forma balanceada entre os DIAS ÚTEIS
 * (considerando feriados BR) entre `from` e `until` (inclusive). Pré-ordena
 * por Prédio→Andar para minimizar deslocamento. Se `perDay` exceder a
 * capacidade diária real, o excedente vira overflow.
 */
export function distributeAcrossMonth(
  os: TriagedOS[],
  weeks: WeekInfo[],
  opts: DistributeOptions = {},
): DistributeResult {
  const from = opts.from ?? new Date();
  const until = opts.until ?? new Date(from.getFullYear(), from.getMonth() + 1, 0);
  const minPorOS = opts.minutosPorOS ?? DEFAULT_MINUTOS_POR_OS;
  const equipeSample = os[0]?.equipe as Equipe | undefined;
  const nTec = Math.max(
    1,
    (equipeSample && opts.tecnicosPorEquipe?.[equipeSample]) ?? opts.tecnicosDefault ?? 1,
  );
  const capPerDay = Math.floor((MINUTOS_UTEIS_DIA * nTec) / minPorOS);

  const businessDays = businessDaysUntil(from, until);
  const businessDaysCount = Math.max(1, businessDays.length);

  const sorted = sortByLocation(os);
  const perDayIdeal = Math.max(1, Math.ceil(sorted.length / businessDaysCount));
  const perDay = Math.min(perDayIdeal, capPerDay);

  const buckets: WeekBucket[] = weeks.map((w) => ({
    week: w,
    os: [],
    porDia: [[], [], [], [], []],
  }));

  const holidays = brHolidays(from.getFullYear());

  // Monta a lista ordenada de dias úteis com referência (semana, dow).
  const daySlots: { wi: number; dow: number; date: Date }[] = [];
  const fromMid = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const lastBiz = businessDays[businessDays.length - 1];
  for (let wi = 0; wi < weeks.length; wi++) {
    const monday = weeks[wi].monday;
    for (let dow = 0; dow < 5; dow++) {
      const day = new Date(monday);
      day.setDate(day.getDate() + dow);
      if (day < fromMid) continue;
      if (day > lastBiz) break;
      if (!isBusinessDay(day, holidays)) continue;
      daySlots.push({ wi, dow, date: day });
    }
  }

  // Distribui: perDay para todos os dias; se sobrar OS antes do fim,
  // aumenta a alocação nos dias finais (flexibilização da última semana),
  // respeitando capPerDay.
  const perDayArr = new Array(daySlots.length).fill(perDay) as number[];
  const assigned = perDayArr.reduce((s, n) => s + n, 0);
  let extra = Math.max(0, sorted.length - assigned);
  // Preenche do fim para o começo até esgotar `extra` ou saturar capPerDay.
  for (let i = daySlots.length - 1; i >= 0 && extra > 0; i--) {
    const room = capPerDay - perDayArr[i];
    if (room <= 0) continue;
    const add = Math.min(room, extra);
    perDayArr[i] += add;
    extra -= add;
  }

  let queueIdx = 0;
  for (let i = 0; i < daySlots.length && queueIdx < sorted.length; i++) {
    const { wi, dow } = daySlots[i];
    const take = perDayArr[i];
    for (let k = 0; k < take && queueIdx < sorted.length; k++) {
      const item = sorted[queueIdx++];
      buckets[wi].os.push(item);
      buckets[wi].porDia[dow].push(item);
    }
  }

  return {
    buckets,
    overflow: sorted.slice(queueIdx),
    perDay,
    businessDaysCount,
    capPerDay,
  };
}

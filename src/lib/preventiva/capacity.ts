// Cálculo de capacidade semanal e fatiamento de OS em semanas.

import type { TriagedOS, Equipe } from "./triage";

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
  const weeks: WeekInfo[] = [];
  let cursor = mondayOf(hoje);
  while (cursor <= lastDay) {
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
  return weeks.length > 0 ? weeks : [
    (() => {
      const m = mondayOf(hoje);
      const f = new Date(m);
      f.setDate(f.getDate() + 4);
      return { isoWeek: isoWeekNumber(m), year: m.getFullYear(), monday: m, friday: f, label: `Semana ${isoWeekNumber(m)}` };
    })(),
  ];
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

/**
 * Utilidades de dias úteis no fuso America/Sao_Paulo.
 * O Brasil não adota horário de verão desde 2019, portanto o offset é fixo -03:00.
 */
export const SP_OFFSET = "-03:00";

export type DayKey = `${number}-${string}-${string}` | string; // YYYY-MM-DD

export function toDayKey(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Cria um Date "wall clock" (UTC puro) a partir de YYYY-MM-DD. */
export function dayKeyToDate(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function addDays(key: string, amount: number): string {
  const date = dayKeyToDate(key);
  date.setUTCDate(date.getUTCDate() + amount);
  return toDayKey(date);
}

export function weekdayIndex(key: string): number {
  return dayKeyToDate(key).getUTCDay(); // 0 dom .. 6 sáb
}

export function isWeekend(key: string): boolean {
  const wd = weekdayIndex(key);
  return wd === 0 || wd === 6;
}

export const WEEKDAY_LABELS = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];

export function weekdayLabel(key: string): string {
  return WEEKDAY_LABELS[weekdayIndex(key)];
}

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function nationalHolidays(year: number): string[] {
  const easter = easterSunday(year);
  const goodFriday = addDays(easter, -2);
  const corpusChristi = addDays(easter, 60);
  return [
    `${year}-01-01`,
    `${year}-04-21`,
    `${year}-05-01`,
    `${year}-09-07`,
    `${year}-10-12`,
    `${year}-11-02`,
    `${year}-11-15`,
    `${year}-11-20`,
    `${year}-12-25`,
    goodFriday,
    corpusChristi,
  ];
}

export function carnivalHolidays(year: number): string[] {
  const easter = easterSunday(year);
  // Segunda e terça de carnaval + quarta-feira de cinzas (meio período, tratada como feriado).
  return [addDays(easter, -48), addDays(easter, -47), addDays(easter, -46)];
}

export function spHolidays(year: number): string[] {
  return [`${year}-07-09`];
}

export type HolidayOptions = {
  nationalHolidays: boolean;
  spHoliday: boolean;
  carnival: boolean;
  customHolidays: string[];
};

export function buildHolidaySet(years: number[], options: HolidayOptions): Set<string> {
  const set = new Set<string>();
  for (const year of years) {
    if (options.nationalHolidays) nationalHolidays(year).forEach((d) => set.add(d));
    if (options.carnival) carnivalHolidays(year).forEach((d) => set.add(d));
    if (options.spHoliday) spHolidays(year).forEach((d) => set.add(d));
  }
  for (const d of options.customHolidays ?? []) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) set.add(d);
  }
  return set;
}

export function isBusinessDay(key: string, holidays: Set<string>): boolean {
  return !isWeekend(key) && !holidays.has(key);
}

export function nextBusinessDay(key: string, holidays: Set<string>): string {
  let cursor = addDays(key, 1);
  let guard = 0;
  while (!isBusinessDay(cursor, holidays) && guard < 400) {
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return cursor;
}

export function ensureBusinessDay(key: string, holidays: Set<string>): string {
  let cursor = key;
  let guard = 0;
  while (!isBusinessDay(cursor, holidays) && guard < 400) {
    cursor = addDays(cursor, 1);
    guard += 1;
  }
  return cursor;
}

export function minutesFromTime(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function timeFromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** ISO com offset fixo de São Paulo, ex.: 2026-07-27T08:00:00-03:00 */
export function spIso(dayKey: string, minutes: number): string {
  return `${dayKey}T${timeFromMinutes(minutes)}:00${SP_OFFSET}`;
}

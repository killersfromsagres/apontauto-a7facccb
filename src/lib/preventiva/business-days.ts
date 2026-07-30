// Cálculo de dias úteis (BR) considerando feriados nacionais fixos e móveis.

function easterSunday(year: number): Date {
  // Meeus/Jones/Butcher algorithm
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
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Feriados nacionais + Corpus Christi + Carnaval (SBC-SP observa). */
export function brHolidays(year: number): Set<string> {
  const easter = easterSunday(year);
  const list: Date[] = [
    new Date(year, 0, 1), // Confraternização
    new Date(year, 3, 21), // Tiradentes
    new Date(year, 4, 1), // Trabalho
    new Date(year, 8, 7), // Independência
    new Date(year, 9, 12), // N. Sra. Aparecida
    new Date(year, 10, 2), // Finados
    new Date(year, 10, 15), // Proclamação
    new Date(year, 10, 20), // Consciência Negra (feriado nacional desde 2024)
    new Date(year, 11, 25), // Natal
    addDays(easter, -48), // Carnaval segunda
    addDays(easter, -47), // Carnaval terça
    addDays(easter, -2), // Sexta-feira Santa
    addDays(easter, 60), // Corpus Christi
  ];
  return new Set(list.map(iso));
}

export function isBusinessDay(d: Date, holidays?: Set<string>): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  const hs = holidays ?? brHolidays(d.getFullYear());
  return !hs.has(iso(d));
}

/** Dias úteis (incluindo hoje) até o último dia do mês corrente. */
export function businessDaysUntilEndOfMonth(from: Date = new Date()): Date[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(from.getFullYear(), from.getMonth() + 1, 0);
  return businessDaysUntil(start, last);
}

/** Dias úteis entre `from` (inclusive) e `until` (inclusive). */
export function businessDaysUntil(from: Date, until: Date): Date[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(until.getFullYear(), until.getMonth(), until.getDate());
  const out: Date[] = [];
  // Feriados podem cruzar de ano
  const holidayCache = new Map<number, Set<string>>();
  const hs = (y: number) => {
    let s = holidayCache.get(y);
    if (!s) {
      s = brHolidays(y);
      holidayCache.set(y, s);
    }
    return s;
  };
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    if (isBusinessDay(d, hs(d.getFullYear()))) out.push(new Date(d));
  }
  return out;
}

export { iso as isoDate };

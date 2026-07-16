// Dias de coleta: segunda (1), quarta (3), sexta (5).
const COLETA_DOW = new Set([1, 3, 5]);

export function isColetaDay(date: Date): boolean {
  return COLETA_DOW.has(date.getDay());
}

/** Próxima data de coleta ESTRITAMENTE após `date` (sem incluir a data). */
export function nextColetaAfter(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  for (let i = 1; i <= 7; i++) {
    const t = new Date(d);
    t.setDate(t.getDate() + i);
    if (isColetaDay(t)) return t;
  }
  return d;
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

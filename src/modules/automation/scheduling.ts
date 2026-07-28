/**
 * Motor de agendamento (itens 9 e 12.3 do prompt mestre).
 * Puro, determinístico e testável: não acessa rede nem banco.
 */

export type WorkCalendar = {
  /** Início da jornada em minutos a partir da meia-noite (padrão 08:00). */
  startMinutes: number;
  /** Fim da jornada (padrão 17:00). */
  endMinutes: number;
  /** Início do intervalo (padrão 12:00) — opcional. */
  breakStartMinutes?: number;
  breakEndMinutes?: number;
  /** 0=domingo ... 6=sábado. */
  workingWeekdays: number[];
  /** Datas ISO (YYYY-MM-DD) não trabalhadas. */
  holidays: string[];
};

export const DEFAULT_CALENDAR: WorkCalendar = {
  startMinutes: 8 * 60,
  endMinutes: 17 * 60,
  breakStartMinutes: 12 * 60,
  breakEndMinutes: 13 * 60,
  workingWeekdays: [1, 2, 3, 4, 5],
  holidays: [],
};

/** Duração padrão por categoria (minutos). */
export const CATEGORY_DURATION: Record<string, number> = {
  chaveiro: 30,
  civil: 30,
  eletrica: 30,
  hidraulica: 60,
  pintura: 60,
  refrigeracao: 60,
  jardinagem: 60,
};

export function durationForCategory(category: string | undefined, fallback = 60): number {
  if (!category) return fallback;
  const key = category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
  return CATEGORY_DURATION[key] ?? fallback;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isWorkingDay(date: Date, cal: WorkCalendar = DEFAULT_CALENDAR): boolean {
  if (!cal.workingWeekdays.includes(date.getDay())) return false;
  return !cal.holidays.includes(toIsoDate(date));
}

function atMinutes(date: Date, minutes: number): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setMinutes(minutes);
  return d;
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** Avança para o próximo instante útil (dia útil, dentro da jornada, fora do intervalo). */
export function nextWorkingSlot(from: Date, cal: WorkCalendar = DEFAULT_CALENDAR): Date {
  let cursor = new Date(from);
  for (let guard = 0; guard < 400; guard++) {
    if (!isWorkingDay(cursor, cal)) {
      cursor = atMinutes(new Date(cursor.getTime() + 86400_000), cal.startMinutes);
      continue;
    }
    const m = minutesOfDay(cursor);
    if (m < cal.startMinutes) return atMinutes(cursor, cal.startMinutes);
    if (m >= cal.endMinutes) {
      cursor = atMinutes(new Date(cursor.getTime() + 86400_000), cal.startMinutes);
      continue;
    }
    if (
      cal.breakStartMinutes != null &&
      cal.breakEndMinutes != null &&
      m >= cal.breakStartMinutes &&
      m < cal.breakEndMinutes
    ) {
      return atMinutes(cursor, cal.breakEndMinutes);
    }
    return cursor;
  }
  return cursor;
}

export type ScheduledSlot = { start: Date; end: Date };

/**
 * Agenda uma tarefa a partir de `from`, respeitando jornada, intervalo,
 * fins de semana e feriados. Tarefas que não cabem no restante do dia são
 * empurradas integralmente para o próximo dia útil (sem quebrar a execução).
 */
export function scheduleTask(
  from: Date,
  durationMinutes: number,
  cal: WorkCalendar = DEFAULT_CALENDAR,
): ScheduledSlot {
  const duration = Math.max(1, Math.round(durationMinutes));
  let start = nextWorkingSlot(from, cal);

  for (let guard = 0; guard < 400; guard++) {
    const startMin = minutesOfDay(start);
    const endMin = startMin + duration;
    const hitsBreak =
      cal.breakStartMinutes != null &&
      cal.breakEndMinutes != null &&
      startMin < cal.breakStartMinutes &&
      endMin > cal.breakStartMinutes;

    if (hitsBreak) {
      start = atMinutes(start, cal.breakEndMinutes!);
      continue;
    }
    if (endMin > cal.endMinutes) {
      start = nextWorkingSlot(atMinutes(new Date(start.getTime() + 86400_000), cal.startMinutes), cal);
      continue;
    }
    return { start, end: new Date(start.getTime() + duration * 60_000) };
  }
  return { start, end: new Date(start.getTime() + duration * 60_000) };
}

export type BatchTaskInput = {
  osNumber: string;
  category?: string;
  durationMinutes?: number;
};

export type BatchTaskOutput = BatchTaskInput & ScheduledSlot & {
  durationMinutes: number;
  position: number;
};

/** Agenda um lote em sequência, sem sobreposição. */
export function scheduleBatch(
  tasks: BatchTaskInput[],
  startAt: Date,
  cal: WorkCalendar = DEFAULT_CALENDAR,
): BatchTaskOutput[] {
  let cursor = new Date(startAt);
  return tasks.map((task, index) => {
    const duration = task.durationMinutes ?? durationForCategory(task.category);
    const slot = scheduleTask(cursor, duration, cal);
    cursor = slot.end;
    return { ...task, ...slot, durationMinutes: duration, position: index };
  });
}

/** Remove OS duplicadas mantendo a primeira ocorrência (idempotência de lote). */
export function dedupeTasks(tasks: BatchTaskInput[]): {
  unique: BatchTaskInput[];
  duplicates: string[];
} {
  const seen = new Set<string>();
  const unique: BatchTaskInput[] = [];
  const duplicates: string[] = [];
  for (const task of tasks) {
    const key = task.osNumber.trim().toUpperCase();
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.push(task.osNumber);
      continue;
    }
    seen.add(key);
    unique.push(task);
  }
  return { unique, duplicates };
}

export function overlaps(a: ScheduledSlot, b: ScheduledSlot): boolean {
  return a.start < b.end && b.start < a.end;
}

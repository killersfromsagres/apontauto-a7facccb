import {
  buildHolidaySet,
  ensureBusinessDay,
  minutesFromTime,
  nextBusinessDay,
  spIso,
  timeFromMinutes,
  weekdayLabel,
  type HolidayOptions,
} from "./businessDays";

export type ScheduleInput = {
  osNumbers: string[];
  startDate: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  dayStart?: string; // HH:mm
  dayEnd?: string; // HH:mm
  durationMinutes: number;
  holidays: HolidayOptions;
};

export type ScheduleEntry = {
  sequence: number;
  osNumber: string;
  dayKey: string;
  weekday: string;
  startIso: string;
  endIso: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  durationText: string;
  dayChanged: boolean;
};

export type ScheduleResult = {
  entries: ScheduleEntry[];
  businessDays: number;
  totalMinutes: number;
  firstStart: string | null;
  lastEnd: string | null;
};

export function formatDuration(minutes: number): string {
  return timeFromMinutes(Math.max(0, Math.round(minutes)));
}

/**
 * Regras: jornada 08:00–17:00, nenhuma OS termina depois do fim da jornada,
 * OS nunca é dividida entre dois dias, fins de semana e feriados são pulados,
 * ordem das OS preservada. Fuso fixo America/Sao_Paulo.
 */
export function buildPointingSchedule(input: ScheduleInput): ScheduleResult {
  const dayStart = minutesFromTime(input.dayStart ?? "08:00");
  const dayEnd = minutesFromTime(input.dayEnd ?? "17:00");
  const duration = Math.round(input.durationMinutes);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("A duração deve ser maior que zero.");
  }
  if (dayEnd <= dayStart) {
    throw new Error("O fim da jornada deve ser depois do início.");
  }
  if (duration > dayEnd - dayStart) {
    throw new Error("A duração da OS não cabe na jornada diária.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
    throw new Error("Data de início inválida.");
  }

  const startYear = Number(input.startDate.slice(0, 4));
  const years = [startYear - 1, startYear, startYear + 1, startYear + 2];
  const holidaySet = buildHolidaySet(years, input.holidays);

  let dayKey = ensureBusinessDay(input.startDate, holidaySet);
  let cursor = dayKey === input.startDate ? minutesFromTime(input.startTime ?? "08:00") : dayStart;
  if (cursor < dayStart) cursor = dayStart;

  const entries: ScheduleEntry[] = [];
  const daysUsed = new Set<string>();
  let previousDay: string | null = null;

  input.osNumbers.forEach((osNumber, index) => {
    if (cursor + duration > dayEnd) {
      dayKey = nextBusinessDay(dayKey, holidaySet);
      cursor = dayStart;
    }
    const start = cursor;
    const end = cursor + duration;
    entries.push({
      sequence: index + 1,
      osNumber,
      dayKey,
      weekday: weekdayLabel(dayKey),
      startIso: spIso(dayKey, start),
      endIso: spIso(dayKey, end),
      startTime: timeFromMinutes(start),
      endTime: timeFromMinutes(end),
      durationMinutes: duration,
      durationText: formatDuration(duration),
      dayChanged: previousDay !== null && previousDay !== dayKey,
    });
    daysUsed.add(dayKey);
    previousDay = dayKey;
    cursor = end;
  });

  return {
    entries,
    businessDays: daysUsed.size,
    totalMinutes: entries.length * duration,
    firstStart: entries[0]?.startIso ?? null,
    lastEnd: entries[entries.length - 1]?.endIso ?? null,
  };
}

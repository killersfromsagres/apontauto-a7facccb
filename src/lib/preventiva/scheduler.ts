// Scheduling engine: distributes OS across working hours (08–12, 13–17, Mon–Fri)
// balancing team load so no one exceeds 8h/day.

import type { ProcessedOS, Team } from "./processor";

export interface ScheduledOS extends ProcessedOS {
  scheduledDate: string; // ISO date (YYYY-MM-DD)
  scheduledStart: string; // HH:mm
  scheduledEnd: string; // HH:mm
  durationMinutes: number;
}

export interface ScheduleOptions {
  startDate?: Date;
  defaultTaskMinutes?: number; // default duration per OS
  dailyMinutesPerTeam?: number; // default 480 (8h)
}

const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
const addDays = (d: Date, n: number) => {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
};
const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
const fmtTime = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const MORNING_START = 8 * 60;
const MORNING_END = 12 * 60;
const AFTERNOON_START = 13 * 60;
const AFTERNOON_END = 17 * 60;

export function scheduleOS(
  list: ProcessedOS[],
  opts: ScheduleOptions = {},
): ScheduledOS[] {
  const duration = opts.defaultTaskMinutes ?? 60;
  const dailyCap = opts.dailyMinutesPerTeam ?? 480;
  const start = opts.startDate ?? nextWorkday(new Date());

  // Group by team, keep SLA order
  const byTeam = new Map<Team, ProcessedOS[]>();
  for (const os of list) {
    if (!byTeam.has(os.equipe)) byTeam.set(os.equipe, []);
    byTeam.get(os.equipe)!.push(os);
  }

  const result: ScheduledOS[] = [];

  for (const [, teamList] of byTeam) {
    // Sort by SLA within team
    teamList.sort((a, b) => a.slaTimestamp - b.slaTimestamp);

    let cursor = new Date(start);
    let usedToday = 0;
    let clock = MORNING_START;

    for (const os of teamList) {
      // Advance to next workday if daily cap reached
      if (usedToday + duration > dailyCap) {
        cursor = nextWorkday(addDays(cursor, 1));
        usedToday = 0;
        clock = MORNING_START;
      }

      // If block boundary would be crossed, jump to afternoon or next day
      let startClock = clock;
      let endClock = startClock + duration;
      if (startClock < MORNING_END && endClock > MORNING_END) {
        startClock = AFTERNOON_START;
        endClock = startClock + duration;
      }
      if (endClock > AFTERNOON_END) {
        cursor = nextWorkday(addDays(cursor, 1));
        usedToday = 0;
        startClock = MORNING_START;
        endClock = startClock + duration;
      }

      result.push({
        ...os,
        scheduledDate: fmtDate(cursor),
        scheduledStart: fmtTime(startClock),
        scheduledEnd: fmtTime(endClock),
        durationMinutes: duration,
      });

      usedToday += duration;
      clock = endClock;
      if (clock === MORNING_END) clock = AFTERNOON_START;
    }
  }

  return result;
}

function nextWorkday(d: Date): Date {
  let c = new Date(d);
  while (isWeekend(c)) c = addDays(c, 1);
  return c;
}

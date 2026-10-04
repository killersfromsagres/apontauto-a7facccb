import { isoWeekNumber, weeksBetween, type WeekInfo } from "./capacity";
import {
  MINUTOS_PADRAO_POR_EQUIPE,
  scheduleTeamMonth,
} from "./monthly-scheduler";
import {
  EQUIPES_ORDEM,
  type Equipe,
  type TriagedOS,
} from "./triage";

export interface SlaConsolidatedRow {
  item: TriagedOS;
  equipe: Equipe;
  week: WeekInfo;
  weekIndex: number;
  normalWeekIndex: number;
  movedBySla: boolean;
}

export interface SlaConsolidatedPlan {
  weeks: WeekInfo[];
  rows: SlaConsolidatedRow[];
  duplicatesRemoved: number;
  prioritizedCount: number;
}

const ACTIVE_TEAMS = EQUIPES_ORDEM.filter(
  (equipe): equipe is Exclude<Equipe, "CORRETIVA"> => equipe !== "CORRETIVA",
);

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnly) {
    return new Date(
      Number(dateOnly[1]),
      Number(dateOnly[2]) - 1,
      Number(dateOnly[3]),
      12,
    );
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function slaDate(item: TriagedOS): Date | null {
  const parsed = parseDate(item.terminoSLA);
  if (parsed) return parsed;

  const timestamp = Number(item.terminoSLATs);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeOsKey(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");

  // Excel costuma transformar OS numérica em texto com sufixo .0.
  return /^\d+\.0+$/.test(normalized)
    ? normalized.replace(/\.0+$/, "")
    : normalized;
}

function rowKey(item: TriagedOS, index: number): string {
  const key = normalizeOsKey(item.os || item.chamado);
  return key || `__SEM_OS__${index}`;
}

function uniqueItems(items: TriagedOS[]): {
  items: Array<{ key: string; item: TriagedOS }>;
  duplicatesRemoved: number;
} {
  const unique = new Map<string, TriagedOS>();
  let blankIndex = 0;

  items.forEach((item, index) => {
    const key = rowKey(item, index);
    if (key.startsWith("__SEM_OS__")) {
      unique.set(`__SEM_OS__${blankIndex++}`, item);
      return;
    }
    if (!unique.has(key)) unique.set(key, item);
  });

  return {
    items: [...unique.entries()].map(([key, item]) => ({ key, item })),
    duplicatesRemoved: Math.max(0, items.length - unique.size),
  };
}

function weekYearForIso(date: Date): number {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  return copy.getUTCFullYear();
}

/**
 * Regra operacional do apontamento SLA:
 * - somente vencimentos antes do dia 28 entram na antecipação;
 * - a OS é apontada na semana imediatamente anterior à semana do Término SLA;
 * - se a semana anterior estiver fora do recorte mensal, usa a primeira semana.
 *
 * Outubro/2026: SLA 09/10 => Semana 40; SLA 23/10 => Semana 42.
 */
export function slaPriorityWeekIndex(
  item: TriagedOS,
  weeks: WeekInfo[],
  referenceDate: Date,
): number | null {
  const sla = slaDate(item);
  if (!sla || weeks.length === 0) return null;

  if (
    sla.getFullYear() !== referenceDate.getFullYear() ||
    sla.getMonth() !== referenceDate.getMonth() ||
    sla.getDate() >= 28
  ) {
    return null;
  }

  const isoWeek = isoWeekNumber(sla);
  const isoYear = weekYearForIso(sla);
  const slaWeekIndex = weeks.findIndex(
    (week) => week.isoWeek === isoWeek && week.year === isoYear,
  );

  if (slaWeekIndex < 0) return 0;
  return Math.max(0, slaWeekIndex - 1);
}

function compareText(a: unknown, b: unknown): number {
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", {
    numeric: true,
    sensitivity: "base",
  });
}

function sortRows(rows: SlaConsolidatedRow[]): SlaConsolidatedRow[] {
  return [...rows].sort((a, b) => {
    const teamOrder =
      EQUIPES_ORDEM.indexOf(a.equipe) - EQUIPES_ORDEM.indexOf(b.equipe);
    if (teamOrder !== 0) return teamOrder;
    if (a.weekIndex !== b.weekIndex) return a.weekIndex - b.weekIndex;

    const slaA = slaDate(a.item)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const slaB = slaDate(b.item)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (slaA !== slaB) return slaA - slaB;

    return (
      compareText(a.item.predio, b.item.predio) ||
      compareText(a.item.andar, b.item.andar) ||
      compareText(a.item.local, b.item.local) ||
      compareText(a.item.os, b.item.os)
    );
  });
}

export function buildSlaConsolidatedPlan(
  inputItems: TriagedOS[],
  referenceDate: Date,
  minutesPerTeam: Partial<Record<Equipe, 30 | 60>> = {},
): SlaConsolidatedPlan {
  const monthStart = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    1,
  );
  const monthEnd = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth() + 1,
    0,
  );
  const weeks = weeksBetween(monthStart, monthEnd);
  const { items: unique, duplicatesRemoved } = uniqueItems(
    inputItems.filter((item) => item.equipe !== "CORRETIVA"),
  );

  const normalWeekByOs = new Map<string, number>();

  for (const equipe of ACTIVE_TEAMS) {
    const teamItems = unique
      .filter(({ item }) => item.equipe === equipe)
      .map(({ item }) => item);
    if (teamItems.length === 0) continue;

    const schedule = scheduleTeamMonth({
      equipe,
      preventivas: teamItems,
      corretivas: [],
      weeks,
      from: monthStart,
      until: monthEnd,
      minutosPorOS:
        minutesPerTeam[equipe] ?? MINUTOS_PADRAO_POR_EQUIPE[equipe],
      reserveCorrectiveSlots: true,
    });

    schedule.buckets.forEach((bucket, weekIndex) => {
      bucket.os.forEach((item) => {
        const key = normalizeOsKey(item.os || item.chamado);
        if (key && !normalWeekByOs.has(key)) normalWeekByOs.set(key, weekIndex);
      });
    });

    schedule.overflowPreventivas.forEach((item) => {
      const key = normalizeOsKey(item.os || item.chamado);
      if (key && !normalWeekByOs.has(key)) {
        normalWeekByOs.set(key, Math.max(0, weeks.length - 1));
      }
    });
  }

  const rows = unique.map(({ key, item }, index): SlaConsolidatedRow => {
    const normalWeekIndex = Math.min(
      Math.max(0, normalWeekByOs.get(key) ?? Math.min(index, weeks.length - 1)),
      Math.max(0, weeks.length - 1),
    );
    const priorityWeekIndex = slaPriorityWeekIndex(item, weeks, monthStart);
    const weekIndex = priorityWeekIndex ?? normalWeekIndex;

    return {
      item,
      equipe: item.equipe,
      week: weeks[weekIndex],
      weekIndex,
      normalWeekIndex,
      movedBySla:
        priorityWeekIndex !== null && priorityWeekIndex !== normalWeekIndex,
    };
  });

  const sortedRows = sortRows(rows);
  return {
    weeks,
    rows: sortedRows,
    duplicatesRemoved,
    prioritizedCount: sortedRows.filter((row) => row.movedBySla).length,
  };
}

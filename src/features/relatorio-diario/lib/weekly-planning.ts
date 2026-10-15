import {
  inferMaintenanceArea,
  maintenanceAreaRank,
  normalizeOs,
  type MaintenanceArea,
  type ScheduledMaintenance,
} from "./daily-maintenance";
import {
  normalizeReportTeam,
  toLocalIsoDate,
  type CorrectiveReportSourceRow,
} from "./corrective-report";

export type WeeklyCorrectiveSourceRow = CorrectiveReportSourceRow & {
  programacao_status?: string | null;
  tipo_importacao?: string | null;
  programacao_periodo_inicio?: string | null;
  programacao_periodo_fim?: string | null;
  programacao_dia_indice?: number | null;
  programacao_equipe?: string | null;
  programacao_tentativas?: number | null;
};

export type WeeklyPlanningRow = ScheduledMaintenance & {
  supplementalCorrective?: boolean;
  programmedCorrective?: boolean;
  sourceCorrectiveId?: string;
  planningOrigin?: "planilha-semanal" | "encaixe-corretiva" | "corretiva-programada";
};

export type WeeklyPlanningDaySummary = {
  date: string;
  total: number;
  preventive: number;
  corrective: number;
  nativeCorrective: number;
  supplementalCorrective: number;
  programmedCorrective: number;
  suggestedCorrective: number;
  teams: string[];
  areas: MaintenanceArea[];
};

export type WeeklyPlanningResult = {
  rows: WeeklyPlanningRow[];
  days: WeeklyPlanningDaySummary[];
  candidateCount: number;
  supplementalCount: number;
  programmedCount: number;
  suggestedCount: number;
  daysWithoutCorrective: string[];
  periodStart: string;
  periodEnd: string;
  targetCorrectivesPerTeamPerDay: number;
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const OPEN_STATUSES = new Set([
  "aberta",
  "aberto",
  "em_andamento",
  "em andamento",
  "pendente",
]);

const isoDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

const addDays = (date: Date, amount: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
};

const mondayOfWeek = (date: Date) => {
  const weekday = date.getDay();
  const distance = weekday === 0 ? -6 : 1 - weekday;
  return addDays(date, distance);
};

const fridayOfWeek = (date: Date) => addDays(mondayOfWeek(date), 4);

const teamKey = (value: unknown, fallbackText = "") =>
  normalize(normalizeReportTeam(value, fallbackText));

export function planningWeekDates(rows: ScheduledMaintenance[]) {
  const dates = rows
    .map((row) => row.date)
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    .sort();

  if (!dates.length) return [];

  const first = parseIsoDate(dates[0]);
  const last = parseIsoDate(dates[dates.length - 1]);
  if (!first || !last) return Array.from(new Set(dates));

  const start = mondayOfWeek(first);
  const end = fridayOfWeek(last);
  const result: string[] = [];

  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const weekday = cursor.getDay();
    if (weekday >= 1 && weekday <= 5) result.push(isoDate(cursor));
  }

  return result;
}

export function isAvailableCorrectiveForPlanning(row: WeeklyCorrectiveSourceRow) {
  if (!OPEN_STATUSES.has(normalize(row.status))) return false;
  if (normalize(row.tipo_importacao) === "backorder_mensal") return false;

  const programmingStatus = normalize(row.programacao_status || "disponivel");
  if (programmingStatus !== "disponivel") return false;

  return Boolean(normalizeOs(row.numero_os));
}

export function isCorrectiveProgrammedForWeek(
  row: WeeklyCorrectiveSourceRow,
  periodStart: string,
  periodEnd: string,
) {
  if (!OPEN_STATUSES.has(normalize(row.status))) return false;
  if (normalize(row.tipo_importacao) === "backorder_mensal") return false;
  if (normalize(row.programacao_status) !== "em_programacao") return false;
  if (String(row.programacao_periodo_inicio ?? "") !== periodStart) return false;
  if (String(row.programacao_periodo_fim ?? "") !== periodEnd) return false;

  const dayIndex = Number(row.programacao_dia_indice);
  return Number.isInteger(dayIndex) && dayIndex >= 0 && dayIndex <= 4;
}

function candidatePriority(row: WeeklyCorrectiveSourceRow) {
  const sla = toLocalIsoDate(row.data_sla);
  const created = toLocalIsoDate(row.data_criacao);
  const os = normalizeOs(row.numero_os);
  return [sla || "9999-12-31", created || "9999-12-31", os];
}

export function sortPlanningCandidates(rows: WeeklyCorrectiveSourceRow[]) {
  return [...rows].sort((a, b) => {
    const aPriority = candidatePriority(a);
    const bPriority = candidatePriority(b);
    for (let index = 0; index < aPriority.length; index += 1) {
      const diff = aPriority[index].localeCompare(bPriority[index]);
      if (diff) return diff;
    }
    return 0;
  });
}

function sourceToPlanningRow(
  source: WeeklyCorrectiveSourceRow,
  date: string,
  programmed: boolean,
): WeeklyPlanningRow {
  const os = normalizeOs(source.numero_os);
  const name = String(source.nome_os ?? "").trim();
  const equipment = String(source.equipamento ?? "").trim();
  const rawTeam = programmed ? source.programacao_equipe || source.equipe : source.equipe;
  const team = normalizeReportTeam(rawTeam, `${name} ${equipment}`);
  const sla = toLocalIsoDate(source.data_sla) || String(source.data_sla ?? "").trim();
  const sourceCorrectiveId = String(source.id ?? "").trim();

  return {
    id: `relatorio-diario:${programmed ? "programado" : "encaixe"}:${date}:${os || sourceCorrectiveId || name}`,
    date,
    os: os || sourceCorrectiveId,
    name,
    building: String(source.predio ?? "").trim(),
    floor: String(source.andar ?? "").trim(),
    space: String(source.local ?? "").trim(),
    activity: "Corretiva",
    sla,
    team,
    area: inferMaintenanceArea(team, "Corretiva Novo", `${name} ${equipment}`),
    asset: String(source.ativo ?? "").trim(),
    equipment,
    observation: programmed
      ? "Corretiva já registrada como programada para esta semana."
      : "Sugestão de encaixe de corretiva aberta para complementar a programação da equipe.",
    sourceFile: programmed
      ? "Corretiva Novo • programada"
      : "Corretiva Novo • sugestão de encaixe",
    programmingSource: "corretiva-novo",
    extraCorrective: true,
    supplementalCorrective: true,
    programmedCorrective: programmed,
    sourceCorrectiveId: sourceCorrectiveId || undefined,
    planningOrigin: programmed ? "corretiva-programada" : "encaixe-corretiva",
  };
}

function summarizePlanningDay(date: string, rows: WeeklyPlanningRow[]): WeeklyPlanningDaySummary {
  const dayRows = rows.filter((row) => row.date === date);
  const correctives = dayRows.filter((row) => row.activity === "Corretiva");
  const supplemental = correctives.filter((row) => row.supplementalCorrective).length;
  const programmed = correctives.filter((row) => row.programmedCorrective).length;
  const suggested = correctives.filter(
    (row) => row.supplementalCorrective && !row.programmedCorrective,
  ).length;

  return {
    date,
    total: dayRows.length,
    preventive: dayRows.filter((row) => row.activity === "Preventiva").length,
    corrective: correctives.length,
    nativeCorrective: Math.max(0, correctives.length - supplemental),
    supplementalCorrective: supplemental,
    programmedCorrective: programmed,
    suggestedCorrective: suggested,
    teams: Array.from(new Set(dayRows.map((row) => row.team).filter(Boolean))).sort(),
    areas: Array.from(new Set(dayRows.map((row) => row.area))).sort(
      (a, b) => maintenanceAreaRank(a) - maintenanceAreaRank(b),
    ),
  };
}

export function buildWeeklyPlanning({
  scheduledRows,
  correctiveRows,
  targetCorrectivesPerTeamPerDay,
  minimumCorrectivesPerDay,
}: {
  scheduledRows: ScheduledMaintenance[];
  correctiveRows: WeeklyCorrectiveSourceRow[];
  targetCorrectivesPerTeamPerDay?: number;
  /** Compatibilidade com a versão anterior da tela. */
  minimumCorrectivesPerDay?: number;
}): WeeklyPlanningResult {
  const targetRaw = targetCorrectivesPerTeamPerDay ?? minimumCorrectivesPerDay ?? 2;
  const target = Math.max(1, Math.min(10, Math.trunc(targetRaw || 1)));
  const dates = planningWeekDates(scheduledRows);
  const dateSet = new Set(dates);
  const periodStart = dates[0] ?? "";
  const periodEnd = dates[dates.length - 1] ?? "";

  const baseRows: WeeklyPlanningRow[] = scheduledRows
    .filter((row) => dateSet.has(row.date))
    .map((row) => ({
      ...row,
      supplementalCorrective: false,
      programmedCorrective: false,
      planningOrigin: "planilha-semanal" as const,
    }));

  const scheduledOs = new Set(
    baseRows.map((row) => normalizeOs(row.os).toUpperCase()).filter(Boolean),
  );

  const alreadyProgrammedRows = correctiveRows
    .filter((row) => isCorrectiveProgrammedForWeek(row, periodStart, periodEnd))
    .map((row) => {
      const dayIndex = Number(row.programacao_dia_indice);
      const date = dates[dayIndex];
      return date ? sourceToPlanningRow(row, date, true) : null;
    })
    .filter((row): row is WeeklyPlanningRow => Boolean(row))
    .filter((row) => {
      const os = normalizeOs(row.os).toUpperCase();
      return !os || !scheduledOs.has(os);
    });

  const programmedOs = new Set(
    alreadyProgrammedRows.map((row) => normalizeOs(row.os).toUpperCase()).filter(Boolean),
  );

  const candidates = sortPlanningCandidates(
    correctiveRows.filter((row) => {
      if (!isAvailableCorrectiveForPlanning(row)) return false;
      const os = normalizeOs(row.numero_os).toUpperCase();
      return Boolean(os) && !scheduledOs.has(os) && !programmedOs.has(os);
    }),
  );

  const candidatesByTeam = new Map<string, WeeklyCorrectiveSourceRow[]>();
  const teamLabels = new Map<string, string>();

  candidates.forEach((candidate) => {
    const name = String(candidate.nome_os ?? "").trim();
    const equipment = String(candidate.equipamento ?? "").trim();
    const label = normalizeReportTeam(candidate.equipe, `${name} ${equipment}`);
    const key = teamKey(label);
    if (!key) return;
    const current = candidatesByTeam.get(key) ?? [];
    current.push(candidate);
    candidatesByTeam.set(key, current);
    if (!teamLabels.has(key)) teamLabels.set(key, label);
  });

  const result = [...baseRows, ...alreadyProgrammedRows];
  const usedOs = new Set<string>(programmedOs);
  const orderedTeamKeys = Array.from(candidatesByTeam.keys()).sort((a, b) =>
    (teamLabels.get(a) ?? a).localeCompare(teamLabels.get(b) ?? b, "pt-BR"),
  );

  const correctiveCountFor = (date: string, key: string) =>
    result.filter(
      (row) =>
        row.date === date &&
        row.activity === "Corretiva" &&
        teamKey(row.team, `${row.name} ${row.equipment}`) === key,
    ).length;

  // Rodízio por rodada: primeiro distribui 1 por equipe ao longo da semana,
  // depois a segunda, terceira etc. Isso evita concentrar toda a carteira no
  // primeiro dia quando uma equipe possui poucos chamados disponíveis.
  for (let round = 0; round < target; round += 1) {
    for (const date of dates) {
      for (const key of orderedTeamKeys) {
        const currentCount = correctiveCountFor(date, key);
        if (currentCount >= target || currentCount > round) continue;

        const queue = candidatesByTeam.get(key) ?? [];
        let candidate: WeeklyCorrectiveSourceRow | undefined;

        while (queue.length && !candidate) {
          const next = queue.shift();
          if (!next) break;
          const os = normalizeOs(next.numero_os).toUpperCase();
          if (!os || usedOs.has(os) || scheduledOs.has(os)) continue;
          usedOs.add(os);
          candidate = next;
        }

        if (candidate) result.push(sourceToPlanningRow(candidate, date, false));
      }
    }
  }

  result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      maintenanceAreaRank(a.area) - maintenanceAreaRank(b.area) ||
      a.activity.localeCompare(b.activity) ||
      a.team.localeCompare(b.team, "pt-BR") ||
      a.os.localeCompare(b.os),
  );

  const days = dates.map((date) => summarizePlanningDay(date, result));
  const supplementalRows = result.filter((row) => row.supplementalCorrective);
  const programmedCount = supplementalRows.filter((row) => row.programmedCorrective).length;
  const suggestedCount = supplementalRows.length - programmedCount;

  return {
    rows: result,
    days,
    candidateCount: candidates.length,
    supplementalCount: supplementalRows.length,
    programmedCount,
    suggestedCount,
    daysWithoutCorrective: days.filter((day) => day.corrective === 0).map((day) => day.date),
    periodStart,
    periodEnd,
    targetCorrectivesPerTeamPerDay: target,
  };
}

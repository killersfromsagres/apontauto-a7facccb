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
};

export type WeeklyPlanningRow = ScheduledMaintenance & {
  supplementalCorrective?: boolean;
  planningOrigin?: "planilha-semanal" | "encaixe-corretiva";
};

export type WeeklyPlanningDaySummary = {
  date: string;
  total: number;
  preventive: number;
  corrective: number;
  nativeCorrective: number;
  supplementalCorrective: number;
  teams: string[];
  areas: MaintenanceArea[];
};

export type WeeklyPlanningResult = {
  rows: WeeklyPlanningRow[];
  days: WeeklyPlanningDaySummary[];
  candidateCount: number;
  supplementalCount: number;
  daysWithoutCorrective: string[];
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

const BLOCKED_PROGRAMMING_STATUSES = new Set([
  "em_programacao",
  "em programacao",
  "reprogramacao_pendente",
  "reprogramacao pendente",
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

/**
 * A programação é semanal. Mesmo que uma das planilhas não tenha OS em um
 * determinado dia, a visão do cliente mantém segunda a sexta-feira da semana.
 */
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
  const status = normalize(row.status);
  if (!OPEN_STATUSES.has(status)) return false;

  if (normalize(row.tipo_importacao) === "backorder_mensal") return false;

  const programmingStatus = normalize(row.programacao_status);
  if (BLOCKED_PROGRAMMING_STATUSES.has(programmingStatus)) return false;

  return Boolean(normalizeOs(row.numero_os));
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

function sourceToPlanningRow(source: WeeklyCorrectiveSourceRow, date: string): WeeklyPlanningRow {
  const os = normalizeOs(source.numero_os);
  const name = String(source.nome_os ?? "").trim();
  const equipment = String(source.equipamento ?? "").trim();
  const team = normalizeReportTeam(source.equipe, `${name} ${equipment}`);
  const sla = toLocalIsoDate(source.data_sla) || String(source.data_sla ?? "").trim();

  return {
    id: `relatorio-diario:encaixe:${date}:${os || source.id || name}`,
    date,
    os: os || String(source.id ?? "").trim(),
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
    observation: "Encaixe automático de corretiva aberta para complementar a programação do dia.",
    sourceFile: "Corretiva Novo • encaixe automático",
    programmingSource: "extra-dia",
    extraCorrective: true,
    supplementalCorrective: true,
    planningOrigin: "encaixe-corretiva",
  };
}

function summarizePlanningDay(date: string, rows: WeeklyPlanningRow[]): WeeklyPlanningDaySummary {
  const dayRows = rows.filter((row) => row.date === date);
  const correctives = dayRows.filter((row) => row.activity === "Corretiva");
  const supplemental = correctives.filter((row) => row.supplementalCorrective).length;

  return {
    date,
    total: dayRows.length,
    preventive: dayRows.filter((row) => row.activity === "Preventiva").length,
    corrective: correctives.length,
    nativeCorrective: Math.max(0, correctives.length - supplemental),
    supplementalCorrective: supplemental,
    teams: Array.from(new Set(dayRows.map((row) => row.team).filter(Boolean))).sort(),
    areas: Array.from(new Set(dayRows.map((row) => row.area))).sort(
      (a, b) => maintenanceAreaRank(a) - maintenanceAreaRank(b),
    ),
  };
}

/**
 * Consolida a programação das planilhas e usa a carteira de corretivas abertas
 * apenas para completar dias com menos corretivas que o mínimo desejado.
 *
 * Importante: esta função NÃO altera status nem reserva OS no banco. Ela monta a
 * comunicação da programação para o cliente.
 */
export function buildWeeklyPlanning({
  scheduledRows,
  correctiveRows,
  minimumCorrectivesPerDay = 1,
}: {
  scheduledRows: ScheduledMaintenance[];
  correctiveRows: WeeklyCorrectiveSourceRow[];
  minimumCorrectivesPerDay?: number;
}): WeeklyPlanningResult {
  const minimum = Math.max(0, Math.min(10, Math.trunc(minimumCorrectivesPerDay || 0)));
  const dates = planningWeekDates(scheduledRows);
  const dateSet = new Set(dates);

  const baseRows: WeeklyPlanningRow[] = scheduledRows
    .filter((row) => dateSet.has(row.date))
    .map((row) => ({
      ...row,
      supplementalCorrective: false,
      planningOrigin: "planilha-semanal" as const,
    }));

  const scheduledOs = new Set(
    baseRows.map((row) => normalizeOs(row.os).toUpperCase()).filter(Boolean),
  );

  const candidates = sortPlanningCandidates(
    correctiveRows.filter((row) => {
      if (!isAvailableCorrectiveForPlanning(row)) return false;
      const os = normalizeOs(row.numero_os).toUpperCase();
      return Boolean(os) && !scheduledOs.has(os);
    }),
  );

  const result = [...baseRows];
  const usedOs = new Set<string>();
  let candidateIndex = 0;

  for (const date of dates) {
    let correctiveCount = result.filter(
      (row) => row.date === date && row.activity === "Corretiva",
    ).length;

    while (correctiveCount < minimum && candidateIndex < candidates.length) {
      let candidate: WeeklyCorrectiveSourceRow | undefined;

      while (candidateIndex < candidates.length && !candidate) {
        const current = candidates[candidateIndex++];
        const os = normalizeOs(current.numero_os).toUpperCase();
        if (!os || usedOs.has(os) || scheduledOs.has(os)) continue;
        usedOs.add(os);
        candidate = current;
      }

      if (!candidate) break;
      result.push(sourceToPlanningRow(candidate, date));
      correctiveCount += 1;
    }
  }

  result.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      maintenanceAreaRank(a.area) - maintenanceAreaRank(b.area) ||
      a.activity.localeCompare(b.activity) ||
      a.team.localeCompare(b.team) ||
      a.os.localeCompare(b.os),
  );

  const days = dates.map((date) => summarizePlanningDay(date, result));

  return {
    rows: result,
    days,
    candidateCount: candidates.length,
    supplementalCount: result.filter((row) => row.supplementalCorrective).length,
    daysWithoutCorrective: days.filter((day) => day.corrective === 0).map((day) => day.date),
  };
}

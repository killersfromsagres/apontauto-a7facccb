import {
  inferMaintenanceArea,
  maintenanceAreaRank,
  normalizeOs,
  summarizeScheduleRows,
  type ScheduleDaySummary,
  type ScheduledMaintenance,
} from "./daily-maintenance";

export type CorrectiveReportSourceRow = {
  id?: string | null;
  numero_os?: string | null;
  status?: string | null;
  fim?: string | null;
  data_programada?: string | null;
  data_criacao?: string | null;
  data_sla?: string | null;
  equipe?: string | null;
  nome_os?: string | null;
  equipamento?: string | null;
  ativo?: string | null;
  patrimonio?: string | null;
  predio?: string | null;
  andar?: string | null;
  local?: string | null;
  observacao_conclusao?: string | null;
};

export type ReportExecutionMap = Record<string, { completedAt: string }>;

export type ReportDaySummary = ScheduleDaySummary & {
  completed: number;
  completedCorrective: number;
  extraCorrective: number;
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

export function isCompletedCorrectiveStatus(status: unknown) {
  const normalized = normalize(status);
  return normalized === "concluida" || normalized === "concluido";
}

export function toLocalIsoDate(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const offset = parsed.getTimezoneOffset() * 60_000;
  return new Date(parsed.getTime() - offset).toISOString().slice(0, 10);
}

function osKey(value: unknown) {
  return normalizeOs(value).trim().toUpperCase();
}

function mappedCorrectiveRow(source: CorrectiveReportSourceRow): ScheduledMaintenance | null {
  if (!isCompletedCorrectiveStatus(source.status)) return null;

  const completedAt = toLocalIsoDate(source.fim);
  if (!completedAt) return null;

  const os = normalizeOs(source.numero_os);
  const team = String(source.equipe ?? "").trim() || "Sem equipe";
  const name = String(source.nome_os ?? "").trim();
  const equipment = String(source.equipamento ?? "").trim();
  const programmedAt = toLocalIsoDate(source.data_programada);
  const date = programmedAt || completedAt;
  const sourceId = String(source.id ?? "").trim() || os || `${completedAt}:${team}:${name}`;

  return {
    id: `corretiva-novo:${sourceId}`,
    date,
    os: os || sourceId,
    name,
    building: String(source.predio ?? "").trim(),
    floor: String(source.andar ?? "").trim(),
    space: String(source.local ?? "").trim(),
    activity: "Corretiva",
    sla: toLocalIsoDate(source.data_sla) || String(source.data_sla ?? "").trim(),
    team,
    area: inferMaintenanceArea(team, "Corretiva Novo", `${name} ${equipment}`),
    asset: String(source.ativo ?? "").trim(),
    equipment,
    observation: String(source.observacao_conclusao ?? "").trim(),
    sourceFile: "Corretiva Novo • realizada em campo",
    completedAt,
    completionSource: "corretiva-novo",
    programmingSource: programmedAt ? "corretiva-novo" : "extra-dia",
    extraCorrective: !programmedAt,
  };
}

export function mapCompletedCorrectives(rows: CorrectiveReportSourceRow[]) {
  return rows
    .map(mappedCorrectiveRow)
    .filter((row): row is ScheduledMaintenance => Boolean(row))
    .sort(
      (a, b) =>
        String(b.completedAt ?? "").localeCompare(String(a.completedAt ?? "")) ||
        maintenanceAreaRank(a.area) - maintenanceAreaRank(b.area) ||
        a.team.localeCompare(b.team) ||
        a.os.localeCompare(b.os),
    );
}

export function buildCompletedReportRows({
  scheduledRows,
  executions,
  correctiveRows,
  selectedDate,
}: {
  scheduledRows: ScheduledMaintenance[];
  executions: ReportExecutionMap;
  correctiveRows: CorrectiveReportSourceRow[];
  selectedDate: string;
}) {
  const scheduledByOs = new Map<string, ScheduledMaintenance[]>();
  scheduledRows.forEach((row) => {
    const key = osKey(row.os);
    if (!key) return;
    const current = scheduledByOs.get(key) ?? [];
    current.push(row);
    scheduledByOs.set(key, current);
  });

  const mappedCorrectives = mapCompletedCorrectives(correctiveRows);
  const officialCompletionByOs = new Map<string, ScheduledMaintenance>();
  mappedCorrectives.forEach((row) => {
    const key = osKey(row.os) || row.id;
    if (!officialCompletionByOs.has(key)) officialCompletionByOs.set(key, row);
  });

  const completed = new Map<string, ScheduledMaintenance>();

  mappedCorrectives
    .filter((row) => row.completedAt === selectedDate)
    .forEach((corrective) => {
      const key = osKey(corrective.os) || corrective.id;
      const candidates = scheduledByOs.get(key) ?? [];
      const scheduled =
        candidates.find((row) => row.date === corrective.date) ??
        candidates.find((row) => row.date === corrective.completedAt) ??
        candidates[0];

      if (!scheduled) {
        completed.set(key, corrective);
        return;
      }

      const team = corrective.team && corrective.team !== "Sem equipe" ? corrective.team : scheduled.team;
      completed.set(key, {
        ...scheduled,
        name: corrective.name || scheduled.name,
        building: corrective.building || scheduled.building,
        floor: corrective.floor || scheduled.floor,
        space: corrective.space || scheduled.space,
        team,
        area: inferMaintenanceArea(team, scheduled.sourceFile, corrective.name || scheduled.name),
        asset: corrective.asset || scheduled.asset,
        equipment: corrective.equipment || scheduled.equipment,
        observation: corrective.observation || scheduled.observation,
        completedAt: corrective.completedAt,
        completionSource: "corretiva-novo",
        programmingSource: "programacao-semanal",
        extraCorrective: false,
      });
    });

  scheduledRows.forEach((row) => {
    const completedAt = executions[row.id]?.completedAt;
    if (completedAt !== selectedDate) return;
    const key = osKey(row.os) || row.id;
    if (officialCompletionByOs.has(key) || completed.has(key)) return;
    completed.set(key, {
      ...row,
      completedAt,
      completionSource: "relatorio-diario",
      programmingSource: "programacao-semanal",
      extraCorrective: false,
    });
  });

  return Array.from(completed.values()).sort(
    (a, b) =>
      maintenanceAreaRank(a.area) - maintenanceAreaRank(b.area) ||
      a.activity.localeCompare(b.activity) ||
      a.team.localeCompare(b.team) ||
      a.os.localeCompare(b.os),
  );
}

export function buildReportDaySummaries({
  scheduledRows,
  executions,
  correctiveRows,
}: {
  scheduledRows: ScheduledMaintenance[];
  executions: ReportExecutionMap;
  correctiveRows: CorrectiveReportSourceRow[];
}): ReportDaySummary[] {
  const scheduledSummary = new Map(
    summarizeScheduleRows(scheduledRows).map((summary) => [summary.date, summary]),
  );
  const dates = new Set<string>(scheduledSummary.keys());

  Object.values(executions).forEach((execution) => {
    if (execution.completedAt) dates.add(execution.completedAt);
  });

  mapCompletedCorrectives(correctiveRows).forEach((row) => {
    if (row.completedAt) dates.add(row.completedAt);
  });

  return Array.from(dates)
    .sort()
    .map((date) => {
      const base = scheduledSummary.get(date) ?? {
        date,
        total: 0,
        preventive: 0,
        corrective: 0,
        teams: [],
        areas: [],
      };
      const completedRows = buildCompletedReportRows({
        scheduledRows,
        executions,
        correctiveRows,
        selectedDate: date,
      });

      return {
        ...base,
        teams: Array.from(new Set([...base.teams, ...completedRows.map((row) => row.team).filter(Boolean)])).sort(),
        areas: Array.from(new Set([...base.areas, ...completedRows.map((row) => row.area)])).sort(
          (a, b) => maintenanceAreaRank(a) - maintenanceAreaRank(b),
        ),
        completed: completedRows.length,
        completedCorrective: completedRows.filter((row) => row.activity === "Corretiva").length,
        extraCorrective: completedRows.filter((row) => row.extraCorrective).length,
      };
    });
}

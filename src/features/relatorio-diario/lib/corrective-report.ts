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
  updated_at?: string | null;
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

export type CorrectivePendingStatusUpdate = {
  osId?: string | null;
  numeroOs?: string | null;
  status?: string | null;
  fim?: string | null;
  observacao_conclusao?: string | null;
  createdAt?: number | null;
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

export const REPORT_SUPPORT_TEAMS = ["Chaveiro", "Pintura", "Limpeza"] as const;

const SUPPORT_TEAM_MATCHERS = [
  { canonical: "Chaveiro", aliases: ["chaveiro"] },
  { canonical: "Pintura", aliases: ["pintura", "pintor"] },
  { canonical: "Limpeza", aliases: ["limpeza", "higienizacao", "conservacao"] },
] as const;

/**
 * Mantém Chaveiro, Pintura e Limpeza como equipes explícitas no report.
 * A descrição só é usada como fallback quando o cadastro da equipe veio vazio,
 * evitando reclassificações indevidas de outras disciplinas.
 */
export function normalizeReportTeam(value: unknown, fallbackText = "") {
  const explicit = String(value ?? "").trim();
  const explicitNormalized = normalize(explicit);
  for (const group of SUPPORT_TEAM_MATCHERS) {
    if (group.aliases.some((alias) => explicitNormalized.includes(alias))) return group.canonical;
  }
  if (explicit) return explicit;

  const fallbackNormalized = normalize(fallbackText);
  for (const group of SUPPORT_TEAM_MATCHERS) {
    if (group.aliases.some((alias) => fallbackNormalized.includes(alias))) return group.canonical;
  }
  return "Sem equipe";
}

const COMPLETED_CORRECTIVE_STATUSES = new Set([
  "concluida",
  "concluido",
  "finalizada",
  "finalizado",
  "fechada",
  "fechado",
  "encerrada",
  "encerrado",
]);

export function isCompletedCorrectiveStatus(status: unknown) {
  return COMPLETED_CORRECTIVE_STATUSES.has(normalize(status));
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

function rowIdentity(row: CorrectiveReportSourceRow) {
  const os = osKey(row.numero_os);
  if (os) return `OS:${os}`;
  const id = String(row.id ?? "").trim().toUpperCase();
  return id ? `ID:${id}` : "";
}

function rowVersion(row: CorrectiveReportSourceRow) {
  const candidates = [row.updated_at, row.fim, row.data_programada, row.data_criacao];
  for (const candidate of candidates) {
    const timestamp = new Date(String(candidate ?? "")).getTime();
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function mergeDefined<T extends Record<string, unknown>>(base: T, patch: Partial<T>): T {
  const next = { ...base };
  Object.entries(patch).forEach(([key, value]) => {
    if (value !== undefined) (next as Record<string, unknown>)[key] = value;
  });
  return next;
}

/**
 * Consolida o estado oficial do banco com o espelho local do Corretiva Novo e
 * com alterações de status ainda pendentes de sincronização. A fila local é
 * aplicada por último porque representa a ação mais recente feita no aparelho.
 *
 * Isso evita dois problemas no relatório diário:
 * - uma conclusão feita offline não some do PDF enquanto aguarda sincronização;
 * - uma OS reaberta localmente não continua sendo tratada como concluída apenas
 *   porque o campo `fim` ainda existe no registro remoto/cacheado.
 */
export function consolidateCorrectiveCompletionSources({
  remoteRows,
  cachedRows = [],
  pendingStatusUpdates = [],
}: {
  remoteRows: CorrectiveReportSourceRow[];
  cachedRows?: CorrectiveReportSourceRow[];
  pendingStatusUpdates?: CorrectivePendingStatusUpdate[];
}) {
  const consolidated = new Map<string, CorrectiveReportSourceRow>();

  remoteRows.forEach((row) => {
    const key = rowIdentity(row);
    if (!key) return;
    const current = consolidated.get(key);
    if (!current || rowVersion(row) >= rowVersion(current)) consolidated.set(key, row);
  });

  cachedRows.forEach((row) => {
    const key = rowIdentity(row);
    if (!key) return;
    const current = consolidated.get(key);
    if (!current || rowVersion(row) >= rowVersion(current)) {
      consolidated.set(key, current ? mergeDefined(current, row) : row);
    }
  });

  const findPendingKey = (update: CorrectivePendingStatusUpdate) => {
    const os = osKey(update.numeroOs);
    if (os) return `OS:${os}`;

    const id = String(update.osId ?? "").trim().toUpperCase();
    if (!id) return "";
    const direct = `ID:${id}`;
    if (consolidated.has(direct)) return direct;

    for (const [key, row] of consolidated.entries()) {
      if (String(row.id ?? "").trim().toUpperCase() === id) return key;
    }
    return direct;
  };

  [...pendingStatusUpdates]
    .sort((a, b) => Number(a.createdAt ?? 0) - Number(b.createdAt ?? 0))
    .forEach((update) => {
      const key = findPendingKey(update);
      if (!key) return;
      const current = consolidated.get(key) ?? {
        id: update.osId ?? null,
        numero_os: update.numeroOs ?? null,
      };
      consolidated.set(
        key,
        mergeDefined(current, {
          status: update.status,
          fim: update.fim,
          observacao_conclusao: update.observacao_conclusao,
          updated_at: update.createdAt
            ? new Date(update.createdAt).toISOString()
            : current.updated_at,
        }),
      );
    });

  return Array.from(consolidated.values());
}

function mappedCorrectiveRow(source: CorrectiveReportSourceRow): ScheduledMaintenance | null {
  if (!isCompletedCorrectiveStatus(source.status)) return null;

  // `fim` é a fonte preferencial. `updated_at` cobre registros antigos já
  // concluídos que não possuíam a data final persistida corretamente.
  const completedAt = toLocalIsoDate(source.fim || source.updated_at);
  if (!completedAt) return null;

  const os = normalizeOs(source.numero_os);
  const team = normalizeReportTeam(source.equipe, `${source.nome_os ?? ""} ${source.equipamento ?? ""}`);
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
  // Com programação importada, o período ativo é o das próprias planilhas;
  // histórico antigo do Corretiva Novo não cria cards de dia.
  const period = schedulePeriod(scheduledRows);
  const inPeriod = (date: string) => !period || (date >= period.start && date <= period.end);

  Object.values(executions).forEach((execution) => {
    if (execution.completedAt && inPeriod(execution.completedAt)) dates.add(execution.completedAt);
  });

  mapCompletedCorrectives(correctiveRows).forEach((row) => {
    if (row.completedAt && inPeriod(row.completedAt)) dates.add(row.completedAt);
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

export type SchedulePeriod = { start: string; end: string };

/** Período (primeira e última data) coberto pelos blocos da programação importada. */
export function schedulePeriod(rows: ScheduledMaintenance[]): SchedulePeriod | null {
  const dates = rows.map((row) => row.date).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!dates.length) return null;
  return { start: dates[0], end: dates[dates.length - 1] };
}

/**
 * Decide se uma nova importação mescla com a programação atual (mesmo período,
 * ex.: Civil/Hidráulica, Refrigeração e Elétrica em etapas) ou a substitui
 * (nova semana sem sobreposição de datas).
 */
export function shouldReplaceSchedule(current: ScheduledMaintenance[], incoming: ScheduledMaintenance[]): boolean {
  const a = schedulePeriod(current);
  const b = schedulePeriod(incoming);
  if (!a || !b) return false;
  return b.start > a.end || b.end < a.start;
}

import { supabase } from "@/integrations/supabase/client";
import { isPreventiva } from "@/lib/corretiva/preventiva-import";

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;

const DASHBOARD_COLUMNS = [
  "id",
  "numero_os",
  "nome_os",
  "predio",
  "andar",
  "local",
  "ativo",
  "equipamento",
  "equipe",
  "status",
  "tipo",
  "tipo_importacao",
  "data_criacao",
  "data_programada",
  "data_sla",
  "inicio",
  "fim",
  "updated_at",
  "material_status",
  "solicitante",
].join(", ");

export type CorretivaDashboardRow = {
  id: string;
  numero_os: string | null;
  nome_os: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  ativo: string | null;
  equipamento: string | null;
  equipe: string | null;
  status: string | null;
  tipo: string | null;
  tipo_importacao: string | null;
  data_criacao: string | null;
  data_programada: string | null;
  data_sla: string | null;
  inicio: string | null;
  fim: string | null;
  updated_at: string | null;
  material_status: string | null;
  solicitante: string | null;
};

export type CorretivaTrendPoint = {
  key: string;
  label: string;
  entradas: number;
  concluidas: number;
  canceladas: number;
};

export type CorretivaTeamPoint = {
  equipe: string;
  emCampo: number;
  concluidas: number;
  atrasadas: number;
};

export type CorretivaStatusPoint = {
  status: string;
  value: number;
};

export type CorretivaRecentEvent = {
  id: string;
  numeroOs: string;
  descricao: string;
  equipe: string;
  status: "concluida" | "cancelada";
  ocorridoEm: string;
  localizacao: string;
  ativo: string;
};

export type CorretivaDashboardData = {
  generatedAt: string;
  lastDatabaseUpdate: string | null;
  sourceRows: number;
  teamOptions: string[];
  metrics: {
    emCampo: number;
    concluidas: number;
    entradas: number;
    atrasadas: number;
    slaPercent: number | null;
    tempoMedioDias: number | null;
    materiaisSolicitados: number;
  };
  trend: CorretivaTrendPoint[];
  teams: CorretivaTeamPoint[];
  statuses: CorretivaStatusPoint[];
  recent: CorretivaRecentEvent[];
};

type QueryResult = {
  data: CorretivaDashboardRow[] | null;
  error: { message?: string } | null;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function isCorrective(row: CorretivaDashboardRow) {
  const tipo = normalize(row.tipo);
  const importType = normalize(row.tipo_importacao);
  return (
    importType !== "backorder_mensal" &&
    !isPreventiva(row.tipo) &&
    !tipo.includes("backorder") &&
    !tipo.includes("back order")
  );
}

function isClosed(row: CorretivaDashboardRow) {
  return row.status === "concluida" || row.status === "cancelada";
}

function eventDate(row: CorretivaDashboardRow) {
  return row.status === "concluida" ? row.fim ?? row.updated_at : row.updated_at ?? row.fim;
}

function startOfLocalDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function startOfWeek(date: Date) {
  const value = startOfLocalDay(date);
  const weekday = value.getDay();
  const daysFromMonday = weekday === 0 ? 6 : weekday - 1;
  value.setDate(value.getDate() - daysFromMonday);
  return value;
}

function bucketStart(date: Date, weekly: boolean) {
  return weekly ? startOfWeek(date) : startOfLocalDay(date);
}

function bucketKey(date: Date, weekly: boolean) {
  return bucketStart(date, weekly).toISOString().slice(0, 10);
}

function statusLabel(status: string | null) {
  const value = normalize(status);
  if (!value || value === "pendente") return "Pendente";
  if (value.includes("andamento") || value.includes("execucao")) return "Em andamento";
  if (value.includes("aguard")) return "Aguardando";
  if (value.includes("program")) return "Programada";
  return String(status)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function fetchPaged(
  runPage: (from: number, to: number) => PromiseLike<QueryResult>,
): Promise<CorretivaDashboardRow[]> {
  const rows: CorretivaDashboardRow[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await runPage(from, to);
    if (error) throw new Error(error.message || "Falha ao consultar corretivas.");

    const current = data ?? [];
    rows.push(...current);
    if (current.length < PAGE_SIZE) break;
  }

  return rows;
}

function uniqueRows(groups: CorretivaDashboardRow[][]) {
  const byId = new Map<string, CorretivaDashboardRow>();
  for (const group of groups) {
    for (const row of group) byId.set(row.id, row);
  }
  return Array.from(byId.values()).filter(isCorrective);
}

function buildTrend(
  created: CorretivaDashboardRow[],
  history: CorretivaDashboardRow[],
  start: Date,
  days: number,
): CorretivaTrendPoint[] {
  const weekly = days > 45;
  const points = new Map<string, CorretivaTrendPoint>();
  let cursor = bucketStart(start, weekly);
  const today = bucketStart(new Date(), weekly);

  while (cursor.getTime() <= today.getTime()) {
    const key = cursor.toISOString().slice(0, 10);
    points.set(key, {
      key,
      label: cursor.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      entradas: 0,
      concluidas: 0,
      canceladas: 0,
    });
    cursor = new Date(cursor.getTime() + (weekly ? 7 : 1) * DAY_MS);
  }

  for (const row of created) {
    if (!row.data_criacao) continue;
    const date = new Date(row.data_criacao);
    if (Number.isNaN(date.getTime())) continue;
    const point = points.get(bucketKey(date, weekly));
    if (point) point.entradas += 1;
  }

  for (const row of history) {
    const value = eventDate(row);
    if (!value) continue;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) continue;
    const point = points.get(bucketKey(date, weekly));
    if (!point) continue;
    if (row.status === "concluida") point.concluidas += 1;
    if (row.status === "cancelada") point.canceladas += 1;
  }

  return Array.from(points.values());
}

export async function fetchCorretivaDashboard(params: {
  dias: number;
  equipe?: string | null;
}): Promise<CorretivaDashboardData> {
  const days = Math.min(Math.max(params.dias, 7), 180);
  const start = startOfLocalDay(new Date(Date.now() - (days - 1) * DAY_MS));
  const startIso = start.toISOString();

  const [activeRaw, createdRaw, historyRaw] = await Promise.all([
    fetchPaged((from, to) =>
      supabase
        .from("corretiva_os")
        .select(DASHBOARD_COLUMNS)
        .or("status.is.null,status.not.in.(concluida,cancelada)")
        .order("updated_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<QueryResult>,
    ),
    fetchPaged((from, to) =>
      supabase
        .from("corretiva_os")
        .select(DASHBOARD_COLUMNS)
        .gte("data_criacao", startIso)
        .order("data_criacao", { ascending: false })
        .range(from, to) as unknown as PromiseLike<QueryResult>,
    ),
    fetchPaged((from, to) =>
      supabase
        .from("corretiva_os")
        .select(DASHBOARD_COLUMNS)
        .in("status", ["concluida", "cancelada"])
        .gte("updated_at", startIso)
        .order("updated_at", { ascending: false })
        .range(from, to) as unknown as PromiseLike<QueryResult>,
    ),
  ]);

  const source = uniqueRows([activeRaw, createdRaw, historyRaw]);
  const teamOptions = Array.from(
    new Set(source.map((row) => row.equipe?.trim()).filter((value): value is string => Boolean(value))),
  ).sort((a, b) => a.localeCompare(b, "pt-BR"));

  const selectedTeam = params.equipe?.trim();
  const filteredSource = selectedTeam
    ? source.filter((row) => normalize(row.equipe) === normalize(selectedTeam))
    : source;

  const active = filteredSource.filter((row) => !isClosed(row));
  const created = filteredSource.filter((row) => {
    if (!row.data_criacao) return false;
    const value = new Date(row.data_criacao).getTime();
    return Number.isFinite(value) && value >= start.getTime();
  });
  const history = filteredSource.filter((row) => {
    if (!isClosed(row)) return false;
    const value = eventDate(row);
    if (!value) return false;
    const time = new Date(value).getTime();
    return Number.isFinite(time) && time >= start.getTime();
  });
  const completed = history.filter((row) => row.status === "concluida");

  const delayed = active.filter((row) => {
    if (!row.data_criacao) return false;
    const createdAt = new Date(row.data_criacao).getTime();
    return Number.isFinite(createdAt) && Date.now() - createdAt >= 30 * DAY_MS;
  });

  const leadTimes = completed
    .map((row) => {
      if (!row.data_criacao) return null;
      const completedAt = eventDate(row);
      if (!completedAt) return null;
      const startTime = new Date(row.data_criacao).getTime();
      const endTime = new Date(completedAt).getTime();
      if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) return null;
      return (endTime - startTime) / DAY_MS;
    })
    .filter((value): value is number => value !== null);

  const slaEligible = leadTimes.length;
  const slaInside = leadTimes.filter((daysToClose) => daysToClose <= 30).length;

  const teams = new Map<string, CorretivaTeamPoint>();
  const ensureTeam = (name: string | null) => {
    const equipe = name?.trim() || "Sem equipe";
    const existing = teams.get(equipe);
    if (existing) return existing;
    const next = { equipe, emCampo: 0, concluidas: 0, atrasadas: 0 };
    teams.set(equipe, next);
    return next;
  };

  for (const row of active) ensureTeam(row.equipe).emCampo += 1;
  for (const row of completed) ensureTeam(row.equipe).concluidas += 1;
  for (const row of delayed) ensureTeam(row.equipe).atrasadas += 1;

  const statuses = new Map<string, number>();
  for (const row of active) {
    const label = statusLabel(row.status);
    statuses.set(label, (statuses.get(label) ?? 0) + 1);
  }

  const lastDatabaseUpdate = filteredSource
    .map((row) => row.updated_at)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

  const recent = history
    .slice()
    .sort((a, b) => new Date(eventDate(b) ?? 0).getTime() - new Date(eventDate(a) ?? 0).getTime())
    .slice(0, 10)
    .map((row): CorretivaRecentEvent => ({
      id: row.id,
      numeroOs: row.numero_os || "—",
      descricao: row.nome_os || "Sem descrição",
      equipe: row.equipe || "Sem equipe",
      status: row.status === "cancelada" ? "cancelada" : "concluida",
      ocorridoEm: eventDate(row) || row.updated_at || new Date().toISOString(),
      localizacao: [row.predio, row.andar, row.local].filter(Boolean).join(" · ") || "Local não informado",
      ativo: row.ativo || row.equipamento || "—",
    }));

  return {
    generatedAt: new Date().toISOString(),
    lastDatabaseUpdate,
    sourceRows: filteredSource.length,
    teamOptions,
    metrics: {
      emCampo: active.length,
      concluidas: completed.length,
      entradas: created.length,
      atrasadas: delayed.length,
      slaPercent: slaEligible ? Math.round((slaInside / slaEligible) * 100) : null,
      tempoMedioDias: leadTimes.length
        ? leadTimes.reduce((total, value) => total + value, 0) / leadTimes.length
        : null,
      materiaisSolicitados: active.filter((row) => row.material_status === "solicitado").length,
    },
    trend: buildTrend(created, history, start, days),
    teams: Array.from(teams.values())
      .sort((a, b) => b.emCampo + b.concluidas - (a.emCampo + a.concluidas))
      .slice(0, 8),
    statuses: Array.from(statuses.entries())
      .map(([status, value]) => ({ status, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    recent,
  };
}

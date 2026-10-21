import { normalizeOs, type ScheduledMaintenance } from "./daily-maintenance";

export type DailyCorrectiveCatalogRow = {
  id?: string | null;
  numero_os?: string | null;
  nome_os?: string | null;
  equipe?: string | null;
  status?: string | null;
  predio?: string | null;
  andar?: string | null;
  local?: string | null;
  solicitante?: string | null;
  equipamento?: string | null;
  ativo?: string | null;
  tipo_importacao?: string | null;
};

export type DailyCorrectiveFilters = {
  search?: string;
  building?: string;
  requester?: string;
  team?: string;
  status?: string;
};

export const normalizeDailyFilterText = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");

export function correctiveDailyItemKey(date: string, numeroOs: unknown) {
  const os = normalizeOs(numeroOs).trim().toUpperCase();
  return `relatorio-diario:corretiva-dia:${date}:${os || "SEM-OS"}`;
}

export function findScheduledCorrectiveItemKey(
  rows: ScheduledMaintenance[],
  date: string,
  numeroOs: unknown,
) {
  const os = normalizeOs(numeroOs).trim().toUpperCase();
  if (!os) return null;

  const found = rows.find(
    (row) =>
      row.date === date &&
      normalizeDailyFilterText(row.activity) === "corretiva" &&
      normalizeOs(row.os).trim().toUpperCase() === os,
  );
  return found?.id ?? null;
}

export function dailyCorrectiveItemKey(
  rows: ScheduledMaintenance[],
  date: string,
  numeroOs: unknown,
) {
  return findScheduledCorrectiveItemKey(rows, date, numeroOs) ?? correctiveDailyItemKey(date, numeroOs);
}

export function isOperationalCorrective(row: DailyCorrectiveCatalogRow) {
  return normalizeDailyFilterText(row.tipo_importacao) !== "backorder_mensal";
}

export function filterDailyCorrectives<T extends DailyCorrectiveCatalogRow>(
  rows: T[],
  filters: DailyCorrectiveFilters,
) {
  const search = normalizeDailyFilterText(filters.search);
  const building = normalizeDailyFilterText(filters.building);
  const requester = normalizeDailyFilterText(filters.requester);
  const team = normalizeDailyFilterText(filters.team);
  const status = normalizeDailyFilterText(filters.status);

  return rows.filter((row) => {
    if (!isOperationalCorrective(row)) return false;

    if (building && building !== "todos" && normalizeDailyFilterText(row.predio) !== building) {
      return false;
    }
    if (team && team !== "todos" && normalizeDailyFilterText(row.equipe) !== team) {
      return false;
    }
    if (status && status !== "todos" && normalizeDailyFilterText(row.status) !== status) {
      return false;
    }
    if (requester && !normalizeDailyFilterText(row.solicitante).includes(requester)) {
      return false;
    }

    if (!search) return true;
    return [
      row.numero_os,
      row.nome_os,
      row.ativo,
      row.equipamento,
      row.predio,
      row.andar,
      row.local,
      row.solicitante,
      row.equipe,
      row.status,
    ]
      .map(normalizeDailyFilterText)
      .join(" ")
      .includes(search);
  });
}

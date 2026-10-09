import * as XLSX from "xlsx";

export type MaintenanceType = "Preventiva" | "Corretiva";
export type MaintenanceArea =
  | "Civil / Hidráulica"
  | "Elétrica"
  | "Refrigeração 1"
  | "Refrigeração 2"
  | "Refrigeração 3"
  | "Refrigeração"
  | "Outros";

export const PRIMARY_MAINTENANCE_AREAS: MaintenanceArea[] = [
  "Civil / Hidráulica",
  "Refrigeração 1",
  "Refrigeração 2",
  "Refrigeração 3",
  "Elétrica",
];

const MAINTENANCE_AREA_ORDER: MaintenanceArea[] = [
  ...PRIMARY_MAINTENANCE_AREAS,
  "Refrigeração",
  "Outros",
];

export type ScheduledMaintenance = {
  id: string;
  date: string;
  os: string;
  name: string;
  building: string;
  floor: string;
  space: string;
  activity: MaintenanceType;
  sla: string;
  team: string;
  area: MaintenanceArea;
  asset: string;
  equipment: string;
  observation: string;
  sourceFile: string;
};

export type ScheduleDaySummary = {
  date: string;
  total: number;
  preventive: number;
  corrective: number;
  teams: string[];
  areas: MaintenanceArea[];
};

export type ImportResult = {
  rows: ScheduledMaintenance[];
  ignoredSheets: string[];
  scheduleSheet: string;
  fileName: string;
  days: ScheduleDaySummary[];
  teams: string[];
  areas: MaintenanceArea[];
  preventive: number;
  corrective: number;
  warnings: string[];
};

const normalize = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

export const normalizeOs = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  return /^\d+\.0+$/.test(raw) ? raw.replace(/\.0+$/, "") : raw;
};

const cell = (row: unknown[], index: number | undefined) =>
  index === undefined ? "" : String(row[index] ?? "").trim();

const toIsoDate = (value: string) => {
  const match = value.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (!match) return null;
  const [, d, m, y] = match;
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
};

const findIndex = (headers: string[], aliases: string[]) => {
  const normalizedAliases = aliases.map(normalize);
  const index = headers.findIndex((header) => normalizedAliases.includes(normalize(header)));
  return index >= 0 ? index : undefined;
};

const isDayTitle = (value: unknown) => {
  const normalized = normalize(value);
  return (
    normalized.includes("SEGUNDA-FEIRA") ||
    normalized.includes("TERCA-FEIRA") ||
    normalized.includes("QUARTA-FEIRA") ||
    normalized.includes("QUINTA-FEIRA") ||
    normalized.includes("SEXTA-FEIRA")
  );
};

const refrigerationGroup = (text: string) => {
  const normalized = normalize(text);
  if (!/(REFRIGERACAO|REFRIG|HVAC|AR CONDICIONADO)/.test(normalized)) return null;

  const digitMatch = normalized.match(/(?:REFRIGERACAO|REFRIG|HVAC)[^0-9]{0,18}0?([123])\b/);
  if (digitMatch?.[1]) return Number(digitMatch[1]);

  if (/\b(?:REFRIGERACAO|REFRIG|HVAC)[^A-Z0-9]{0,8}III\b/.test(normalized)) return 3;
  if (/\b(?:REFRIGERACAO|REFRIG|HVAC)[^A-Z0-9]{0,8}II\b/.test(normalized)) return 2;
  if (/\b(?:REFRIGERACAO|REFRIG|HVAC)[^A-Z0-9]{0,8}I\b/.test(normalized)) return 1;

  return 0;
};

export function inferMaintenanceArea(team: string, sourceFile = "", description = ""): MaintenanceArea {
  const combined = normalize([team, sourceFile, description].filter(Boolean).join(" "));

  const refGroup = refrigerationGroup(combined);
  if (refGroup === 1) return "Refrigeração 1";
  if (refGroup === 2) return "Refrigeração 2";
  if (refGroup === 3) return "Refrigeração 3";
  if (refGroup === 0) return "Refrigeração";

  if (combined.includes("ELETRICA") || combined.includes("ELETRICISTA")) return "Elétrica";
  if (combined.includes("CIVIL") || combined.includes("HIDRAULICA")) return "Civil / Hidráulica";

  return "Outros";
}

export function maintenanceAreaRank(area: MaintenanceArea) {
  const index = MAINTENANCE_AREA_ORDER.indexOf(area);
  return index >= 0 ? index : MAINTENANCE_AREA_ORDER.length;
}

export function summarizeScheduleRows(rows: ScheduledMaintenance[]): ScheduleDaySummary[] {
  const grouped = new Map<string, ScheduledMaintenance[]>();

  rows.forEach((row) => {
    const current = grouped.get(row.date) ?? [];
    current.push(row);
    grouped.set(row.date, current);
  });

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, dayRows]) => ({
      date,
      total: dayRows.length,
      preventive: dayRows.filter((row) => row.activity === "Preventiva").length,
      corrective: dayRows.filter((row) => row.activity === "Corretiva").length,
      teams: Array.from(new Set(dayRows.map((row) => row.team).filter(Boolean))).sort(),
      areas: Array.from(new Set(dayRows.map((row) => row.area))).sort(
        (a, b) => maintenanceAreaRank(a) - maintenanceAreaRank(b),
      ),
    }));
}

export function parseScheduleMatrix(matrix: unknown[][], sourceFile: string): ScheduledMaintenance[] {
  const rows: ScheduledMaintenance[] = [];
  let currentDate = "";
  let headers: string[] = [];

  for (const rawRow of matrix) {
    const row = Array.isArray(rawRow) ? rawRow : [];
    const detectedDate = toIsoDate(String(row[0] ?? ""));

    // O dia programado vem somente da faixa de título do bloco
    // (ex.: "SEGUNDA-FEIRA • 05/10/2026 • ELÉTRICA...").
    // Datas internas da OS, principalmente Término SLA, nunca alteram o dia programado.
    if (detectedDate && isDayTitle(row[0])) {
      currentDate = detectedDate;
      headers = [];
      continue;
    }

    const normalizedRow = row.map(normalize);
    if (normalizedRow.includes("OS") && normalizedRow.includes("ATIVIDADE")) {
      headers = row.map((value) => String(value ?? ""));
      continue;
    }

    if (!currentDate || headers.length === 0) continue;

    const osIndex = findIndex(headers, ["OS", "NÚMERO OS", "NUMERO OS"]);
    const activityIndex = findIndex(headers, ["ATIVIDADE", "TIPO"]);
    const os = normalizeOs(cell(row, osIndex));
    const activityRaw = normalize(cell(row, activityIndex));
    if (!os || (activityRaw !== "PREVENTIVA" && activityRaw !== "CORRETIVA")) continue;

    const activity: MaintenanceType = activityRaw === "CORRETIVA" ? "Corretiva" : "Preventiva";
    const name = cell(row, findIndex(headers, ["NOME", "DENOMINAÇÃO", "DENOMINACAO", "DESCRIÇÃO", "DESCRICAO"]));
    const building = cell(row, findIndex(headers, ["PRÉDIO", "PREDIO"]));
    const floor = cell(row, findIndex(headers, ["ANDAR"]));
    const space = cell(row, findIndex(headers, ["ESPAÇO", "ESPACO", "AMBIENTE"]));
    const sla = cell(row, findIndex(headers, ["TÉRMINO SLA", "TERMINO SLA", "SLA"]));
    const team = cell(row, findIndex(headers, ["EQUIPE", "TIME", "DISCIPLINA"]));
    const asset = cell(row, findIndex(headers, ["ATIVO"]));
    const equipment = cell(row, findIndex(headers, ["EQUIPAMENTO"]));
    const observation = cell(row, findIndex(headers, ["OBSERVAÇÃO", "OBSERVACAO", "OBS.", "OBS"]));
    const area = inferMaintenanceArea(team, sourceFile, name);
    const id = [currentDate, os, normalize(team || area || sourceFile)].join("|");

    rows.push({
      id,
      date: currentDate,
      os,
      name,
      building,
      floor,
      space,
      activity,
      sla,
      team,
      area,
      asset,
      equipment,
      observation,
      sourceFile,
    });
  }

  return rows;
}

export async function parseScheduleFile(file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const exactScheduleSheet = workbook.SheetNames.find((name) => normalize(name) === "PROGRAMACAO");
  const scheduleSheet =
    exactScheduleSheet ??
    workbook.SheetNames.find((name) => normalize(name).includes("PROGRAMACAO")) ??
    workbook.SheetNames[0];

  if (!scheduleSheet) throw new Error(`Nenhuma aba encontrada em ${file.name}.`);

  const sheet = workbook.Sheets[scheduleSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const rows = parseScheduleMatrix(matrix, file.name);

  if (!rows.length) {
    throw new Error(
      `A planilha ${file.name} não possui OS válidas na aba ${scheduleSheet}. Verifique se os blocos de segunda a sexta contêm as colunas OS e Atividade.`,
    );
  }

  const days = summarizeScheduleRows(rows);
  const teams = Array.from(new Set(rows.map((row) => row.team).filter(Boolean))).sort();
  const areas = Array.from(new Set(rows.map((row) => row.area))).sort(
    (a, b) => maintenanceAreaRank(a) - maintenanceAreaRank(b),
  );
  const warnings: string[] = [];

  if (!exactScheduleSheet) {
    warnings.push(`A aba exata "PROGRAMAÇÃO" não foi encontrada; foi utilizada "${scheduleSheet}".`);
  }

  if (days.length < 5) {
    warnings.push(`Foram identificados ${days.length} dia(s) programado(s) no arquivo.`);
  }

  if (areas.includes("Outros")) {
    warnings.push(`Há registros cuja área não pôde ser classificada automaticamente em ${file.name}.`);
  }

  const ignoredSheets = workbook.SheetNames.filter((name) => name !== scheduleSheet);
  if (ignoredSheets.length) {
    warnings.push(`${ignoredSheets.length} aba(s) auxiliar(es) foram ignoradas para evitar duplicidade.`);
  }

  return {
    rows,
    ignoredSheets,
    scheduleSheet,
    fileName: file.name,
    days,
    teams,
    areas,
    preventive: rows.filter((row) => row.activity === "Preventiva").length,
    corrective: rows.filter((row) => row.activity === "Corretiva").length,
    warnings,
  };
}

export function mergeSchedules(current: ScheduledMaintenance[], incoming: ScheduledMaintenance[]) {
  const hydratedCurrent = current.map((row) => ({
    ...row,
    area: row.area ?? inferMaintenanceArea(row.team, row.sourceFile, row.name),
  }));
  const merged = new Map(hydratedCurrent.map((row) => [row.id, row]));
  incoming.forEach((row) => merged.set(row.id, row));
  return Array.from(merged.values()).sort((a, b) =>
    a.date.localeCompare(b.date) ||
    maintenanceAreaRank(a.area) - maintenanceAreaRank(b.area) ||
    a.team.localeCompare(b.team) ||
    a.os.localeCompare(b.os),
  );
}

export function formatDateBr(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

export function formatWeekdayBr(date: string, short = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const formatted = new Date(`${date}T12:00:00`).toLocaleDateString("pt-BR", {
    weekday: short ? "short" : "long",
  });
  return formatted.replace(/\.$/, "");
}

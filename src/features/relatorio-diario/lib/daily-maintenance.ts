import * as XLSX from "xlsx";

export type MaintenanceType = "Preventiva" | "Corretiva";

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
  asset: string;
  equipment: string;
  observation: string;
  sourceFile: string;
};

export type ImportResult = {
  rows: ScheduledMaintenance[];
  ignoredSheets: string[];
  scheduleSheet: string;
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

export function parseScheduleMatrix(matrix: unknown[][], sourceFile: string): ScheduledMaintenance[] {
  const rows: ScheduledMaintenance[] = [];
  let currentDate = "";
  let headers: string[] = [];

  for (const rawRow of matrix) {
    const row = Array.isArray(rawRow) ? rawRow : [];
    const joined = row.map((value) => String(value ?? "")).join(" • ");
    const detectedDate = toIsoDate(joined);
    const first = normalize(row[0]);

    // Os arquivos de programação usam uma faixa de título por dia. A data dessa
    // faixa passa a valer para as OS logo abaixo até o próximo título diário.
    if (detectedDate && !["OS", "TERMINO SLA", "SLA"].includes(first)) {
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
    const team = cell(row, findIndex(headers, ["EQUIPE"]));
    const asset = cell(row, findIndex(headers, ["ATIVO"]));
    const equipment = cell(row, findIndex(headers, ["EQUIPAMENTO"]));
    const observation = cell(row, findIndex(headers, ["OBSERVAÇÃO", "OBSERVACAO", "OBS.", "OBS"]));
    const id = [currentDate, os, normalize(team || sourceFile)].join("|");

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
  const scheduleSheet =
    workbook.SheetNames.find((name) => normalize(name) === "PROGRAMACAO") ??
    workbook.SheetNames.find((name) => normalize(name).includes("PROGRAMACAO")) ??
    workbook.SheetNames[0];

  if (!scheduleSheet) throw new Error(`Nenhuma aba encontrada em ${file.name}.`);

  const sheet = workbook.Sheets[scheduleSheet];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  return {
    rows: parseScheduleMatrix(matrix, file.name),
    ignoredSheets: workbook.SheetNames.filter((name) => name !== scheduleSheet),
    scheduleSheet,
  };
}

export function mergeSchedules(current: ScheduledMaintenance[], incoming: ScheduledMaintenance[]) {
  const merged = new Map(current.map((row) => [row.id, row]));
  incoming.forEach((row) => merged.set(row.id, row));
  return Array.from(merged.values()).sort((a, b) =>
    a.date.localeCompare(b.date) || a.team.localeCompare(b.team) || a.os.localeCompare(b.os),
  );
}

export function formatDateBr(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return date;
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

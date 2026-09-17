import { classifyPriority } from "@/lib/corretiva/priority-classifier";
import { getLatestCorretivas } from "./corretivas.functions";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const COLORS = {
  white: "FFFFFFFF",
  stripe: "FFF7FAFC",
  text: "FF162231",
  border: "FFDDE5EC",
  borderStrong: "FFB9C7D3",
  navySoft: "FF17324D",
  correctiveBg: "FFFFFFCC",
  correctiveText: "FF162231",
} as const;

const PREVENTIVE_OS_COLORS: Record<string, string> = {
  ELETRICA: "FFCCFFFF",
  CIVIL: "FFD9EAD3",
  CHAVEIRO: "FFEADCF8",
  "CLIMATIZACAO E REFRIGERACAO 1": "FFCCFFFF",
  "CLIMATIZACAO E REFRIGERACAO 2": "FFD9EAD3",
  "CLIMATIZACAO E REFRIGERACAO 3": "FFF4CCCC",
  HIDRAULICA: "FFFCE5CD",
};

const DAY_NAMES = [
  "SEGUNDA-FEIRA",
  "TERÇA-FEIRA",
  "QUARTA-FEIRA",
  "QUINTA-FEIRA",
  "SEXTA-FEIRA",
] as const;

const CCH_TEAM_ORDER = ["CIVIL", "HIDRÁULICA"] as const;

const COL = {
  os: 1,
  nome: 2,
  predio: 3,
  andar: 4,
  espaco: 5,
  atividade: 6,
  sla: 7,
  equipe: 8,
  ativo: 9,
  equipamento: 10,
  prioridade: 11,
} as const;

interface RowSnapshot {
  values: unknown[];
  styles: unknown[];
  height?: number;
}

interface SourceDaySection {
  dayIndex: number;
  band: RowSnapshot;
  bandText: string;
  header: RowSnapshot;
  rows: RowSnapshot[];
}

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toUpperCase();
}

function cloneStyle(style: unknown) {
  return JSON.parse(JSON.stringify(style ?? {}));
}

function captureRow(
  row: import("exceljs").Row,
  maxColumn = COL.equipamento,
): RowSnapshot {
  const values: unknown[] = [];
  const styles: unknown[] = [];
  for (let column = 1; column <= maxColumn; column += 1) {
    const cell = row.getCell(column);
    values.push(cell.value);
    styles.push(cloneStyle(cell.style));
  }
  return { values, styles, height: row.height };
}

function applySnapshot(
  row: import("exceljs").Row,
  snapshot: RowSnapshot,
  maxColumn = COL.equipamento,
) {
  for (let column = 1; column <= maxColumn; column += 1) {
    const cell = row.getCell(column);
    cell.value = snapshot.values[column - 1] as never;
    cell.style = cloneStyle(snapshot.styles[column - 1]) as import("exceljs").Style;
  }
  if (snapshot.height) row.height = snapshot.height;
}

function isDataRow(row: import("exceljs").Row) {
  const activity = normalize(row.getCell(COL.atividade).text);
  return activity === "CORRETIVA" || activity === "PREVENTIVA";
}

function isCorrectiveRow(row: import("exceljs").Row) {
  return normalize(row.getCell(COL.atividade).text) === "CORRETIVA";
}

function isCorrectiveSnapshot(snapshot: RowSnapshot) {
  return normalize(snapshot.values[COL.atividade - 1]) === "CORRETIVA";
}

function snapshotTeam(snapshot: RowSnapshot) {
  return String(snapshot.values[COL.equipe - 1] ?? "").trim();
}

function parseBrDate(value: string): string | undefined {
  const raw = value.trim();
  const match = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return raw || undefined;
  return `${match[3]}-${match[2]}-${match[1]}`;
}

function formatDatePtBr(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("pt-BR");
}

function priorityForRow(row: import("exceljs").Row) {
  return classifyPriority({
    numero_os: row.getCell(COL.os).text,
    nome_os: row.getCell(COL.nome).text,
    predio: row.getCell(COL.predio).text,
    andar: row.getCell(COL.andar).text,
    local: row.getCell(COL.espaco).text,
    equipe: row.getCell(COL.equipe).text,
    data_sla: parseBrDate(row.getCell(COL.sla).text),
  });
}

function visualLineCount(value: string, charsPerLine: number) {
  if (!value.trim()) return 1;
  return value.split(/\r?\n/).reduce(
    (total, part) =>
      total + Math.max(1, Math.ceil(Math.max(1, part.trim().length) / charsPerLine)),
    0,
  );
}

function dataRowHeight(row: import("exceljs").Row) {
  const corrective = isCorrectiveRow(row);
  const lines = Math.max(
    visualLineCount(row.getCell(COL.nome).text, corrective ? 42 : 52),
    visualLineCount(row.getCell(COL.espaco).text, corrective ? 26 : 30),
    visualLineCount(row.getCell(COL.equipamento).text, corrective ? 36 : 42),
    visualLineCount(row.getCell(COL.equipe).text, 24),
    2,
  );

  if (corrective) {
    // Corretivas podem ter descrições extensas. A altura cresce conforme o texto,
    // com margem suficiente para o wrap do Excel não cortar nenhuma palavra.
    return Math.min(420, Math.max(74, 30 + lines * 22));
  }
  return Math.min(170, Math.max(62, 24 + lines * 18));
}

function copyHeaderStyle(
  source: import("exceljs").Cell,
  target: import("exceljs").Cell,
) {
  target.style = cloneStyle(source.style) as import("exceljs").Style;
  target.alignment = {
    ...(target.alignment ?? {}),
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
}

function readSourceDaySections(
  sheet: import("exceljs").Worksheet,
): SourceDaySection[] {
  const sections: SourceDaySection[] = [];
  let band: import("exceljs").Row | undefined;
  let header: import("exceljs").Row | undefined;
  let rows: import("exceljs").Row[] = [];
  let dayIndex = -1;

  const flush = () => {
    if (!band || !header || dayIndex < 0) return;
    sections.push({
      dayIndex,
      band: captureRow(band),
      bandText: band.getCell(1).text,
      header: captureRow(header),
      rows: rows.filter(isDataRow).map((row) => captureRow(row)),
    });
  };

  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (row.number === 1) return;
    const first = row.getCell(1).text.trim();
    const matchedDay = DAY_NAMES.findIndex((day) => first.startsWith(day));
    if (matchedDay >= 0) {
      flush();
      band = row;
      header = undefined;
      rows = [];
      dayIndex = matchedDay;
      return;
    }
    if (!band) return;
    if (!header && normalize(row.getCell(COL.atividade).text) === "ATIVIDADE") {
      header = row;
      return;
    }
    if (header) rows.push(row);
  });

  flush();
  return sections;
}

function rebuildCchProgramSheet(sheet: import("exceljs").Worksheet) {
  if (sheet.name !== "PROGRAMAÇÃO") return;

  const sections = readSourceDaySections(sheet);
  if (sections.length === 0) return;

  const discoveredTeams = new Set(
    sections.flatMap((section) => section.rows.map(snapshotTeam)).filter(Boolean),
  );
  const isCch =
    discoveredTeams.size > 0 &&
    [...discoveredTeams].every((team) =>
      CCH_TEAM_ORDER.includes(team as (typeof CCH_TEAM_ORDER)[number]),
    );
  if (!isCch) return;

  const titleSnapshot = captureRow(sheet.getRow(1));
  const originalViews = sheet.views;
  const originalPageSetup = { ...sheet.pageSetup };
  const originalFooter = sheet.headerFooter.oddFooter;
  const columnWidths = Array.from(
    { length: COL.equipamento },
    (_, index) => sheet.getColumn(index + 1).width,
  );

  const merges = [
    ...(((sheet.model as unknown as { merges?: string[] }).merges ?? [])),
  ];
  merges.forEach((range) => {
    try {
      sheet.unMergeCells(range);
    } catch {
      // Intervalo já desfeito pelo ExcelJS.
    }
  });
  if (sheet.rowCount > 0) sheet.spliceRows(1, sheet.rowCount);

  columnWidths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = originalViews;
  sheet.pageSetup = originalPageSetup;
  sheet.headerFooter.oddFooter = originalFooter;

  sheet.mergeCells(1, 1, 1, COL.equipamento);
  const title = sheet.getCell(1, 1);
  title.value = titleSnapshot.values[0] as never;
  title.style = cloneStyle(titleSnapshot.styles[0]) as import("exceljs").Style;
  if (titleSnapshot.height) sheet.getRow(1).height = titleSnapshot.height;

  let rowIndex = 2;
  for (const team of CCH_TEAM_ORDER) {
    if (!discoveredTeams.has(team)) continue;

    sheet.mergeCells(rowIndex, 1, rowIndex, COL.equipamento);
    const teamCell = sheet.getCell(rowIndex, 1);
    teamCell.value = `EQUIPE • ${team}`;
    teamCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: COLORS.navySoft },
    };
    teamCell.font = {
      name: "Aptos ExtraBold",
      bold: true,
      size: 13,
      color: { argb: COLORS.white },
    };
    teamCell.alignment = {
      vertical: "middle",
      horizontal: "left",
      indent: 1,
    };
    teamCell.border = {
      bottom: { style: "medium", color: { argb: COLORS.borderStrong } },
    };
    sheet.getRow(rowIndex).height = 28;
    rowIndex += 1;

    for (let dayIndex = 0; dayIndex < DAY_NAMES.length; dayIndex += 1) {
      const source = sections.find((section) => section.dayIndex === dayIndex);
      if (!source) continue;

      const teamRows = source.rows.filter((row) => snapshotTeam(row) === team);
      const preventiveRows = teamRows.filter((row) => !isCorrectiveSnapshot(row));
      const correctiveRows = teamRows.filter(isCorrectiveSnapshot).slice(0, 2);
      const orderedRows = [...preventiveRows, ...correctiveRows];
      const bandParts = source.bandText.split(" • ");
      const dayAndDate = bandParts.slice(0, 2).join(" • ");

      sheet.mergeCells(rowIndex, 1, rowIndex, COL.equipamento);
      const bandCell = sheet.getCell(rowIndex, 1);
      bandCell.value = `${dayAndDate} • ${team} • ${orderedRows.length} OS (${correctiveRows.length} CORRETIVAS)`;
      bandCell.style = cloneStyle(source.band.styles[0]) as import("exceljs").Style;
      if (source.band.height) sheet.getRow(rowIndex).height = source.band.height;
      rowIndex += 1;

      applySnapshot(sheet.getRow(rowIndex), source.header);
      rowIndex += 1;

      if (orderedRows.length === 0) {
        sheet.mergeCells(rowIndex, 1, rowIndex, COL.equipamento);
        const empty = sheet.getCell(rowIndex, 1);
        empty.value = `Nenhuma OS de ${team} programada para este dia.`;
        empty.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: COLORS.stripe },
        };
        empty.font = { name: "Aptos", size: 10, color: { argb: COLORS.text } };
        empty.alignment = { vertical: "middle", horizontal: "center" };
        empty.border = {
          top: { style: "thin", color: { argb: COLORS.border } },
          bottom: { style: "thin", color: { argb: COLORS.border } },
        };
        sheet.getRow(rowIndex).height = 34;
        rowIndex += 1;
        continue;
      }

      orderedRows.forEach((snapshot) => {
        applySnapshot(sheet.getRow(rowIndex), snapshot);
        rowIndex += 1;
      });
    }
  }
}

function collectProgramTeams(sheet: import("exceljs").Worksheet): string[] {
  const teams = new Set<string>();
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (!isDataRow(row)) return;
    const team = row.getCell(COL.equipe).text.trim();
    if (team) teams.add(team);
  });
  return [...teams];
}

function shortTeamName(team: string) {
  const normalized = normalize(team);
  if (normalized.startsWith("CLIMATIZACAO E REFRIGERACAO ")) {
    const number = normalized.match(/(\d+)$/)?.[1];
    return number ? `REFRIGERAÇÃO ${number}` : "REFRIGERAÇÃO";
  }
  return team.toUpperCase();
}

function programTeamLabel(teams: string[]) {
  const refrigeracao = teams
    .map((team) => shortTeamName(team))
    .filter((team) => team.startsWith("REFRIGERAÇÃO"));
  if (teams.length === 3 && refrigeracao.length === 3) {
    return "REFRIGERAÇÃO 1 / REFRIGERAÇÃO 2 / REFRIGERAÇÃO 3";
  }
  return teams.map(shortTeamName).join(" / ");
}

function updateProgramTitle(sheet: import("exceljs").Worksheet) {
  if (sheet.name !== "PROGRAMAÇÃO") return;
  const teams = collectProgramTeams(sheet);
  if (teams.length === 0) return;

  const current = sheet.getCell(1, 1).text.trim();
  const suffix = current.match(/SEMANA\s+.*$/i)?.[0] ?? current;
  sheet.getCell(1, 1).value =
    `PROGRAMAÇÃO SEMANAL • ${programTeamLabel(teams)} • ${suffix}`;
}

function extendMergedRowToPriority(
  sheet: import("exceljs").Worksheet,
  rowNumber: number,
) {
  try {
    sheet.unMergeCells(`A${rowNumber}:J${rowNumber}`);
  } catch {
    // Já expandido.
  }
  try {
    sheet.mergeCells(`A${rowNumber}:K${rowNumber}`);
  } catch {
    // Já mesclado.
  }
}

function normalizeDataRowVisual(row: import("exceljs").Row) {
  const base = row.number % 2 === 0 ? COLORS.white : COLORS.stripe;
  for (let column = 1; column <= COL.equipamento; column += 1) {
    const cell = row.getCell(column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: base } };
    cell.font = { ...(cell.font ?? {}), color: { argb: COLORS.text } };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.border } },
      bottom: { style: "thin", color: { argb: COLORS.border } },
      left: { style: "thin", color: { argb: COLORS.border } },
      right: { style: "thin", color: { argb: COLORS.border } },
    };
  }

  if (isCorrectiveRow(row)) {
    for (const column of [COL.os, COL.atividade]) {
      const cell = row.getCell(column);
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: COLORS.correctiveBg },
      };
      cell.font = {
        ...(cell.font ?? {}),
        name: "Aptos ExtraBold",
        bold: true,
        color: { argb: COLORS.correctiveText },
      };
    }
    return;
  }

  const teamKey = normalize(row.getCell(COL.equipe).text);
  const preventiveColor = PREVENTIVE_OS_COLORS[teamKey];
  if (preventiveColor) {
    const osCell = row.getCell(COL.os);
    osCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: preventiveColor },
    };
    osCell.font = {
      ...(osCell.font ?? {}),
      name: "Aptos ExtraBold",
      bold: true,
      color: { argb: COLORS.text },
    };
  }
}

function addDayPageBreaks(sheet: import("exceljs").Worksheet) {
  if (sheet.name !== "PROGRAMAÇÃO") return;
  const dayRows: number[] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const first = row.getCell(1).text.trim();
    if (DAY_NAMES.some((day) => first.startsWith(day))) dayRows.push(row.number);
  });
  (
    sheet as unknown as {
      rowBreaks: Array<{ id: number; min: number; max: number; man: number }>;
    }
  ).rowBreaks = dayRows.slice(1).map((rowNumber) => ({
    id: rowNumber - 1,
    min: 0,
    max: COL.prioridade - 1,
    man: 1,
  }));
}

function prepareSheet(sheet: import("exceljs").Worksheet) {
  const isProgram = sheet.name === "PROGRAMAÇÃO";
  const isTeam = sheet.name.startsWith("IMP ");
  if (!isProgram && !isTeam) return;

  sheet.pageSetup.blackAndWhite = false;
  sheet.pageSetup.fitToPage = true;
  sheet.pageSetup.fitToWidth = 1;
  sheet.pageSetup.fitToHeight = 0;
  sheet.pageSetup.orientation = "landscape";
  sheet.pageSetup.paperSize = 9;
  sheet.pageSetup.margins = {
    left: 0.12,
    right: 0.12,
    top: 0.12,
    bottom: 0.12,
    header: 0.08,
    footer: 0.08,
  };

  sheet.getColumn(COL.os).width = 15;
  sheet.getColumn(COL.nome).width = 72;
  sheet.getColumn(COL.predio).width = 16;
  sheet.getColumn(COL.andar).width = 15;
  sheet.getColumn(COL.espaco).width = 38;
  sheet.getColumn(COL.atividade).width = 16;
  sheet.getColumn(COL.sla).width = 18;
  sheet.getColumn(COL.equipe).width = 30;
  sheet.getColumn(COL.ativo).width = 30;
  sheet.getColumn(COL.equipamento).width = 50;
  sheet.getColumn(COL.prioridade).width = 18;

  extendMergedRowToPriority(sheet, 1);
  let firstHeaderRow = 0;
  let lastDataRow = 1;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    const firstText = row.getCell(1).text.trim();
    const activityText = normalize(row.getCell(COL.atividade).text);

    if (isProgram && DAY_NAMES.some((day) => firstText.startsWith(day))) {
      extendMergedRowToPriority(sheet, row.number);
      return;
    }
    if (firstText.startsWith("EQUIPE • ") || firstText.startsWith("Nenhuma OS")) {
      extendMergedRowToPriority(sheet, row.number);
      return;
    }
    if (activityText === "ATIVIDADE") {
      firstHeaderRow ||= row.number;
      const priorityHeader = row.getCell(COL.prioridade);
      copyHeaderStyle(row.getCell(COL.equipamento), priorityHeader);
      priorityHeader.value = "Prioridade";
      row.height = Math.max(row.height || 0, 30);
      return;
    }
    if (!isDataRow(row)) return;

    lastDataRow = Math.max(lastDataRow, row.number);
    row.height = dataRowHeight(row);
    for (let column = 1; column <= COL.equipamento; column += 1) {
      const cell = row.getCell(column);
      cell.alignment = {
        ...(cell.alignment ?? {}),
        vertical: "middle",
        wrapText: true,
      };
    }

    normalizeDataRowVisual(row);

    const priorityCell = row.getCell(COL.prioridade);
    const base = row.number % 2 === 0 ? COLORS.white : COLORS.stripe;
    priorityCell.value = isCorrectiveRow(row) ? priorityForRow(row).level : null;
    priorityCell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: base },
    };
    priorityCell.font = {
      name: "Aptos SemiBold",
      bold: isCorrectiveRow(row),
      size: 9,
      color: { argb: COLORS.text },
    };
    priorityCell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    priorityCell.border = {
      top: { style: "thin", color: { argb: COLORS.border } },
      bottom: { style: "thin", color: { argb: COLORS.border } },
      left: { style: "thin", color: { argb: COLORS.border } },
      right: { style: "thin", color: { argb: COLORS.border } },
    };
  });

  if (firstHeaderRow) sheet.autoFilter = `A${firstHeaderRow}:K${firstHeaderRow}`;
  sheet.pageSetup.printArea = `A1:K${Math.max(lastDataRow, sheet.rowCount)}`;
  addDayPageBreaks(sheet);
}

async function openingDateMap() {
  const map = new Map<string, string>();
  try {
    const rows = (await getLatestCorretivas()) as Array<{
      numero_os?: unknown;
      id?: unknown;
      data_criacao?: unknown;
    }>;
    rows.forEach((row) => {
      const date = formatDatePtBr(row.data_criacao);
      if (!date) return;
      [row.numero_os, row.id].forEach((key) => {
        const normalized = normalize(key);
        if (normalized) map.set(normalized, date);
      });
    });
  } catch (error) {
    console.warn(
      "[Programacao] Não foi possível atualizar a data de abertura das corretivas:",
      error,
    );
  }
  return map;
}

function applyCorrectiveOpeningDates(
  workbook: import("exceljs").Workbook,
  dates: Map<string, string>,
) {
  if (dates.size === 0) return;
  workbook.worksheets.forEach((sheet) => {
    if (sheet.name !== "PROGRAMAÇÃO" && !sheet.name.startsWith("IMP ")) return;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      if (!isCorrectiveRow(row)) return;
      const date = dates.get(normalize(row.getCell(COL.os).text));
      if (date) row.getCell(COL.sla).value = date;
    });
  });
}

/**
 * Pós-processamento da Programação conforme o modelo operacional:
 * - CCH permanece separado por equipe (Civil SEG→SEX, depois Hidráulica SEG→SEX);
 * - preventiva: somente a célula OS recebe a cor da equipe;
 * - corretiva: somente OS + Atividade recebem amarelo;
 * - linhas permanecem branco/#F7FAFC;
 * - Término SLA da corretiva exibe a data de abertura;
 * - altura de corretivas cresce automaticamente para mostrar a descrição completa.
 */
export async function polishWeeklyProgramacao(blob: Blob): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const [dates] = await Promise.all([openingDateMap()]);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());

  const programSheet = workbook.getWorksheet("PROGRAMAÇÃO");
  if (programSheet) {
    rebuildCchProgramSheet(programSheet);
    updateProgramTitle(programSheet);
  }

  applyCorrectiveOpeningDates(workbook, dates);
  workbook.worksheets.forEach(prepareSheet);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function excelColor(value: unknown, fallback: string) {
  if (!value || typeof value !== "object" || !("argb" in value)) return fallback;
  const argb = String((value as { argb?: string }).argb ?? "");
  return argb.length >= 6 ? `#${argb.slice(-6)}` : fallback;
}

function renderRow(
  row: import("exceljs").Row,
  className: string,
  merged = false,
  firstOverride?: string,
) {
  const cells: string[] = [];
  for (let column = 1; column <= COL.prioridade; column += 1) {
    if (merged && column > 1) continue;
    const cell = row.getCell(column);
    const fill = cell.fill && "fgColor" in cell.fill ? cell.fill.fgColor : undefined;
    const background = excelColor(fill, "#FFFFFF");
    const color = excelColor(cell.font?.color, "#162231");
    const align =
      cell.alignment?.horizontal ??
      ([COL.nome, COL.espaco, COL.equipe, COL.ativo, COL.equipamento].includes(
        column as 2 | 5 | 8 | 9 | 10,
      )
        ? "left"
        : "center");
    const value =
      column === 1 && firstOverride !== undefined ? firstOverride : cell.text;
    cells.push(
      `<td${merged ? ` colspan="${COL.prioridade}"` : ""} style="background:${background};color:${color};text-align:${align};font-weight:${cell.font?.bold ? 800 : 500}">${escapeHtml(value)}</td>`,
    );
  }
  return `<tr class="${className}">${cells.join("")}</tr>`;
}

interface DaySection {
  band: import("exceljs").Row;
  header: import("exceljs").Row;
  rows: import("exceljs").Row[];
}

function readDaySections(sheet: import("exceljs").Worksheet): DaySection[] {
  const days: DaySection[] = [];
  let band: import("exceljs").Row | undefined;
  let header: import("exceljs").Row | undefined;
  let rows: import("exceljs").Row[] = [];

  const flush = () => {
    if (!band || !header) return;
    days.push({ band, header, rows: rows.filter(isDataRow) });
  };

  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (row.number === 1) return;
    const first = row.getCell(1).text.trim();
    if (DAY_NAMES.some((day) => first.startsWith(day))) {
      flush();
      band = row;
      header = undefined;
      rows = [];
      return;
    }
    if (!band) return;
    if (!header && normalize(row.getCell(COL.atividade).text) === "ATIVIDADE") {
      header = row;
      return;
    }
    if (header) rows.push(row);
  });

  flush();
  return days;
}

export async function printWeeklyProgramacaoColor(blob: Blob): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    throw new Error("O navegador bloqueou a janela de impressão.");
  }

  printWindow.opener = null;
  printWindow.document.write(
    "<p style='font-family:Arial;padding:24px'>Preparando impressão por equipe e dia...</p>",
  );

  try {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet = workbook.getWorksheet("PROGRAMAÇÃO");
    if (!sheet) throw new Error("A aba PROGRAMAÇÃO não foi encontrada.");

    const titleRow = sheet.getRow(1);
    const days = readDaySections(sheet);
    const sections = days.map((day, index) => {
      const preventiveCount = day.rows.filter((row) => !isCorrectiveRow(row)).length;
      const correctiveCount = day.rows.filter(isCorrectiveRow).length;
      const team =
        day.rows[0]?.getCell(COL.equipe).text.trim() ||
        day.band.getCell(1).text.split(" • ")[2] ||
        "";
      const bandParts = day.band.getCell(1).text.split(" • ");
      const dayLabel = bandParts.slice(0, 2).join(" • ");
      const bandLabel = `${dayLabel} • ${team} • ${preventiveCount} PREVENTIVAS • ${correctiveCount} CORRETIVAS`;
      return `<section class="day-sheet${index === days.length - 1 ? " last-day" : ""}"><table>
        <thead>
          ${renderRow(titleRow, "title-row", true)}
          ${renderRow(day.band, "day-band", true, bandLabel)}
          ${renderRow(day.header, "column-header")}
        </thead>
        <tbody>${day.rows
          .map((row) =>
            renderRow(
              row,
              `data-row ${isCorrectiveRow(row) ? "corrective-row" : "preventive-row"}`,
            ),
          )
          .join("")}</tbody>
      </table></section>`;
    });

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Programação semanal</title><style>
      @page { size: A4 landscape; margin: 3mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      html, body { margin: 0; background: #fff; font-family: Aptos, Arial, sans-serif; color: #162231; }
      .day-sheet { break-before: page; page-break-before: always; break-after: page; page-break-after: always; }
      .day-sheet:first-child { break-before: auto; page-break-before: auto; }
      .day-sheet.last-day { break-after: auto; page-break-after: auto; }
      table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      thead { display: table-header-group; }
      tbody { display: table-row-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      td { border: 1px solid #DDE5EC; padding: 4.2px; font-size: 7.5pt; line-height: 1.18; vertical-align: middle; overflow-wrap: anywhere; white-space: normal; }
      .title-row td { padding: 5px; font-size: 12pt; }
      .day-band td { padding: 4px; font-size: 9pt; }
      .column-header td { padding: 3.5px; font-size: 7.4pt; }
      .data-row td:nth-child(2) { font-size: 8.2pt; line-height: 1.22; }
      td:nth-child(1){width:6%} td:nth-child(2){width:25%} td:nth-child(3){width:7%} td:nth-child(4){width:6%}
      td:nth-child(5){width:11%} td:nth-child(6){width:7%} td:nth-child(7){width:7%} td:nth-child(8){width:9%}
      td:nth-child(9){width:7%} td:nth-child(10){width:8%} td:nth-child(11){width:7%}
      @media print {
        .day-sheet { break-before: page !important; page-break-before: always !important; break-after: page !important; page-break-after: always !important; }
        .day-sheet:first-child { break-before: auto !important; page-break-before: auto !important; }
        .day-sheet.last-day { break-after: auto !important; page-break-after: auto !important; }
      }
    </style></head><body>${sections.join("")}</body></html>`;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    await printWindow.document.fonts?.ready;
    printWindow.focus();
    printWindow.setTimeout(() => printWindow.print(), 250);
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

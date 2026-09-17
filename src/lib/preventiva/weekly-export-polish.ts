const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const COLORS = {
  white: "FFFFFFFF",
  stripe: "FFF7FAFC",
  text: "FF162231",
  border: "FFDDE5EC",
  borderStrong: "FFB9C7D3",
  navy: "FF0B1F33",
  navySoft: "FF17324D",
  teal: "FF0F6B78",
  correctiveBg: "FFFFE4E6",
  correctiveText: "FFB42318",
  correctiveBorder: "FFFDA4AF",
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
const REFRIG_TEAM_ORDER = [
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 1",
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 2",
  "CLIMATIZAÇÃO E REFRIGERAÇÃO 3",
] as const;
const ELECTRICAL_TEAM = "ELÉTRICA" as const;

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

interface DaySection {
  band: import("exceljs").Row;
  header: import("exceljs").Row;
  rows: import("exceljs").Row[];
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

function visualLineCount(value: string, charsPerLine: number) {
  if (!value.trim()) return 1;
  return value.split(/\r?\n/).reduce(
    (total, part) =>
      total + Math.max(1, Math.ceil(Math.max(1, part.trim().length) / charsPerLine)),
    0,
  );
}

function contentRowHeight(row: import("exceljs").Row) {
  const corrective = isCorrectiveRow(row);
  const lines = Math.max(
    visualLineCount(row.getCell(COL.nome).text, 58),
    visualLineCount(row.getCell(COL.espaco).text, 34),
    visualLineCount(row.getCell(COL.equipamento).text, 46),
    visualLineCount(row.getCell(COL.equipe).text, 28),
    2,
  );
  const calculated = (corrective ? 28 : 24) + lines * (corrective ? 17 : 15);
  return Math.min(corrective ? 120 : 104, Math.max(corrective ? 60 : 56, calculated));
}

function idealDailyRowHeight(rowCount: number) {
  if (rowCount <= 0) return 0;
  return Math.max(52, Math.min(92, 930 / rowCount));
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
  return sections.sort((a, b) => a.dayIndex - b.dayIndex);
}

function canonicalKnownTeam(value: string): string | undefined {
  const normalized = normalize(value);
  const known = [...CCH_TEAM_ORDER, ...REFRIG_TEAM_ORDER, ELECTRICAL_TEAM];
  return known.find((team) => normalize(team) === normalized);
}

function summaryTeams(workbook: import("exceljs").Workbook) {
  const summary = workbook.getWorksheet("RESUMO");
  if (!summary) return [];
  const teams = new Set<string>();
  summary.eachRow({ includeEmpty: false }, (row) => {
    const team = canonicalKnownTeam(row.getCell(1).text.trim());
    if (team) teams.add(team);
  });
  return [...teams];
}

function resolveTeamOrder(
  workbook: import("exceljs").Workbook,
  sections: SourceDaySection[],
): string[] | undefined {
  const teams = new Set<string>(summaryTeams(workbook));
  sections.forEach((section) =>
    section.rows.forEach((row) => {
      const team = canonicalKnownTeam(snapshotTeam(row));
      if (team) teams.add(team);
    }),
  );

  if ([...teams].some((team) => REFRIG_TEAM_ORDER.includes(team as never))) {
    return [...REFRIG_TEAM_ORDER];
  }
  if (
    teams.size > 0 &&
    [...teams].every((team) => CCH_TEAM_ORDER.includes(team as never))
  ) {
    return [...CCH_TEAM_ORDER];
  }
  if (teams.has(ELECTRICAL_TEAM) && teams.size === 1) return [ELECTRICAL_TEAM];
  return teams.size === 1 ? [...teams] : undefined;
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
  const refrigeration = teams.filter((team) =>
    normalize(team).startsWith("CLIMATIZACAO E REFRIGERACAO "),
  );
  if (refrigeration.length > 0) return "REFRIGERAÇÃO 1 / REFRIGERAÇÃO 2 / REFRIGERAÇÃO 3";
  return teams.map(shortTeamName).join(" / ");
}

function unmergeAll(sheet: import("exceljs").Worksheet) {
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
}

function rebuildProgramSheetByTeam(
  workbook: import("exceljs").Workbook,
  sheet: import("exceljs").Worksheet,
) {
  if (sheet.name !== "PROGRAMAÇÃO") return;
  const sections = readSourceDaySections(sheet);
  if (sections.length === 0) return;

  const teamOrder = resolveTeamOrder(workbook, sections);
  if (!teamOrder?.length) return;

  const titleSnapshot = captureRow(sheet.getRow(1));
  const currentTitle = String(titleSnapshot.values[0] ?? "").trim();
  const titleSuffix = currentTitle.match(/SEMANA\s+.*$/i)?.[0] ?? currentTitle;
  const originalViews = sheet.views;
  const originalPageSetup = { ...sheet.pageSetup };
  const originalFooter = sheet.headerFooter.oddFooter;
  const columnWidths = Array.from(
    { length: COL.equipamento },
    (_, index) => sheet.getColumn(index + 1).width,
  );

  unmergeAll(sheet);
  if (sheet.rowCount > 0) sheet.spliceRows(1, sheet.rowCount);

  columnWidths.forEach((width, index) => {
    sheet.getColumn(index + 1).width = width;
  });
  sheet.views = originalViews;
  sheet.pageSetup = originalPageSetup;
  sheet.headerFooter.oddFooter = originalFooter;

  sheet.mergeCells(1, 1, 1, COL.equipamento);
  const title = sheet.getCell(1, 1);
  title.value = `PROGRAMAÇÃO SEMANAL • ${programTeamLabel(teamOrder)} • ${titleSuffix}`;
  title.style = cloneStyle(titleSnapshot.styles[0]) as import("exceljs").Style;
  title.font = {
    ...(title.font ?? {}),
    name: "Aptos ExtraBold",
    bold: true,
    size: 23,
    color: { argb: COLORS.white },
  };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  title.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  sheet.getRow(1).height = 48;

  let rowIndex = 2;
  for (const team of teamOrder) {
    for (const source of sections) {
      const teamRows = source.rows.filter(
        (row) => normalize(snapshotTeam(row)) === normalize(team),
      );
      const preventiveRows = teamRows.filter((row) => !isCorrectiveSnapshot(row));
      const correctiveRows = teamRows.filter(isCorrectiveSnapshot);
      const orderedRows = [...preventiveRows, ...correctiveRows];
      const bandParts = source.bandText.split(" • ");
      const dayAndDate = bandParts.slice(0, 2).join(" • ");

      sheet.mergeCells(rowIndex, 1, rowIndex, COL.equipamento);
      const bandCell = sheet.getCell(rowIndex, 1);
      bandCell.value = `${dayAndDate} • ${shortTeamName(team)} • ${orderedRows.length} OS (${correctiveRows.length} CORRETIVAS)`;
      bandCell.style = cloneStyle(source.band.styles[0]) as import("exceljs").Style;
      bandCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.teal } };
      bandCell.font = {
        ...(bandCell.font ?? {}),
        name: "Aptos ExtraBold",
        bold: true,
        size: 12.5,
        color: { argb: COLORS.white },
      };
      bandCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      sheet.getRow(rowIndex).height = 32;
      rowIndex += 1;

      const header = sheet.getRow(rowIndex);
      applySnapshot(header, source.header);
      for (let column = 1; column <= COL.equipamento; column += 1) {
        const cell = header.getCell(column);
        cell.font = {
          ...(cell.font ?? {}),
          name: "Aptos ExtraBold",
          bold: true,
          size: 10,
          color: { argb: COLORS.white },
        };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navySoft } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      }
      header.height = 35;
      rowIndex += 1;

      if (orderedRows.length === 0) {
        sheet.mergeCells(rowIndex, 1, rowIndex, COL.equipamento);
        const empty = sheet.getCell(rowIndex, 1);
        empty.value = `Nenhuma OS de ${shortTeamName(team)} programada para este dia.`;
        empty.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.stripe } };
        empty.font = { name: "Aptos SemiBold", bold: true, size: 12, color: { argb: COLORS.text } };
        empty.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        empty.border = {
          top: { style: "thin", color: { argb: COLORS.border } },
          bottom: { style: "thin", color: { argb: COLORS.border } },
        };
        sheet.getRow(rowIndex).height = 120;
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

function normalizeDataRowVisual(row: import("exceljs").Row) {
  const base = row.number % 2 === 0 ? COLORS.white : COLORS.stripe;
  for (let column = 1; column <= COL.equipamento; column += 1) {
    const cell = row.getCell(column);
    const currentSize = Number(cell.font?.size ?? 10);
    const minimumSize = [COL.nome, COL.espaco, COL.equipamento].includes(column as 2 | 5 | 10)
      ? 11
      : 10;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: base } };
    cell.font = {
      ...(cell.font ?? {}),
      size: Math.max(currentSize, minimumSize),
      color: { argb: COLORS.text },
    };
    cell.alignment = {
      ...(cell.alignment ?? {}),
      vertical: "middle",
      wrapText: true,
    };
    cell.border = {
      top: { style: "thin", color: { argb: COLORS.border } },
      bottom: { style: "thin", color: { argb: COLORS.border } },
      left: { style: "thin", color: { argb: COLORS.border } },
      right: { style: "thin", color: { argb: COLORS.border } },
    };
  }

  // Excel trabalha em pontos: 120 pt equivalem a aproximadamente 160 px em 96 DPI.
  row.height = 120;

  const osCell = row.getCell(COL.os);
  osCell.font = {
    ...(osCell.font ?? {}),
    size: 18,
  };

  const nomeCell = row.getCell(COL.nome);
  nomeCell.font = {
    ...(nomeCell.font ?? {}),
    size: 28,
  };

  const ativoCell = row.getCell(COL.ativo);
  ativoCell.font = {
    ...(ativoCell.font ?? {}),
    size: 16,
  };

  for (const column of [COL.espaco, COL.ativo, COL.equipamento]) {
    const cell = row.getCell(column);
    cell.alignment = {
      ...(cell.alignment ?? {}),
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  }

  // A data de Término SLA permanece sempre neutra. Nenhum destaque amarelo/vermelho
  // deve alcançar a coluna de data.
  row.getCell(COL.sla).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: base },
  };

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
      cell.border = {
        top: { style: "thin", color: { argb: COLORS.correctiveBorder } },
        bottom: { style: "thin", color: { argb: COLORS.correctiveBorder } },
        left: { style: "thin", color: { argb: COLORS.correctiveBorder } },
        right: { style: "thin", color: { argb: COLORS.correctiveBorder } },
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
    max: COL.equipamento - 1,
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
  sheet.pageSetup.printTitlesRow = "1:1";
  sheet.pageSetup.margins = {
    left: 0.12,
    right: 0.12,
    top: 0.16,
    bottom: 0.16,
    header: 0.08,
    footer: 0.08,
  };

  // A:J somente. As larguras foram equilibradas para aproveitar A4 paisagem
  // sem sacrificar o wrap das descrições.
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
  sheet.getColumn(11).hidden = true;
  sheet.getColumn(11).width = 0;

  let firstHeaderRow = 0;
  let lastUsedRow = 1;

  sheet.eachRow({ includeEmpty: false }, (row) => {
    lastUsedRow = Math.max(lastUsedRow, row.number);
    const firstText = row.getCell(1).text.trim();
    const activityText = normalize(row.getCell(COL.atividade).text);

    if (isProgram && DAY_NAMES.some((day) => firstText.startsWith(day))) {
      row.height = Math.max(row.height || 0, 32);
      const cell = row.getCell(1);
      cell.font = {
        ...(cell.font ?? {}),
        name: "Aptos ExtraBold",
        bold: true,
        size: 12.5,
        color: { argb: COLORS.white },
      };
      return;
    }

    if (activityText === "ATIVIDADE") {
      firstHeaderRow ||= row.number;
      row.height = Math.max(row.height || 0, 35);
      for (let column = 1; column <= COL.equipamento; column += 1) {
        const cell = row.getCell(column);
        cell.font = {
          ...(cell.font ?? {}),
          name: "Aptos ExtraBold",
          bold: true,
          size: 10,
          color: { argb: COLORS.white },
        };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      }
      return;
    }

    if (!isDataRow(row)) return;
    normalizeDataRowVisual(row);
  });

  if (isProgram) {
    readDaySections(sheet).forEach((section) => {
      const ideal = idealDailyRowHeight(section.rows.length);
      section.rows.forEach((row) => {
        row.height = Math.max(contentRowHeight(row), ideal);
        row.height = 120;
      });
    });
  }

  if (firstHeaderRow) sheet.autoFilter = `A${firstHeaderRow}:J${firstHeaderRow}`;
  sheet.pageSetup.printArea = `A1:J${Math.max(lastUsedRow, sheet.rowCount)}`;
  addDayPageBreaks(sheet);
}

/**
 * Pós-processamento operacional da Programação:
 * - somente A:J (sem coluna K/Prioridade);
 * - CCH: Civil SEG→SEX e Hidráulica SEG→SEX;
 * - Refrigeração: equipe 1 SEG→SEX, depois equipe 2 SEG→SEX e equipe 3 SEG→SEX;
 * - cada equipe/dia vira uma página de impressão independente;
 * - corretivas recebem vermelho apenas em OS + Atividade;
 * - Término SLA preserva a data original e permanece com fundo neutro;
 * - altura e tipografia são ajustadas para aproveitar melhor a folha A4 paisagem.
 */
export async function polishWeeklyProgramacao(blob: Blob): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());

  const programSheet = workbook.getWorksheet("PROGRAMAÇÃO");
  if (programSheet) rebuildProgramSheetByTeam(workbook, programSheet);

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
  for (let column = 1; column <= COL.equipamento; column += 1) {
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
      `<td${merged ? ` colspan="${COL.equipamento}"` : ""} style="background:${background};color:${color};text-align:${align};font-weight:${cell.font?.bold ? 800 : 500}">${escapeHtml(value)}</td>`,
    );
  }
  return `<tr class="${className}">${cells.join("")}</tr>`;
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
      const bandParts = day.band.getCell(1).text.split(" • ");
      const dayLabel = bandParts.slice(0, 2).join(" • ");
      const team = bandParts[2]?.trim() || day.rows[0]?.getCell(COL.equipe).text.trim() || "";
      const bandLabel = `${dayLabel} • ${team} • ${preventiveCount} PREVENTIVAS • ${correctiveCount} CORRETIVAS`;
      const rowCount = Math.max(day.rows.length, 1);
      const bodyFont = rowCount >= 18 ? 7.9 : rowCount >= 15 ? 8.25 : 8.65;
      const body = day.rows.length
        ? day.rows
            .map((row) =>
              renderRow(
                row,
                `data-row ${isCorrectiveRow(row) ? "corrective-row" : "preventive-row"}`,
              ),
            )
            .join("")
        : `<tr class="empty-row"><td colspan="${COL.equipamento}">Nenhuma OS programada para ${escapeHtml(team)} neste dia.</td></tr>`;

      return `<section class="day-sheet${index === days.length - 1 ? " last-day" : ""}" style="--row-count:${rowCount};--body-font:${bodyFont}pt"><table>
        <thead>
          ${renderRow(titleRow, "title-row", true)}
          ${renderRow(day.band, "day-band", true, bandLabel)}
          ${renderRow(day.header, "column-header")}
        </thead>
        <tbody>${body}</tbody>
      </table></section>`;
    });

    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Programação semanal</title><style>
      @page { size: A4 landscape; margin: 3mm; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
      html, body { margin: 0; background: #fff; font-family: Aptos, Arial, sans-serif; color: #162231; }
      .day-sheet { height: 203mm; break-before: page; page-break-before: always; break-after: page; page-break-after: always; }
      .day-sheet:first-child { break-before: auto; page-break-before: auto; }
      .day-sheet.last-day { break-after: auto; page-break-after: auto; }
      table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
      thead { display: table-header-group; }
      tbody { display: table-row-group; }
      tr { break-inside: avoid; page-break-inside: avoid; }
      td { border: 1px solid #DDE5EC; padding: 4px 4.5px; font-size: var(--body-font); line-height: 1.16; vertical-align: middle; overflow-wrap: anywhere; white-space: normal; }
      .title-row { height: 13mm; }
      .title-row td { padding: 5px; font-size: 13.5pt; }
      .day-band { height: 9mm; }
      .day-band td { padding: 4px 6px; font-size: 10pt; }
      .column-header { height: 9mm; }
      .column-header td { padding: 3.5px; font-size: 8.1pt; }
      tbody tr { height: calc(170mm / var(--row-count)); }
      .data-row td:nth-child(2), .data-row td:nth-child(5), .data-row td:nth-child(10) { font-size: calc(var(--body-font) + .45pt); line-height: 1.19; }
      .empty-row td { text-align: center; font-size: 12pt; font-weight: 700; background: #F7FAFC; }
      td:nth-child(1){width:6%} td:nth-child(2){width:27%} td:nth-child(3){width:7%} td:nth-child(4){width:6%}
      td:nth-child(5){width:12%} td:nth-child(6){width:7%} td:nth-child(7){width:7%} td:nth-child(8){width:10%}
      td:nth-child(9){width:8%} td:nth-child(10){width:10%}
      @media print {
        .day-sheet { height: 203mm !important; break-before: page !important; page-break-before: always !important; break-after: page !important; page-break-after: always !important; }
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

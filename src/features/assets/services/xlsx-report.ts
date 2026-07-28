// Estilo corporativo PCM para as abas adicionais geradas pelo sistema.
//
// Nenhuma função deste arquivo altera as abas originais da planilha do usuário:
// elas apenas criam/formatam abas novas (Resumo, Não Encontrados, Base).

export const NAVY = "FF0B1B3A"; // azul-marinho profundo
export const ELECTRIC = "FF1D4ED8"; // azul elétrico
export const ZEBRA = "FFF3F6FB";
export const GRID = "FFC3CEDF";
export const TEXT_LIGHT = "FFFFFFFF";

export const FONT = "Calibri";

const thin = { style: "thin" as const, color: { argb: GRID } };
export const THIN_BORDER = { top: thin, left: thin, bottom: thin, right: thin };

export const DATE_FMT = "dd/mm/yyyy hh:mm";

export interface ColumnSpec {
  header: string;
  width?: number;
  /** Força o valor como texto (preserva zeros à esquerda). */
  text?: boolean;
  numFmt?: string;
  wrap?: boolean;
}

/** Cabeçalho corporativo (faixa azul-marinho) ocupando `span` colunas. */
export function addCorporateHeader(ws: any, title: string, subtitle: string, span: number) {
  ws.mergeCells(1, 1, 1, Math.max(span, 1));
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, size: 16, bold: true, color: { argb: TEXT_LIGHT } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 30;

  ws.mergeCells(2, 1, 2, Math.max(span, 1));
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: FONT, size: 10, color: { argb: TEXT_LIGHT } };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 18;

  ws.getRow(3).height = 6;
}

/** Escreve o cabeçalho da tabela na linha `row` e devolve a próxima linha. */
export function writeTableHeader(ws: any, row: number, cols: ColumnSpec[]) {
  const r = ws.getRow(row);
  cols.forEach((c, i) => {
    const cell = r.getCell(i + 1);
    cell.value = c.header;
    cell.font = { name: FONT, size: 11, bold: true, color: { argb: TEXT_LIGHT } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ELECTRIC } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = THIN_BORDER;
  });
  r.height = 22;
  r.commit?.();
  return row + 1;
}

/** Escreve as linhas de dados com zebra discreta, bordas e formatos. */
export function writeTableRows(ws: any, startRow: number, cols: ColumnSpec[], data: unknown[][]) {
  data.forEach((values, i) => {
    const r = ws.getRow(startRow + i);
    cols.forEach((c, j) => {
      const cell = r.getCell(j + 1);
      const v = values[j];
      if (c.text) {
        cell.value = v == null ? "" : String(v);
        cell.numFmt = "@";
      } else {
        cell.value = (v as any) ?? "";
        if (c.numFmt) cell.numFmt = c.numFmt;
      }
      cell.font = { name: FONT, size: 10 };
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: "middle", wrapText: !!c.wrap };
      if (i % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } };
      }
    });
    r.commit?.();
  });
  return startRow + data.length;
}

/** Larguras com limites (mín. 10 / máx. 52) calculadas pelo conteúdo. */
export function autoFitColumns(ws: any, cols: ColumnSpec[], data: unknown[][]) {
  cols.forEach((c, j) => {
    if (c.width) {
      ws.getColumn(j + 1).width = c.width;
      return;
    }
    let max = c.header.length;
    for (const row of data) {
      const len = String(row[j] ?? "").length;
      if (len > max) max = len;
      if (max > 60) break;
    }
    ws.getColumn(j + 1).width = Math.min(Math.max(max + 4, 10), 52);
  });
}

/** Autofiltro + congelamento do cabeçalho da tabela. */
export function finishTable(ws: any, headerRow: number, colCount: number, lastRow: number) {
  ws.autoFilter = {
    from: { row: headerRow, column: 1 },
    to: { row: Math.max(lastRow, headerRow), column: Math.max(colCount, 1) },
  };
  ws.views = [{ state: "frozen", ySplit: headerRow }];
}

/* -------------------------------------------------------------------------- */
/* Formatação condicional de "Status do Match"                                 */
/* -------------------------------------------------------------------------- */

export const STATUS_COLORS: { match: string[]; bg: string; fg: string }[] = [
  { match: ["Hierarquia", "Correspondência exata"], bg: "FFDCFCE7", fg: "FF14532D" }, // verde
  { match: ["Valor preservado"], bg: "FFDBEAFE", fg: "FF1E3A8A" }, // azul
  { match: ["Legado"], bg: "FFFEF3C7", fg: "FF78350F" }, // amarelo
  { match: ["Não encontrado", "Conflito"], bg: "FFFEE2E2", fg: "FF7F1D1D" }, // vermelho
  { match: ["Correção manual"], bg: "FFEDE9FE", fg: "FF4C1D95" }, // violeta
];

function colLetter(index1: number) {
  let n = index1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Aplica formatação condicional por texto exato na coluna informada. */
export function applyStatusConditionalFormatting(
  ws: any,
  columnIndex1: number,
  firstRow: number,
  lastRow: number,
) {
  if (lastRow < firstRow || columnIndex1 < 1) return;
  const L = colLetter(columnIndex1);
  const ref = `${L}${firstRow}:${L}${lastRow}`;
  const rules: any[] = [];
  for (const group of STATUS_COLORS) {
    for (const text of group.match) {
      rules.push({
        type: "containsText",
        operator: "containsText",
        text,
        priority: rules.length + 1,
        style: {
          font: { name: FONT, size: 10, bold: true, color: { argb: group.fg } },
          fill: { type: "pattern", pattern: "solid", bgColor: { argb: group.bg } },
        },
      });
    }
  }
  ws.addConditionalFormatting({ ref, rules });
}

export { colLetter };

import ExcelJS from "exceljs";

export type MaterialCompraRow = {
  created_at?: string | null;
  origem?: "refrigeracao" | "corretiva" | string | null;
  os_id?: string | null;
  descricao?: string | null;
  quantidade?: number | null;
};

export type MaterialOsRow = {
  numero_os?: string | null;
  equipe?: string | null;
  predio?: string | null;
  andar?: string | null;
  local?: string | null;
  solicitante?: string | null;
};

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const C = {
  navy: argb("#071522"),
  navy2: argb("#10263A"),
  slate: argb("#334155"),
  muted: argb("#64748B"),
  border: argb("#E2E8F0"),
  surface: argb("#F8FAFC"),
  white: argb("#FFFFFF"),
  ink: argb("#0F172A"),
  emerald: argb("#059669"),
  emeraldSoft: argb("#ECFDF5"),
  sky: argb("#0284C7"),
  skySoft: argb("#E0F2FE"),
  orange: argb("#EA580C"),
  orangeSoft: argb("#FFF7ED"),
  amber: argb("#D97706"),
  amberSoft: argb("#FFFBEB"),
  violet: argb("#7C3AED"),
  violetSoft: argb("#F5F3FF"),
};

const thinBorder = { style: "thin", color: { argb: C.border } } as const;

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("pt-BR");
}

function originLabel(value: string | null | undefined) {
  return value === "refrigeracao" ? "Refrigeração" : "Corretiva";
}

function locationLabel(os: MaterialOsRow | undefined) {
  return [os?.predio, os?.andar, os?.local].filter(Boolean).join(" · ") || "—";
}

function styleTitle(sheet: ExcelJS.Worksheet, title: string, subtitle: string, lastColumn: string) {
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.mergeCells(`A3:${lastColumn}3`);

  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.font = { name: "Aptos Display", size: 22, bold: true, color: { argb: C.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleCell.border = { bottom: { style: "medium", color: { argb: C.emerald } } };

  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: argb("#D7E5F3") } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy2 } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 };

  const metaCell = sheet.getCell("A3");
  metaCell.value = `Gerado em ${new Date().toLocaleString("pt-BR")} · Central Unificada de Materiais`;
  metaCell.font = { name: "Aptos", size: 9, italic: true, color: { argb: C.muted } };
  metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.surface } };
  metaCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  sheet.getRow(1).height = 40;
  sheet.getRow(2).height = 24;
  sheet.getRow(3).height = 21;
}

function styleKpi(sheet: ExcelJS.Worksheet, range: string, value: number, label: string, fill: string, color: string) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = `${value}\n${label}`;
  cell.font = { name: "Aptos Display", size: 15, bold: true, color: { argb: color } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = { top: thinBorder, right: thinBorder, bottom: thinBorder, left: thinBorder };
}

function buildSummary(workbook: ExcelJS.Workbook, items: MaterialCompraRow[], osById: Map<string, MaterialOsRow>) {
  const sheet = workbook.addWorksheet("Resumo de Compras", { views: [{ showGridLines: false }] });
  sheet.properties.tabColor = { argb: C.emerald };
  sheet.columns = Array.from({ length: 8 }, () => ({ width: 15 }));

  styleTitle(sheet, "CENTRAL UNIFICADA DE MATERIAIS", "Resumo executivo das solicitações para compra", "H");

  const totalQtd = items.reduce((sum, item) => sum + Number(item.quantidade || 1), 0);
  const refrig = items.filter((item) => item.origem === "refrigeracao").length;
  const corretiva = items.filter((item) => item.origem !== "refrigeracao").length;
  const equipes = new Set(items.map((item) => osById.get(String(item.os_id))?.equipe).filter(Boolean)).size;

  styleKpi(sheet, "A5:B7", items.length, "SOLICITAÇÕES", C.emeraldSoft, C.emerald);
  styleKpi(sheet, "C5:D7", totalQtd, "ITENS / UNIDADES", C.amberSoft, C.amber);
  styleKpi(sheet, "E5:F7", refrig, "REFRIGERAÇÃO", C.skySoft, C.sky);
  styleKpi(sheet, "G5:H7", corretiva, "CORRETIVA", C.orangeSoft, C.orange);

  sheet.mergeCells("A9:H9");
  const band = sheet.getCell("A9");
  band.value = "DISTRIBUIÇÃO OPERACIONAL";
  band.font = { name: "Aptos", size: 10, bold: true, color: { argb: C.white } };
  band.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate } };
  band.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  const teamCounts = new Map<string, number>();
  for (const item of items) {
    const team = osById.get(String(item.os_id))?.equipe || "Sem equipe";
    teamCounts.set(team, (teamCounts.get(team) || 0) + 1);
  }

  sheet.getCell("A10").value = "Equipe";
  sheet.getCell("E10").value = "Solicitações";
  sheet.mergeCells("A10:D10");
  sheet.mergeCells("E10:H10");
  [sheet.getCell("A10"), sheet.getCell("E10")].forEach((cell) => {
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: C.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy2 } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  let row = 11;
  [...teamCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([team, count]) => {
    sheet.mergeCells(`A${row}:D${row}`);
    sheet.mergeCells(`E${row}:H${row}`);
    sheet.getCell(`A${row}`).value = team;
    sheet.getCell(`E${row}`).value = count;
    [sheet.getCell(`A${row}`), sheet.getCell(`E${row}`)].forEach((cell) => {
      cell.font = { name: "Aptos", size: 9.5, bold: true, color: { argb: C.ink } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row % 2 ? C.white : C.surface } };
      cell.alignment = { vertical: "middle", horizontal: cell.address.startsWith("E") ? "center" : "left", indent: 1 };
      cell.border = { bottom: thinBorder, left: thinBorder, right: thinBorder };
    });
    row += 1;
  });

  sheet.mergeCells(`A${row + 1}:H${row + 2}`);
  const note = sheet.getCell(`A${row + 1}`);
  note.value = `${equipes} equipe(s) com solicitações ativas neste arquivo. O relatório respeita exatamente os filtros aplicados na tela no momento da exportação.`;
  note.font = { name: "Aptos", size: 9, italic: true, color: { argb: C.muted } };
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.violetSoft } };
  note.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  note.border = { top: thinBorder, right: thinBorder, bottom: thinBorder, left: thinBorder };

  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    paperSize: 9,
    horizontalCentered: true,
    margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter.oddFooter = "&L&9Apont Auto · Materiais&C&9Resumo de Compras&R&9Página &P de &N";
}

function buildPurchases(workbook: ExcelJS.Workbook, items: MaterialCompraRow[], osById: Map<string, MaterialOsRow>) {
  const sheet = workbook.addWorksheet("Compras", { views: [{ state: "frozen", ySplit: 5, showGridLines: false }] });
  sheet.properties.tabColor = { argb: C.emerald };
  sheet.columns = [
    { width: 20 }, { width: 16 }, { width: 14 }, { width: 48 },
    { width: 10 }, { width: 22 }, { width: 36 }, { width: 24 },
  ];

  styleTitle(sheet, "EXPORTAÇÃO DE COMPRAS", "Solicitações consolidadas de Corretiva e Refrigeração", "H");

  const headers = ["Data", "Origem", "OS", "Descrição da peça / material", "Qtd", "Equipe", "Localização", "Solicitante"];
  const headerRow = sheet.getRow(5);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: C.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index === 1 ? C.emerald : C.navy2 } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: thinBorder, right: thinBorder, bottom: { style: "medium", color: { argb: C.emerald } }, left: thinBorder };
  });
  headerRow.height = 30;

  items.forEach((item, index) => {
    const os = osById.get(String(item.os_id));
    const row = sheet.getRow(6 + index);
    row.values = [
      formatDate(item.created_at),
      originLabel(item.origem),
      os?.numero_os || "—",
      item.descricao || "—",
      Number(item.quantidade || 1),
      os?.equipe || "—",
      locationLabel(os),
      os?.solicitante || "—",
    ];
    row.height = 30;

    row.eachCell((cell) => {
      cell.font = { name: "Aptos", size: 9.5, color: { argb: C.ink } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? C.surface : C.white } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = { bottom: thinBorder, left: thinBorder, right: thinBorder };
    });

    const originCell = row.getCell(2);
    const refrigeracao = item.origem === "refrigeracao";
    originCell.font = { name: "Aptos", size: 9.5, bold: true, color: { argb: refrigeracao ? C.sky : C.orange } };
    originCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: refrigeracao ? C.skySoft : C.orangeSoft } };
    originCell.alignment = { vertical: "middle", horizontal: "center" };

    const osCell = row.getCell(3);
    osCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: C.violet } };
    osCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.violetSoft } };
    osCell.alignment = { vertical: "middle", horizontal: "center" };

    const qtyCell = row.getCell(5);
    qtyCell.font = { name: "Aptos Display", size: 11, bold: true, color: { argb: C.emerald } };
    qtyCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.emeraldSoft } };
    qtyCell.alignment = { vertical: "middle", horizontal: "center" };
  });

  const lastRow = Math.max(5, 5 + items.length);
  sheet.autoFilter = { from: { row: 5, column: 1 }, to: { row: lastRow, column: 8 } };
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    horizontalCentered: true,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printArea: `A1:H${lastRow}`,
    printTitlesRow: "1:5",
  };
  sheet.headerFooter.oddFooter = "&L&9Apont Auto · Central de Materiais&C&9Compras&R&9Página &P de &N";
}

export function buildComprasPremiumWorkbook(items: MaterialCompraRow[], osById: Map<string, MaterialOsRow>) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Apont Auto";
  workbook.company = "Apont Auto";
  workbook.title = "Central Unificada de Materiais · Exportação de Compras";
  workbook.subject = "Solicitações consolidadas para compras";
  workbook.created = new Date();
  workbook.modified = new Date();

  buildSummary(workbook, items, osById);
  buildPurchases(workbook, items, osById);
  return workbook;
}

export async function exportComprasPremiumExcel(items: MaterialCompraRow[], osById: Map<string, MaterialOsRow>) {
  const workbook = buildComprasPremiumWorkbook(items, osById);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Central_Materiais_Compras_Premium_${new Date().toISOString().split("T")[0]}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

import ExcelJS from "exceljs";

export type MaterialCompraRow = {
  id?: string | null;
  created_at?: string | null;
  material_request_date?: string | null;
  origem?: "refrigeracao" | "corretiva" | string | null;
  os_id?: string | null;
  descricao?: string | null;
  quantidade?: number | null;
  centro_custo?: string | null;
  modelo?: string | null;
  urgencia?: string | null;
  observacao?: string | null;
  status_gestor?: string | null;
  material_status?: string | null;
};

export type MaterialOsRow = {
  numero_os?: string | null;
  nome_os?: string | null;
  ativo?: string | null;
  equipamento?: string | null;
  patrimonio?: string | null;
  equipe?: string | null;
  predio?: string | null;
  andar?: string | null;
  local?: string | null;
  solicitante?: string | null;
  status?: string | null;
  data_criacao?: string | null;
  created_at?: string | null;
  data_sla?: string | null;
  data_programada?: string | null;
};

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const C = {
  graphite: argb("#0A1622"),
  navy: argb("#10263A"),
  navySoft: argb("#EAF0F5"),
  slate: argb("#425466"),
  muted: argb("#6B7B8C"),
  border: argb("#DCE3E9"),
  surface: argb("#F7F9FB"),
  white: argb("#FFFFFF"),
  ink: argb("#152536"),
  teal: argb("#147C73"),
  tealSoft: argb("#E8F5F3"),
  amber: argb("#B07014"),
  amberSoft: argb("#FCF5E5"),
  red: argb("#A94442"),
  redSoft: argb("#FBECEC"),
  silver: argb("#AEBBC7"),
};

const thin = { style: "thin", color: { argb: C.border } } as const;

function text(value: unknown, fallback = "—") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? text(value) : date.toLocaleString("pt-BR");
}

function locationLabel(os: MaterialOsRow | undefined) {
  return [os?.predio, os?.andar, os?.local].filter(Boolean).join(" · ") || "—";
}

function originLabel(value: string | null | undefined) {
  return value === "refrigeracao" ? "Refrigeração" : "Corretiva";
}

function costCenter(item: MaterialCompraRow) {
  return text(item.centro_custo, "NÃO MAPEADO");
}

function totalQuantity(items: MaterialCompraRow[]) {
  return items.reduce((sum, item) => sum + Number(item.quantidade || 1), 0);
}

function distinctOs(items: MaterialCompraRow[], osById: Map<string, MaterialOsRow>) {
  return new Set(items.map((item) => osById.get(String(item.os_id))?.numero_os).filter(Boolean)).size;
}

function applyCorporateHeader(
  sheet: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  lastColumn: string,
) {
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.mergeCells(`A3:${lastColumn}3`);

  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.font = { name: "Aptos Display", size: 22, bold: true, color: { argb: C.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.graphite } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleCell.border = { bottom: { style: "medium", color: { argb: C.teal } } };

  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: "Aptos", size: 10, bold: true, color: { argb: argb("#D9E4EC") } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 2 };

  const metaCell = sheet.getCell("A3");
  metaCell.value = `Grupo GPS · Facilities  |  Operação Suvinil / Sherwin-Williams  |  Gerado em ${new Date().toLocaleString("pt-BR")}`;
  metaCell.font = { name: "Aptos", size: 8.5, italic: true, color: { argb: C.slate } };
  metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.surface } };
  metaCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  sheet.getRow(1).height = 39;
  sheet.getRow(2).height = 24;
  sheet.getRow(3).height = 22;
}

function styleKpi(
  sheet: ExcelJS.Worksheet,
  range: string,
  value: number | string,
  label: string,
  fill: string,
  color: string,
) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = `${value}\n${label}`;
  cell.font = { name: "Aptos Display", size: 14, bold: true, color: { argb: color } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cell.border = { top: thin, right: thin, bottom: thin, left: thin };
}

function styleSectionBand(sheet: ExcelJS.Worksheet, range: string, title: string) {
  sheet.mergeCells(range);
  const cell = sheet.getCell(range.split(":")[0]);
  cell.value = title;
  cell.font = { name: "Aptos", size: 9.5, bold: true, color: { argb: C.white } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate } };
  cell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
}

function buildSummary(
  workbook: ExcelJS.Workbook,
  items: MaterialCompraRow[],
  osById: Map<string, MaterialOsRow>,
) {
  const sheet = workbook.addWorksheet("Resumo Executivo", { views: [{ showGridLines: false }] });
  sheet.properties.tabColor = { argb: C.teal };
  sheet.columns = Array.from({ length: 10 }, () => ({ width: 14 }));

  applyCorporateHeader(
    sheet,
    "RELATÓRIO CORPORATIVO DE MATERIAIS",
    "Consolidação executiva das solicitações de peças e materiais de manutenção",
    "J",
  );

  const mapped = items.filter((item) => text(item.centro_custo, "") !== "").length;
  const centers = new Set(items.map((item) => text(item.centro_custo, "")).filter(Boolean));
  const osCount = distinctOs(items, osById);

  styleKpi(sheet, "A5:B7", items.length, "SOLICITAÇÕES", C.tealSoft, C.teal);
  styleKpi(sheet, "C5:D7", totalQuantity(items), "ITENS / UNIDADES", C.amberSoft, C.amber);
  styleKpi(sheet, "E5:F7", osCount, "CHAMADOS / OS", C.navySoft, C.navy);
  styleKpi(sheet, "G5:H7", centers.size, "CENTROS DE CUSTO", C.surface, C.slate);
  styleKpi(sheet, "I5:J7", `${mapped}/${items.length}`, "CC IDENTIFICADOS", mapped === items.length ? C.tealSoft : C.redSoft, mapped === items.length ? C.teal : C.red);

  const ccCounts = new Map<string, { requests: number; quantity: number; os: Set<string> }>();
  for (const item of items) {
    const cc = costCenter(item);
    const current = ccCounts.get(cc) || { requests: 0, quantity: 0, os: new Set<string>() };
    current.requests += 1;
    current.quantity += Number(item.quantidade || 1);
    const os = osById.get(String(item.os_id))?.numero_os;
    if (os) current.os.add(os);
    ccCounts.set(cc, current);
  }

  styleSectionBand(sheet, "A9:J9", "DISTRIBUIÇÃO POR CENTRO DE CUSTO");
  const summaryHeaders = ["Centro de Custo", "Solicitações", "Quantidade", "OS vinculadas"];
  const summaryHeaderRow = sheet.getRow(10);
  summaryHeaderRow.values = summaryHeaders;
  sheet.mergeCells("A10:D10");
  sheet.mergeCells("E10:F10");
  sheet.mergeCells("G10:H10");
  sheet.mergeCells("I10:J10");
  ["A10", "E10", "G10", "I10"].forEach((address, index) => {
    const cell = sheet.getCell(address);
    cell.value = summaryHeaders[index];
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: C.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  let rowIndex = 11;
  [...ccCounts.entries()]
    .sort((a, b) => b[1].requests - a[1].requests || a[0].localeCompare(b[0], "pt-BR"))
    .forEach(([cc, values]) => {
      sheet.mergeCells(`A${rowIndex}:D${rowIndex}`);
      sheet.mergeCells(`E${rowIndex}:F${rowIndex}`);
      sheet.mergeCells(`G${rowIndex}:H${rowIndex}`);
      sheet.mergeCells(`I${rowIndex}:J${rowIndex}`);
      const rowValues = [cc, values.requests, values.quantity, values.os.size];
      ["A", "E", "G", "I"].forEach((column, index) => {
        const cell = sheet.getCell(`${column}${rowIndex}`);
        cell.value = rowValues[index];
        cell.font = {
          name: "Aptos",
          size: 9.5,
          bold: column === "A",
          color: { argb: cc === "NÃO MAPEADO" && column === "A" ? C.red : C.ink },
        };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: cc === "NÃO MAPEADO" ? C.amberSoft : rowIndex % 2 ? C.white : C.surface },
        };
        cell.alignment = { vertical: "middle", horizontal: column === "A" ? "left" : "center", indent: column === "A" ? 1 : 0 };
        cell.border = { bottom: thin, left: thin, right: thin };
      });
      sheet.getRow(rowIndex).height = 23;
      rowIndex += 1;
    });

  sheet.mergeCells(`A${rowIndex + 2}:J${rowIndex + 3}`);
  const note = sheet.getCell(`A${rowIndex + 2}`);
  note.value = "Documento preparado para fluxo corporativo de Facilities. Solicitações sem Centro de Custo aparecem destacadas para revisão antes do encaminhamento ao cliente.";
  note.font = { name: "Aptos", size: 9, italic: true, color: { argb: C.slate } };
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navySoft } };
  note.alignment = { vertical: "middle", horizontal: "left", wrapText: true, indent: 1 };
  note.border = { top: thin, right: thin, bottom: thin, left: thin };

  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 1,
    paperSize: 9,
    horizontalCentered: true,
    margins: { left: 0.35, right: 0.35, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter.oddFooter = "&L&8Grupo GPS · Facilities&C&8Operação Suvinil / Sherwin-Williams&R&8Página &P de &N";
}

function buildRequests(
  workbook: ExcelJS.Workbook,
  items: MaterialCompraRow[],
  osById: Map<string, MaterialOsRow>,
) {
  const sheet = workbook.addWorksheet("Solicitações", {
    views: [{ state: "frozen", ySplit: 6, xSplit: 2, showGridLines: false }],
  });
  sheet.properties.tabColor = { argb: C.navy };
  sheet.columns = [
    { width: 19 },
    { width: 15 },
    { width: 18 },
    { width: 20 },
    { width: 38 },
    { width: 48 },
    { width: 10 },
    { width: 20 },
    { width: 16 },
    { width: 15 },
    { width: 29 },
    { width: 25 },
    { width: 15 },
  ];

  applyCorporateHeader(
    sheet,
    "SOLICITAÇÕES DE MATERIAIS",
    "Relação detalhada para planejamento, compras e atendimento de manutenção",
    "M",
  );

  sheet.mergeCells("A5:M5");
  const guide = sheet.getCell("A5");
  guide.value = "CENTRO DE CUSTO É VINCULADO AUTOMATICAMENTE PELO ATIVO · LINHAS SEM VÍNCULO FICAM DESTACADAS PARA REVISÃO";
  guide.font = { name: "Aptos", size: 8.5, bold: true, color: { argb: C.teal } };
  guide.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.tealSoft } };
  guide.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  guide.border = { bottom: thin };
  sheet.getRow(5).height = 22;

  const headers = [
    "Data da Solicitação",
    "OS",
    "Centro de Custo",
    "Ativo",
    "Descrição do Chamado",
    "Peça / Material Solicitado",
    "Qtd.",
    "Equipe",
    "Prédio",
    "Andar",
    "Local",
    "Solicitante",
    "Origem",
  ];

  const headerRow = sheet.getRow(6);
  headers.forEach((header, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = header;
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: C.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index === 2 ? C.teal : C.navy } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: thin, right: thin, bottom: { style: "medium", color: { argb: C.teal } }, left: thin };
  });
  headerRow.height = 36;

  items.forEach((item, index) => {
    const os = osById.get(String(item.os_id));
    const row = sheet.getRow(7 + index);
    const cc = costCenter(item);
    row.values = [
      formatDate(item.material_request_date || item.created_at),
      text(os?.numero_os),
      cc,
      text(os?.ativo),
      text(os?.nome_os),
      text(item.descricao),
      Number(item.quantidade || 1),
      text(os?.equipe),
      text(os?.predio),
      text(os?.andar),
      text(os?.local),
      text(os?.solicitante),
      originLabel(item.origem),
    ];
    row.height = 44;

    for (let column = 1; column <= headers.length; column += 1) {
      const cell = row.getCell(column);
      cell.font = { name: "Aptos", size: 9, color: { argb: C.ink } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 ? C.surface : C.white } };
      cell.alignment = {
        vertical: "middle",
        horizontal: [2, 3, 7, 13].includes(column) ? "center" : "left",
        wrapText: true,
      };
      cell.border = { bottom: thin, left: thin, right: thin };
    }

    row.getCell(2).font = { name: "Aptos Display", size: 10, bold: true, color: { argb: C.navy } };
    row.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navySoft } };

    row.getCell(3).font = { name: "Aptos Display", size: 10, bold: true, color: { argb: cc === "NÃO MAPEADO" ? C.red : C.teal } };
    row.getCell(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: cc === "NÃO MAPEADO" ? C.amberSoft : C.tealSoft } };

    row.getCell(6).font = { name: "Aptos", size: 10, bold: true, color: { argb: C.ink } };
    row.getCell(7).font = { name: "Aptos Display", size: 11, bold: true, color: { argb: C.teal } };

    const originCell = row.getCell(13);
    originCell.font = { name: "Aptos", size: 8.5, bold: true, color: { argb: C.slate } };
    originCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.surface } };
  });

  const lastRow = Math.max(6, 6 + items.length);
  sheet.autoFilter = { from: { row: 6, column: 1 }, to: { row: lastRow, column: headers.length } };
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    horizontalCentered: true,
    margins: { left: 0.2, right: 0.2, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 },
    printArea: `A1:M${lastRow}`,
    printTitlesRow: "1:6",
  };
  sheet.headerFooter.oddFooter = "&L&8Grupo GPS · Facilities&C&8Materiais · Suvinil / Sherwin-Williams&R&8Página &P de &N";
}

function buildCostCenterSheet(
  workbook: ExcelJS.Workbook,
  items: MaterialCompraRow[],
  osById: Map<string, MaterialOsRow>,
) {
  const sheet = workbook.addWorksheet("Por Centro de Custo", { views: [{ showGridLines: false, state: "frozen", ySplit: 5 }] });
  sheet.properties.tabColor = { argb: C.silver };
  sheet.columns = [{ width: 21 }, { width: 16 }, { width: 16 }, { width: 18 }, { width: 62 }];
  applyCorporateHeader(sheet, "ANÁLISE POR CENTRO DE CUSTO", "Rastreabilidade financeira das solicitações de materiais", "E");

  const grouped = new Map<string, { requests: number; quantity: number; os: Set<string>; materials: string[] }>();
  for (const item of items) {
    const cc = costCenter(item);
    const current = grouped.get(cc) || { requests: 0, quantity: 0, os: new Set<string>(), materials: [] };
    current.requests += 1;
    current.quantity += Number(item.quantidade || 1);
    const os = osById.get(String(item.os_id))?.numero_os;
    if (os) current.os.add(os);
    if (item.descricao) current.materials.push(item.descricao);
    grouped.set(cc, current);
  }

  const header = sheet.getRow(5);
  ["Centro de Custo", "Solicitações", "Quantidade", "OS", "Materiais / peças"].forEach((value, index) => {
    const cell = header.getCell(index + 1);
    cell.value = value;
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: C.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index === 0 ? C.teal : C.navy } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: thin, right: thin, bottom: thin, left: thin };
  });
  header.height = 30;

  [...grouped.entries()].sort((a, b) => b[1].requests - a[1].requests).forEach(([cc, data], index) => {
    const row = sheet.getRow(6 + index);
    row.values = [cc, data.requests, data.quantity, data.os.size, data.materials.join(" · ")];
    row.height = 32;
    row.eachCell((cell, column) => {
      cell.font = { name: "Aptos", size: 9, bold: column === 1, color: { argb: cc === "NÃO MAPEADO" && column === 1 ? C.red : C.ink } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: cc === "NÃO MAPEADO" ? C.amberSoft : index % 2 ? C.surface : C.white } };
      cell.alignment = { vertical: "middle", horizontal: column === 5 ? "left" : "center", wrapText: true };
      cell.border = { bottom: thin, left: thin, right: thin };
    });
  });

  const lastRow = Math.max(5, 5 + grouped.size);
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.35, right: 0.35, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
    printArea: `A1:E${lastRow}`,
    printTitlesRow: "1:5",
  };
  sheet.headerFooter.oddFooter = "&L&8Grupo GPS · Facilities&C&8Centros de Custo&R&8Página &P de &N";
}

export function buildComprasPremiumWorkbook(
  items: MaterialCompraRow[],
  osById: Map<string, MaterialOsRow>,
) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Apont Auto · Grupo GPS";
  workbook.company = "Grupo GPS";
  workbook.title = "Relatório Corporativo de Materiais · Suvinil / Sherwin-Williams";
  workbook.subject = "Solicitações de peças e materiais de manutenção";
  workbook.description = "Relatório operacional preparado pelo Grupo GPS para a operação Suvinil / Sherwin-Williams.";
  workbook.created = new Date();
  workbook.modified = new Date();

  buildSummary(workbook, items, osById);
  buildRequests(workbook, items, osById);
  buildCostCenterSheet(workbook, items, osById);
  return workbook;
}

export async function exportComprasPremiumExcel(
  items: MaterialCompraRow[],
  osById: Map<string, MaterialOsRow>,
) {
  const workbook = buildComprasPremiumWorkbook(items, osById);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Relatorio_Materiais_GPS_Suvinil_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

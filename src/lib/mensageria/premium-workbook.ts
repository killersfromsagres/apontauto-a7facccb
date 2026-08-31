import * as ExcelJS from "exceljs";

import type { Envio, Malote } from "@/lib/mensageria/models";
import { MENSAGERIA_SECTORS } from "@/lib/mensageria/seed-data";

const COLORS = {
  navy: "FF0F172A",
  navySoft: "FF172033",
  slate: "FF334155",
  teal: "FF14B8A6",
  tealSoft: "FFCCFBF1",
  emerald: "FF10B981",
  emeraldSoft: "FFD1FAE5",
  amber: "FFF59E0B",
  amberSoft: "FFFEF3C7",
  rose: "FFF43F5E",
  roseSoft: "FFFFE4E6",
  sky: "FF0EA5E9",
  skySoft: "FFE0F2FE",
  white: "FFFFFFFF",
  surface: "FFF8FAFC",
  border: "FFE2E8F0",
  muted: "FF64748B",
  text: "FF0F172A",
} as const;

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: COLORS.border } },
  left: { style: "thin", color: { argb: COLORS.border } },
  bottom: { style: "thin", color: { argb: COLORS.border } },
  right: { style: "thin", color: { argb: COLORS.border } },
};

function formatDateTime(value: string | null, legacy = false) {
  if (!value) return legacy ? "Não registrado na planilha" : "Não informado";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Data inválida";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    ...(legacy ? {} : { timeStyle: "short" as const }),
  }).format(date);
}

function assertWorksheetApi(sheet: ExcelJS.Worksheet) {
  const api = sheet as unknown as Record<string, unknown>;
  const requiredMethods = ["mergeCells", "getCell", "getRow", "getColumn", "addTable"] as const;
  for (const method of requiredMethods) {
    if (typeof api[method] !== "function") {
      throw new Error(`ExcelJS incompatível: método Worksheet.${method} indisponível.`);
    }
  }
}

function setWorkbookMetadata(workbook: ExcelJS.Workbook) {
  workbook.creator = "ApontAuto";
  workbook.lastModifiedBy = "ApontAuto";
  workbook.company = "ApontAuto";
  workbook.subject = "Backup profissional de Mensageria e Malotes";
  workbook.title = "Mensageria e Malotes — Backup";
  workbook.description = "Backup local estruturado com protocolos, envios e setores.";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
}

function configureWorksheet(sheet: ExcelJS.Worksheet, tabColor: string) {
  assertWorksheetApi(sheet);
  sheet.properties.tabColor = { argb: tabColor };
  sheet.views = [{ state: "frozen", ySplit: 6, showGridLines: false }];
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.25, right: 0.25, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 },
  };
  sheet.headerFooter.oddFooter = "&LApontAuto — Mensageria&CBackup profissional&R&P / &N";
}

function addSheetHeader(sheet: ExcelJS.Worksheet, title: string, subtitle: string, lastColumn: string) {
  sheet.mergeCells(`A1:${lastColumn}1`);
  sheet.mergeCells(`A2:${lastColumn}2`);
  sheet.mergeCells(`A3:${lastColumn}3`);

  const titleCell = sheet.getCell("A1");
  titleCell.value = title;
  titleCell.font = { name: "Aptos Display", size: 20, bold: true, color: { argb: COLORS.white } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  const subtitleCell = sheet.getCell("A2");
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: "Aptos", size: 10, color: { argb: "FFCBD5E1" } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navySoft } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left" };

  const metaCell = sheet.getCell("A3");
  metaCell.value = `Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date())}`;
  metaCell.font = { name: "Aptos", size: 9, italic: true, color: { argb: COLORS.muted } };
  metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.surface } };
  metaCell.alignment = { vertical: "middle", horizontal: "left" };

  sheet.getRow(1).height = 32;
  sheet.getRow(2).height = 22;
  sheet.getRow(3).height = 20;
  sheet.getRow(4).height = 8;
  sheet.getRow(5).height = 8;
}

function styleTableHeader(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  row.height = 28;
  row.eachCell((cell) => {
    cell.font = { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.slate } };
    cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    cell.border = THIN_BORDER;
  });
}

function styleDataRows(sheet: ExcelJS.Worksheet, startRow: number, endRow: number) {
  for (let rowNumber = startRow; rowNumber <= endRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    row.height = 24;
    row.eachCell((cell) => {
      cell.font = { name: "Aptos", size: 9, color: { argb: COLORS.text } };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.border = THIN_BORDER;
    });
  }
}

function styleStatusCell(cell: ExcelJS.Cell, status: string) {
  const normalized = status.toLocaleUpperCase("pt-BR");
  let fill = COLORS.skySoft;
  let font = COLORS.sky;

  if (normalized.includes("ENTREGUE") || normalized.includes("FINALIZADO")) {
    fill = COLORS.emeraldSoft;
    font = COLORS.emerald;
  } else if (normalized.includes("PENDENTE") || normalized.includes("AGUARDANDO") || normalized.includes("PREPARANDO")) {
    fill = COLORS.amberSoft;
    font = COLORS.amber;
  } else if (normalized.includes("DEVOLVIDO")) {
    fill = COLORS.roseSoft;
    font = COLORS.rose;
  }

  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
  cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: font } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

function createSummarySheet(workbook: ExcelJS.Workbook, malotes: Malote[], envios: Envio[]) {
  const sheet = workbook.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
  assertWorksheetApi(sheet);
  sheet.properties.tabColor = { argb: COLORS.teal };
  sheet.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
  sheet.columns = Array.from({ length: 8 }, () => ({ width: 15 }));

  sheet.mergeCells("A1:H2");
  const title = sheet.getCell("A1");
  title.value = "MENSAGERIA E MALOTES";
  title.font = { name: "Aptos Display", size: 24, bold: true, color: { argb: COLORS.white } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navy } };
  title.alignment = { vertical: "middle", horizontal: "left" };

  sheet.mergeCells("A3:H3");
  const subtitle = sheet.getCell("A3");
  subtitle.value = "Backup executivo • protocolos, entregas, envios e setores";
  subtitle.font = { name: "Aptos", size: 11, color: { argb: "FFCBD5E1" } };
  subtitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.navySoft } };
  subtitle.alignment = { vertical: "middle", horizontal: "left" };

  const cards = [
    { range: "A5:B7", label: "TOTAL DE MALOTES", value: malotes.length, fill: COLORS.tealSoft, accent: COLORS.teal },
    { range: "C5:D7", label: "PENDENTES", value: malotes.filter((item) => item.status === "aguardando_entrega").length, fill: COLORS.amberSoft, accent: COLORS.amber },
    { range: "E5:F7", label: "ENTREGUES", value: malotes.filter((item) => item.status === "entregue").length, fill: COLORS.emeraldSoft, accent: COLORS.emerald },
    { range: "G5:H7", label: "ENVIOS ATIVOS", value: envios.filter((item) => item.status === "preparando" || item.status === "enviado").length, fill: COLORS.skySoft, accent: COLORS.sky },
  ];

  for (const card of cards) {
    sheet.mergeCells(card.range);
    const cell = sheet.getCell(card.range.split(":")[0]);
    cell.value = `${card.value}\n${card.label}`;
    cell.font = { name: "Aptos Display", size: 16, bold: true, color: { argb: card.accent } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: card.fill } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = THIN_BORDER;
  }

  sheet.mergeCells("A9:H9");
  const sectionTitle = sheet.getCell("A9");
  sectionTitle.value = "CONTEÚDO DO BACKUP";
  sectionTitle.font = { name: "Aptos", size: 11, bold: true, color: { argb: COLORS.white } };
  sectionTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.slate } };
  sectionTitle.alignment = { vertical: "middle", horizontal: "left" };

  const summaryRows = [
    ["Aba", "Registros", "Descrição"],
    ["Malotes", malotes.length, "Recebimentos, rastreio, setor, entrega e comprovações"],
    ["Envios", envios.length, "Correios, Jurídico, malotes internos e demais expedições"],
    ["Setores", MENSAGERIA_SECTORS.length, "Setores cadastrados e responsáveis"],
  ];

  summaryRows.forEach((row, index) => {
    const rowNumber = 10 + index;
    const excelRow = sheet.getRow(rowNumber);
    excelRow.values = [row[0], row[1], row[2]];
    sheet.mergeCells(`C${rowNumber}:H${rowNumber}`);
    excelRow.height = index === 0 ? 26 : 24;
    excelRow.eachCell((cell) => {
      cell.border = THIN_BORDER;
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
      cell.font = index === 0
        ? { name: "Aptos", size: 10, bold: true, color: { argb: COLORS.white } }
        : { name: "Aptos", size: 10, color: { argb: COLORS.text } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index === 0 ? COLORS.slate : COLORS.white } };
    });
  });

  sheet.mergeCells("A15:H15");
  const note = sheet.getCell("A15");
  note.value = `Arquivo gerado localmente em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeStyle: "short" }).format(new Date())}.`;
  note.font = { name: "Aptos", size: 9, italic: true, color: { argb: COLORS.muted } };
  note.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: COLORS.surface } };
  note.border = THIN_BORDER;
  sheet.getRow(15).height = 30;
}

function createMalotesSheet(workbook: ExcelJS.Workbook, malotes: Malote[]) {
  const sheet = workbook.addWorksheet("Malotes");
  configureWorksheet(sheet, COLORS.teal);
  addSheetHeader(sheet, "MALOTES E PROTOCOLOS", "Histórico completo da entrada na portaria até a entrega ao destinatário.", "S");

  const headers = ["Status", "Setor", "Responsável do setor", "Remetente", "Destinatário", "Código de rastreio", "Código interno", "Item", "Quantidade", "Data recebimento", "Local", "Recebido por", "Assinatura portaria", "Data entrega", "Entregue para", "Assinatura destinatário", "Observações recebimento", "Observações entrega", "Origem"];
  const sectorMap = new Map(MENSAGERIA_SECTORS.map((item) => [item.nome, item.responsavel]));
  const rows = malotes.map((item) => [
    item.status === "entregue" ? "ENTREGUE" : "PENDENTE",
    item.setor,
    sectorMap.get(item.setor) ?? "",
    item.remetente,
    item.destinatario,
    item.codigo_rastreio ?? "",
    item.codigo_interno ?? "",
    item.item_descricao ?? "",
    item.quantidade,
    formatDateTime(item.recebido_em, item.legacy_import),
    item.local_recebimento,
    item.recebido_por,
    item.assinatura_portaria_data_url ? "SIM" : "NÃO DISPONÍVEL",
    formatDateTime(item.entregue_em, item.legacy_import),
    item.entregue_para ?? "",
    item.assinatura_entrega_data_url ? "SIM" : "NÃO DISPONÍVEL",
    item.observacoes ?? "",
    item.entrega_observacoes ?? "",
    item.legacy_import ? "PLANILHA IMPORTADA" : "REGISTRO LOCAL",
  ]);

  sheet.addTable({
    name: "TabelaMalotes",
    ref: "A6",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true, showFirstColumn: false, showLastColumn: false },
    columns: headers.map((name) => ({ name })),
    rows,
  });
  styleTableHeader(sheet, 6);
  if (rows.length) styleDataRows(sheet, 7, 6 + rows.length);
  for (let rowNumber = 7; rowNumber <= 6 + rows.length; rowNumber += 1) {
    const cell = sheet.getCell(`A${rowNumber}`);
    styleStatusCell(cell, String(cell.value ?? ""));
  }
  [14, 24, 24, 24, 24, 22, 18, 30, 12, 20, 18, 22, 18, 20, 22, 22, 34, 34, 20]
    .forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function createEnviosSheet(workbook: ExcelJS.Workbook, envios: Envio[]) {
  const sheet = workbook.addWorksheet("Envios");
  configureWorksheet(sheet, COLORS.sky);
  addSheetHeader(sheet, "CONTROLE DE ENVIOS", "Acompanhamento de Correios, Jurídico, malotes internos e demais expedições.", "L");

  const headers = ["Status", "Categoria", "Remetente", "Destinatário", "Código de rastreio", "Item", "Nota fiscal", "Data envio", "Enviado por", "Data conclusão", "Observações", "Origem"];
  const categoryLabel = (item: Envio) => ({ correios: "Correios", juridico: "Jurídico", malote_interno: "Malote interno", outro: "Outro" })[item.categoria];
  const rows = envios.map((item) => [
    item.status.toLocaleUpperCase("pt-BR"),
    categoryLabel(item),
    item.remetente,
    item.destinatario,
    item.codigo_rastreio ?? "",
    item.item_descricao ?? "",
    item.nota_fiscal ?? "",
    formatDateTime(item.enviado_em, item.legacy_import),
    item.enviado_por ?? "",
    formatDateTime(item.finalizado_em, item.legacy_import),
    item.observacoes ?? "",
    item.legacy_import ? "PLANILHA IMPORTADA" : "REGISTRO LOCAL",
  ]);

  sheet.addTable({
    name: "TabelaEnvios",
    ref: "A6",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true, showFirstColumn: false, showLastColumn: false },
    columns: headers.map((name) => ({ name })),
    rows,
  });
  styleTableHeader(sheet, 6);
  if (rows.length) styleDataRows(sheet, 7, 6 + rows.length);
  for (let rowNumber = 7; rowNumber <= 6 + rows.length; rowNumber += 1) {
    const cell = sheet.getCell(`A${rowNumber}`);
    styleStatusCell(cell, String(cell.value ?? ""));
  }
  [14, 20, 24, 24, 22, 30, 18, 20, 22, 20, 34, 20]
    .forEach((width, index) => { sheet.getColumn(index + 1).width = width; });
}

function createSetoresSheet(workbook: ExcelJS.Workbook) {
  const sheet = workbook.addWorksheet("Setores");
  configureWorksheet(sheet, COLORS.slate);
  addSheetHeader(sheet, "SETORES E RESPONSÁVEIS", "Referência operacional utilizada para direcionamento dos protocolos.", "C");
  const rows = MENSAGERIA_SECTORS.map((item, index) => [index + 1, item.nome, item.responsavel]);
  sheet.addTable({
    name: "TabelaSetores",
    ref: "A6",
    headerRow: true,
    totalsRow: false,
    style: { theme: "TableStyleMedium2", showRowStripes: true, showFirstColumn: false, showLastColumn: false },
    columns: [{ name: "#" }, { name: "Setor" }, { name: "Responsável" }],
    rows,
  });
  styleTableHeader(sheet, 6);
  if (rows.length) styleDataRows(sheet, 7, 6 + rows.length);
  sheet.getColumn(1).width = 8;
  sheet.getColumn(2).width = 34;
  sheet.getColumn(3).width = 34;
}

export function buildMensageriaPremiumWorkbook(malotes: Malote[], envios: Envio[]) {
  const workbook = new ExcelJS.Workbook();
  setWorkbookMetadata(workbook);
  createSummarySheet(workbook, malotes, envios);
  createMalotesSheet(workbook, malotes);
  createEnviosSheet(workbook, envios);
  createSetoresSheet(workbook);
  return workbook;
}

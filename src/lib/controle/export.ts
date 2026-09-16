// Exportador Excel da Central de Materiais.
// Mantém as cinco abas operacionais e adiciona uma apresentação executiva
// consistente para acompanhamento de compras, centros de custo e Facilities.

import type { ControleItem, CentroCusto, EnvioFacilities } from "./data";
import { STATUS_COMPRA_LABEL, STATUS_COMPRA_ORDER } from "./data";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;

const C = {
  navy: argb("#071426"),
  navy2: argb("#0D223D"),
  blue: argb("#2563EB"),
  cyan: argb("#06B6D4"),
  sky: argb("#E0F2FE"),
  white: argb("#FFFFFF"),
  ink: argb("#0F172A"),
  slate700: argb("#334155"),
  slate500: argb("#64748B"),
  slate300: argb("#CBD5E1"),
  slate200: argb("#E2E8F0"),
  slate100: argb("#F1F5F9"),
  slate50: argb("#F8FAFC"),
  emerald: argb("#10B981"),
  emeraldBg: argb("#D1FAE5"),
  amber: argb("#F59E0B"),
  amberBg: argb("#FEF3C7"),
  rose: argb("#E11D48"),
  roseBg: argb("#FFE4E6"),
  indigoBg: argb("#E0E7FF"),
  indigo: argb("#4338CA"),
  violetBg: argb("#EDE9FE"),
  violet: argb("#6D28D9"),
};

const FONT = "Aptos";
const BORDER = { style: "thin" as const, color: { argb: C.slate200 } };

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function setupSheet(ws: any, tabColor: string, orientation: "portrait" | "landscape" = "landscape") {
  ws.properties = {
    defaultRowHeight: 20,
    tabColor: { argb: tabColor },
  };
  ws.pageSetup = {
    orientation,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    horizontalDpi: 300,
    verticalDpi: 300,
  };
  ws.pageMargins = { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 };
  ws.headerFooter = {
    oddFooter: "Apont Auto · Central de Materiais  |  Página &P de &N",
  };
}

function titleBlock(ws: any, title: string, subtitle: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = { name: FONT, size: 20, bold: true, color: { argb: C.white } };
  titleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy } };
  ws.getRow(1).height = 36;

  ws.mergeCells(2, 1, 2, cols);
  const subtitleCell = ws.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: FONT, size: 10, color: { argb: C.white } };
  subtitleCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.blue } };
  ws.getRow(2).height = 22;

  ws.mergeCells(3, 1, 3, cols);
  const metaCell = ws.getCell(3, 1);
  metaCell.value = `APONT AUTO  ·  Central operacional  ·  Gerado em ${new Date().toLocaleString("pt-BR")}`;
  metaCell.font = { name: FONT, size: 8, bold: true, color: { argb: C.slate500 } };
  metaCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  metaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
  ws.getRow(3).height = 18;
}

function headerRow(ws: any, rowIdx: number, headers: string[]) {
  const row = ws.getRow(rowIdx);
  headers.forEach((header, index) => {
    const cell = row.getCell(index + 1);
    cell.value = header;
    cell.font = { name: FONT, size: 9, bold: true, color: { argb: C.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.navy2 } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
  });
  row.height = 28;
  ws.views = [{ state: "frozen", ySplit: rowIdx }];
  ws.autoFilter = {
    from: { row: rowIdx, column: 1 },
    to: { row: rowIdx, column: headers.length },
  };
}

function styleBody(ws: any, firstRow: number, lastRow: number, cols: number) {
  if (lastRow < firstRow) return;
  for (let rowIndex = firstRow; rowIndex <= lastRow; rowIndex++) {
    const row = ws.getRow(rowIndex);
    row.height = 30;
    for (let col = 1; col <= cols; col++) {
      const cell = row.getCell(col);
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      cell.alignment = { vertical: "middle", wrapText: true };
      if ((rowIndex - firstRow) % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate50 } };
      }
      cell.border = { bottom: { style: "hair", color: { argb: C.slate200 } } };
    }
  }
}

function badge(cell: any, kind: "ok" | "warn" | "danger" | "info" | "neutral" | "violet") {
  const map = {
    ok: [C.emeraldBg, argb("#047857")],
    warn: [C.amberBg, argb("#92400E")],
    danger: [C.roseBg, argb("#9F1239")],
    info: [C.sky, argb("#0369A1")],
    neutral: [C.slate100, C.slate700],
    violet: [C.violetBg, C.violet],
  } as const;
  const [bg, fg] = map[kind];
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.font = { name: FONT, size: 9, bold: true, color: { argb: fg } };
  cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function statusKind(status: string): "ok" | "warn" | "danger" | "info" | "neutral" {
  if (status === "recebido" || status === "comprado") return "ok";
  if (status === "solicitado" || status === "em_cotacao") return "info";
  if (status === "cancelado") return "danger";
  return "warn";
}

function originKind(origin: string) {
  return origin === "corretiva" ? "info" : "violet";
}

function kpiCard(ws: any, row: number, startCol: number, endCol: number, label: string, value: number | string, accent: string) {
  ws.mergeCells(row, startCol, row, endCol);
  const labelCell = ws.getCell(row, startCol);
  labelCell.value = label.toUpperCase();
  labelCell.font = { name: FONT, size: 8, bold: true, color: { argb: C.slate500 } };
  labelCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };

  ws.mergeCells(row + 1, startCol, row + 1, endCol);
  const valueCell = ws.getCell(row + 1, startCol);
  valueCell.value = value;
  valueCell.font = { name: FONT, size: 19, bold: true, color: { argb: C.ink } };
  valueCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.white } };
  valueCell.border = {
    left: { style: "medium", color: { argb: accent } },
    right: BORDER,
    top: BORDER,
    bottom: BORDER,
  };
  ws.getRow(row).height = 18;
  ws.getRow(row + 1).height = 28;
}

function sectionTitle(ws: any, row: number, title: string, cols: number) {
  ws.mergeCells(row, 1, row, cols);
  const cell = ws.getCell(row, 1);
  cell.value = title;
  cell.font = { name: FONT, size: 11, bold: true, color: { argb: C.navy } };
  cell.alignment = { vertical: "middle", indent: 1 };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
  ws.getRow(row).height = 23;
}

export async function exportControleMateriais(params: {
  itens: ControleItem[];
  centros: CentroCusto[];
  envios: EnvioFacilities[];
}): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto · Central de Materiais";
  wb.created = new Date();
  wb.modified = new Date();
  wb.company = "Apont Auto";
  wb.subject = "Central operacional de materiais";

  const pecas = params.itens.filter((item) => item.tipo === "peca");
  const defeitos = params.itens.filter((item) => item.tipo === "problema");
  const fieldRequests = params.itens.filter((item) => item.fonte === "execucao_campo");
  const requested = params.itens.filter((item) => item.meta?.data_solicitacao_facilities).length;
  const received = params.itens.filter((item) => item.meta?.status_compra === "recebido").length;
  const missingCc = params.itens.filter((item) => !item.meta?.centro_custo).length;
  const inPurchase = params.itens.filter((item) => ["solicitado", "em_cotacao", "comprado"].includes(item.meta?.status_compra ?? "")).length;

  // ---------------------------- RESUMO ----------------------------
  const resumo = wb.addWorksheet("Resumo");
  setupSheet(resumo, C.blue);
  resumo.columns = Array.from({ length: 8 }, () => ({ width: 18 }));
  resumo.getColumn(1).width = 22;
  resumo.getColumn(8).width = 22;
  titleBlock(
    resumo,
    "Central de Materiais · Painel Executivo",
    "Visão consolidada de Corretiva + Refrigeração, compras, Execução de Campo e Facilities",
    8,
  );

  kpiCard(resumo, 5, 1, 2, "Registros na fila", params.itens.length, C.blue);
  kpiCard(resumo, 5, 3, 4, "Execução de Campo", fieldRequests.length, C.violet);
  kpiCard(resumo, 5, 5, 6, "Em fluxo de compra", inPurchase, C.cyan);
  kpiCard(resumo, 5, 7, 8, "Recebidos", received, C.emerald);

  sectionTitle(resumo, 9, "Indicadores operacionais", 8);
  const operational = [
    ["Pedidos de peças", pecas.length],
    ["Defeitos apontados", defeitos.length],
    ["Encaminhados à Facilities", requested],
    ["Aguardando encaminhamento", params.itens.length - requested],
    ["Sem centro de custo", missingCc],
    ["Centros cadastrados", params.centros.length],
    ["Envios registrados", params.envios.length],
    ["Taxa de recebimento", params.itens.length ? `${Math.round((received / params.itens.length) * 100)}%` : "0%"],
  ];
  operational.forEach(([label, value], index) => {
    const row = 10 + Math.floor(index / 4) * 2;
    const start = 1 + (index % 4) * 2;
    kpiCard(resumo, row, start, start + 1, String(label), value as string | number, index === 4 ? C.rose : C.blue);
  });

  // Os blocos abaixo ocupam faixas de linhas independentes. Não reutilize a mesma
  // linha em sectionTitle: ExcelJS rejeita uma nova mesclagem sobre células já mescladas.
  const statusStart = 15;
  sectionTitle(resumo, statusStart, "Distribuição por situação de compra", 8);
  const statusHeaders = ["Situação", "Qtd.", "% da fila", "Leitura"];
  headerRow(resumo, statusStart + 1, statusHeaders);
  STATUS_COMPRA_ORDER.forEach((status, index) => {
    const row = statusStart + 2 + index;
    const count = params.itens.filter((item) => (item.meta?.status_compra ?? "aguardando") === status).length;
    const pct = params.itens.length ? `${Math.round((count / params.itens.length) * 100)}%` : "0%";
    resumo.getRow(row).values = [STATUS_COMPRA_LABEL[status], count, pct, status === "aguardando" ? "Ação pendente" : STATUS_COMPRA_LABEL[status]];
    styleBody(resumo, row, row, 4);
    badge(resumo.getCell(row, 1), statusKind(status));
    resumo.getCell(row, 2).alignment = { horizontal: "center", vertical: "middle" };
    resumo.getCell(row, 3).alignment = { horizontal: "center", vertical: "middle" };
  });

  const originStart = statusStart + 2 + STATUS_COMPRA_ORDER.length + 2;
  sectionTitle(resumo, originStart, "Origem dos registros", 8);
  headerRow(resumo, originStart + 1, ["Origem", "Qtd.", "Participação", "Fonte"]);
  const origins = [
    ["Corretiva", params.itens.filter((item) => item.origem === "corretiva").length],
    ["Refrigeração", params.itens.filter((item) => item.origem === "refrigeracao").length],
    ["Execução de Campo", fieldRequests.length],
  ];
  origins.forEach(([label, count], index) => {
    const row = originStart + 2 + index;
    const n = Number(count);
    resumo.getRow(row).values = [label, n, params.itens.length ? `${Math.round((n / params.itens.length) * 100)}%` : "0%", label === "Execução de Campo" ? "Corretiva + Refrigeração · independente da conclusão da OS" : "Apontamento técnico"];
    styleBody(resumo, row, row, 4);
    badge(resumo.getCell(row, 1), label === "Corretiva" ? "info" : label === "Refrigeração" ? "violet" : "neutral");
  });

  const alertRow = originStart + 6;
  resumo.mergeCells(alertRow, 1, alertRow, 8);
  const alert = resumo.getCell(alertRow, 1);
  alert.value = missingCc > 0
    ? `ATENÇÃO OPERACIONAL · ${missingCc} registro(s) sem centro de custo. Classifique antes de encaminhar a compra à Facilities.`
    : "FLUXO OK · Todos os registros possuem centro de custo preenchido.";
  alert.font = { name: FONT, size: 10, bold: true, color: { argb: missingCc > 0 ? argb("#92400E") : argb("#047857") } };
  alert.fill = { type: "pattern", pattern: "solid", fgColor: { argb: missingCc > 0 ? C.amberBg : C.emeraldBg } };
  alert.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  resumo.getRow(alertRow).height = 26;
  resumo.views = [{ state: "frozen", ySplit: 4 }];
  resumo.pageSetup.printArea = `A1:H${alertRow}`;

  // ---------------------------- PEÇAS ----------------------------
  const pecaHeaders = [
    "Origem", "OS", "Descrição da atividade", "Prédio", "Andar", "Local", "Equipe",
    "Material solicitado", "Modelo / Ref.", "Qtd.", "Urgência", "Status gestor", "Situação da compra",
    "Centro de custo", "Nº requisição", "Fornecedor", "Valor estimado", "Data Facilities", "Solicitado por", "Observação", "Apontado em",
  ];
  const wsPecas = wb.addWorksheet("Peças");
  setupSheet(wsPecas, C.blue);
  wsPecas.columns = [
    { width: 14 }, { width: 12 }, { width: 32 }, { width: 12 }, { width: 9 }, { width: 18 }, { width: 16 },
    { width: 32 }, { width: 18 }, { width: 8 }, { width: 11 }, { width: 14 }, { width: 20 }, { width: 18 },
    { width: 16 }, { width: 18 }, { width: 15 }, { width: 20 }, { width: 18 }, { width: 28 }, { width: 18 },
  ];
  titleBlock(wsPecas, "Pedidos de Peças", `Refrigeração + Corretiva · ${pecas.length} registro(s)`, pecaHeaders.length);
  headerRow(wsPecas, 4, pecaHeaders);
  pecas.forEach((item, index) => {
    wsPecas.getRow(5 + index).values = [
      item.origem === "refrigeracao" ? "Refrigeração" : "Corretiva", item.numeroOs, item.descricaoOs ?? "", item.predio ?? "",
      item.andar ?? "", item.local ?? "", item.equipe ?? "", item.descricao, item.modelo ?? "", item.quantidade ?? "", item.urgencia ?? "",
      item.statusGestor, STATUS_COMPRA_LABEL[item.meta?.status_compra ?? "aguardando"], item.meta?.centro_custo ?? "", item.meta?.numero_requisicao ?? "",
      item.meta?.fornecedor ?? "", item.meta?.valor_estimado ?? "", fmtDate(item.meta?.data_solicitacao_facilities), item.meta?.solicitado_por ?? "",
      item.meta?.observacao ?? "", fmtDate(item.criadoEm),
    ];
  });
  styleBody(wsPecas, 5, 4 + pecas.length, pecaHeaders.length);
  pecas.forEach((item, index) => {
    const row = 5 + index;
    badge(wsPecas.getCell(row, 1), originKind(item.origem) as any);
    badge(wsPecas.getCell(row, 13), statusKind(item.meta?.status_compra ?? "aguardando"));
    if (!item.meta?.centro_custo) badge(wsPecas.getCell(row, 14), "danger");
    wsPecas.getCell(row, 10).alignment = { horizontal: "center", vertical: "middle" };
    wsPecas.getCell(row, 17).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00;"—"';
  });
  wsPecas.pageSetup.printArea = `A1:U${Math.max(4 + pecas.length, 5)}`;

  // ---------------------------- DEFEITOS ----------------------------
  const defHeaders = ["Origem", "OS", "Descrição da atividade", "Prédio", "Andar", "Local", "Equipe", "Defeito apontado", "Gravidade", "Status gestor", "Situação", "Centro de custo", "Data Facilities", "Observação", "Apontado em"];
  const wsDef = wb.addWorksheet("Defeitos");
  setupSheet(wsDef, C.violet, "landscape");
  wsDef.columns = [{ width: 14 }, { width: 12 }, { width: 32 }, { width: 12 }, { width: 9 }, { width: 18 }, { width: 16 }, { width: 40 }, { width: 14 }, { width: 14 }, { width: 20 }, { width: 18 }, { width: 20 }, { width: 28 }, { width: 18 }];
  titleBlock(wsDef, "Defeitos Apontados", `Refrigeração + Corretiva · ${defeitos.length} registro(s)`, defHeaders.length);
  headerRow(wsDef, 4, defHeaders);
  defeitos.forEach((item, index) => {
    wsDef.getRow(5 + index).values = [
      item.origem === "refrigeracao" ? "Refrigeração" : "Corretiva", item.numeroOs, item.descricaoOs ?? "", item.predio ?? "", item.andar ?? "", item.local ?? "", item.equipe ?? "",
      item.descricao, item.gravidade ?? "", item.statusGestor, STATUS_COMPRA_LABEL[item.meta?.status_compra ?? "aguardando"], item.meta?.centro_custo ?? "",
      fmtDate(item.meta?.data_solicitacao_facilities), item.meta?.observacao ?? "", fmtDate(item.criadoEm),
    ];
  });
  styleBody(wsDef, 5, 4 + defeitos.length, defHeaders.length);
  defeitos.forEach((item, index) => {
    const row = 5 + index;
    badge(wsDef.getCell(row, 1), originKind(item.origem) as any);
    badge(wsDef.getCell(row, 11), statusKind(item.meta?.status_compra ?? "aguardando"));
    if (!item.meta?.centro_custo) badge(wsDef.getCell(row, 12), "danger");
  });
  wsDef.pageSetup.printArea = `A1:O${Math.max(4 + defeitos.length, 5)}`;

  // ---------------------------- CENTRO DE CUSTO ----------------------------
  const ccHeaders = ["Centro de custo", "Descrição / Área", "Responsável", "OS vinculada", "Material / Defeito", "Origem", "Valor estimado", "Observação"];
  const wsCC = wb.addWorksheet("Centro de Custo");
  setupSheet(wsCC, C.cyan, "landscape");
  wsCC.columns = [{ width: 24 }, { width: 28 }, { width: 22 }, { width: 14 }, { width: 42 }, { width: 16 }, { width: 16 }, { width: 32 }];
  titleBlock(wsCC, "Centro de Custo · Classificação", "Complete a classificação antes do encaminhamento de compra à Facilities.", ccHeaders.length);
  headerRow(wsCC, 4, ccHeaders);
  params.itens.forEach((item, index) => {
    wsCC.getRow(5 + index).values = [
      item.meta?.centro_custo ?? "", "", "", item.numeroOs, item.descricao,
      item.origem === "refrigeracao" ? "Refrigeração" : "Corretiva", item.meta?.valor_estimado ?? "", item.meta?.observacao ?? "",
    ];
  });
  styleBody(wsCC, 5, 4 + params.itens.length, ccHeaders.length);
  for (let index = 0; index < params.itens.length; index++) {
    const row = 5 + index;
    const cc = wsCC.getCell(row, 1);
    cc.fill = { type: "pattern", pattern: "solid", fgColor: { argb: params.itens[index].meta?.centro_custo ? C.emeraldBg : C.amberBg } };
    cc.font = { name: FONT, size: 9, bold: true, color: { argb: C.ink } };
    cc.border = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };
    wsCC.getCell(row, 7).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00;"—"';
  }
  const refStart = Math.max(8, 5 + params.itens.length + 2);
  sectionTitle(wsCC, refStart, "Centros de custo cadastrados · referência", 8);
  headerRow(wsCC, refStart + 1, ["Código", "Descrição", "Responsável", "Observação"]);
  params.centros.forEach((center, index) => {
    wsCC.getRow(refStart + 2 + index).values = [center.codigo, center.descricao ?? "", center.responsavel ?? "", center.observacao ?? ""];
  });
  styleBody(wsCC, refStart + 2, refStart + 1 + params.centros.length, 4);
  wsCC.views = [{ state: "frozen", ySplit: 4 }];
  wsCC.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: ccHeaders.length } };
  wsCC.pageSetup.printArea = `A1:H${Math.max(refStart + 1 + params.centros.length, 5)}`;

  // ---------------------------- ENVIOS ----------------------------
  const envHeaders = ["Data/hora do envio", "Centro de custo", "Destinatário", "Canal", "Itens enviados", "Observação", "Detalhamento"];
  const wsEnv = wb.addWorksheet("Envios Facilities");
  setupSheet(wsEnv, C.emerald, "landscape");
  wsEnv.columns = [{ width: 22 }, { width: 20 }, { width: 26 }, { width: 16 }, { width: 14 }, { width: 34 }, { width: 64 }];
  titleBlock(wsEnv, "Envios à Facilities · Rastreabilidade", "Histórico dos pedidos encaminhados para compra e atendimento.", envHeaders.length);
  headerRow(wsEnv, 4, envHeaders);
  params.envios.forEach((envio, index) => {
    wsEnv.getRow(5 + index).values = [
      fmtDate(envio.enviado_em), envio.centro_custo ?? "", envio.destinatario ?? "", envio.canal ?? "", envio.total_itens,
      envio.observacao ?? "", (envio.itens ?? []).map((item) => `OS ${item.numeroOs} — ${item.descricao}`).join(" | "),
    ];
  });
  styleBody(wsEnv, 5, 4 + params.envios.length, envHeaders.length);
  for (let index = 0; index < params.envios.length; index++) {
    badge(wsEnv.getCell(5 + index, 5), "ok");
  }
  wsEnv.pageSetup.printArea = `A1:G${Math.max(4 + params.envios.length, 5)}`;

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
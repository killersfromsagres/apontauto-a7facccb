// Exportador Excel do módulo "Solicitação de Materiais".
// Gera uma planilha pronta para envio ao Suprimentos/Facilities,
// sem preenchimento manual item a item.

import type { CarrinhoItem, Solicitacao } from "./data";
import { PRIORIDADE_LABEL, STATUS_LABEL } from "./data";

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

const C = {
  ink: argb("#0B1220"),
  brand: argb("#0B3D91"),
  accent: argb("#1F6FEB"),
  white: argb("#FFFFFF"),
  slate700: argb("#334155"),
  slate200: argb("#E2E8F0"),
  slate50: argb("#F8FAFC"),
  warnBg: argb("#FEF3C7"),
  warnFg: argb("#92400E"),
  okBg: argb("#DCFCE7"),
  okFg: argb("#166534"),
  infoBg: argb("#DBEAFE"),
  infoFg: argb("#1E40AF"),
  dangerBg: argb("#FEE2E2"),
  dangerFg: argb("#991B1B"),
};

const FONT = "Aptos";

function fmtDate(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString("pt-BR");
}

function titleBlock(ws: any, title: string, subtitle: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { name: FONT, size: 18, bold: true, color: { argb: C.white } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brand } };
  ws.getRow(1).height = 34;

  ws.mergeCells(2, 1, 2, cols);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { name: FONT, size: 10, color: { argb: C.white } };
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.accent } };
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 6;
}

function headerRow(ws: any, rowIdx: number, headers: string[]) {
  const row = ws.getRow(rowIdx);
  headers.forEach((h, i) => {
    const cell = row.getCell(i + 1);
    cell.value = h;
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate700 } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: C.slate200 } },
      bottom: { style: "thin", color: { argb: C.slate200 } },
      left: { style: "thin", color: { argb: C.slate200 } },
      right: { style: "thin", color: { argb: C.slate200 } },
    };
  });
  row.height = 26;
  ws.views = [{ state: "frozen", ySplit: rowIdx }];
  ws.autoFilter = { from: { row: rowIdx, column: 1 }, to: { row: rowIdx, column: headers.length } };
}

function styleBody(ws: any, firstRow: number, lastRow: number, cols: number) {
  for (let r = firstRow; r <= lastRow; r++) {
    const row = ws.getRow(r);
    row.height = 20;
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      cell.alignment = { vertical: "middle", wrapText: true };
      if ((r - firstRow) % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate50 } };
      }
      cell.border = { bottom: { style: "hair", color: { argb: C.slate200 } } };
    }
  }
}

function badge(cell: any, kind: "ok" | "warn" | "info" | "danger") {
  const map = {
    ok: [C.okBg, C.okFg],
    warn: [C.warnBg, C.warnFg],
    info: [C.infoBg, C.infoFg],
    danger: [C.dangerBg, C.dangerFg],
  } as const;
  const [bg, fg] = map[kind];
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.font = { name: FONT, size: 10, bold: true, color: { argb: fg } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

function prioridadeKind(p: string): "ok" | "warn" | "info" | "danger" {
  if (p === "urgente") return "danger";
  if (p === "alta") return "warn";
  if (p === "baixa") return "ok";
  return "info";
}

export type CabecalhoSolicitacao = {
  numero?: string | null;
  solicitante: string;
  setor?: string | null;
  centroCusto?: string | null;
  predio?: string | null;
  local?: string | null;
  prioridade: string;
  status?: string | null;
  observacao?: string | null;
  criadoEm?: string | null;
};

const ITEM_HEADERS = [
  "Item",
  "Código",
  "Descrição do material",
  "Unidade",
  "Quantidade",
  "Justificativa / aplicação",
];

/** Planilha de uma solicitação (usada no carrinho e no histórico). */
export async function exportSolicitacaoMateriais(params: {
  cabecalho: CabecalhoSolicitacao;
  itens: Array<{
    codigo?: string | null;
    descricao: string;
    unidade: string;
    quantidade: number;
    justificativa?: string | null;
  }>;
}): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto · Solicitação de Materiais";
  wb.created = new Date();

  const { cabecalho, itens } = params;
  const ws = wb.addWorksheet("Solicitação", {
    properties: { defaultRowHeight: 18 },
    pageSetup: { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });
  ws.columns = [
    { width: 8 },
    { width: 16 },
    { width: 52 },
    { width: 12 },
    { width: 14 },
    { width: 44 },
  ];

  titleBlock(
    ws,
    "Solicitação de Materiais",
    `${cabecalho.numero ? cabecalho.numero + " · " : ""}Gerado em ${new Date().toLocaleString("pt-BR")}`,
    ITEM_HEADERS.length,
  );

  // Bloco de identificação
  const info: [string, string][] = [
    ["Solicitante", cabecalho.solicitante || "—"],
    ["Setor / equipe", cabecalho.setor || "—"],
    ["Centro de custo", cabecalho.centroCusto || "—"],
    ["Prédio", cabecalho.predio || "—"],
    ["Local / andar", cabecalho.local || "—"],
    ["Prioridade", PRIORIDADE_LABEL[cabecalho.prioridade as never] ?? cabecalho.prioridade],
    [
      "Situação",
      cabecalho.status ? (STATUS_LABEL[cabecalho.status as never] ?? cabecalho.status) : "—",
    ],
    ["Data da solicitação", fmtDate(cabecalho.criadoEm) || new Date().toLocaleString("pt-BR")],
  ];

  let r = 4;
  for (const [label, value] of info) {
    const a = ws.getCell(r, 1);
    ws.mergeCells(r, 1, r, 2);
    a.value = label;
    a.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate700 } };
    a.alignment = { vertical: "middle", indent: 1 };
    ws.mergeCells(r, 3, r, ITEM_HEADERS.length);
    const b = ws.getCell(r, 3);
    b.value = value;
    b.font = { name: FONT, size: 10, color: { argb: C.ink } };
    b.alignment = { vertical: "middle", indent: 1 };
    if (label === "Prioridade") badge(b, prioridadeKind(cabecalho.prioridade));
    ws.getRow(r).height = 19;
    r += 1;
  }

  if (cabecalho.observacao) {
    ws.mergeCells(r, 1, r, 2);
    const a = ws.getCell(r, 1);
    a.value = "Observações";
    a.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate700 } };
    a.alignment = { vertical: "middle", indent: 1 };
    ws.mergeCells(r, 3, r, ITEM_HEADERS.length);
    const b = ws.getCell(r, 3);
    b.value = cabecalho.observacao;
    b.font = { name: FONT, size: 10, color: { argb: C.ink } };
    b.alignment = { vertical: "middle", wrapText: true, indent: 1 };
    ws.getRow(r).height = 32;
    r += 1;
  }

  r += 1;
  const headerIdx = r;
  headerRow(ws, headerIdx, ITEM_HEADERS);

  itens.forEach((i, idx) => {
    const row = ws.getRow(headerIdx + 1 + idx);
    row.values = [
      idx + 1,
      i.codigo || "",
      i.descricao,
      i.unidade,
      Number(i.quantidade ?? 0),
      i.justificativa || "",
    ];
  });
  const lastRow = headerIdx + itens.length;
  styleBody(ws, headerIdx + 1, lastRow, ITEM_HEADERS.length);
  for (let idx = 0; idx < itens.length; idx++) {
    const row = headerIdx + 1 + idx;
    ws.getCell(row, 1).alignment = { vertical: "middle", horizontal: "center" };
    ws.getCell(row, 4).alignment = { vertical: "middle", horizontal: "center" };
    const q = ws.getCell(row, 5);
    q.alignment = { vertical: "middle", horizontal: "center" };
    q.numFmt = "#,##0.##";
    q.font = { name: FONT, size: 10, bold: true, color: { argb: C.ink } };
  }

  // Total de itens
  const totalRow = lastRow + 1;
  ws.mergeCells(totalRow, 1, totalRow, 4);
  const tl = ws.getCell(totalRow, 1);
  tl.value = "Total de itens solicitados";
  tl.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
  tl.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  tl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate700 } };
  const tv = ws.getCell(totalRow, 5);
  tv.value = itens.length > 0 ? { formula: `SUM(E${headerIdx + 1}:E${lastRow})` } : 0;
  tv.numFmt = "#,##0.##";
  tv.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } };
  tv.alignment = { vertical: "middle", horizontal: "center" };
  tv.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate700 } };
  ws.getCell(totalRow, 6).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: C.slate700 },
  };
  ws.getRow(totalRow).height = 22;

  // Assinaturas
  const sigRow = totalRow + 3;
  const sigs = ["Solicitante", "Aprovação — Gestor", "Recebido por — Suprimentos"];
  sigs.forEach((label, i) => {
    const col = i * 2 + 1;
    ws.mergeCells(sigRow, col, sigRow, Math.min(col + 1, ITEM_HEADERS.length));
    const c = ws.getCell(sigRow, col);
    c.value = label;
    c.font = { name: FONT, size: 9, color: { argb: C.slate700 } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.border = { top: { style: "thin", color: { argb: C.slate700 } } };
  });

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Planilha consolidada com várias solicitações (histórico do colaborador). */
export async function exportHistoricoSolicitacoes(sols: Solicitacao[]): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto · Solicitação de Materiais";
  wb.created = new Date();

  const headers = [
    "Solicitação",
    "Data",
    "Solicitante",
    "Setor",
    "Centro de custo",
    "Prédio",
    "Local",
    "Prioridade",
    "Situação",
    "Código",
    "Material",
    "Un.",
    "Qtd.",
    "Justificativa",
  ];
  const ws = wb.addWorksheet("Solicitações", { pageSetup: { orientation: "landscape" } });
  ws.columns = [
    { width: 18 },
    { width: 18 },
    { width: 24 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 13 },
    { width: 14 },
    { width: 14 },
    { width: 42 },
    { width: 8 },
    { width: 9 },
    { width: 38 },
  ];
  titleBlock(
    ws,
    "Histórico de Solicitações de Materiais",
    `Consolidado de ${sols.length} solicitação(ões) · Gerado em ${new Date().toLocaleString("pt-BR")}`,
    headers.length,
  );
  headerRow(ws, 4, headers);

  let row = 5;
  for (const s of sols) {
    const linhas = s.itens.length > 0 ? s.itens : [null];
    for (const it of linhas) {
      ws.getRow(row).values = [
        s.numero,
        fmtDate(s.enviada_em ?? s.created_at),
        s.solicitante,
        s.setor ?? "",
        s.centro_custo ?? "",
        s.predio ?? "",
        s.local ?? "",
        PRIORIDADE_LABEL[s.prioridade] ?? s.prioridade,
        STATUS_LABEL[s.status] ?? s.status,
        it?.codigo ?? "",
        it?.descricao ?? "—",
        it?.unidade ?? "",
        it ? Number(it.quantidade) : "",
        it?.justificativa ?? "",
      ];
      row += 1;
    }
  }
  styleBody(ws, 5, row - 1, headers.length);
  for (let r2 = 5; r2 < row; r2++) {
    ws.getCell(r2, 13).numFmt = "#,##0.##";
    ws.getCell(r2, 13).alignment = { vertical: "middle", horizontal: "center" };
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

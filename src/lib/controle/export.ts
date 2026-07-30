// Exportador Excel do módulo "Controle de Materiais".
// Abas: Resumo · Peças · Defeitos · Centro de Custo (preenchimento manual)
// · Envios Facilities.

import type { ControleItem, CentroCusto, EnvioFacilities } from "./data";
import { STATUS_COMPRA_LABEL } from "./data";

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

const C = {
  ink: argb("#0B1220"),
  brand: argb("#0B3D91"),
  accent: argb("#1F6FEB"),
  cyan: argb("#0EA5E9"),
  white: argb("#FFFFFF"),
  slate700: argb("#334155"),
  slate500: argb("#64748B"),
  slate200: argb("#E2E8F0"),
  slate100: argb("#F1F5F9"),
  slate50: argb("#F8FAFC"),
  okBg: argb("#DCFCE7"),
  okFg: argb("#166534"),
  warnBg: argb("#FEF3C7"),
  warnFg: argb("#92400E"),
  dangerBg: argb("#FEE2E2"),
  dangerFg: argb("#991B1B"),
  infoBg: argb("#DBEAFE"),
  infoFg: argb("#1E40AF"),
};

const FONT = "Aptos";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
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
      cell.border = {
        bottom: { style: "hair", color: { argb: C.slate200 } },
      };
    }
  }
}

function badge(cell: any, kind: "ok" | "warn" | "danger" | "info" | "neutral") {
  const map = {
    ok: [C.okBg, C.okFg],
    warn: [C.warnBg, C.warnFg],
    danger: [C.dangerBg, C.dangerFg],
    info: [C.infoBg, C.infoFg],
    neutral: [C.slate100, C.slate700],
  } as const;
  const [bg, fg] = map[kind];
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.font = { name: FONT, size: 10, bold: true, color: { argb: fg } };
  cell.alignment = { vertical: "middle", horizontal: "center" };
}

function statusKind(status: string): "ok" | "warn" | "danger" | "info" | "neutral" {
  if (status === "recebido" || status === "comprado") return "ok";
  if (status === "solicitado" || status === "em_cotacao") return "info";
  if (status === "cancelado") return "danger";
  return "warn";
}

export async function exportControleMateriais(params: {
  itens: ControleItem[];
  centros: CentroCusto[];
  envios: EnvioFacilities[];
}): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto · Controle de Materiais";
  wb.created = new Date();

  const geradoEm = new Date().toLocaleString("pt-BR");
  const pecas = params.itens.filter((i) => i.tipo === "peca");
  const defeitos = params.itens.filter((i) => i.tipo === "problema");

  /* ---------------------------- Resumo ---------------------------- */
  const resumo = wb.addWorksheet("Resumo", {
    properties: { defaultRowHeight: 18 },
    pageSetup: { orientation: "landscape", fitToPage: true },
  });
  resumo.columns = [{ width: 38 }, { width: 22 }, { width: 22 }, { width: 22 }, { width: 22 }];
  titleBlock(
    resumo,
    "Controle de Materiais",
    `Pedidos de peças e defeitos — Refrigeração e Corretiva · Gerado em ${geradoEm}`,
    5,
  );

  const kpis: [string, string | number][] = [
    ["Total de registros", params.itens.length],
    ["Pedidos de peças", pecas.length],
    ["Defeitos apontados", defeitos.length],
    ["Refrigeração", params.itens.filter((i) => i.origem === "refrigeracao").length],
    ["Corretiva", params.itens.filter((i) => i.origem === "corretiva").length],
    [
      "Solicitados à Facilities",
      params.itens.filter((i) => i.meta?.data_solicitacao_facilities).length,
    ],
    [
      "Aguardando solicitação",
      params.itens.filter((i) => !i.meta?.data_solicitacao_facilities).length,
    ],
    ["Sem centro de custo", params.itens.filter((i) => !i.meta?.centro_custo).length],
  ];

  let r = 4;
  resumo.getCell(r, 1).value = "Indicadores";
  resumo.getCell(r, 1).font = { name: FONT, size: 12, bold: true, color: { argb: C.brand } };
  r += 1;
  for (const [label, value] of kpis) {
    const a = resumo.getCell(r, 1);
    const b = resumo.getCell(r, 2);
    a.value = label;
    a.font = { name: FONT, size: 10, color: { argb: C.slate700 } };
    b.value = value;
    b.font = { name: FONT, size: 12, bold: true, color: { argb: C.ink } };
    b.alignment = { horizontal: "left" };
    resumo.getRow(r).height = 20;
    r += 1;
  }

  r += 1;
  resumo.getCell(r, 1).value = "Situação de compra";
  resumo.getCell(r, 1).font = { name: FONT, size: 12, bold: true, color: { argb: C.brand } };
  r += 1;
  for (const [key, label] of Object.entries(STATUS_COMPRA_LABEL)) {
    const count = params.itens.filter(
      (i) => (i.meta?.status_compra ?? "aguardando") === key,
    ).length;
    resumo.getCell(r, 1).value = label;
    resumo.getCell(r, 1).font = { name: FONT, size: 10, color: { argb: C.slate700 } };
    const cell = resumo.getCell(r, 2);
    cell.value = count;
    badge(cell, statusKind(key));
    r += 1;
  }

  r += 1;
  resumo.mergeCells(r, 1, r, 5);
  const note = resumo.getCell(r, 1);
  note.value =
    'IMPORTANTE: preencha a aba "Centro de Custo" antes de encaminhar a solicitação de compra à área de Facilities.';
  note.font = { name: FONT, size: 10, bold: true, color: { argb: C.warnFg } };
  note.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.warnBg } };
  note.alignment = { vertical: "middle", indent: 1 };
  resumo.getRow(r).height = 24;

  /* ------------------------- Peças / Defeitos ------------------------- */
  const pecaHeaders = [
    "Origem",
    "OS",
    "Descrição da atividade",
    "Prédio",
    "Andar",
    "Local",
    "Equipe",
    "Material solicitado",
    "Modelo / Ref.",
    "Qtd",
    "Urgência",
    "Status gestor",
    "Situação da compra",
    "Centro de custo",
    "Nº requisição",
    "Fornecedor",
    "Valor estimado",
    "Data solicitação Facilities",
    "Solicitado por",
    "Observação",
    "Apontado em",
  ];

  const wsPecas = wb.addWorksheet("Peças", { pageSetup: { orientation: "landscape" } });
  wsPecas.columns = [
    { width: 14 },
    { width: 12 },
    { width: 34 },
    { width: 14 },
    { width: 10 },
    { width: 18 },
    { width: 16 },
    { width: 34 },
    { width: 18 },
    { width: 7 },
    { width: 12 },
    { width: 14 },
    { width: 20 },
    { width: 18 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 22 },
    { width: 18 },
    { width: 30 },
    { width: 18 },
  ];
  titleBlock(
    wsPecas,
    "Pedidos de Peças",
    `Refrigeração + Corretiva · ${pecas.length} registros`,
    pecaHeaders.length,
  );
  headerRow(wsPecas, 4, pecaHeaders);

  pecas.forEach((i, idx) => {
    const row = wsPecas.getRow(5 + idx);
    row.values = [
      i.origem === "refrigeracao" ? "Refrigeração" : "Corretiva",
      i.numeroOs,
      i.descricaoOs ?? "",
      i.predio ?? "",
      i.andar ?? "",
      i.local ?? "",
      i.equipe ?? "",
      i.descricao,
      i.modelo ?? "",
      i.quantidade ?? "",
      i.urgencia ?? "",
      i.statusGestor,
      STATUS_COMPRA_LABEL[i.meta?.status_compra ?? "aguardando"],
      i.meta?.centro_custo ?? "",
      i.meta?.numero_requisicao ?? "",
      i.meta?.fornecedor ?? "",
      i.meta?.valor_estimado ?? "",
      fmtDate(i.meta?.data_solicitacao_facilities),
      i.meta?.solicitado_por ?? "",
      i.meta?.observacao ?? "",
      fmtDate(i.criadoEm),
    ];
  });
  styleBody(wsPecas, 5, 4 + pecas.length, pecaHeaders.length);
  pecas.forEach((i, idx) => {
    badge(wsPecas.getCell(5 + idx, 13), statusKind(i.meta?.status_compra ?? "aguardando"));
    const cc = wsPecas.getCell(5 + idx, 14);
    if (!i.meta?.centro_custo) badge(cc, "danger");
    const val = wsPecas.getCell(5 + idx, 17);
    val.numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00;"—"';
  });

  const defHeaders = [
    "Origem",
    "OS",
    "Descrição da atividade",
    "Prédio",
    "Andar",
    "Local",
    "Equipe",
    "Defeito apontado",
    "Gravidade",
    "Status gestor",
    "Situação",
    "Centro de custo",
    "Data solicitação Facilities",
    "Observação",
    "Apontado em",
  ];
  const wsDef = wb.addWorksheet("Defeitos", { pageSetup: { orientation: "landscape" } });
  wsDef.columns = [
    { width: 14 },
    { width: 12 },
    { width: 34 },
    { width: 14 },
    { width: 10 },
    { width: 18 },
    { width: 16 },
    { width: 42 },
    { width: 14 },
    { width: 14 },
    { width: 20 },
    { width: 18 },
    { width: 22 },
    { width: 30 },
    { width: 18 },
  ];
  titleBlock(
    wsDef,
    "Defeitos Apontados",
    `Refrigeração + Corretiva · ${defeitos.length} registros`,
    defHeaders.length,
  );
  headerRow(wsDef, 4, defHeaders);
  defeitos.forEach((i, idx) => {
    wsDef.getRow(5 + idx).values = [
      i.origem === "refrigeracao" ? "Refrigeração" : "Corretiva",
      i.numeroOs,
      i.descricaoOs ?? "",
      i.predio ?? "",
      i.andar ?? "",
      i.local ?? "",
      i.equipe ?? "",
      i.descricao,
      i.gravidade ?? "",
      i.statusGestor,
      STATUS_COMPRA_LABEL[i.meta?.status_compra ?? "aguardando"],
      i.meta?.centro_custo ?? "",
      fmtDate(i.meta?.data_solicitacao_facilities),
      i.meta?.observacao ?? "",
      fmtDate(i.criadoEm),
    ];
  });
  styleBody(wsDef, 5, 4 + defeitos.length, defHeaders.length);
  defeitos.forEach((i, idx) => {
    badge(wsDef.getCell(5 + idx, 11), statusKind(i.meta?.status_compra ?? "aguardando"));
  });

  /* ------------------------- Centro de Custo ------------------------- */
  const ccHeaders = [
    "Centro de custo (preencher)",
    "Descrição / Área",
    "Responsável",
    "OS vinculada",
    "Material / Defeito",
    "Origem",
    "Valor estimado",
    "Observação",
  ];
  const wsCC = wb.addWorksheet("Centro de Custo", {
    properties: { tabColor: { argb: C.cyan } },
    pageSetup: { orientation: "landscape" },
  });
  wsCC.columns = [
    { width: 28 },
    { width: 30 },
    { width: 22 },
    { width: 14 },
    { width: 44 },
    { width: 16 },
    { width: 16 },
    { width: 34 },
  ];
  titleBlock(
    wsCC,
    "Centro de Custo — preenchimento manual",
    "Informe o centro de custo de cada item. Campo obrigatório para abrir a solicitação de compra junto à Facilities.",
    ccHeaders.length,
  );
  headerRow(wsCC, 4, ccHeaders);

  params.itens.forEach((i, idx) => {
    wsCC.getRow(5 + idx).values = [
      i.meta?.centro_custo ?? "",
      "",
      "",
      i.numeroOs,
      i.descricao,
      i.origem === "refrigeracao" ? "Refrigeração" : "Corretiva",
      i.meta?.valor_estimado ?? "",
      i.meta?.observacao ?? "",
    ];
  });
  styleBody(wsCC, 5, 4 + params.itens.length, ccHeaders.length);
  for (let idx = 0; idx < params.itens.length; idx++) {
    const cell = wsCC.getCell(5 + idx, 1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.warnBg } };
    cell.font = { name: FONT, size: 10, bold: true, color: { argb: C.ink } };
    cell.border = {
      top: { style: "thin", color: { argb: C.slate200 } },
      bottom: { style: "thin", color: { argb: C.slate200 } },
      left: { style: "thin", color: { argb: C.slate200 } },
      right: { style: "thin", color: { argb: C.slate200 } },
    };
    wsCC.getCell(5 + idx, 7).numFmt = 'R$ #,##0.00;[Red]-R$ #,##0.00;"—"';
  }

  // Lista de centros cadastrados (referência lateral + validação)
  if (params.centros.length > 0) {
    const startRef = 5 + params.itens.length + 3;
    wsCC.getCell(startRef, 1).value = "Centros de custo cadastrados";
    wsCC.getCell(startRef, 1).font = { name: FONT, size: 11, bold: true, color: { argb: C.brand } };
    headerRow(wsCC, startRef + 1, ["Código", "Descrição", "Responsável", "Observação"]);
    params.centros.forEach((c, idx) => {
      wsCC.getRow(startRef + 2 + idx).values = [
        c.codigo,
        c.descricao ?? "",
        c.responsavel ?? "",
        c.observacao ?? "",
      ];
    });
    // headerRow congela a linha; restaura o congelamento do cabeçalho principal
    wsCC.views = [{ state: "frozen", ySplit: 4 }];
    wsCC.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: ccHeaders.length } };
  }

  /* ---------------------- Envios para Facilities ---------------------- */
  const envHeaders = [
    "Data/hora do envio",
    "Centro de custo",
    "Destinatário",
    "Canal",
    "Itens enviados",
    "Observação",
    "Detalhamento",
  ];
  const wsEnv = wb.addWorksheet("Envios Facilities", { pageSetup: { orientation: "landscape" } });
  wsEnv.columns = [
    { width: 22 },
    { width: 20 },
    { width: 26 },
    { width: 16 },
    { width: 14 },
    { width: 34 },
    { width: 60 },
  ];
  titleBlock(
    wsEnv,
    "Comprovação de Solicitações à Facilities",
    "Histórico imutável das datas em que os pedidos de compra foram encaminhados.",
    envHeaders.length,
  );
  headerRow(wsEnv, 4, envHeaders);
  params.envios.forEach((e, idx) => {
    wsEnv.getRow(5 + idx).values = [
      fmtDate(e.enviado_em),
      e.centro_custo ?? "",
      e.destinatario ?? "",
      e.canal ?? "",
      e.total_itens,
      e.observacao ?? "",
      (e.itens ?? []).map((i) => `OS ${i.numeroOs} — ${i.descricao}`).join(" | "),
    ];
  });
  styleBody(wsEnv, 5, 4 + params.envios.length, envHeaders.length);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

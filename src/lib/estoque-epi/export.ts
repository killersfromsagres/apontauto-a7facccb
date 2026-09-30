import type {
  EstoqueColaborador,
  EstoqueEntrega,
  EstoqueItem,
  EstoqueMovimento,
  EstoqueSnapshot,
} from "./data";
import { estoqueStatus, inventoryValue } from "./data";

const NAVY = "FF0B1F33";
const BLUE = "FF0EA5E9";
const CYAN = "FF22D3EE";
const GREEN = "FF16A34A";
const AMBER = "FFF59E0B";
const RED = "FFDC2626";
const WHITE = "FFFFFFFF";
const TEXT = "FF172033";
const MUTED = "FF64748B";
const BORDER = "FFDCE4EC";
const SOFT = "FFF7FAFC";

function fmtDate(value?: string | null): string {
  if (!value) return "—";
  const [y, m, d] = value.slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function money(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(value || 0);
}

function movementLabel(tipo: string): string {
  const labels: Record<string, string> = {
    entrada: "Entrada",
    saida: "Saída",
    devolucao: "Devolução",
    ajuste_positivo: "Ajuste +",
    ajuste_negativo: "Ajuste -",
    descarte: "Descarte",
  };
  return labels[tipo] ?? tipo;
}

function statusColor(status: string): string {
  if (status === "ZERADO" || status === "CRÍTICO") return RED;
  if (status === "COMPRAR") return AMBER;
  if (status === "IDEAL") return GREEN;
  if (status === "ACIMA") return BLUE;
  return MUTED;
}

function applyHeader(row: any, color = NAVY) {
  row.height = 26;
  row.eachCell((cell: any) => {
    cell.font = { name: "Aptos", size: 9, bold: true, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "thin", color: { argb: BORDER } },
    };
  });
}

function addTitle(
  sheet: any,
  title: string,
  subtitle: string,
  endColumn: number,
  accent = BLUE,
) {
  sheet.mergeCells(1, 1, 2, endColumn);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = {
    name: "Aptos Display",
    size: 19,
    bold: true,
    color: { argb: WHITE },
  };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };

  sheet.mergeCells(3, 1, 3, endColumn);
  const subtitleCell = sheet.getCell(3, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = { name: "Aptos", size: 9, color: { argb: MUTED } };
  subtitleCell.alignment = { vertical: "middle" };

  sheet.getCell(1, endColumn).border = {
    right: { style: "thick", color: { argb: accent } },
  };
}

function styleBodyRow(row: any, index: number) {
  row.height = 28;
  row.eachCell((cell: any) => {
    cell.font = { name: "Aptos", size: 9, color: { argb: TEXT } };
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = {
      bottom: { style: "hair", color: { argb: BORDER } },
    };
    if (index % 2 === 1) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
    }
  });
}

function configureSheet(sheet: any) {
  sheet.views = [{ state: "frozen", ySplit: 5, showGridLines: false }];
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.25,
      right: 0.25,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    },
  };
  sheet.headerFooter.oddFooter =
    "&LApont Auto • Estoque EPI & Uniformes&C&P / &N&RAtualizado automaticamente";
}

function addStockSheet(
  workbook: any,
  items: EstoqueItem[],
  movimentos: EstoqueMovimento[],
) {
  const sheet = workbook.addWorksheet("ESTOQUE", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  });
  addTitle(
    sheet,
    "ESTOQUE • EPI & UNIFORMES",
    `Posição atual • ${items.length} itens ativos/inativos • Gerado em ${new Date().toLocaleString("pt-BR")}`,
    18,
  );
  sheet.addRow([]);
  const header = sheet.addRow([
    "Código",
    "Descrição",
    "Categoria",
    "Tamanho",
    "CA",
    "Un.",
    "Entradas",
    "Saídas",
    "Saldo atual",
    "Mínimo",
    "Ideal",
    "% do ideal",
    "Status",
    "Sugestão de compra",
    "Valor unitário",
    "Valor em estoque",
    "Comprado",
    "Entregue",
  ]);
  applyHeader(header);

  const movementTotals = new Map<
    string,
    { entradas: number; saidas: number; comprado: number; entregue: number }
  >();
  movimentos.forEach((mov) => {
    const current = movementTotals.get(mov.item_id) ?? {
      entradas: 0,
      saidas: 0,
      comprado: 0,
      entregue: 0,
    };
    const value = Number(mov.valor_unitario ?? 0) * Number(mov.quantidade ?? 0);
    if (["entrada", "devolucao", "ajuste_positivo"].includes(mov.tipo)) {
      current.entradas += Number(mov.quantidade ?? 0);
      current.comprado += value;
    } else {
      current.saidas += Number(mov.quantidade ?? 0);
      current.entregue += value;
    }
    movementTotals.set(mov.item_id, current);
  });

  items.forEach((item, index) => {
    const status = estoqueStatus(item);
    const movement = movementTotals.get(item.id) ?? {
      entradas: 0,
      saidas: 0,
      comprado: 0,
      entregue: 0,
    };
    const ideal = Number(item.estoque_ideal ?? 0);
    const percentIdeal =
      ideal > 0 ? Number(item.estoque_atual ?? 0) / ideal : null;
    const purchaseSuggestion =
      ideal > 0 ? Math.max(0, ideal - Number(item.estoque_atual ?? 0)) : 0;

    const row = sheet.addRow([
      item.codigo ?? "",
      item.descricao,
      item.categoria,
      item.tamanho ?? "",
      item.ca_numero ?? "",
      item.unidade,
      movement.entradas,
      movement.saidas,
      item.estoque_atual,
      item.estoque_minimo ?? "",
      item.estoque_ideal ?? "",
      percentIdeal ?? "",
      status,
      purchaseSuggestion || "",
      item.valor_unitario ?? "",
      inventoryValue(item),
      movement.comprado,
      movement.entregue,
    ]);
    styleBodyRow(row, index);
    [1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14].forEach((col) => {
      row.getCell(col).alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    });
    row.getCell(12).numFmt = '0.0%';
    row.getCell(13).font = {
      bold: true,
      color: { argb: statusColor(status) },
    };
    row.getCell(15).numFmt = 'R$ #,##0.00';
    row.getCell(16).numFmt = 'R$ #,##0.00';
    row.getCell(17).numFmt = 'R$ #,##0.00';
    row.getCell(18).numFmt = 'R$ #,##0.00';
  });

  const widths = [
    12, 44, 24, 10, 14, 8, 10, 10, 11, 10, 10, 11, 12, 16, 14, 16, 14, 14,
  ];
  widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: Math.max(5, 5 + items.length), column: 18 },
  };
  configureSheet(sheet);
}

function addMovementSheet(workbook: any, movimentos: EstoqueMovimento[]) {
  const sheet = workbook.addWorksheet("MOVIMENTAÇÕES", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  });
  addTitle(
    sheet,
    "MOVIMENTAÇÕES DE ESTOQUE",
    `Datas reais de entrada/retirada, colaboradores e ajustes • ${movimentos.length} registros`,
    14,
    CYAN,
  );
  sheet.addRow([]);
  const header = sheet.addRow([
    "Data da entrada / retirada",
    "Tipo",
    "Código",
    "Item",
    "Categoria",
    "Tamanho",
    "CA",
    "Qtd.",
    "Saldo anterior",
    "Saldo após",
    "Colaborador",
    "Motivo",
    "Documento",
    "Observação",
  ]);
  applyHeader(header);

  movimentos.forEach((mov, index) => {
    const row = sheet.addRow([
      fmtDate(mov.data_movimento),
      movementLabel(mov.tipo),
      mov.item?.codigo ?? "",
      mov.item?.descricao ?? "Item",
      mov.item?.categoria ?? "",
      mov.item?.tamanho ?? "",
      mov.item?.ca_numero ?? "",
      mov.quantidade,
      mov.saldo_anterior,
      mov.saldo_apos,
      mov.colaborador_nome ?? "",
      mov.motivo ?? "",
      mov.documento ?? "",
      mov.observacao ?? "",
    ]);
    styleBodyRow(row, index);
    [1, 2, 3, 6, 7, 8, 9, 10].forEach((col) => {
      row.getCell(col).alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true,
      };
    });
  });

  const widths = [12, 14, 12, 38, 22, 10, 13, 9, 12, 12, 24, 24, 18, 36];
  widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: Math.max(5, 5 + movimentos.length), column: 14 },
  };
  configureSheet(sheet);
}

function addDeliverySheet(workbook: any, entregas: EstoqueEntrega[]) {
  const sheet = workbook.addWorksheet("RETIRADAS", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  });
  addTitle(
    sheet,
    "RETIRADAS POR COLABORADOR",
    "Histórico auditável de EPI e uniformes entregues aos colaboradores",
    11,
    GREEN,
  );
  sheet.addRow([]);
  const header = sheet.addRow([
    "Data da retirada",
    "Colaborador",
    "Matrícula",
    "Setor",
    "Item",
    "CA",
    "Qtd.",
    "Valor unitário",
    "Valor total",
    "Observação",
    "Entrega ID",
  ]);
  applyHeader(header);

  let index = 0;
  entregas.forEach((entrega) => {
    const rows = entrega.itens?.length ? entrega.itens : [null];
    rows.forEach((item) => {
      const qty = Number(item?.quantidade ?? 0);
      const unit = Number(item?.valor_unitario ?? 0);
      const row = sheet.addRow([
        fmtDate(entrega.data_entrega),
        entrega.colaborador_nome,
        entrega.colaborador_matricula ?? "",
        entrega.colaborador_setor ?? "",
        item?.descricao ?? "",
        item?.ca_numero ?? "",
        qty || "",
        item?.valor_unitario ?? "",
        qty * unit || "",
        entrega.observacao ?? "",
        entrega.id,
      ]);
      styleBodyRow(row, index++);
      row.getCell(8).numFmt = 'R$ #,##0.00';
      row.getCell(9).numFmt = 'R$ #,##0.00';
    });
  });

  const widths = [12, 28, 14, 22, 42, 14, 9, 14, 14, 34, 38];
  widths.forEach((width, index2) => (sheet.getColumn(index2 + 1).width = width));
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: Math.max(5, 5 + index), column: 11 },
  };
  configureSheet(sheet);
}

function addCollaboratorSheet(
  workbook: any,
  colaboradores: EstoqueColaborador[],
  entregas: EstoqueEntrega[],
) {
  const counts = new Map<string, { retiradas: number; itens: number }>();
  entregas.forEach((entrega) => {
    if (!entrega.colaborador_id) return;
    const current = counts.get(entrega.colaborador_id) ?? { retiradas: 0, itens: 0 };
    current.retiradas += 1;
    current.itens += (entrega.itens ?? []).reduce(
      (sum, item) => sum + Number(item.quantidade ?? 0),
      0,
    );
    counts.set(entrega.colaborador_id, current);
  });

  const sheet = workbook.addWorksheet("COLABORADORES", {
    views: [{ state: "frozen", ySplit: 5, showGridLines: false }],
  });
  addTitle(
    sheet,
    "COLABORADORES • CONTROLE DE RETIRADAS",
    "Cadastro vinculado às entregas de EPI e uniformes",
    9,
    GREEN,
  );
  sheet.addRow([]);
  const header = sheet.addRow([
    "Nome",
    "Matrícula",
    "Setor",
    "Cargo",
    "Unidade",
    "Status",
    "Retiradas",
    "Itens entregues",
    "Cadastro",
  ]);
  applyHeader(header);

  colaboradores.forEach((colab, index) => {
    const stats = counts.get(colab.id) ?? { retiradas: 0, itens: 0 };
    const row = sheet.addRow([
      colab.nome,
      colab.matricula ?? "",
      colab.setor ?? "",
      colab.cargo ?? "",
      colab.unidade ?? "",
      colab.ativo ? "ATIVO" : "INATIVO",
      stats.retiradas,
      stats.itens,
      fmtDate(colab.created_at),
    ]);
    styleBodyRow(row, index);
  });

  const widths = [30, 14, 22, 22, 18, 12, 10, 14, 12];
  widths.forEach((width, index) => (sheet.getColumn(index + 1).width = width));
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: Math.max(5, 5 + colaboradores.length), column: 9 },
  };
  configureSheet(sheet);
}

function addSummarySheet(workbook: any, snapshot: EstoqueSnapshot) {
  const items = snapshot.items.filter((item) => item.ativo);
  const totalValue = items.reduce((sum, item) => sum + inventoryValue(item), 0);
  const qty = items.reduce((sum, item) => sum + Number(item.estoque_atual || 0), 0);
  const critical = items.filter((item) =>
    ["ZERADO", "CRÍTICO", "COMPRAR"].includes(estoqueStatus(item)),
  );
  const categoryCounts = new Map<string, { itens: number; qtd: number; valor: number }>();
  items.forEach((item) => {
    const current = categoryCounts.get(item.categoria) ?? {
      itens: 0,
      qtd: 0,
      valor: 0,
    };
    current.itens += 1;
    current.qtd += Number(item.estoque_atual || 0);
    current.valor += inventoryValue(item);
    categoryCounts.set(item.categoria, current);
  });

  const sheet = workbook.addWorksheet("RESUMO", {
    views: [{ showGridLines: false }],
  });
  sheet.columns = Array.from({ length: 10 }, () => ({ width: 16 }));
  sheet.mergeCells("A1:J2");
  const title = sheet.getCell("A1");
  title.value = "APONT AUTO • CONTROLE DE ESTOQUE";
  title.font = {
    name: "Aptos Display",
    size: 22,
    bold: true,
    color: { argb: WHITE },
  };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  title.alignment = { horizontal: "left", vertical: "middle" };

  sheet.mergeCells("A3:J3");
  const subtitle = sheet.getCell("A3");
  subtitle.value =
    "Uniformes, EPIs, entradas, saídas e rastreabilidade por colaborador";
  subtitle.font = { name: "Aptos", size: 10, color: { argb: MUTED } };

  const cards = [
    ["A5:B7", "ITENS CADASTRADOS", items.length, BLUE],
    ["D5:E7", "UNIDADES EM ESTOQUE", qty, CYAN],
    ["G5:H7", "VALOR DO ESTOQUE", money(totalValue), GREEN],
    ["I5:J7", "ATENÇÃO / COMPRA", critical.length, AMBER],
  ] as const;

  cards.forEach(([range, label, value, color]) => {
    sheet.mergeCells(range);
    const start = range.split(":")[0];
    const cell = sheet.getCell(start);
    cell.value = `${label}\n${value}`;
    cell.font = {
      name: "Aptos Display",
      size: 12,
      bold: true,
      color: { argb: WHITE },
    };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: color } };
    cell.alignment = {
      horizontal: "center",
      vertical: "middle",
      wrapText: true,
    };
  });

  sheet.getCell("A10").value = "Categoria";
  sheet.getCell("B10").value = "Itens";
  sheet.getCell("C10").value = "Quantidade";
  sheet.getCell("D10").value = "Valor";
  applyHeader(sheet.getRow(10));

  let rowIndex = 11;
  [...categoryCounts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], "pt-BR"))
    .forEach(([category, stats], index) => {
      const row = sheet.getRow(rowIndex++);
      row.values = [category, stats.itens, stats.qtd, stats.valor];
      styleBodyRow(row, index);
      row.getCell(4).numFmt = 'R$ #,##0.00';
    });

  const criticalStart = Math.max(rowIndex + 2, 22);
  sheet.getCell(criticalStart, 1).value = "Itens para atenção";
  sheet.getCell(criticalStart, 1).font = {
    size: 12,
    bold: true,
    color: { argb: TEXT },
  };
  const criticalHeader = sheet.getRow(criticalStart + 1);
  criticalHeader.values = [
    "Descrição",
    "Categoria",
    "Saldo",
    "Mínimo",
    "Ideal",
    "Status",
  ];
  applyHeader(criticalHeader, NAVY);

  critical
    .sort((a, b) => a.estoque_atual - b.estoque_atual)
    .slice(0, 40)
    .forEach((item, index) => {
      const row = sheet.getRow(criticalStart + 2 + index);
      const status = estoqueStatus(item);
      row.values = [
        item.descricao,
        item.categoria,
        item.estoque_atual,
        item.estoque_minimo ?? "",
        item.estoque_ideal ?? "",
        status,
      ];
      styleBodyRow(row, index);
      row.getCell(6).font = {
        bold: true,
        color: { argb: statusColor(status) },
      };
    });

  sheet.getColumn(1).width = 46;
  sheet.getColumn(2).width = 24;
  sheet.getColumn(3).width = 14;
  sheet.getColumn(4).width = 16;
  sheet.getColumn(5).width = 12;
  sheet.getColumn(6).width = 14;
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  sheet.headerFooter.oddFooter =
    "&LApont Auto • Gestão de Estoque&C&P / &N&RRelatório atualizado";
}

export async function generateEstoqueWorkbook(snapshot: EstoqueSnapshot) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Apont Auto";
  workbook.company = "In Haus Industrial";
  workbook.title = "Controle de Estoque • Uniformes e EPIs";
  workbook.subject = "Estoque, movimentações, retiradas e colaboradores";
  workbook.created = new Date();

  addSummarySheet(workbook, snapshot);
  addStockSheet(workbook, snapshot.items, snapshot.movimentos);
  addMovementSheet(workbook, snapshot.movimentos);
  addDeliverySheet(workbook, snapshot.entregas);
  addCollaboratorSheet(workbook, snapshot.colaboradores, snapshot.entregas);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const stamp = new Date().toISOString().slice(0, 10).split("-").reverse().join("-");
  return {
    blob,
    filename: `CONTROLE DE ESTOQUE EPI E UNIFORMES - ${stamp}.xlsx`,
  };
}

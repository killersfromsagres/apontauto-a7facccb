import { OsCacheRow } from "./db";
import { isPreventiva } from "./preventiva-import";

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

const C = {
  ink: argb("#0F172A"),
  brand: argb("#0B1220"),
  brandSoft: argb("#172033"),
  accent: argb("#2563EB"),
  accentSoft: argb("#EFF6FF"),
  white: argb("#FFFFFF"),
  slate700: argb("#334155"),
  slate500: argb("#64748B"),
  slate300: argb("#CBD5E1"),
  slate200: argb("#E2E8F0"),
  slate100: argb("#F1F5F9"),
  slate50: argb("#F8FAFC"),
  warnBg: argb("#FFF7E6"),
  warnFg: argb("#9A6700"),
  okBg: argb("#ECFDF3"),
  okFg: argb("#067647"),
  infoBg: argb("#EFF8FF"),
  infoFg: argb("#175CD3"),
  dangerBg: argb("#FEF3F2"),
  dangerFg: argb("#B42318"),
};

const FONT = "Aptos";

const thinBorder = {
  style: "thin",
  color: { argb: C.slate200 },
} as const;

function titleBlock(ws: any, title: string, subtitle: string, cols: number) {
  ws.mergeCells(1, 1, 1, cols);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = title;
  titleCell.font = {
    name: FONT,
    size: 20,
    bold: true,
    color: { argb: C.white },
  };
  titleCell.alignment = {
    vertical: "middle",
    horizontal: "left",
    indent: 1,
  };
  titleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: C.brand },
  };
  ws.getRow(1).height = 38;

  ws.mergeCells(2, 1, 2, cols);
  const subtitleCell = ws.getCell(2, 1);
  subtitleCell.value = subtitle;
  subtitleCell.font = {
    name: FONT,
    size: 10,
    bold: true,
    color: { argb: C.white },
  };
  subtitleCell.alignment = {
    vertical: "middle",
    horizontal: "left",
    indent: 1,
  };
  subtitleCell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: C.accent },
  };
  ws.getRow(2).height = 22;

  const accentRow = ws.getRow(3);
  accentRow.height = 5;
  for (let c = 1; c <= cols; c += 1) {
    accentRow.getCell(c).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: C.accentSoft },
    };
  }
}

function headerRow(ws: any, rowIdx: number, headers: string[]) {
  const row = ws.getRow(rowIdx);

  headers.forEach((header, index) => {
    const cell = row.getCell(index + 1);
    cell.value = header;
    cell.font = {
      name: FONT,
      size: 10,
      bold: true,
      color: { argb: C.white },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: C.brandSoft },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
    cell.border = {
      top: thinBorder,
      bottom: { style: "medium", color: { argb: C.accent } },
      left: thinBorder,
      right: thinBorder,
    };
  });

  row.height = 30;
  ws.views = [
    {
      state: "frozen",
      ySplit: rowIdx,
      activeCell: `A${rowIdx + 1}`,
      showGridLines: false,
    },
  ];
}

function styleBody(ws: any, firstRow: number, lastRow: number, cols: number) {
  for (let r = firstRow; r <= lastRow; r += 1) {
    const row = ws.getRow(r);
    row.height = 34;

    for (let c = 1; c <= cols; c += 1) {
      const cell = row.getCell(c);
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      cell.alignment = {
        vertical: "middle",
        wrapText: true,
        horizontal: "left",
        indent: c === 1 ? 0 : 1,
      };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: (r - firstRow) % 2 === 0 ? C.white : C.slate50 },
      };
      cell.border = {
        bottom: thinBorder,
        left: thinBorder,
        right: thinBorder,
      };
    }

    row.getCell(1).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(2).font = {
      name: FONT,
      size: 10,
      bold: true,
      color: { argb: C.infoFg },
    };
    row.getCell(3).font = {
      name: FONT,
      size: 10,
      bold: true,
      color: { argb: C.slate700 },
    };
    row.getCell(8).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(9).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(10).alignment = { vertical: "middle", horizontal: "center" };
    row.getCell(11).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  }
}

function highlightOperationalStatus(
  row: any,
  slaText: string,
  materialSolicitado: boolean,
  status: string,
) {
  const slaCell = row.getCell(9);
  if (slaText === "No prazo") {
    slaCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.okFg } };
    slaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.okBg } };
  } else {
    slaCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.dangerFg } };
    slaCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.dangerBg } };
  }

  const materialCell = row.getCell(10);
  if (materialSolicitado) {
    materialCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.warnFg } };
    materialCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.warnBg } };
  } else {
    materialCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate500 } };
    materialCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
  }

  const normalizedStatus = status.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  const statusCell = row.getCell(11);

  if (["CONCLUIDO", "FINALIZADO", "FECHADO"].includes(normalizedStatus)) {
    statusCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.okFg } };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.okBg } };
  } else if (["EM ANDAMENTO", "EM EXECUCAO", "EXECUCAO"].includes(normalizedStatus)) {
    statusCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.infoFg } };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.infoBg } };
  } else {
    statusCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.slate700 } };
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate100 } };
  }
}

function styleSummaryRow(ws: any, rowIdx: number, cols: number, total: number) {
  ws.mergeCells(rowIdx, 1, rowIdx, 5);
  const labelCell = ws.getCell(rowIdx, 1);
  labelCell.value = "RESUMO DA PROGRAMAÇÃO";
  labelCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.white } };
  labelCell.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brandSoft } };

  ws.mergeCells(rowIdx, 6, rowIdx, cols);
  const totalCell = ws.getCell(rowIdx, 6);
  totalCell.value = `Total: ${total} chamados em aberto`;
  totalCell.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } };
  totalCell.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.accent } };

  for (let c = 1; c <= cols; c += 1) {
    ws.getCell(rowIdx, c).border = {
      top: { style: "medium", color: { argb: C.accent } },
      bottom: thinBorder,
    };
  }

  ws.getRow(rowIdx).height = 30;
}

export async function generateProgramacaoExcel(
  osList: OsCacheRow[],
  equipeFiltro: string,
  aba: "corretiva" | "preventiva",
) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto · Programação";
  wb.company = "Apont Auto";
  wb.subject = "Programação de execução de campo";
  wb.created = new Date();

  const title = aba === "preventiva" ? "Programação de Backorder" : "Programação de Corretivas";
  const ws = wb.addWorksheet("Programação", {
    properties: {
      defaultRowHeight: 18,
      tabColor: { argb: C.accent },
    },
    pageSetup: {
      orientation: "landscape",
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: {
        left: 0.25,
        right: 0.25,
        top: 0.55,
        bottom: 0.55,
        header: 0.2,
        footer: 0.2,
      },
    },
  });

  const headers = [
    "ID",
    "OS",
    "Equipe",
    "Solicitante",
    "Prédio / Andar",
    "Local",
    "Descrição do Serviço",
    "Abertura",
    "SLA (Atraso)",
    "Material",
    "Status Atual",
  ];

  ws.columns = [
    { width: 7 },
    { width: 14 },
    { width: 19 },
    { width: 27 },
    { width: 23 },
    { width: 24 },
    { width: 52 },
    { width: 15 },
    { width: 16 },
    { width: 16 },
    { width: 17 },
  ];

  titleBlock(
    ws,
    title.toUpperCase(),
    `Equipe: ${equipeFiltro.toUpperCase()}  •  Gerado em ${new Date().toLocaleString("pt-BR")}`,
    headers.length,
  );

  const headerIdx = 4;
  headerRow(ws, headerIdx, headers);

  const operationalRows: Array<{
    row: any;
    slaText: string;
    materialSolicitado: boolean;
    status: string;
  }> = [];

  osList.forEach((o, idx) => {
    const rowIdx = headerIdx + 1 + idx;
    const row = ws.getRow(rowIdx);

    const dataAbertura = o.data_criacao
      ? new Date(o.data_criacao).toLocaleDateString("pt-BR")
      : "—";

    let slaText = "No prazo";
    if (o.data_criacao) {
      const diff = Math.floor(
        (new Date().getTime() - new Date(o.data_criacao).getTime()) / (1000 * 60 * 60 * 24),
      );
      if (diff >= 30) {
        slaText = `${diff} dias`;
      }
    }

    const materialSolicitado = o.material_status === "solicitado";
    const status = (o.status || "aberto").toUpperCase();

    row.values = [
      idx + 1,
      o.numero_os,
      o.equipe || "—",
      o.solicitante || "—",
      `${o.predio || ""} / ${o.andar || ""}`,
      o.local || "—",
      o.nome_os || "—",
      dataAbertura,
      slaText,
      materialSolicitado ? "Solicitado" : "N/A",
      status,
    ];

    operationalRows.push({ row, slaText, materialSolicitado, status });
  });

  const lastRow = headerIdx + osList.length;
  styleBody(ws, headerIdx + 1, lastRow, headers.length);
  operationalRows.forEach(({ row, slaText, materialSolicitado, status }) => {
    highlightOperationalStatus(row, slaText, materialSolicitado, status);
  });

  ws.autoFilter = {
    from: { row: headerIdx, column: 1 },
    to: { row: Math.max(headerIdx, lastRow), column: headers.length },
  };
  ws.pageSetup.printTitlesRow = `${headerIdx}:${headerIdx}`;
  ws.pageSetup.printArea = `A1:K${Math.max(headerIdx, lastRow + 2)}`;

  const totalRow = lastRow + 2;
  styleSummaryRow(ws, totalRow, headers.length, osList.length);

  ws.headerFooter.oddFooter =
    `&L&10Apont Auto · Execução de Campo&C&10Página &P de &N&R&10${title}`;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `programacao_${aba}_${equipeFiltro.toLowerCase().replace(/\s+/g, "_")}_${new Date().toISOString().split("T")[0]}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

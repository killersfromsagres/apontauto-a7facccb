import { OsCacheRow } from "./db";
import { isPreventiva } from "./preventiva-import";

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

const C = {
  ink: argb("#0F172A"),
  brand: argb("#0F172A"),
  accent: argb("#3B82F6"),
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
}

function styleBody(ws: any, firstRow: number, lastRow: number, cols: number) {
  for (let r = firstRow; r <= lastRow; r++) {
    const row = ws.getRow(r);
    row.height = 32; // Mais espaçoso
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      cell.font = { name: FONT, size: 10, color: { argb: C.ink } };
      cell.alignment = { vertical: "middle", wrapText: true, horizontal: "left", indent: 1 };
      if ((r - firstRow) % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate50 } };
      }
      cell.border = { 
        bottom: { style: "thin", color: { argb: C.slate200 } }, // Borda mais visível
        right: { style: "thin", color: { argb: C.slate200 } },
        left: { style: "thin", color: { argb: C.slate200 } },
      };
    }
  }
}

export async function generateProgramacaoExcel(osList: OsCacheRow[], equipeFiltro: string, aba: "corretiva" | "preventiva") {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto · Programação";
  wb.created = new Date();

  const title = aba === "preventiva" ? "Programação de Backorder" : "Programação de Corretivas";
  const ws = wb.addWorksheet("Programação", {
    properties: { defaultRowHeight: 18 },
    pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  const headers = ["ID", "OS", "Equipe", "Solicitante", "Prédio / Andar", "Local", "Descrição do Serviço", "Abertura", "SLA (Atraso)", "Material", "Status Atual"];
  ws.columns = [
    { width: 8 },  // ID
    { width: 12 }, // OS
    { width: 18 }, // Equipe
    { width: 25 }, // Solicitante
    { width: 22 }, // Prédio / Andar
    { width: 22 }, // Local
    { width: 50 }, // Descrição
    { width: 15 }, // Abertura
    { width: 15 }, // SLA
    { width: 15 }, // Material
    { width: 15 }, // Status Atual
  ];

  titleBlock(
    ws,
    title.toUpperCase(),
    `Equipe: ${equipeFiltro.toUpperCase()} · Gerado em ${new Date().toLocaleString("pt-BR")}`,
    headers.length
  );

  const headerIdx = 4;
  headerRow(ws, headerIdx, headers);

  osList.forEach((o, idx) => {
    const rowIdx = headerIdx + 1 + idx;
    const row = ws.getRow(rowIdx);
    
    const dataAbertura = o.data_criacao ? new Date(o.data_criacao).toLocaleDateString("pt-BR") : "—";
    let slaText = "No prazo";
    if (o.data_criacao) {
      const diff = Math.floor((new Date().getTime() - new Date(o.data_criacao).getTime()) / (1000 * 60 * 60 * 24));
      if (diff >= 30) {
        slaText = `${diff} dias`;
      }
    }

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
      o.material_status === "solicitado" ? "Solicitado" : "N/A",
      (o.status || "aberto").toUpperCase()
    ];

    // Status Styling
    if (slaText !== "No prazo") {
      const slaCell = row.getCell(9);
      slaCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.dangerFg } };
    }
    if (o.material_status === "solicitado") {
      const matCell = row.getCell(10);
      matCell.font = { name: FONT, size: 10, bold: true, color: { argb: C.warnFg } };
    }
  });

  const lastRow = headerIdx + osList.length;
  styleBody(ws, headerIdx + 1, lastRow, headers.length);

  // Totais no final
  const totalRow = lastRow + 2;
  ws.mergeCells(totalRow, 1, totalRow, 5);
  const tl = ws.getCell(totalRow, 1);
  tl.value = "Resumo da Programação";
  tl.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } };
  tl.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  tl.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brand } };
  
  ws.mergeCells(totalRow, 6, totalRow, headers.length);
  const tr = ws.getCell(totalRow, 6);
  tr.value = `Total: ${osList.length} chamados em aberto`;
  tr.font = { name: FONT, size: 11, bold: true, color: { argb: C.white } };
  tr.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  tr.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brand } };
  ws.getRow(totalRow).height = 28;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `programacao_${aba}_${equipeFiltro.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

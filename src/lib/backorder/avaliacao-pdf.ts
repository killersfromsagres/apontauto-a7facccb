import { SolicitanteResumo, fmtDate } from "./avaliacao-email";

export async function generateAvaliacaoPDF(input: {
  titulo: string;
  resumo: SolicitanteResumo[];
  ano: string | number;
}) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto - Prisma";
  
  const ws = wb.addWorksheet("RELATÓRIO DE AVALIAÇÃO", {
    views: [{ state: "frozen", ySplit: 2, showGridLines: false }],
  });

  const COLUMNS = [
    { key: "nome", label: "SOLICITANTE", width: 45 },
    { key: "concluidos", label: "CONCLUÍDOS", width: 15 },
    { key: "aguardando", label: "AGUARD. APROV.", width: 18 },
    { key: "total", label: "TOTAL PENDENTE", width: 18 },
  ];

  ws.columns = COLUMNS.map(c => ({ key: c.key, width: c.width }));

  // Cores
  const TITLE_BG = "FF0F172A"; // Slate 900
  const HEADER_BG = "FF1E293B"; // Slate 800
  const WHITE = "FFFFFFFF";
  const TEXT_DARK = "FF0F172A";
  const BORDER_COLOR = "FFCBD5E1";
  const ROW_ALT_BG = "FFF8FAFC";

  // Título
  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `${input.titulo} - RELATÓRIO DE AVALIAÇÃO (${input.ano})`;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_BG } };
  titleCell.font = { name: "Segoe UI", bold: true, size: 16, color: { argb: WHITE } };
  titleCell.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 45;

  // Cabeçalho
  const headRow = ws.getRow(2);
  COLUMNS.forEach((c, i) => {
    const cell = headRow.getCell(i + 1);
    cell.value = c.label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.font = { name: "Segoe UI", bold: true, size: 10, color: { argb: WHITE } };
    cell.alignment = { vertical: "middle", horizontal: "center" };
    cell.border = {
      top: { style: "thin", color: { argb: WHITE } },
      bottom: { style: "thin", color: { argb: WHITE } },
      left: { style: "thin", color: { argb: WHITE } },
      right: { style: "thin", color: { argb: WHITE } },
    };
  });
  headRow.height = 30;

  // Dados
  input.resumo.forEach((r, idx) => {
    const row = ws.addRow({
      nome: r.nome,
      concluidos: r.concluidos,
      aguardando: r.aguardando,
      total: r.total
    });

    const isAlt = idx % 2 === 1;
    row.eachCell((cell) => {
      cell.font = { name: "Segoe UI", size: 10, color: { argb: TEXT_DARK } };
      cell.alignment = { vertical: "middle", horizontal: cell.column === 1 ? "left" : "center" };
      cell.border = {
        bottom: { style: "thin", color: { argb: BORDER_COLOR } }
      };
      if (isAlt) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ROW_ALT_BG } };
      }
    });
    row.height = 25;
  });

  // Totais no final
  const totalRow = ws.addRow({
    nome: "TOTAL GERAL",
    concluidos: input.resumo.reduce((a, b) => a + b.concluidos, 0),
    aguardando: input.resumo.reduce((a, b) => a + b.aguardando, 0),
    total: input.resumo.reduce((a, b) => a + b.total, 0)
  });
  
  totalRow.eachCell((cell) => {
    cell.font = { name: "Segoe UI", bold: true, size: 11, color: { argb: WHITE } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG } };
    cell.alignment = { vertical: "middle", horizontal: cell.column === 1 ? "left" : "center" };
  });
  totalRow.height = 30;

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

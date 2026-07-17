// Exportação: XLSX (ExcelJS) + PDF (jsPDF) do Controle de ASO.
// Vendors pesados (ExcelJS, jsPDF) são carregados sob demanda no clique de exportar.
import { downloadBlob } from "@/lib/download";
import { computeStatus, computeDiasAVencer, fmtBr, STATUS_COLOR, STATUS_LABEL, type AsoStatus } from "./aso";

export type SstExportRow = {
  nome: string;
  cpf: string | null;
  matricula: string | null;
  filial: string | null;
  cliente: string | null;
  funcao: string | null;
  supervisor: string | null;
  tipo_exame: string | null;
  data_exame_realizado: string | null;
  data_vencimento: string | null;
  data_sugerida_agendamento: string | null;
  observacao: string | null;
};

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

const COLUMNS: { key: keyof SstExportRow | "status" | "dias"; header: string; width: number }[] = [
  { key: "nome", header: "Nome", width: 32 },
  { key: "cpf", header: "CPF", width: 14 },
  { key: "matricula", header: "Matrícula", width: 12 },
  { key: "funcao", header: "Função", width: 22 },
  { key: "filial", header: "Filial", width: 16 },
  { key: "cliente", header: "Cliente", width: 16 },
  { key: "supervisor", header: "Supervisor", width: 22 },
  { key: "tipo_exame", header: "Tipo de Exame", width: 16 },
  { key: "data_exame_realizado", header: "Último Exame", width: 14 },
  { key: "data_vencimento", header: "Vencimento", width: 14 },
  { key: "data_sugerida_agendamento", header: "Sugestão Agend.", width: 16 },
  { key: "dias", header: "Dias a Vencer", width: 13 },
  { key: "status", header: "Status", width: 16 },
  { key: "observacao", header: "Observação", width: 30 },
];

export async function exportSstXlsx(rows: SstExportRow[], filename = "controle-aso.xlsx") {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto — SST";
  const ws = wb.addWorksheet("Controle ASO", {
    views: [{ state: "frozen", ySplit: 3 }],
  });

  // Título
  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const title = ws.getCell(1, 1);
  title.value = "Segurança do Trabalho — Controle de ASO";
  title.font = { name: "Calibri", size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#1F2A44") } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, COLUMNS.length);
  const sub = ws.getCell(2, 1);
  sub.value = `Gerado em ${new Date().toLocaleString("pt-BR")} — ${rows.length} colaborador(es)`;
  sub.font = { italic: true, color: { argb: "FF64748B" } };
  sub.alignment = { horizontal: "center" };

  // Cabeçalhos
  const headerRow = ws.getRow(3);
  COLUMNS.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = col.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#E86A1C") } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getColumn(i + 1).width = col.width;
  });
  headerRow.height = 22;

  // Dados
  rows.forEach((r) => {
    const status = computeStatus(r.data_vencimento);
    const dias = computeDiasAVencer(r.data_vencimento);
    const row = ws.addRow(
      COLUMNS.map((c) => {
        if (c.key === "status") return STATUS_LABEL[status];
        if (c.key === "dias") return dias ?? "";
        const v = r[c.key as keyof SstExportRow];
        if (c.key.toString().startsWith("data_")) return fmtBr(v as string | null);
        return v ?? "";
      }),
    );
    const color = STATUS_COLOR[status].hex;
    const statusIdx = COLUMNS.findIndex((c) => c.key === "status") + 1;
    const statusCell = row.getCell(statusIdx);
    statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(color) } };
    statusCell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    statusCell.alignment = { horizontal: "center" };
  });

  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: COLUMNS.length } };

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

export async function exportSstPdf(rows: SstExportRow[], filename = "controle-aso.pdf") {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, opts: unknown) => void }).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  doc.setFillColor(31, 42, 68);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 44, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text("Segurança do Trabalho — Controle de ASO", 24, 28);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} — ${rows.length} colaborador(es)`, 24, 40);

  const totals: Record<AsoStatus, number> = { vencido: 0, critico: 0, atencao: 0, em_dia: 0, sem_registro: 0 };

  const body = rows.map((r) => {
    const status = computeStatus(r.data_vencimento);
    totals[status]++;
    const dias = computeDiasAVencer(r.data_vencimento);
    return [
      r.nome,
      r.matricula ?? "—",
      r.funcao ?? "—",
      r.filial ?? "—",
      r.supervisor ?? "—",
      fmtBr(r.data_exame_realizado),
      fmtBr(r.data_vencimento),
      dias == null ? "—" : String(dias),
      STATUS_LABEL[status],
    ];
  });

  autoTable(doc, {
    startY: 56,
    head: [["Nome", "Matr.", "Função", "Filial", "Supervisor", "Últ. Exame", "Vencimento", "Dias", "Status"]],
    body,
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: [232, 106, 28], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data: {
      section: string;
      row: { index: number };
      column: { index: number };
      cell: { styles: { fillColor?: number[]; textColor?: number[]; fontStyle?: string } };
    }) => {
      if (data.section === "body" && data.column.index === 8) {
        const status = computeStatus(rows[data.row.index].data_vencimento);
        const hex = STATUS_COLOR[status].hex.replace("#", "");
        data.cell.styles.fillColor = [
          parseInt(hex.slice(0, 2), 16),
          parseInt(hex.slice(2, 4), 16),
          parseInt(hex.slice(4, 6), 16),
        ];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16;
  doc.setFontSize(9);
  doc.setTextColor(31, 42, 68);
  const summary = (Object.keys(totals) as AsoStatus[])
    .map((k) => `${STATUS_LABEL[k]}: ${totals[k]}`)
    .join("   |   ");
  doc.text(summary, 24, finalY);

  doc.save(filename);
}

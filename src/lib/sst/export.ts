// Exportação completa do Controle de ASO — XLSX (multi-aba) + PDF (multi-tabela).
// Traz todos os campos cadastrais + ASO + extras livres.
import { downloadBlob } from "@/lib/download";
import {
  computeStatus, computeDiasAVencer, fmtBr,
  STATUS_COLOR, STATUS_LABEL, type AsoStatus,
} from "./aso";

export type SstExportRow = {
  nome: string;
  cpf: string | null;
  matricula: string | null;
  empresa: string | null;
  filial: string | null;
  descricao_filial: string | null;
  cliente: string | null;
  regional: string | null;
  negocio: string | null;
  funcao: string | null;
  descricao_funcao: string | null;
  cod_funcao: string | null;
  situacao: string | null;
  supervisor: string | null;
  gerente: string | null;
  gerente_regional: string | null;
  diretor: string | null;
  diretor_executivo: string | null;
  tipo_contrato: string | null;
  escala: string | null;
  horario_trabalho: string | null;
  sexo: string | null;
  rg: string | null;
  data_nascimento: string | null;
  municipio: string | null;
  estado: string | null;
  pis: string | null;
  ctps: string | null;
  serie_ctps: string | null;
  cc: string | null;
  cr: string | null;
  data_admissao: string | null;
  data_demissao: string | null;
  tipo_exame: string | null;
  data_exame_realizado: string | null;
  data_vencimento: string | null;
  data_sugerida_agendamento: string | null;
  agendamento_confirmado: boolean;
  observacao: string | null;
  dados_extras?: Record<string, string> | null;
};

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

type Col = { key: string; header: string; width: number; kind?: "date" | "text" | "num" };

const COLS_ASO: Col[] = [
  { key: "nome", header: "Nome", width: 32 },
  { key: "cpf", header: "CPF", width: 14 },
  { key: "matricula", header: "Matrícula", width: 12 },
  { key: "funcao", header: "Função", width: 24 },
  { key: "situacao", header: "Situação", width: 12 },
  { key: "empresa", header: "Empresa", width: 12 },
  { key: "filial", header: "Filial", width: 16 },
  { key: "descricao_filial", header: "Descrição Filial", width: 20 },
  { key: "cliente", header: "Cliente", width: 14 },
  { key: "regional", header: "Regional", width: 10 },
  { key: "negocio", header: "Negócio", width: 16 },
  { key: "cc", header: "Centro Custo", width: 16 },
  { key: "cr", header: "Centro Resultado (CR)", width: 32 },
  { key: "supervisor", header: "Supervisor", width: 22 },
  { key: "gerente", header: "Gerente", width: 22 },
  { key: "gerente_regional", header: "Gerente Regional", width: 22 },
  { key: "diretor", header: "Diretor", width: 22 },
  { key: "diretor_executivo", header: "Diretor Executivo", width: 22 },
  { key: "data_admissao", header: "Admissão", width: 12, kind: "date" },
  { key: "tipo_exame", header: "Tipo de Exame", width: 16 },
  { key: "data_exame_realizado", header: "Último Exame", width: 14, kind: "date" },
  { key: "data_vencimento", header: "Vencimento", width: 14, kind: "date" },
  { key: "dias", header: "Dias a Vencer", width: 12, kind: "num" },
  { key: "status", header: "Status", width: 16 },
  { key: "data_sugerida_agendamento", header: "Sugestão Agend.", width: 16, kind: "date" },
  { key: "agendamento_confirmado", header: "Agend. Confirmado", width: 16 },
  { key: "observacao", header: "Observação", width: 34 },
];

const COLS_CADASTRO: Col[] = [
  { key: "nome", header: "Nome", width: 32 },
  { key: "cpf", header: "CPF", width: 14 },
  { key: "rg", header: "RG", width: 14 },
  { key: "matricula", header: "Matrícula", width: 12 },
  { key: "data_nascimento", header: "Nascimento", width: 12, kind: "date" },
  { key: "sexo", header: "Sexo", width: 8 },
  { key: "empresa", header: "Empresa", width: 12 },
  { key: "filial", header: "Filial", width: 16 },
  { key: "descricao_filial", header: "Descrição Filial", width: 20 },
  { key: "cliente", header: "Cliente", width: 14 },
  { key: "regional", header: "Regional", width: 10 },
  { key: "negocio", header: "Negócio", width: 16 },
  { key: "funcao", header: "Função", width: 24 },
  { key: "cod_funcao", header: "Cód. Função", width: 12 },
  { key: "descricao_funcao", header: "Desc. Função", width: 22 },
  { key: "situacao", header: "Situação", width: 12 },
  { key: "tipo_contrato", header: "Contrato", width: 18 },
  { key: "escala", header: "Escala", width: 12 },
  { key: "horario_trabalho", header: "Horário", width: 18 },
  { key: "supervisor", header: "Supervisor", width: 22 },
  { key: "gerente", header: "Gerente", width: 22 },
  { key: "gerente_regional", header: "Gerente Regional", width: 22 },
  { key: "diretor", header: "Diretor", width: 22 },
  { key: "diretor_executivo", header: "Diretor Executivo", width: 22 },
  { key: "pis", header: "PIS", width: 14 },
  { key: "ctps", header: "CTPS", width: 12 },
  { key: "serie_ctps", header: "Série CTPS", width: 12 },
  { key: "cc", header: "Centro Custo", width: 16 },
  { key: "cr", header: "Centro Result.", width: 32 },
  { key: "municipio", header: "Município", width: 18 },
  { key: "estado", header: "UF", width: 6 },
  { key: "data_admissao", header: "Admissão", width: 12, kind: "date" },
  { key: "data_demissao", header: "Demissão", width: 12, kind: "date" },
];

function cellValue(r: SstExportRow, key: string): unknown {
  if (key === "status") return STATUS_LABEL[computeStatus(r.data_vencimento)];
  if (key === "dias") {
    const d = computeDiasAVencer(r.data_vencimento);
    return d == null ? "" : d;
  }
  if (key === "agendamento_confirmado") return r.agendamento_confirmado ? "Sim" : "";
  const v = (r as unknown as Record<string, unknown>)[key];
  return v ?? "";
}

async function buildSheet(
  wb: import("exceljs").Workbook,
  title: string,
  subtitle: string,
  cols: Col[],
  rows: SstExportRow[],
) {
  const ws = wb.addWorksheet(title.slice(0, 31), {
    views: [{ state: "frozen", ySplit: 3 }],
  });
  ws.mergeCells(1, 1, 1, cols.length);
  const t = ws.getCell(1, 1);
  t.value = title;
  t.font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#1F2A44") } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 26;

  ws.mergeCells(2, 1, 2, cols.length);
  const s = ws.getCell(2, 1);
  s.value = subtitle;
  s.font = { italic: true, color: { argb: "FF64748B" } };
  s.alignment = { horizontal: "center" };

  const head = ws.getRow(3);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#E86A1C") } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    ws.getColumn(i + 1).width = c.width;
  });
  head.height = 22;

  rows.forEach((r) => {
    const row = ws.addRow(
      cols.map((c) => {
        const v = cellValue(r, c.key);
        if (c.kind === "date" && typeof v === "string" && v) return fmtBr(v);
        return v;
      }),
    );
    if (cols.some((c) => c.key === "status")) {
      const st = computeStatus(r.data_vencimento);
      const hex = STATUS_COLOR[st].hex;
      const idx = cols.findIndex((c) => c.key === "status") + 1;
      const cell = row.getCell(idx);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { horizontal: "center" };
    }
  });
  ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
}

export async function exportSstXlsx(rows: SstExportRow[], filename = "controle-aso.xlsx") {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto — SST";

  const stamp = new Date().toLocaleString("pt-BR");

  // Painel
  const totals: Record<AsoStatus, number> = { vencido: 0, critico: 0, atencao: 0, em_dia: 0, sem_registro: 0 };
  rows.forEach((r) => totals[computeStatus(r.data_vencimento)]++);
  const painel = wb.addWorksheet("Painel");
  painel.mergeCells(1, 1, 1, 3);
  const pt = painel.getCell(1, 1);
  pt.value = "SEGURANÇA DO TRABALHO — Painel";
  pt.font = { size: 14, bold: true, color: { argb: "FFFFFFFF" } };
  pt.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#1F2A44") } };
  pt.alignment = { horizontal: "center", vertical: "middle" };
  painel.getRow(1).height = 24;
  painel.getCell(2, 1).value = `Gerado em ${stamp} — ${rows.length} colaborador(es)`;
  painel.getRow(2).font = { italic: true, color: { argb: "FF64748B" } };
  painel.addRow([]);
  const h = painel.addRow(["Indicador", "Quantidade", "% do Total"]);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#E86A1C") } }));
  painel.addRow(["Total de colaboradores", rows.length, "100%"]);
  (Object.keys(STATUS_LABEL) as AsoStatus[]).forEach((k) => {
    const q = totals[k];
    const pct = rows.length ? ((q / rows.length) * 100).toFixed(1) + "%" : "0%";
    const r = painel.addRow([STATUS_LABEL[k], q, pct]);
    const cell = r.getCell(1);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(STATUS_COLOR[k].hex) } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
  });
  [30, 14, 12].forEach((w, i) => (painel.getColumn(i + 1).width = w));

  await buildSheet(
    wb, "Controle de ASO",
    `Sistema automatizado — ${stamp}`,
    COLS_ASO,
    rows,
  );

  const pendencias = rows.filter((r) => computeStatus(r.data_vencimento) === "sem_registro");
  await buildSheet(
    wb, "Pendências (Sem ASO)",
    `Colaboradores ativos sem registro — ${stamp}`,
    COLS_ASO.filter((c) => !["data_exame_realizado", "data_vencimento", "dias", "status", "data_sugerida_agendamento", "agendamento_confirmado", "tipo_exame"].includes(c.key)),
    pendencias,
  );

  await buildSheet(
    wb, "Cadastro Completo",
    `Base unificada com todas as informações — ${stamp}`,
    COLS_CADASTRO,
    rows,
  );

  // Extras: qualquer campo adicional vindo das planilhas
  const extraKeys = new Set<string>();
  rows.forEach((r) => Object.keys(r.dados_extras ?? {}).forEach((k) => extraKeys.add(k)));
  if (extraKeys.size > 0) {
    const cols: Col[] = [
      { key: "nome", header: "Nome", width: 32 },
      { key: "cpf", header: "CPF", width: 14 },
      ...Array.from(extraKeys).map((k) => ({ key: `__extra:${k}`, header: k, width: 20 })),
    ];
    const ws = wb.addWorksheet("Dados Adicionais", { views: [{ state: "frozen", ySplit: 3 }] });
    ws.mergeCells(1, 1, 1, cols.length);
    ws.getCell(1, 1).value = "Campos adicionais capturados das planilhas";
    ws.getCell(1, 1).font = { size: 13, bold: true, color: { argb: "FFFFFFFF" } };
    ws.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#1F2A44") } };
    ws.getCell(1, 1).alignment = { horizontal: "center" };
    ws.getRow(1).height = 22;
    ws.mergeCells(2, 1, 2, cols.length);
    ws.getCell(2, 1).value = `${rows.length} colaborador(es) · ${extraKeys.size} campo(s)`;
    ws.getCell(2, 1).font = { italic: true, color: { argb: "FF64748B" } };
    const head = ws.getRow(3);
    cols.forEach((c, i) => {
      const cell = head.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb("#E86A1C") } };
      ws.getColumn(i + 1).width = c.width;
    });
    rows.forEach((r) => {
      ws.addRow(cols.map((c) => {
        if (c.key === "nome") return r.nome;
        if (c.key === "cpf") return r.cpf ?? "";
        const k = c.key.replace("__extra:", "");
        return r.dados_extras?.[k] ?? "";
      }));
    });
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: cols.length } };
  }

  const buf = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    filename,
  );
}

// ================= PDF =================
export async function exportSstPdf(rows: SstExportRow[], filename = "controle-aso.pdf") {
  const [{ default: jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"), import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod as unknown as { default: (doc: unknown, opts: unknown) => void }).default;

  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  const header = (title: string) => {
    doc.setFillColor(31, 42, 68);
    doc.rect(0, 0, W, 44, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.text(title, 24, 28);
    doc.setFontSize(9);
    doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")} — ${rows.length} colaborador(es)`, 24, 40);
  };

  header("Segurança do Trabalho — Controle de ASO");

  const totals: Record<AsoStatus, number> = { vencido: 0, critico: 0, atencao: 0, em_dia: 0, sem_registro: 0 };
  rows.forEach((r) => totals[computeStatus(r.data_vencimento)]++);

  // Painel resumido
  autoTable(doc, {
    startY: 56,
    head: [["Indicador", "Qtd.", "% do total"]],
    body: [
      ["Total de colaboradores", String(rows.length), "100%"],
      ...(Object.keys(STATUS_LABEL) as AsoStatus[]).map((k) => [
        STATUS_LABEL[k],
        String(totals[k]),
        rows.length ? ((totals[k] / rows.length) * 100).toFixed(1) + "%" : "0%",
      ]),
    ],
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [232, 106, 28], textColor: 255 },
    tableWidth: 320,
  });

  // Tabela ASO
  const asoBody = rows.map((r) => {
    const st = computeStatus(r.data_vencimento);
    const dias = computeDiasAVencer(r.data_vencimento);
    return [
      r.nome, r.matricula ?? "—", r.funcao ?? "—", r.filial ?? "—",
      r.supervisor ?? "—", fmtBr(r.data_exame_realizado),
      fmtBr(r.data_vencimento), dias == null ? "—" : String(dias),
      STATUS_LABEL[st],
    ];
  });
  doc.addPage();
  header("Controle de ASO — Detalhado");
  autoTable(doc, {
    startY: 56,
    head: [["Nome", "Matr.", "Função", "Filial", "Supervisor", "Últ. Exame", "Vencimento", "Dias", "Status"]],
    body: asoBody,
    styles: { fontSize: 8, cellPadding: 3 },
    headStyles: { fillColor: [232, 106, 28], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didParseCell: (data: {
      section: string; row: { index: number }; column: { index: number };
      cell: { styles: { fillColor?: number[]; textColor?: number[]; fontStyle?: string } };
    }) => {
      if (data.section === "body" && data.column.index === 8) {
        const st = computeStatus(rows[data.row.index].data_vencimento);
        const hex = STATUS_COLOR[st].hex.replace("#", "");
        data.cell.styles.fillColor = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // Cadastro completo
  doc.addPage();
  header("Cadastro Completo de Colaboradores");
  autoTable(doc, {
    startY: 56,
    head: [["Nome", "CPF", "Matr.", "Empresa", "Filial", "Regional", "Função", "Situação", "Supervisor", "Gerente", "Admissão"]],
    body: rows.map((r) => [
      r.nome, r.cpf ?? "—", r.matricula ?? "—", r.empresa ?? "—",
      r.filial ?? "—", r.regional ?? "—", r.funcao ?? "—",
      r.situacao ?? "—", r.supervisor ?? "—", r.gerente ?? "—",
      fmtBr(r.data_admissao),
    ]),
    styles: { fontSize: 7.5, cellPadding: 3 },
    headStyles: { fillColor: [31, 42, 68], textColor: 255 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
  });

  // Pendências
  const pend = rows.filter((r) => computeStatus(r.data_vencimento) === "sem_registro");
  if (pend.length) {
    doc.addPage();
    header(`Pendências (Sem ASO) — ${pend.length}`);
    autoTable(doc, {
      startY: 56,
      head: [["Nome", "Matr.", "Função", "Filial", "Supervisor", "Admissão"]],
      body: pend.map((r) => [r.nome, r.matricula ?? "—", r.funcao ?? "—", r.filial ?? "—", r.supervisor ?? "—", fmtBr(r.data_admissao)]),
      styles: { fontSize: 8, cellPadding: 3 },
      headStyles: { fillColor: [220, 38, 38], textColor: 255 },
    });
  }

  doc.save(filename);
}

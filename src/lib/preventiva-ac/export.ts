import { CHECKLIST_PMOC, MEDICOES } from "./pmoc";

export type PmocRegistro = {
  tag: string;
  tipo_equipamento?: string | null;
  marca?: string | null;
  modelo?: string | null;
  numero_serie?: string | null;
  capacidade_btu?: number | null;
  fluido_refrigerante?: string | null;
  ano_fabricacao?: number | null;
  data_instalacao?: string | null;
  predio?: string | null;
  andar?: string | null;
  local?: string | null;
  ambiente?: string | null;
  area_climatizada?: number | null;
  ocupacao_max?: number | null;
  fabricante?: string | null;
  responsavel_tecnico?: string | null;
  data_manutencao?: string | null;
  tipo_servico?: string | null;
  checklist?: Record<string, string> | null;
  medicoes?: Record<string, string> | null;
  observacoes?: string | null;
  colaborador?: string | null;
};

const HEADER_FILL = "FF0F172A";
const HEADER_TEXT = "FFFFFFFF";
const LABEL_FILL = "FFE2E8F0";
const ZEBRA = "FFF8FAFC";

const statusLabel = (v?: string) =>
  v === "conforme" ? "Conforme" : v === "nao_conforme" ? "Não conforme" : v === "na" ? "N/A" : "—";

export async function generatePmocWorkbook(registros: PmocRegistro[]): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto — PMOC";
  wb.created = new Date();

  // ===== Resumo =====
  const ws = wb.addWorksheet("RESUMO PMOC", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = [
    "TAG", "Tipo", "Marca", "Modelo", "N° Série", "Capacidade (BTU/h)", "Fluido",
    "Ano Fabr.", "Data Instalação", "Prédio", "Andar", "Local", "Ambiente",
    "Área (m²)", "Ocupação máx.", "Fabricante", "Resp. Técnico",
    "Data Manut.", "Tipo Serviço", "Colaborador", "Observações",
  ];
  ws.columns = headers.map((h) => ({ header: h, width: Math.max(12, Math.min(28, h.length + 6)) }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: HEADER_TEXT } };
  head.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  head.height = 32;
  head.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
    c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });

  registros.forEach((r, i) => {
    const row = ws.addRow([
      r.tag, r.tipo_equipamento, r.marca, r.modelo, r.numero_serie, r.capacidade_btu, r.fluido_refrigerante,
      r.ano_fabricacao, r.data_instalacao ? new Date(r.data_instalacao) : null,
      r.predio, r.andar, r.local, r.ambiente, r.area_climatizada, r.ocupacao_max,
      r.fabricante, r.responsavel_tecnico,
      r.data_manutencao ? new Date(r.data_manutencao) : null,
      r.tipo_servico, r.colaborador, r.observacoes,
    ]);
    if (i % 2 === 1) {
      row.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ZEBRA } }));
    }
    const dInst = row.getCell(9);
    if (dInst.value instanceof Date) dInst.numFmt = "dd/mm/yyyy";
    const dManut = row.getCell(18);
    if (dManut.value instanceof Date) dManut.numFmt = "dd/mm/yyyy";
    row.alignment = { vertical: "middle", wrapText: true };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };

  // ===== Uma aba por equipamento com checklist completo =====
  for (const r of registros) {
    const name = safeSheetName(`PMOC - ${r.tag}`);
    const s = wb.addWorksheet(name);
    s.columns = [{ width: 32 }, { width: 40 }, { width: 20 }];

    const title = s.addRow([`PMOC — ${r.tag}`, "", ""]);
    s.mergeCells(title.number, 1, title.number, 3);
    title.font = { bold: true, size: 14, color: { argb: HEADER_TEXT } };
    title.alignment = { vertical: "middle", horizontal: "center" };
    title.height = 28;
    title.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };

    addSection(s, "Identificação");
    addKV(s, "TAG", r.tag);
    addKV(s, "Tipo", r.tipo_equipamento);
    addKV(s, "Marca / Modelo", `${r.marca ?? ""} ${r.modelo ?? ""}`.trim());
    addKV(s, "N° Série", r.numero_serie);
    addKV(s, "Capacidade (BTU/h)", r.capacidade_btu);
    addKV(s, "Fluido refrigerante", r.fluido_refrigerante);
    addKV(s, "Ano fabricação", r.ano_fabricacao);
    addKV(s, "Data de instalação", r.data_instalacao);
    addKV(s, "Fabricante", r.fabricante);
    addKV(s, "Responsável técnico", r.responsavel_tecnico);

    addSection(s, "Localização");
    addKV(s, "Prédio", r.predio);
    addKV(s, "Andar", r.andar);
    addKV(s, "Local", r.local);
    addKV(s, "Ambiente", r.ambiente);
    addKV(s, "Área climatizada (m²)", r.area_climatizada);
    addKV(s, "Ocupação máxima", r.ocupacao_max);

    addSection(s, "Manutenção");
    addKV(s, "Data", r.data_manutencao);
    addKV(s, "Tipo de serviço", r.tipo_servico);
    addKV(s, "Colaborador", r.colaborador);

    addSection(s, "Checklist PMOC");
    const grupos = new Map<string, typeof CHECKLIST_PMOC>();
    for (const it of CHECKLIST_PMOC) {
      if (!grupos.has(it.grupo)) grupos.set(it.grupo, [] as any);
      grupos.get(it.grupo)!.push(it);
    }
    for (const [grupo, itens] of grupos) {
      const gr = s.addRow([grupo, "", ""]);
      gr.font = { bold: true };
      gr.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LABEL_FILL } };
      for (const it of itens) {
        addKV(s, it.label, statusLabel(r.checklist?.[it.key]));
      }
    }

    addSection(s, "Medições");
    for (const m of MEDICOES) {
      const val = r.medicoes?.[m.key];
      addKV(s, `${m.label} (${m.unidade})`, val || "—");
    }

    addSection(s, "Observações");
    const obs = s.addRow([r.observacoes || "—", "", ""]);
    s.mergeCells(obs.number, 1, obs.number, 3);
    obs.alignment = { wrapText: true, vertical: "top" };
    obs.height = 60;
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function addSection(s: any, label: string) {
  const r = s.addRow([label, "", ""]);
  s.mergeCells(r.number, 1, r.number, 3);
  r.font = { bold: true, color: { argb: HEADER_TEXT } };
  r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  r.height = 22;
  r.alignment = { vertical: "middle" };
}

function addKV(s: any, label: string, value: unknown) {
  const r = s.addRow([label, value ?? "—", ""]);
  r.getCell(1).font = { bold: true };
  r.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: LABEL_FILL } };
  r.alignment = { vertical: "middle", wrapText: true };
}

function safeSheetName(name: string): string {
  return name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
}

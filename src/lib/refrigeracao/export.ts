// Exportador Excel do módulo Refrigeração — layout moderno e profissional.
// Design system dedicado: capa executiva, KPIs, cabeçalhos em duas faixas,
// linhas zebradas, badges de status/urgência/gravidade e rodapé institucional.

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();

// Paleta institucional (azul profundo → ciano → acentos semânticos).
const C = {
  ink: argb("#0B1220"),
  slate900: argb("#0F172A"),
  slate800: argb("#1E293B"),
  slate600: argb("#475569"),
  slate500: argb("#64748B"),
  slate300: argb("#CBD5E1"),
  slate200: argb("#E2E8F0"),
  slate100: argb("#F1F5F9"),
  slate50: argb("#F8FAFC"),
  white: argb("#FFFFFF"),
  brand: argb("#0B3D91"),
  brandSoft: argb("#1E3A8A"),
  accent: argb("#1F6FEB"),
  cyan: argb("#0EA5E9"),
  // Semânticos (fundo suave + texto forte)
  okBg: argb("#DCFCE7"),
  okFg: argb("#166534"),
  warnBg: argb("#FEF3C7"),
  warnFg: argb("#92400E"),
  dangerBg: argb("#FEE2E2"),
  dangerFg: argb("#991B1B"),
  infoBg: argb("#DBEAFE"),
  infoFg: argb("#1E40AF"),
  neutralBg: argb("#E2E8F0"),
  neutralFg: argb("#334155"),
};

const FONT = "Aptos";
const FONT_BOLD = "Aptos ExtraBold";

export type RefrigOsExport = {
  numero_os: string;
  nome_os: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  tipo: string | null;
  equipe: string | null;
  data_sla: string | null;
  data_programada: string | null;
  ativo: string;
  equipamento: string;
  patrimonio: string | null;
  status: string;
  created_at: string;
};

export type RefrigPecaExport = {
  numero_os: string;
  descricao: string;
  quantidade: number;
  urgencia: string;
  observacao: string | null;
  status_gestor: string;
  created_at: string;
};

export type RefrigProblemaExport = {
  numero_os: string;
  descricao: string;
  gravidade: string;
  status_gestor: string;
  created_at: string;
};

export type RefrigFotoExport = {
  numero_os: string;
  legenda: string | null;
  created_at: string;
};

const URG_LABEL: Record<string, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta — parado",
};
const GRAV_LABEL: Record<string, string> = {
  observacao: "Observação",
  falha: "Funcionando com falha",
  critico: "Crítico — parado",
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("pt-BR");
}
function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("pt-BR");
}

type Column = {
  key: string;
  label: string;
  width: number;
  align?: "left" | "center" | "right";
  badge?: "status" | "urgencia" | "gravidade";
};

function badgeColors(kind: Column["badge"], raw: string): { bg: string; fg: string } | null {
  if (!kind) return null;
  const v = String(raw ?? "").toLowerCase().trim();
  if (!v) return null;
  if (kind === "status") {
    if (v.includes("conclu") || v.includes("finaliz") || v.includes("aprov"))
      return { bg: C.okBg, fg: C.okFg };
    if (v.includes("andamento") || v.includes("execu") || v.includes("progr"))
      return { bg: C.infoBg, fg: C.infoFg };
    if (v.includes("pend") || v.includes("aberto") || v.includes("aguard"))
      return { bg: C.warnBg, fg: C.warnFg };
    if (v.includes("cancel") || v.includes("recus") || v.includes("negad"))
      return { bg: C.dangerBg, fg: C.dangerFg };
    return { bg: C.neutralBg, fg: C.neutralFg };
  }
  if (kind === "urgencia") {
    if (v.startsWith("baixa")) return { bg: C.okBg, fg: C.okFg };
    if (v.startsWith("m")) return { bg: C.warnBg, fg: C.warnFg };
    if (v.startsWith("alta")) return { bg: C.dangerBg, fg: C.dangerFg };
    return { bg: C.neutralBg, fg: C.neutralFg };
  }
  if (kind === "gravidade") {
    if (v.startsWith("observ")) return { bg: C.infoBg, fg: C.infoFg };
    if (v.startsWith("funcion")) return { bg: C.warnBg, fg: C.warnFg };
    if (v.startsWith("cr")) return { bg: C.dangerBg, fg: C.dangerFg };
    return { bg: C.neutralBg, fg: C.neutralFg };
  }
  return null;
}

function thinBorder(color = C.slate200) {
  return {
    top: { style: "thin" as const, color: { argb: color } },
    bottom: { style: "thin" as const, color: { argb: color } },
    left: { style: "thin" as const, color: { argb: color } },
    right: { style: "thin" as const, color: { argb: color } },
  };
}

async function makeSheet(
  wb: import("exceljs").Workbook,
  name: string,
  titulo: string,
  subtitulo: string,
  columns: Column[],
  rows: Record<string, string | number>[],
) {
  const ws = wb.addWorksheet(name, {
    views: [{ state: "frozen", ySplit: 4, showGridLines: false }],
    properties: { defaultRowHeight: 20 },
  });
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));

  // Linha 1 — barra institucional (título)
  ws.mergeCells(1, 1, 1, columns.length);
  const t = ws.getCell(1, 1);
  t.value = titulo;
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate900 } };
  t.font = { name: FONT_BOLD, bold: true, size: 20, color: { argb: C.white } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(1).height = 38;

  // Linha 2 — subtítulo/legenda
  ws.mergeCells(2, 1, 2, columns.length);
  const s = ws.getCell(2, 1);
  s.value = subtitulo;
  s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate800 } };
  s.font = { name: FONT, italic: true, size: 10, color: { argb: C.slate300 } };
  s.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(2).height = 20;

  // Linha 3 — faixa fina de acento
  ws.mergeCells(3, 1, 3, columns.length);
  const bar = ws.getCell(3, 1);
  bar.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.accent } };
  ws.getRow(3).height = 4;

  // Linha 4 — cabeçalhos das colunas
  const head = ws.getRow(4);
  columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label.toUpperCase();
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.brand } };
    cell.font = { name: FONT_BOLD, bold: true, size: 10.5, color: { argb: C.white } };
    cell.alignment = {
      vertical: "middle",
      horizontal: c.align ?? "center",
      wrapText: true,
      indent: c.align === "left" ? 1 : 0,
    };
    cell.border = {
      top: { style: "medium", color: { argb: C.brand } },
      bottom: { style: "medium", color: { argb: C.slate900 } },
      left: { style: "thin", color: { argb: C.brandSoft } },
      right: { style: "thin", color: { argb: C.brandSoft } },
    };
  });
  head.height = 30;

  // Dados
  let rowIdx = 5;
  if (rows.length === 0) {
    ws.mergeCells(rowIdx, 1, rowIdx, columns.length);
    const empty = ws.getCell(rowIdx, 1);
    empty.value = "Nenhum registro para exibir.";
    empty.font = { name: FONT, italic: true, size: 11, color: { argb: C.slate500 } };
    empty.alignment = { vertical: "middle", horizontal: "center" };
    empty.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate50 } };
    ws.getRow(rowIdx).height = 40;
    rowIdx++;
  } else {
    for (let r = 0; r < rows.length; r++) {
      const row = ws.getRow(rowIdx++);
      const zebra = r % 2 === 1;
      const bg = zebra ? C.slate50 : C.white;
      columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        const raw = rows[r][c.key];
        cell.value = raw ?? "";
        cell.font = { name: FONT, size: 10.5, color: { argb: C.slate900 } };
        cell.alignment = {
          vertical: "middle",
          horizontal: c.align ?? "center",
          wrapText: true,
          indent: c.align === "left" ? 1 : 0,
        };
        cell.border = thinBorder(C.slate200);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };

        // Badge semântico
        const b = badgeColors(c.badge, String(raw ?? ""));
        if (b && String(raw ?? "").trim() !== "") {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: b.bg } };
          cell.font = { name: FONT_BOLD, bold: true, size: 10.5, color: { argb: b.fg } };
        }

        // Destaque para número da OS
        if (c.key === "numero_os") {
          cell.font = { name: FONT_BOLD, bold: true, size: 10.5, color: { argb: C.brand } };
        }
      });
      row.height = 22;
    }
  }

  // Rodapé institucional
  const footRow = rowIdx + 1;
  ws.mergeCells(footRow, 1, footRow, columns.length);
  const foot = ws.getCell(footRow, 1);
  foot.value = `Apont Auto · Refrigeração · Gerado em ${new Date().toLocaleString("pt-BR")}`;
  foot.font = { name: FONT, italic: true, size: 9, color: { argb: C.slate500 } };
  foot.alignment = { vertical: "middle", horizontal: "right", indent: 1 };
  ws.getRow(footRow).height = 18;

  // Auto filter no cabeçalho
  ws.autoFilter = {
    from: { row: 4, column: 1 },
    to: { row: 4, column: columns.length },
  };

  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printTitlesRow: "1:4",
  };
  ws.headerFooter = {
    oddFooter: "&L&\"Aptos\"&9 Apont Auto — Refrigeração&C&\"Aptos\"&9&P / &N&R&\"Aptos\"&9&D",
  };
}

async function makeCover(
  wb: import("exceljs").Workbook,
  kpis: { osTotal: number; pecasTotal: number; problemasTotal: number; fotosTotal: number },
) {
  const ws = wb.addWorksheet("Resumo", {
    views: [{ state: "normal", showGridLines: false }],
    properties: { defaultRowHeight: 22 },
  });
  for (let i = 1; i <= 8; i++) ws.getColumn(i).width = 18;

  // Bloco superior — banner
  ws.mergeCells("A1:H2");
  const banner = ws.getCell("A1");
  banner.value = "REFRIGERAÇÃO";
  banner.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate900 } };
  banner.font = { name: FONT_BOLD, bold: true, size: 28, color: { argb: C.white } };
  banner.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
  ws.getRow(1).height = 34;
  ws.getRow(2).height = 34;

  ws.mergeCells("A3:H3");
  const sub = ws.getCell("A3");
  sub.value = "Relatório executivo · Ordens de Serviço, peças, problemas e evidências";
  sub.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.slate800 } };
  sub.font = { name: FONT, italic: true, size: 11, color: { argb: C.slate300 } };
  sub.alignment = { vertical: "middle", horizontal: "left", indent: 2 };
  ws.getRow(3).height = 26;

  ws.mergeCells("A4:H4");
  const accent = ws.getCell("A4");
  accent.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C.accent } };
  ws.getRow(4).height = 4;

  // KPIs
  const cards: Array<{ range: string; label: string; value: number; bg: string; fg: string }> = [
    { range: "A6:B8", label: "ORDENS DE SERVIÇO", value: kpis.osTotal, bg: C.brand, fg: C.white },
    { range: "C6:D8", label: "PEÇAS SOLICITADAS", value: kpis.pecasTotal, bg: C.accent, fg: C.white },
    { range: "E6:F8", label: "PROBLEMAS", value: kpis.problemasTotal, bg: C.cyan, fg: C.white },
    { range: "G6:H8", label: "FOTOS", value: kpis.fotosTotal, bg: C.slate800, fg: C.white },
  ];
  ws.getRow(6).height = 22;
  ws.getRow(7).height = 36;
  ws.getRow(8).height = 18;
  cards.forEach((k) => {
    ws.mergeCells(k.range);
    const c = ws.getCell(k.range.split(":")[0]);
    c.value = `${k.label}\n${k.value}`;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: k.bg } };
    c.font = { name: FONT_BOLD, bold: true, size: 22, color: { argb: k.fg } };
    c.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    c.border = thinBorder(k.bg);
  });

  // Legenda
  ws.mergeCells("A10:H10");
  const legTitle = ws.getCell("A10");
  legTitle.value = "LEGENDA DE STATUS";
  legTitle.font = { name: FONT_BOLD, bold: true, size: 11, color: { argb: C.slate800 } };
  legTitle.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  ws.getRow(10).height = 22;

  const legends: Array<{ cell: string; text: string; bg: string; fg: string }> = [
    { cell: "A11", text: "Concluído / Aprovado", bg: C.okBg, fg: C.okFg },
    { cell: "C11", text: "Em andamento", bg: C.infoBg, fg: C.infoFg },
    { cell: "E11", text: "Pendente / Aguardando", bg: C.warnBg, fg: C.warnFg },
    { cell: "G11", text: "Cancelado / Crítico", bg: C.dangerBg, fg: C.dangerFg },
  ];
  ws.getRow(11).height = 24;
  legends.forEach((l) => {
    const end = String.fromCharCode(l.cell.charCodeAt(0) + 1) + l.cell.slice(1);
    ws.mergeCells(`${l.cell}:${end}`);
    const c = ws.getCell(l.cell);
    c.value = l.text;
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: l.bg } };
    c.font = { name: FONT_BOLD, bold: true, size: 10.5, color: { argb: l.fg } };
    c.alignment = { vertical: "middle", horizontal: "center" };
    c.border = thinBorder(C.slate200);
  });

  // Meta
  ws.mergeCells("A13:H13");
  const meta = ws.getCell("A13");
  meta.value = `Documento gerado em ${new Date().toLocaleString("pt-BR")} · Apont Auto`;
  meta.font = { name: FONT, italic: true, size: 10, color: { argb: C.slate500 } };
  meta.alignment = { vertical: "middle", horizontal: "left", indent: 1 };

  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    paperSize: 9,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
  };
}

export async function generateRefrigeracaoExport(input: {
  os: RefrigOsExport[];
  pecas: RefrigPecaExport[];
  problemas: RefrigProblemaExport[];
  fotos: RefrigFotoExport[];
}): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto";
  wb.company = "Apont Auto";
  wb.created = new Date();

  await makeCover(wb, {
    osTotal: input.os.length,
    pecasTotal: input.pecas.length,
    problemasTotal: input.problemas.length,
    fotosTotal: input.fotos.length,
  });

  await makeSheet(
    wb,
    "OS",
    "Ordens de Serviço",
    "Registro completo das OS emitidas — localização, equipe responsável e status operacional.",
    [
      { key: "numero_os", label: "OS", width: 12 },
      { key: "nome_os", label: "Nome da OS", width: 32, align: "left" },
      { key: "predio", label: "Prédio", width: 14 },
      { key: "andar", label: "Andar", width: 8 },
      { key: "local", label: "Local", width: 22, align: "left" },
      { key: "tipo", label: "Tipo", width: 16 },
      { key: "equipe", label: "Equipe", width: 18 },
      { key: "data_sla", label: "SLA", width: 12 },
      { key: "data_programada", label: "Programada", width: 14 },
      { key: "ativo", label: "Ativo", width: 16 },
      { key: "equipamento", label: "Equipamento", width: 26, align: "left" },
      { key: "patrimonio", label: "Patrimônio", width: 14 },
      { key: "status", label: "Status", width: 16, badge: "status" },
      { key: "criada_em", label: "Criada em", width: 18 },
    ],
    input.os.map((o) => ({
      numero_os: o.numero_os,
      nome_os: o.nome_os ?? "",
      predio: o.predio ?? "",
      andar: o.andar ?? "",
      local: o.local ?? "",
      tipo: o.tipo ?? "",
      equipe: o.equipe ?? "",
      data_sla: fmtDate(o.data_sla),
      data_programada: fmtDate(o.data_programada),
      ativo: o.ativo,
      equipamento: o.equipamento,
      patrimonio: o.patrimonio ?? "",
      status: o.status,
      criada_em: fmtDateTime(o.created_at),
    })),
  );

  await makeSheet(
    wb,
    "Pecas",
    "Solicitações de peças",
    "Peças requisitadas pelos técnicos — urgência, quantidade e parecer do gestor.",
    [
      { key: "numero_os", label: "OS", width: 12 },
      { key: "descricao", label: "Descrição da peça", width: 42, align: "left" },
      { key: "quantidade", label: "Qtd", width: 8, align: "right" },
      { key: "urgencia", label: "Urgência", width: 18, badge: "urgencia" },
      { key: "observacao", label: "Observação", width: 38, align: "left" },
      { key: "status_gestor", label: "Status", width: 16, badge: "status" },
      { key: "criada_em", label: "Solicitada em", width: 18 },
    ],
    input.pecas.map((p) => ({
      numero_os: p.numero_os,
      descricao: p.descricao,
      quantidade: p.quantidade,
      urgencia: URG_LABEL[p.urgencia] ?? p.urgencia,
      observacao: p.observacao ?? "",
      status_gestor: p.status_gestor,
      criada_em: fmtDateTime(p.created_at),
    })),
  );

  await makeSheet(
    wb,
    "Problemas",
    "Problemas sinalizados",
    "Não conformidades registradas em campo — gravidade e tratativa do gestor.",
    [
      { key: "numero_os", label: "OS", width: 12 },
      { key: "descricao", label: "Descrição do problema", width: 54, align: "left" },
      { key: "gravidade", label: "Gravidade", width: 24, badge: "gravidade" },
      { key: "status_gestor", label: "Status", width: 16, badge: "status" },
      { key: "criada_em", label: "Sinalizado em", width: 18 },
    ],
    input.problemas.map((p) => ({
      numero_os: p.numero_os,
      descricao: p.descricao,
      gravidade: GRAV_LABEL[p.gravidade] ?? p.gravidade,
      status_gestor: p.status_gestor,
      criada_em: fmtDateTime(p.created_at),
    })),
  );

  await makeSheet(
    wb,
    "Fotos",
    "Evidências fotográficas",
    "Registro visual anexado às OS — data de envio e legenda descritiva.",
    [
      { key: "numero_os", label: "OS", width: 12 },
      { key: "legenda", label: "Legenda", width: 60, align: "left" },
      { key: "criada_em", label: "Enviada em", width: 22 },
    ],
    input.fotos.map((f) => ({
      numero_os: f.numero_os,
      legenda: f.legenda ?? "",
      criada_em: fmtDateTime(f.created_at),
    })),
  );

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

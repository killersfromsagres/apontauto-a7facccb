// Exportador Excel do módulo Refrigeração — mesmo padrão visual dos demais módulos.

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const HEADER_BG_L1 = argb("#0B3D91");
const HEADER_BG_L2 = argb("#1F6FEB");

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

async function makeSheet(
  wb: import("exceljs").Workbook,
  name: string,
  titulo: string,
  columns: Array<{ key: string; label: string; width: number }>,
  rows: Record<string, string | number>[],
) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 2 }] });
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  ws.mergeCells(1, 1, 1, columns.length);
  const title = ws.getCell(1, 1);
  title.value = titulo;
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG_L1 } };
  title.font = { name: "Aptos ExtraBold", bold: true, size: 18, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 32;

  const head = ws.getRow(2);
  columns.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG_L2 } };
    cell.font = { name: "Aptos ExtraBold", bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin", color: { argb: "FF000000" } },
      bottom: { style: "thin", color: { argb: "FF000000" } },
      left: { style: "thin", color: { argb: "FF000000" } },
      right: { style: "thin", color: { argb: "FF000000" } },
    };
  });
  head.height = 28;

  let rowIdx = 3;
  for (const r of rows) {
    const row = ws.getRow(rowIdx++);
    columns.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = r[c.key] ?? "";
      cell.font = { name: "Aptos", size: 11, color: { argb: "FF000000" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFBFBFBF" } },
        bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
        left: { style: "thin", color: { argb: "FFBFBFBF" } },
        right: { style: "thin", color: { argb: "FFBFBFBF" } },
      };
    });
    row.height = 22;
  }

  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    printTitlesRow: "1:2",
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

  await makeSheet(
    wb,
    "OS",
    "Refrigeração · Ordens de Serviço",
    [
      { key: "numero_os", label: "OS", width: 14 },
      { key: "nome_os", label: "Nome OS", width: 32 },
      { key: "predio", label: "Prédio", width: 16 },
      { key: "andar", label: "Andar", width: 10 },
      { key: "local", label: "Local", width: 22 },
      { key: "tipo", label: "Tipo", width: 16 },
      { key: "equipe", label: "Equipe", width: 18 },
      { key: "data_sla", label: "Data SLA", width: 14 },
      { key: "data_programada", label: "Programada", width: 14 },
      { key: "ativo", label: "Ativo", width: 16 },
      { key: "equipamento", label: "Equipamento", width: 26 },
      { key: "patrimonio", label: "Patrimônio", width: 16 },
      { key: "status", label: "Status", width: 14 },
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
    "Refrigeração · Solicitações de peças",
    [
      { key: "numero_os", label: "OS", width: 14 },
      { key: "descricao", label: "Descrição da peça", width: 40 },
      { key: "quantidade", label: "Qtd", width: 8 },
      { key: "urgencia", label: "Urgência", width: 16 },
      { key: "observacao", label: "Observação", width: 36 },
      { key: "status_gestor", label: "Status", width: 14 },
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
    "Refrigeração · Problemas sinalizados",
    [
      { key: "numero_os", label: "OS", width: 14 },
      { key: "descricao", label: "Descrição do problema", width: 50 },
      { key: "gravidade", label: "Gravidade", width: 22 },
      { key: "status_gestor", label: "Status", width: 14 },
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
    "Refrigeração · Fotos registradas",
    [
      { key: "numero_os", label: "OS", width: 14 },
      { key: "legenda", label: "Legenda", width: 40 },
      { key: "criada_em", label: "Enviada em", width: 18 },
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

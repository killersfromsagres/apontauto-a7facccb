// Exportador Excel do Controle de Lavanderia — mesmo padrão visual do módulo Backorder.

import type { PecaState } from "./crossing";

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const HEADER_BG_L1 = argb("#002060");
const HEADER_BG_L2 = argb("#2B3095");

export interface LavExportPeca extends PecaState {
  matricula: string | null;
  nome: string;
  tipoPeca: string;
  setor: string;
}

export interface LavExportEvento {
  codigo: string;
  matricula: string | null;
  nome: string;
  tipo: "saida" | "entrada";
  data: string;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

const STATUS_LABEL: Record<PecaState["status"], string> = {
  em_higienizacao: "Em higienização",
  atrasada: "Atrasada",
  retornada: "Retornada",
};

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

export async function generateLavanderiaExport(input: {
  pecas: LavExportPeca[];
  eventos: LavExportEvento[];
}): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto";

  await makeSheet(
    wb,
    "Status",
    "Controle de Lavanderia · Status por peça",
    [
      { key: "codigo", label: "Código de barras", width: 22 },
      { key: "matricula", label: "Matrícula", width: 14 },
      { key: "nome", label: "Colaborador", width: 36 },
      { key: "tipoPeca", label: "Tipo da peça", width: 22 },
      { key: "setor", label: "Setor", width: 22 },
      { key: "ultimaSaida", label: "Última saída", width: 16 },
      { key: "previstoRetorno", label: "Previsto retorno", width: 18 },
      { key: "ultimaEntrada", label: "Última entrada", width: 16 },
      { key: "diasAtraso", label: "Dias em atraso", width: 14 },
      { key: "status", label: "Status", width: 18 },
      { key: "giro", label: "Giro", width: 10 },
    ],
    input.pecas.map((p) => ({
      codigo: p.codigo,
      matricula: p.matricula ?? "",
      nome: p.nome,
      tipoPeca: p.tipoPeca || "Não informado",
      setor: p.setor || "Não informado",
      ultimaSaida: fmtDate(p.ultimaSaida),
      previstoRetorno: fmtDate(p.previstoRetorno),
      ultimaEntrada: fmtDate(p.ultimaEntrada),
      diasAtraso: p.status === "atrasada" ? p.diasAtraso : "",
      status: STATUS_LABEL[p.status],
      giro: p.giro,
    })),
  );

  await makeSheet(
    wb,
    "Historico",
    "Controle de Lavanderia · Histórico consolidado",
    [
      { key: "data", label: "Data", width: 14 },
      { key: "tipo", label: "Movimento", width: 14 },
      { key: "codigo", label: "Código de barras", width: 22 },
      { key: "matricula", label: "Matrícula", width: 14 },
      { key: "nome", label: "Colaborador", width: 36 },
    ],
    [...input.eventos]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map((e) => ({
        data: fmtDate(e.data),
        tipo: e.tipo === "saida" ? "Saída" : "Entrada",
        codigo: e.codigo,
        matricula: e.matricula ?? "",
        nome: e.nome,
      })),
  );

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

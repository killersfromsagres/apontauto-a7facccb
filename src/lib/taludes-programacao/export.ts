// Exportadores XLSX + PNG da Programação de Taludes.
import type { ClimaBundle } from "./clima";
import { statusClimatico } from "./clima";

export type ProgRow = {
  id: string;
  os_atividade: string;
  talude: string;
  tipo_servico: string;
  data_programada: string;
  equipe: string;
  situacao: string;
  observacoes: string;
};

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const H1 = argb("#166534"); // verde escuro
const H2 = argb("#15803d");
const CHUVA = argb("#FEE2E2");
const CHUVA_TXT = argb("#991B1B");

function fmt(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

const TIPO_LABEL: Record<string, string> = {
  rocada: "Roçada",
  contencao: "Contenção",
  drenagem: "Drenagem",
  inspecao: "Inspeção",
  plantio: "Plantio",
  outro: "Outro",
};
const SIT_LABEL: Record<string, string> = {
  programado: "Programado",
  realizado: "Realizado",
  adiado_chuva: "Adiado por chuva",
  cancelado: "Cancelado",
};

export async function exportProgramacaoXLSX(rows: ProgRow[], clima: ClimaBundle): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto";

  const ws = wb.addWorksheet("PROGRAMAÇÃO", { views: [{ state: "frozen", ySplit: 2 }] });
  const cols = [
    { key: "os", label: "OS/Atividade", w: 22 },
    { key: "talude", label: "Talude", w: 26 },
    { key: "tipo", label: "Tipo de Serviço", w: 20 },
    { key: "data", label: "Data Programada", w: 18 },
    { key: "equipe", label: "Equipe", w: 22 },
    { key: "status", label: "Status Climático", w: 32 },
    { key: "situacao", label: "Situação", w: 20 },
    { key: "obs", label: "Observações", w: 32 },
  ];
  ws.columns = cols.map((c) => ({ key: c.key, width: c.w }));

  ws.mergeCells(1, 1, 1, cols.length);
  const t = ws.getCell(1, 1);
  t.value = "Programação de Taludes — Apont Auto";
  t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: H1 } };
  t.font = { name: "Aptos ExtraBold", bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  t.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 34;

  const head = ws.getRow(2);
  cols.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: H2 } };
    cell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  head.height = 28;

  const sorted = [...rows].sort((a, b) => a.data_programada.localeCompare(b.data_programada));
  let rowIdx = 3;
  const diasChuva: string[] = [];
  for (const r of sorted) {
    const st = statusClimatico(r.data_programada, clima.dias, clima.config);
    if (st.nivel === "chuva" && !diasChuva.includes(r.data_programada))
      diasChuva.push(r.data_programada);
    const row = ws.getRow(rowIdx++);
    const vals = [
      r.os_atividade,
      r.talude,
      TIPO_LABEL[r.tipo_servico] ?? r.tipo_servico,
      fmt(r.data_programada),
      r.equipe,
      st.motivo,
      SIT_LABEL[r.situacao] ?? r.situacao,
      r.observacoes,
    ];
    vals.forEach((v, i) => {
      const cell = row.getCell(i + 1);
      cell.value = v;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      if (st.nivel === "chuva") {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: CHUVA } };
        cell.font = { color: { argb: CHUVA_TXT }, bold: true };
      }
    });
    row.height = 26;
  }

  // Rodapé com dias de chuva
  if (diasChuva.length) {
    rowIdx += 1;
    ws.mergeCells(rowIdx, 1, rowIdx, cols.length);
    const foot = ws.getCell(rowIdx, 1);
    foot.value = `⚠️ Dias com chuva no período: ${diasChuva.map(fmt).join(", ")}`;
    foot.font = { bold: true, color: { argb: CHUVA_TXT } };
    foot.alignment = { vertical: "middle", horizontal: "left" };
  }

  // Aba histórico
  const wsh = wb.addWorksheet("HISTÓRICO CLIMA");
  wsh.columns = [
    { key: "data", width: 14 },
    { key: "choveu", width: 12 },
    { key: "mm", width: 12 },
    { key: "cond", width: 24 },
  ];
  const hh = wsh.addRow(["Data", "Choveu", "mm", "Condição"]);
  hh.font = { bold: true, color: { argb: "FFFFFFFF" } };
  hh.eachCell((c) => {
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: H2 } };
    c.alignment = { horizontal: "center" };
  });
  for (const d of clima.dias) {
    wsh.addRow([
      fmt(d.data),
      d.choveu ? "Sim" : "Não",
      (d.precipitacao_mm_real ?? d.precipitacao_mm_prev ?? 0).toFixed(1),
      d.condicao ?? "",
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

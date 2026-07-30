// Exportador da Programação de Prioridades — mesmo padrão visual do
// export padrão de Backorder, com coluna extra "Motivo da Prioridade".

const argb = (hex: string) => "FF" + hex.replace("#", "").toUpperCase();
const HEADER_BG_L1 = argb("#7F1D1D");
const HEADER_BG_L2 = argb("#B91C1C");
const COL_WIDTH = 31.28;

const COLUMNS = [
  { key: "os", label: "OS" },
  { key: "nome", label: "Nome" },
  { key: "predio", label: "Prédio" },
  { key: "andar", label: "Andar" },
  { key: "espaco", label: "Espaço" },
  { key: "atividade", label: "Atividade" },
  { key: "sla", label: "Término SLA" },
  { key: "equipe", label: "Equipe" },
  { key: "ativo", label: "Ativo" },
  { key: "motivo", label: "Motivo da Prioridade" },
  { key: "outros", label: "Outros" },
];

export interface PriorityRow {
  os: string;
  nome: string;
  ativo: string;
  predio: string;
  andar: string;
  espaco: string;
  equipe: string;
  termino_sla: string | null;
  data_solicitacao: string;
  outros: string;
  motivo_prioridade: string;
  prioridade_nivel: number;
}

function sortPriority(rows: PriorityRow[]): PriorityRow[] {
  return [...rows].sort((a, b) => {
    if (b.prioridade_nivel !== a.prioridade_nivel) return b.prioridade_nivel - a.prioridade_nivel;
    return new Date(a.data_solicitacao).getTime() - new Date(b.data_solicitacao).getTime();
  });
}

function fmt(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("pt-BR");
}

export async function generatePriorityExport(input: {
  titulo: string;
  rows: PriorityRow[];
}): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto";
  const ws = wb.addWorksheet("PRIORIDADES", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.columns = COLUMNS.map((c) => ({ key: c.key, width: COL_WIDTH }));

  ws.mergeCells(1, 1, 1, COLUMNS.length);
  const title = ws.getCell(1, 1);
  title.value = `${input.titulo}  ·  Programação de Prioridades — Backorder`;
  title.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG_L1 } };
  title.font = { name: "Aptos ExtraBold", bold: true, size: 20, color: { argb: "FFFFFFFF" } };
  title.alignment = { vertical: "middle", horizontal: "center" };
  ws.getRow(1).height = 36;

  const head = ws.getRow(2);
  COLUMNS.forEach((c, i) => {
    const cell = head.getCell(i + 1);
    cell.value = c.label;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_BG_L2 } };
    cell.font = { name: "Aptos ExtraBold", bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
  });
  head.height = 34;

  const sorted = sortPriority(input.rows);
  let idx = 3;
  for (const r of sorted) {
    const row = ws.getRow(idx++);
    const values: Record<string, string> = {
      os: r.os,
      nome: r.nome,
      predio: r.predio,
      andar: r.andar,
      espaco: r.espaco,
      atividade: "Corretiva",
      sla: fmt(r.termino_sla),
      equipe: r.equipe,
      ativo: r.ativo,
      motivo: r.motivo_prioridade,
      outros: r.outros,
    };
    COLUMNS.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = values[c.key];
      cell.font = { name: "Aptos ExtraBold", bold: true, size: 13, color: { argb: "FF000000" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFBFBFBF" } },
        bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
        left: { style: "thin", color: { argb: "FFBFBFBF" } },
        right: { style: "thin", color: { argb: "FFBFBFBF" } },
      };
      // Destaque de nível 3 (alto risco)
      if (r.prioridade_nivel >= 3) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } };
      } else if (r.prioridade_nivel === 2) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } };
      }
    });
    row.height = 32;
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

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function openPriorityPrintView(titulo: string, rows: PriorityRow[]) {
  const sorted = sortPriority(rows);
  const style = `
    body { font-family: 'Aptos', 'Segoe UI', system-ui, sans-serif; margin: 24px; color: #0f172a; }
    h1 { font-size: 20px; margin: 0 0 6px; }
    .sub { color: #64748b; font-size: 12px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    thead th { background: #b91c1c; color: #fff; padding: 8px; text-align: center; border: 1px solid #7f1d1d; }
    tbody td { border: 1px solid #cbd5e1; padding: 6px 8px; vertical-align: top; }
    tr.n3 td { background: #fee2e2; }
    tr.n2 td { background: #fef3c7; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 999px; background: #b91c1c; color: #fff; font-weight: 600; font-size: 10px; }
    @page { size: A4 landscape; margin: 12mm; }
    @media print { .noprint { display: none; } }
  `;
  const head = COLUMNS.map((c) => `<th>${c.label}</th>`).join("");
  const body = sorted
    .map((r) => {
      const cls = r.prioridade_nivel >= 3 ? "n3" : r.prioridade_nivel === 2 ? "n2" : "";
      const tds = [
        r.os,
        r.nome,
        r.predio,
        r.andar,
        r.espaco,
        "Corretiva",
        fmt(r.termino_sla),
        r.equipe,
        r.ativo,
        r.motivo_prioridade,
        r.outros,
      ]
        .map((v) => `<td>${escapeHtml(v ?? "")}</td>`)
        .join("");
      return `<tr class="${cls}">${tds}</tr>`;
    })
    .join("");

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(
    titulo,
  )} — Prioridades</title><style>${style}</style></head><body>
    <h1>${escapeHtml(titulo)} — Programação de Prioridades</h1>
    <div class="sub">${sorted.length} chamados prioritários · gerado em ${new Date().toLocaleString(
      "pt-BR",
    )}</div>
    <div class="noprint" style="margin-bottom:12px"><button onclick="window.print()">Imprimir</button></div>
    <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  </body></html>`;

  const win = window.open("", "_blank");
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(v: string) {
  return String(v).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

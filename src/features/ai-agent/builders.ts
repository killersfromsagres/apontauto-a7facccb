// Geração dos artefatos (Excel, PowerPoint, Power BI/CSV) a partir do plano
// executado localmente. Design corporativo consistente com o restante do PCM.

import ExcelJS from "exceljs";

import {
  DATE_FMT,
  ELECTRIC,
  FONT,
  NAVY,
  TEXT_LIGHT,
  addCorporateHeader,
  autoFitColumns,
  finishTable,
  writeTableHeader,
  writeTableRows,
  type ColumnSpec,
} from "@/features/assets/services/xlsx-report";

import type { TabelaResultado } from "./spec-runner";
import type { Dataset, Spec } from "./types";

const sheetName = (name: string, used: Set<string>) => {
  let base = name.replace(/[\\/*?:[\]]/g, " ").slice(0, 28) || "Aba";
  let out = base;
  let i = 2;
  while (used.has(out.toLowerCase())) out = `${base.slice(0, 25)} ${i++}`;
  used.add(out.toLowerCase());
  return out;
};

/* ------------------------------- Excel ---------------------------------- */

export async function buildXlsx(
  spec: Spec,
  tabelas: TabelaResultado[],
  ds: Dataset,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apontauto — Agente de IA";
  wb.created = new Date();

  const used = new Set<string>();
  const subtitle = `${spec.subtitulo || ds.fileName} • gerado em ${new Date().toLocaleString("pt-BR")}`;

  // Capa / resumo executivo
  const capa = wb.addWorksheet(sheetName("Resumo Executivo", used), {
    views: [{ showGridLines: false }],
  });
  addCorporateHeader(capa, spec.titulo, subtitle, 8);
  let r = 5;
  capa.getColumn(1).width = 4;
  capa.getColumn(2).width = 110;
  for (const linha of spec.resumo) {
    const cell = capa.getCell(r, 2);
    cell.value = `•  ${linha}`;
    cell.font = { name: FONT, size: 11 };
    cell.alignment = { wrapText: true, vertical: "top" };
    capa.getRow(r).height = 20;
    r += 1;
  }
  r += 1;
  const kpis: [string, string | number][] = [
    ["Linhas processadas", ds.rows.length],
    ["Ativos resolvidos na base", ds.resolvidos],
    ["Ativos não encontrados", ds.naoResolvidos],
    ["Tabelas geradas", tabelas.length],
  ];
  for (const [k, v] of kpis) {
    const a = capa.getCell(r, 2);
    a.value = k;
    a.font = { name: FONT, size: 10, bold: true, color: { argb: NAVY } };
    const b = capa.getCell(r, 3);
    b.value = v;
    b.font = { name: FONT, size: 10 };
    r += 1;
  }
  if (spec.observacoes) {
    r += 1;
    const o = capa.getCell(r, 2);
    o.value = spec.observacoes;
    o.font = { name: FONT, size: 10, italic: true };
    o.alignment = { wrapText: true, vertical: "top" };
  }

  // Tabelas do plano
  for (const t of tabelas) {
    const ws = wb.addWorksheet(sheetName(t.nome, used), { views: [{ showGridLines: false }] });
    const cols: ColumnSpec[] = t.headers.map((h) => ({
      header: h,
      wrap: h.length > 18,
      numFmt: /data|prazo|termino/i.test(h) ? DATE_FMT : undefined,
    }));
    addCorporateHeader(ws, t.nome, t.descricao || subtitle, cols.length);
    const headerRow = 4;
    const start = writeTableHeader(ws, headerRow, cols);
    const last = writeTableRows(ws, start, cols, t.rows);
    autoFitColumns(ws, cols, t.rows);
    finishTable(ws, headerRow, cols.length, last - 1);
  }

  // Base enriquecida (sempre presente — serve de fonte para Power BI)
  const base = wb.addWorksheet(sheetName("Base Enriquecida", used), {
    views: [{ showGridLines: false }],
  });
  const baseCols: ColumnSpec[] = ds.columns.map((h) => ({ header: h, wrap: false }));
  addCorporateHeader(base, "Base enriquecida", subtitle, baseCols.length);
  const bStart = writeTableHeader(base, 4, baseCols);
  const baseRows = ds.rows.map((row) => ds.columns.map((c) => row[c] ?? ""));
  const bLast = writeTableRows(base, bStart, baseCols, baseRows);
  autoFitColumns(base, baseCols, baseRows.slice(0, 200));
  finishTable(base, 4, baseCols.length, bLast - 1);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/* ----------------------------- PowerPoint -------------------------------- */

const HEX_NAVY = "0B1B3A";
const HEX_ELECTRIC = "1D4ED8";
const HEX_LIGHT = "F3F6FB";

export async function buildPptx(
  spec: Spec,
  tabelas: TabelaResultado[],
  ds: Dataset,
): Promise<Blob> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  pptx.author = "Apontauto";
  pptx.company = "Apontauto PCM";

  const byId = new Map(tabelas.map((t) => [t.id, t]));

  // Capa
  const capa = pptx.addSlide();
  capa.background = { color: HEX_NAVY };
  capa.addText(spec.titulo, {
    x: 0.7,
    y: 1.9,
    w: 8.6,
    h: 1.2,
    fontSize: 40,
    bold: true,
    color: "FFFFFF",
    fontFace: "Arial",
  });
  capa.addText(spec.subtitulo || ds.fileName, {
    x: 0.7,
    y: 3.1,
    w: 8.6,
    h: 0.6,
    fontSize: 18,
    color: "9DB6E8",
    fontFace: "Arial",
  });
  capa.addText(new Date().toLocaleDateString("pt-BR"), {
    x: 0.7,
    y: 4.6,
    w: 4,
    h: 0.4,
    fontSize: 13,
    color: "6E86B8",
  });

  // Resumo executivo
  if (spec.resumo.length > 0) {
    const s = pptx.addSlide();
    s.addText("Resumo executivo", {
      x: 0.6,
      y: 0.5,
      w: 8.8,
      h: 0.8,
      fontSize: 30,
      bold: true,
      color: HEX_NAVY,
    });
    s.addText(
      spec.resumo.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
      { x: 0.8, y: 1.5, w: 8.4, h: 3.6, fontSize: 18, color: "1F2937", lineSpacingMultiple: 1.2 },
    );
  }

  for (const slide of spec.slides) {
    const s = pptx.addSlide();
    s.addText(slide.titulo, {
      x: 0.6,
      y: 0.4,
      w: 8.8,
      h: 0.7,
      fontSize: 28,
      bold: true,
      color: HEX_NAVY,
    });
    if (slide.subtitulo) {
      s.addText(slide.subtitulo, { x: 0.6, y: 1.05, w: 8.8, h: 0.4, fontSize: 14, color: "64748B" });
    }

    const tabela = slide.tabelaId ? byId.get(slide.tabelaId) : undefined;
    const temVisual = !!tabela && slide.grafico !== "nenhum";
    const bulletsW = tabela ? 4.2 : 8.6;

    if (slide.bullets.length > 0) {
      s.addText(
        slide.bullets.map((t) => ({ text: t, options: { bullet: true, breakLine: true } })),
        {
          x: 0.7,
          y: 1.6,
          w: bulletsW,
          h: 3.4,
          fontSize: 15,
          color: "1F2937",
          lineSpacingMultiple: 1.15,
        },
      );
    }

    if (tabela) {
      const x = slide.bullets.length > 0 ? 5.1 : 0.7;
      const w = slide.bullets.length > 0 ? 4.2 : 8.6;
      if (temVisual) {
        const labels = tabela.rows.slice(0, 8).map((r) => String(r[0] ?? ""));
        const idxNum = tabela.headers.length - 1;
        const values = tabela.rows.slice(0, 8).map((r) => Number(r[idxNum]) || 0);
        const tipo =
          slide.grafico === "pizza"
            ? pptx.ChartType.pie
            : slide.grafico === "linha"
              ? pptx.ChartType.line
              : pptx.ChartType.bar;
        s.addChart(tipo, [{ name: tabela.headers[idxNum] ?? "Total", labels, values }], {
          x,
          y: 1.6,
          w,
          h: 3.4,
          showLegend: slide.grafico === "pizza",
          legendPos: "b",
          chartColors: ["1D4ED8", "0EA5E9", "22C55E", "F59E0B", "EC4899", "8B5CF6", "14B8A6"],
          showValue: slide.grafico !== "pizza",
        });
      } else {
        const head = tabela.headers.slice(0, 5);
        const body = tabela.rows
          .slice(0, 9)
          .map((r) => r.slice(0, 5).map((c) => ({ text: String(c ?? "") })));
        s.addTable(
          [head.map((h) => ({ text: h, options: { bold: true, color: "FFFFFF" } })), ...body],
          {
            x,
            y: 1.6,
            w,
            fontSize: 11,
            color: "1F2937",
            border: { type: "solid", color: "C3CEDF", pt: 0.5 },
            fill: { color: HEX_LIGHT },
            rowH: 0.32,
            autoPage: false,
          },
        );
        s.addShape(pptx.ShapeType.rect, {
          x,
          y: 1.6,
          w,
          h: 0.32,
          fill: { color: HEX_ELECTRIC },
          line: { color: HEX_ELECTRIC },
        });
        s.addText(
          head.map((h, i) => ({
            text: h + (i < head.length - 1 ? "   " : ""),
            options: { bold: true, color: "FFFFFF" },
          })),
          { x: x + 0.05, y: 1.6, w: w - 0.1, h: 0.32, fontSize: 10, valign: "middle" },
        );
      }
    }
  }

  const blob = (await pptx.write({ outputType: "blob" })) as Blob;
  return blob;
}

/* ------------------------------ CSV / BI --------------------------------- */

function toCsv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(";"), ...rows.map((r) => r.map(esc).join(";"))].join("\r\n");
}

/** Base plana pronta para importar no Power BI (UTF-8 BOM, separador ";"). */
export function buildPowerBiCsv(ds: Dataset): Blob {
  const rows = ds.rows.map((r) => ds.columns.map((c) => r[c] ?? ""));
  return new Blob(["\uFEFF" + toCsv(ds.columns, rows)], { type: "text/csv;charset=utf-8" });
}

export function buildTabelaCsv(t: TabelaResultado): Blob {
  return new Blob(["\uFEFF" + toCsv(t.headers, t.rows)], { type: "text/csv;charset=utf-8" });
}

export { ELECTRIC, TEXT_LIGHT };

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

  // Garante que TODA análise gerada a partir do arquivo apareça na apresentação,
  // mesmo que a IA não tenha criado um slide para ela.
  const referenciadas = new Set(spec.slides.map((s) => s.tabelaId).filter(Boolean) as string[]);
  const slidesExtras = tabelas
    .filter((t) => !referenciadas.has(t.id))
    .map((t) => ({
      titulo: t.nome,
      subtitulo: t.descricao ?? `${t.total} registros do arquivo enviado`,
      bullets: [] as string[],
      tabelaId: t.id,
      grafico: (t.rows.length <= 12 && t.headers.length <= 3 ? "barras" : "nenhum") as
        | "barras"
        | "nenhum",
    }));

  for (const slide of [...spec.slides, ...slidesExtras]) {

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

/* --------------------------------- PDF ----------------------------------- */

const RGB_NAVY: [number, number, number] = [11, 27, 58];
const RGB_ELECTRIC: [number, number, number] = [29, 78, 216];
const RGB_MUTED: [number, number, number] = [100, 116, 139];

/** Relatório executivo em PDF (A4 retrato) com capa, KPIs e todas as análises. */
export async function buildPdf(
  spec: Spec,
  tabelas: TabelaResultado[],
  ds: Dataset,
): Promise<Blob> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = (autoTableMod.default ?? autoTableMod) as unknown as (
    doc: unknown,
    options: Record<string, unknown>,
  ) => void;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 14;
  const geradoEm = new Date().toLocaleString("pt-BR");

  const header = (titulo: string, subtitulo: string) => {
    doc.setFillColor(...RGB_NAVY);
    doc.rect(0, 0, W, 26, "F");
    doc.setFillColor(...RGB_ELECTRIC);
    doc.rect(0, 26, W, 1.2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text(titulo.slice(0, 78), M, 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(157, 182, 232);
    doc.text(subtitulo.slice(0, 110), M, 19);
    doc.setTextColor(30, 41, 59);
  };

  // Capa / resumo executivo
  header(spec.titulo, spec.subtitulo || ds.fileName);
  let y = 38;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Resumo executivo", M, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  for (const linha of spec.resumo) {
    const wrapped = doc.splitTextToSize(`•  ${linha}`, W - M * 2) as string[];
    if (y + wrapped.length * 5 > 265) {
      doc.addPage();
      header(spec.titulo, spec.subtitulo || ds.fileName);
      y = 38;
    }
    doc.text(wrapped, M, y);
    y += wrapped.length * 5 + 1;
  }

  y += 4;
  const kpis: [string, string][] = [
    ["Linhas processadas", String(ds.rows.length)],
    ["Ativos resolvidos", String(ds.resolvidos)],
    ["Sem correspondência", String(ds.naoResolvidos)],
    ["Análises geradas", String(tabelas.length)],
  ];
  const cardW = (W - M * 2 - 6) / 4;
  kpis.forEach(([label, value], i) => {
    const x = M + i * (cardW + 2);
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(243, 246, 251);
    doc.roundedRect(x, y, cardW, 18, 2, 2, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...RGB_ELECTRIC);
    doc.text(value, x + 3, y + 8);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...RGB_MUTED);
    doc.text(doc.splitTextToSize(label, cardW - 6) as string[], x + 3, y + 13);
  });
  y += 26;
  doc.setTextColor(30, 41, 59);

  if (spec.observacoes) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(9);
    doc.setTextColor(...RGB_MUTED);
    const obs = doc.splitTextToSize(spec.observacoes, W - M * 2) as string[];
    doc.text(obs, M, y);
    y += obs.length * 4.5 + 4;
    doc.setTextColor(30, 41, 59);
  }

  // Análises
  for (const t of tabelas) {
    doc.addPage();
    header(t.nome, t.descricao || `${spec.titulo} • gerado em ${geradoEm}`);
    const head = [t.headers.slice(0, 8)];
    const body = t.rows.slice(0, 300).map((r) => r.slice(0, 8).map((c) => String(c ?? "")));
    autoTable(doc, {
      head,
      body,
      startY: 36,
      margin: { left: M, right: M, top: 34 },
      styles: { font: "helvetica", fontSize: 8, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: RGB_ELECTRIC, textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles: { fillColor: [243, 246, 251] },
      didDrawPage: () => header(t.nome, t.descricao || `Gerado em ${geradoEm}`),
    });
    if (t.rows.length > 300) {
      const finalY =
        (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 250;
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(...RGB_MUTED);
      doc.text(
        `Exibindo as primeiras 300 de ${t.rows.length} linhas. Base completa no Excel/CSV.`,
        M,
        finalY + 6,
      );
      doc.setTextColor(30, 41, 59);
    }
  }

  // Rodapé com paginação
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...RGB_MUTED);
    doc.text(`Apontauto • Agente de Documentos (IA) • ${geradoEm}`, M, 290);
    doc.text(`${p}/${total}`, W - M, 290, { align: "right" });
  }

  return doc.output("blob");
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

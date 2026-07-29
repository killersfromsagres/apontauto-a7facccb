/**
 * BI Studio — exportações: CSV, Excel, PDF e imagem PNG do painel.
 */

import { downloadBlob } from "@/lib/download";
import { DATASETS, type DatasetKey, type Row } from "./catalog";

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");

function toMatrix(rows: Row[], columns?: string[]) {
  const cols = columns?.length ? columns : Object.keys(rows[0] ?? {});
  const body = rows.map((r) =>
    cols.map((c) => {
      const v = r[c];
      if (v == null) return "";
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    }),
  );
  return { cols, body };
}

export function exportCsv(rows: Row[], filename: string, columns?: string[]) {
  const { cols, body } = toMatrix(rows, columns);
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = [cols.map(escape).join(";"), ...body.map((r) => r.map(escape).join(";"))].join("\n");
  downloadBlob(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }), `${filename}-${stamp()}.csv`);
}

export async function exportExcel(
  sheets: { name: string; rows: Row[]; columns?: string[] }[],
  filename: string,
  title = "Apont Auto — BI Studio",
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = "Apont Auto PCM";
  wb.created = new Date();

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name.slice(0, 30) || "Dados");
    const { cols, body } = toMatrix(sheet.rows, sheet.columns);
    const width = Math.max(cols.length, 1);

    ws.mergeCells(1, 1, 1, width);
    const t = ws.getCell(1, 1);
    t.value = title;
    t.font = { name: "Aptos", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
    t.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3D91" } };
    t.alignment = { vertical: "middle", indent: 1 };
    ws.getRow(1).height = 30;

    ws.mergeCells(2, 1, 2, width);
    const s = ws.getCell(2, 1);
    s.value = `${sheet.name} · ${sheet.rows.length} registro(s) · gerado em ${new Date().toLocaleString("pt-BR")}`;
    s.font = { name: "Aptos", size: 10, color: { argb: "FFFFFFFF" } };
    s.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F6FEB" } };
    s.alignment = { vertical: "middle", indent: 1 };

    const headerIdx = 4;
    const header = ws.getRow(headerIdx);
    header.values = cols;
    header.eachCell((cell) => {
      cell.font = { name: "Aptos", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    });
    header.height = 22;

    body.forEach((line, i) => {
      const row = ws.getRow(headerIdx + 1 + i);
      row.values = line;
      row.eachCell((cell) => {
        cell.font = { name: "Aptos", size: 10 };
        cell.alignment = { vertical: "middle", wrapText: true };
        if (i % 2 === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F5F9" } };
        }
      });
    });

    cols.forEach((c, i) => {
      const maxLen = Math.max(c.length, ...body.map((r) => (r[i] ?? "").length));
      ws.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 12), 44);
    });
    ws.views = [{ state: "frozen", ySplit: headerIdx }];
    if (body.length) {
      ws.autoFilter = { from: { row: headerIdx, column: 1 }, to: { row: headerIdx, column: width } };
    }
  }

  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${filename}-${stamp()}.xlsx`,
  );
}

export async function exportDatasetExcel(key: DatasetKey, rows: Row[]) {
  const def = DATASETS[key];
  await exportExcel([{ name: def.label, rows }], `bi-${key}`, `Apont Auto — ${def.label}`);
}

/** PDF executivo: capa, KPIs e tabelas dos widgets. */
export async function exportPdf(opts: {
  title: string;
  subtitle: string;
  kpis: { label: string; value: string }[];
  tables: { title: string; columns: string[]; rows: string[][] }[];
}) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(11, 61, 145);
  doc.rect(0, 0, W, 72, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text(opts.title, 32, 34);
  doc.setFontSize(10);
  doc.text(opts.subtitle, 32, 54);

  let y = 100;
  doc.setTextColor(30, 41, 59);
  if (opts.kpis.length) {
    doc.setFontSize(13);
    doc.text("Indicadores", 32, y);
    y += 12;
    autoTable(doc, {
      startY: y,
      head: [opts.kpis.map((k) => k.label)],
      body: [opts.kpis.map((k) => k.value)],
      theme: "grid",
      styles: { fontSize: 9, halign: "center" },
      headStyles: { fillColor: [31, 111, 235], textColor: 255 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  for (const table of opts.tables) {
    if (y > doc.internal.pageSize.getHeight() - 120) {
      doc.addPage();
      y = 60;
    }
    doc.setFontSize(12);
    doc.text(table.title, 32, y);
    autoTable(doc, {
      startY: y + 8,
      head: [table.columns],
      body: table.rows,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
  }

  doc.save(`bi-painel-${stamp()}.pdf`);
}

/** PNG de alta resolução do painel renderizado. */
export async function exportPng(node: HTMLElement, filename = "bi-painel") {
  const { toBlob } = await import("html-to-image");
  const blob = await toBlob(node, {
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: getComputedStyle(document.body).backgroundColor || "#0b1220",
    filter: (el) => !(el instanceof HTMLElement && el.dataset.exportIgnore === "true"),
  });
  if (blob) downloadBlob(blob, `${filename}-${stamp()}.png`);
}

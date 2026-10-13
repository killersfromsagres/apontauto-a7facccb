import type { ApontamentoRow } from "./apontamento";

export interface SheetInput {
  titulo: string;
  rows: ApontamentoRow[];
}

export interface AusenciaExportRow {
  matricula: string;
  colaborador: string;
  especialidade: string;
  tipo: "Falta" | "Férias";
  inicio: string;
  fim: string;
  observacao?: string;
}

export async function generateApontamentosMultiSheetWorkbook(
  sheets: SheetInput[],
  ausencias: AusenciaExportRow[] = [],
): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  wb.creator = "Sistema de Apontamento";

  const headerFills = ["FFFA8072", "FF7CC77C", "FF7CC77C", "FFD8B4FE"];
  const bodyFills = ["FFFCAFA7", "FFB7EDB7", "FFB7EDB7", "FFD8B4FE"];
  const headers = ["Técnico", "Data Início", "Data Final", "OS"];

  for (const { titulo, rows } of sheets) {
    const ws = wb.addWorksheet(titulo, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { key: "tecnico", width: 22 },
      { key: "ini", width: 22, style: { numFmt: "dd/mm/yyyy hh:mm" } },
      { key: "fim", width: 22, style: { numFmt: "dd/mm/yyyy hh:mm" } },
      { key: "os", width: 44 },
    ];

    const headerRow = ws.addRow(headers);
    headerRow.height = 30;
    headerRow.alignment = { vertical: "middle", horizontal: "center" };
    headerRow.font = { bold: true, size: 13, color: { argb: "FF000000" } };
    headerRow.eachCell((cell, col) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: headerFills[col - 1] },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } },
      };
    });

    for (const r of rows) {
      const row = ws.addRow([r.tecnico, r.dataInicio, r.dataFinal, r.os]);
      row.height = 20;
      row.getCell(2).numFmt = "dd/mm/yyyy hh:mm";
      row.getCell(3).numFmt = "dd/mm/yyyy hh:mm";
      row.eachCell((cell, col) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: bodyFills[col - 1] },
        };
        cell.font = { size: 12, color: { argb: "FF000000" } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "hair", color: { argb: "FFCBD5E1" } },
          bottom: { style: "hair", color: { argb: "FFCBD5E1" } },
        };
      });
    }
  }

  if (ausencias.length > 0) {
    const ws = wb.addWorksheet("FALTAS_FERIAS", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    ws.columns = [
      { key: "matricula", width: 16 },
      { key: "colaborador", width: 38 },
      { key: "especialidade", width: 20 },
      { key: "tipo", width: 14 },
      { key: "inicio", width: 16 },
      { key: "fim", width: 16 },
      { key: "observacao", width: 42 },
    ];

    const absenceHeaders = [
      "Matrícula",
      "Colaborador",
      "Especialidade",
      "Tipo",
      "Início",
      "Fim",
      "Observação",
    ];
    const headerRow = ws.addRow(absenceHeaders);
    headerRow.height = 30;
    headerRow.font = { bold: true, size: 12 };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE2E8F0" },
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FF94A3B8" } },
        bottom: { style: "thin", color: { argb: "FF94A3B8" } },
        left: { style: "thin", color: { argb: "FF94A3B8" } },
        right: { style: "thin", color: { argb: "FF94A3B8" } },
      };
    });

    for (const ausencia of ausencias) {
      const row = ws.addRow([
        ausencia.matricula,
        ausencia.colaborador,
        ausencia.especialidade,
        ausencia.tipo,
        toBrDate(ausencia.inicio),
        toBrDate(ausencia.fim),
        ausencia.observacao ?? "",
      ]);
      row.height = 20;
      row.alignment = { vertical: "middle" };
    }

    ws.autoFilter = "A1:G1";
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function toBrDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

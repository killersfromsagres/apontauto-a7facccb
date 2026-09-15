import { buildWeeklyPrintHtml } from "./weekly-exporter";

const CORRECTIVE_BG = "FFFFD966";
const CORRECTIVE_TEXT = "FF000000";
const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function activityText(row: import("exceljs").Row): string {
  return row.getCell(6).text.trim().toUpperCase();
}

/**
 * Pós-processa a planilha semanal sem interferir na lógica do escalonador.
 * Garante leitura completa, destaque amarelo das corretivas e preferência
 * explícita por impressão colorida no arquivo Excel.
 */
export async function polishWeeklyProgramacao(blob: Blob): Promise<Blob> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await blob.arrayBuffer());

  workbook.worksheets.forEach((sheet) => {
    sheet.pageSetup.blackAndWhite = false;

    sheet.eachRow({ includeEmpty: false }, (row) => {
      const activity = activityText(row);
      const isDataRow = activity === "CORRETIVA" || activity === "PREVENTIVA";
      if (!isDataRow) return;

      const isTeamSheet = sheet.name !== "PROGRAMAÇÃO";
      row.height = isTeamSheet ? 68 : 74;

      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.alignment = {
          ...(cell.alignment ?? {}),
          vertical: "middle",
          wrapText: true,
        };

        if (activity === "CORRETIVA") {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: CORRECTIVE_BG },
          };
          cell.font = {
            ...(cell.font ?? {}),
            color: { argb: CORRECTIVE_TEXT },
          };
        }
      });
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: XLSX_MIME });
}

/**
 * Impressão HTML da programação com altura ampliada e preservação de cores.
 * A preferência blackAndWhite=false fica no XLSX; o HTML usa print-color-adjust.
 */
export async function printWeeklyProgramacaoColor(blob: Blob): Promise<void> {
  const printWindow = window.open("", "_blank");
  if (!printWindow)
    throw new Error("O navegador bloqueou a janela de impressão.");

  printWindow.opener = null;
  printWindow.document.write(
    "<p style='font-family:Arial;padding:24px'>Preparando impressão colorida...</p>",
  );

  try {
    let html = await buildWeeklyPrintHtml(blob);
    html = html.replace(
      ".data-row td { min-height: 52px; height: auto; padding-top: 5px; padding-bottom: 5px; }",
      ".data-row td { min-height: 68px; height: auto; padding-top: 7px; padding-bottom: 7px; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }",
    );
    html = html.replace(
      "@media print {",
      "@media print { html, body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }",
    );

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    await printWindow.document.fonts?.ready;
    printWindow.focus();
    printWindow.setTimeout(() => printWindow.print(), 250);
  } catch (error) {
    printWindow.close();
    throw error;
  }
}

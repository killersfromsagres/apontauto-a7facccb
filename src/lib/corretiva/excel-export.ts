import ExcelJS from "exceljs";
import { saveAs } from "file-saver";
import { format } from "date-fns";

export async function exportCorretivaHistoricoToExcel(rows: any[]) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Histórico de OS");

  // Define Columns
  worksheet.columns = [
    { header: "Número OS", key: "numero_os", width: 15 },
    { header: "Descrição / Nome OS", key: "nome_os", width: 40 },
    { header: "Equipe", key: "equipe", width: 15 },
    { header: "Prédio", key: "predio", width: 20 },
    { header: "Andar", key: "andar", width: 15 },
    { header: "Local", key: "local", width: 20 },
    { header: "Ativo", key: "ativo", width: 20 },
    { header: "Equipamento", key: "equipamento", width: 25 },
    { header: "Patrimônio", key: "patrimonio", width: 15 },
    { header: "Solicitante", key: "solicitante", width: 25 },
    { header: "Status", key: "status", width: 15 },
    { header: "Finalizada em", key: "fim", width: 25 },
    { header: "Rubrica", key: "tem_assinatura", width: 12 },
  ];

  // Style Header
  worksheet.getRow(1).eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" }, // Apple Obsidian style
    };
    cell.font = {
      color: { argb: "FFFFFFFF" },
      bold: true,
      size: 11,
    };
    cell.alignment = { vertical: "middle", horizontal: "center" };
  });

  // Add Data
  rows.forEach((row) => {
    const dataRow = worksheet.addRow({
      numero_os: row.numero_os,
      nome_os: row.nome_os,
      equipe: row.equipe,
      predio: row.predio,
      andar: row.andar,
      local: row.local,
      ativo: row.ativo,
      equipamento: row.equipamento,
      patrimonio: row.patrimonio,
      solicitante: row.solicitante,
      status: row.status === "concluida" ? "Finalizada" : "Cancelada",
      fim: row.fim ? format(new Date(row.fim), "dd/MM/yyyy HH:mm") : "—",
      tem_assinatura: row.assinatura_url ? "Sim" : "Não",
    });

    // Style Status Cell
    const statusCell = dataRow.getCell("status");
    if (row.status === "concluida") {
      statusCell.font = { color: { argb: "FF059669" }, bold: true }; // Emerald 600
    } else {
      statusCell.font = { color: { argb: "FFDC2626" }, bold: true }; // Red 600
    }
  });

  // Apply general styles to rows
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.height = 20;
      row.eachCell((cell) => {
        cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
      });
    }
  });

  // Export
  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `Historico_OS_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`;
  saveAs(new Blob([buffer]), fileName);
}

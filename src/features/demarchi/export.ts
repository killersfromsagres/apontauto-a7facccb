import { downloadBlob } from "@/lib/download";
import {
  locationText,
  PRIORITIES,
  protocol,
  STATUSES,
  type DemAsset,
  type DemPerson,
  type DemTicket,
  type DemWorklog,
} from "./domain";

/** A dated snapshot of the current filtered queue, with stable protocol links. */
export async function exportTickets(
  tickets: DemTicket[],
  assets: DemAsset[],
  people: DemPerson[],
  logs: DemWorklog[],
) {
  const ExcelJS = (await import("exceljs")).default;
  const book = new ExcelJS.Workbook();
  book.creator = "Apont Auto · Demarchi";
  book.created = new Date();
  const sheet = book.addWorksheet("Chamados", { views: [{ state: "frozen", ySplit: 5 }] });
  const headers = [
    "Protocolo",
    "Solicitante",
    "E-mail",
    "Chamado",
    "Descrição",
    "Localização",
    "Referência",
    "Criticidade",
    "SLA (dias corridos)",
    "Abertura",
    "Prazo",
    "Situação",
    "Data programada",
    "Responsável",
    "Horas apontadas",
    "Serviço realizado",
  ];
  sheet.mergeCells(1, 1, 1, headers.length);
  sheet.getCell(1, 1).value = "DEMARCHI · CENTRAL DE MANUTENÇÃO";
  sheet.getRow(1).height = 36;
  sheet.mergeCells(2, 1, 2, headers.length);
  sheet.getCell(2, 1).value =
    `Fila exportada em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília) · ${tickets.length} chamados na seleção`;
  sheet.mergeCells(3, 1, 3, headers.length);
  sheet.getCell(3, 1).value =
    "Criticidade: Emergencial 1 dia · Alta 7 dias · Baixa 30 dias. Datas e horários em Brasília.";
  sheet.getRow(5).values = headers;
  sheet.getRow(5).height = 30;
  for (const ticket of tickets) {
    // Excel stores wall-clock dates without a timezone. Encode Brasília parts
    // as UTC fields so the export is independent of the browser's timezone.
    const localDate = (value: string | null) => {
      if (!value) return null;
      if (value.length === 10) return new Date(value + "T00:00:00Z");
      const parts = Object.fromEntries(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Sao_Paulo",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hourCycle: "h23",
        })
          .formatToParts(new Date(value))
          .map((part) => [part.type, part.value]),
      );
      return new Date(
        Date.UTC(
          Number(parts.year),
          Number(parts.month) - 1,
          Number(parts.day),
          Number(parts.hour),
          Number(parts.minute),
          Number(parts.second),
        ),
      );
    };
    const row = sheet.addRow([
      protocol(ticket.number),
      ticket.requester_name,
      ticket.requester_email,
      ticket.title,
      ticket.description,
      locationText(ticket.asset_id, assets),
      ticket.location_detail,
      PRIORITIES[ticket.priority].label,
      PRIORITIES[ticket.priority].days,
      localDate(ticket.created_at),
      localDate(ticket.deadline),
      STATUSES[ticket.status],
      localDate(ticket.scheduled_for),
      people.find((p) => p.id === ticket.assigned_to)?.name || "Não atribuído",
      logs.filter((l) => l.ticket_id === ticket.id).reduce((s, l) => s + l.minutes, 0) / 60,
      ticket.resolution,
    ]);
    row.height = 44;
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.font = { name: "Aptos", size: 10, color: { argb: "FF253B50" } };
      if (row.number % 2 === 0)
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF1F6FA" } };
    });
    [10, 11].forEach((n) => (row.getCell(n).numFmt = "dd/mm/yyyy hh:mm"));
    row.getCell(13).numFmt = "dd/mm/yyyy";
    row.getCell(15).numFmt = "0.00";
    row.getCell(8).font = {
      name: "Aptos",
      bold: true,
      size: 10,
      color: {
        argb:
          ticket.priority === "emergencial"
            ? "FFB22D47"
            : ticket.priority === "alta"
              ? "FF93600C"
              : "FF16749E",
      },
    };
  }
  [1, 5].forEach((n) =>
    sheet.getRow(n).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12334D" } };
      cell.font = {
        name: "Aptos",
        bold: true,
        size: n === 1 ? 17 : 10,
        color: { argb: "FFFFFFFF" },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
    }),
  );
  sheet.getRow(2).font = { name: "Aptos", size: 10, color: { argb: "FF526A7F" } };
  sheet.getRow(3).font = { name: "Aptos", size: 10, color: { argb: "FF526A7F" } };
  [21, 26, 32, 42, 60, 58, 30, 17, 16, 21, 21, 24, 18, 28, 18, 60].forEach((width, i) => {
    sheet.getColumn(i + 1).width = width;
  });
  sheet.autoFilter = {
    from: { row: 5, column: 1 },
    to: { row: Math.max(sheet.rowCount, 5), column: headers.length },
  };
  sheet.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  const buffer = await book.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `Demarchi_Chamados_${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}

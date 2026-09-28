import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import fiorinoAsset from "@/assets/fiorino_template.pdf.asset.json";
import saveiroAsset from "@/assets/saveiro_template.pdf.asset.json";
import type {
  ChecklistItemResult,
  ChecklistTemplateCode,
  FleetChecklist,
  FleetVehicle,
} from "@/features/fleet/api";

type Point = { x: number; y: number; maxWidth?: number; size?: number };

type TemplateLayout = {
  url: string;
  code: ChecklistTemplateCode;
  fields: {
    date: Point;
    driver: Point;
    sector: Point;
    unit: Point;
    plate: Point;
    brandModel: Point;
    kmInitial: Point;
    kmFinal: Point;
    itinerary: Point;
    departureTime: Point;
    arrivalTime: Point;
    inspector: Point;
  };
  itemMode: "single" | "two_columns";
  itemStartY: number;
  itemStepY: number;
  itemOkX: number;
  itemNokX: number;
  secondItemStartY?: number;
  secondItemOkX?: number;
  secondItemNokX?: number;
  itemObservationX?: number;
  itemObservationWidth?: number;
  observations: Point;
  driverSignature: Point;
  responsibleSignature: Point;
};

const FIORINO_LAYOUT: TemplateLayout = {
  url: fiorinoAsset.url,
  code: "fiorino_van",
  fields: {
    date: { x: 478, y: 778, maxWidth: 80, size: 12 },
    driver: { x: 82, y: 693, maxWidth: 160, size: 9 },
    sector: { x: 270, y: 693, maxWidth: 150, size: 9 },
    unit: { x: 475, y: 693, maxWidth: 80, size: 9 },
    plate: { x: 92, y: 671, maxWidth: 130, size: 10 },
    brandModel: { x: 286, y: 671, maxWidth: 250, size: 9 },
    kmInitial: { x: 91, y: 650, maxWidth: 125, size: 9 },
    kmFinal: { x: 281, y: 650, maxWidth: 125, size: 9 },
    itinerary: { x: 128, y: 628, maxWidth: 420, size: 8.5 },
    departureTime: { x: 117, y: 606, maxWidth: 100, size: 9 },
    arrivalTime: { x: 309, y: 606, maxWidth: 100, size: 9 },
    inspector: { x: 159, y: 584, maxWidth: 370, size: 9 },
  },
  itemMode: "single",
  itemStartY: 326,
  itemStepY: 14.2,
  itemOkX: 269,
  itemNokX: 309,
  itemObservationX: 342,
  itemObservationWidth: 210,
  observations: { x: 41, y: 93, maxWidth: 510, size: 7.5 },
  driverSignature: { x: 130, y: 37, maxWidth: 145, size: 8 },
  responsibleSignature: { x: 383, y: 37, maxWidth: 145, size: 8 },
};

const PICKUP_LAYOUT: TemplateLayout = {
  url: saveiroAsset.url,
  code: "pickup",
  fields: {
    date: { x: 482, y: 785, maxWidth: 75, size: 12 },
    driver: { x: 84, y: 675, maxWidth: 230, size: 9 },
    sector: { x: 355, y: 675, maxWidth: 190, size: 9 },
    unit: { x: 79, y: 632, maxWidth: 105, size: 9 },
    plate: { x: 90, y: 653, maxWidth: 210, size: 10 },
    brandModel: { x: 356, y: 653, maxWidth: 190, size: 9 },
    kmInitial: { x: 243, y: 632, maxWidth: 115, size: 9 },
    kmFinal: { x: 432, y: 632, maxWidth: 112, size: 9 },
    itinerary: { x: 113, y: 610, maxWidth: 430, size: 8.5 },
    departureTime: { x: 111, y: 588, maxWidth: 115, size: 9 },
    arrivalTime: { x: 303, y: 588, maxWidth: 100, size: 9 },
    inspector: { x: 452, y: 588, maxWidth: 95, size: 8 },
  },
  itemMode: "two_columns",
  itemStartY: 271,
  itemStepY: 22.2,
  itemOkX: 224,
  itemNokX: 264,
  secondItemStartY: 271,
  secondItemOkX: 514,
  secondItemNokX: 554,
  observations: { x: 41, y: 88, maxWidth: 510, size: 7.5 },
  driverSignature: { x: 125, y: 31, maxWidth: 150, size: 8 },
  responsibleSignature: { x: 380, y: 31, maxWidth: 150, size: 8 },
};

function templateCode(checklist: FleetChecklist, vehicle: FleetVehicle): ChecklistTemplateCode {
  return checklist.template_code || vehicle.checklist_template_code || "fiorino_van";
}

export function getTemplateForVehicle(
  vehicle: FleetVehicle,
  checklist?: Pick<FleetChecklist, "template_code">,
): string {
  return (checklist?.template_code || vehicle.checklist_template_code) === "pickup"
    ? saveiroAsset.url
    : fiorinoAsset.url;
}

function layoutFor(checklist: FleetChecklist, vehicle: FleetVehicle): TemplateLayout {
  return templateCode(checklist, vehicle) === "pickup" ? PICKUP_LAYOUT : FIORINO_LAYOUT;
}

function fitText(font: PDFFont, text: string, maxWidth: number, initialSize: number, minimum = 6.3) {
  let size = initialSize;
  while (size > minimum && font.widthOfTextAtSize(text, size) > maxWidth) size -= 0.35;
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return { text, size };

  let value = text;
  while (value.length > 3 && font.widthOfTextAtSize(`${value}…`, size) > maxWidth) {
    value = value.slice(0, -1);
  }
  return { text: `${value}…`, size };
}

function drawValue(page: PDFPage, font: PDFFont, value: unknown, point: Point) {
  const text = String(value ?? "").trim();
  if (!text) return;
  const initialSize = point.size ?? 9;
  const fitted = point.maxWidth
    ? fitText(font, text, point.maxWidth, initialSize)
    : { text, size: initialSize };
  page.drawText(fitted.text, {
    x: point.x,
    y: point.y,
    size: fitted.size,
    font,
    color: rgb(0.04, 0.04, 0.04),
  });
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function formatKm(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return "";
  return Math.round(Number(value)).toLocaleString("pt-BR");
}

function compactObservation(item: ChecklistItemResult) {
  return String(item.observation ?? "").replace(/\s+/g, " ").trim();
}

function drawMark(page: PDFPage, font: PDFFont, x: number, y: number) {
  page.drawText("X", {
    x,
    y,
    size: 11,
    font,
    color: rgb(0.06, 0.06, 0.06),
  });
}

function drawChecklistItems(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  items: ChecklistItemResult[],
  layout: TemplateLayout,
) {
  items.slice(0, 12).forEach((item, index) => {
    const isOk = item.status === "ok";
    if (layout.itemMode === "single") {
      const y = layout.itemStartY - index * layout.itemStepY;
      drawMark(page, fontBold, isOk ? layout.itemOkX : layout.itemNokX, y);

      const observation = compactObservation(item);
      if (observation && layout.itemObservationX && layout.itemObservationWidth) {
        drawValue(page, font, observation, {
          x: layout.itemObservationX,
          y: y + 1,
          maxWidth: layout.itemObservationWidth,
          size: 6.2,
        });
      }
      return;
    }

    const secondColumn = index >= 6;
    const row = secondColumn ? index - 6 : index;
    const y = (secondColumn ? layout.secondItemStartY! : layout.itemStartY) - row * layout.itemStepY;
    const okX = secondColumn ? layout.secondItemOkX! : layout.itemOkX;
    const nokX = secondColumn ? layout.secondItemNokX! : layout.itemNokX;
    drawMark(page, fontBold, isOk ? okX : nokX, y);
  });
}

function buildObservations(checklist: FleetChecklist) {
  const lines: string[] = [];
  if (checklist.damages?.length) {
    const labels: Record<string, string> = {
      batido: "Batido",
      riscado: "Riscado",
      amassado: "Amassado",
      quebrado: "Quebrado",
      barulho: "Barulho",
    };
    lines.push(
      `Avarias: ${[...new Set(checklist.damages.map((damage) => labels[damage.type] ?? damage.type))].join(", ")}.`,
    );
    const descriptions = [
      ...new Set(
        checklist.damages
          .map((damage) => String(damage.description ?? "").trim())
          .filter(Boolean),
      ),
    ];
    if (descriptions.length) lines.push(descriptions.join(" · "));
  }

  const itemNotes = (checklist.items ?? [])
    .filter((item) => item.status !== "ok" && compactObservation(item))
    .map((item) => `${item.label}: ${compactObservation(item)}`);
  if (itemNotes.length) lines.push(itemNotes.join(" | "));
  if (checklist.notes?.trim()) lines.push(checklist.notes.trim());
  return lines.join("\n");
}

function drawWrappedObservation(page: PDFPage, font: PDFFont, text: string, point: Point) {
  if (!text.trim()) return;
  const width = point.maxWidth ?? 500;
  const size = point.size ?? 7.5;
  const words = text.replace(/\r/g, "").split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  lines.slice(0, 5).forEach((value, index) => {
    page.drawText(value, {
      x: point.x,
      y: point.y - index * (size + 2.4),
      size,
      font,
      color: rgb(0.08, 0.08, 0.08),
    });
  });
}

/**
 * Gera o certificado preenchendo somente as áreas variáveis do template.
 * Os textos, logotipo, linhas, legenda, desenho do veículo e títulos permanecem
 * no PDF-base para não sofrerem deslocamentos ou reflow.
 */
export async function generateVehicleCertificate(
  checklist: FleetChecklist,
  vehicle: FleetVehicle,
  protocol: string,
): Promise<Uint8Array> {
  const layout = layoutFor(checklist, vehicle);
  const response = await fetch(layout.url);
  if (!response.ok) throw new Error("Não foi possível carregar o modelo do certificado.");

  const pdfBytes = await response.arrayBuffer();
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const page = pdfDoc.getPages()[0];
  if (!page) throw new Error("O modelo do certificado não possui página válida.");

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  drawValue(page, fontBold, formatDate(checklist.inspection_date || checklist.created_at), layout.fields.date);
  drawValue(page, font, checklist.driver_name, layout.fields.driver);
  drawValue(page, font, checklist.sector, layout.fields.sector);
  drawValue(page, font, checklist.unit, layout.fields.unit);
  drawValue(page, fontBold, vehicle.plate || "", layout.fields.plate);
  drawValue(page, font, `${vehicle.brand} ${vehicle.model}${vehicle.version ? ` ${vehicle.version}` : ""}`, layout.fields.brandModel);
  drawValue(page, font, formatKm(checklist.odometer_initial_km), layout.fields.kmInitial);
  drawValue(page, font, formatKm(checklist.odometer_final_km), layout.fields.kmFinal);
  drawValue(page, font, checklist.itinerary_destination, layout.fields.itinerary);
  drawValue(page, font, checklist.departure_time?.slice(0, 5), layout.fields.departureTime);
  drawValue(page, font, checklist.arrival_time?.slice(0, 5), layout.fields.arrivalTime);
  drawValue(page, font, checklist.inspector_name, layout.fields.inspector);

  drawChecklistItems(page, font, fontBold, checklist.items ?? [], layout);
  drawWrappedObservation(page, font, buildObservations(checklist), layout.observations);

  drawValue(page, font, checklist.driver_name, layout.driverSignature);
  drawValue(page, font, checklist.inspector_name || "Responsável", layout.responsibleSignature);

  const footer = `Apont Auto · ${protocol} · ${new Date(checklist.created_at).toLocaleString("pt-BR")}`;
  page.drawText(footer, {
    x: 38,
    y: 10,
    size: 5.8,
    font,
    color: rgb(0.48, 0.48, 0.48),
  });

  return await pdfDoc.save();
}

export function downloadUint8Array(data: Uint8Array, filename: string) {
  const blob = new Blob([data as BlobPart], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

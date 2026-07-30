import { jsPDF } from "jspdf";

import logoAsset from "@/assets/in-haus-logo.png.asset.json";
import type { FleetChecklist, FleetVehicle } from "@/features/fleet/api";
import { vehicleTitle } from "@/features/fleet/api";
import { PHOTO_CATEGORIES, STATUS_LABEL } from "@/features/fleet/checklist-items";
import { inferSketchKind, renderVehicleSketch } from "@/features/fleet/vehicle-sketch";

const NAVY = { r: 17, g: 24, b: 39 };
const ORANGE = { r: 245, g: 158, b: 11 };
const GRAY = { r: 110, g: 116, b: 128 };

const STATUS_RGB: Record<string, [number, number, number]> = {
  ok: [16, 143, 94],
  atencao: [202, 138, 4],
  critico: [190, 42, 58],
};

async function toDataUrl(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = reject;
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Código de verificação legível derivado do id do checklist. */
export function certificateCode(checklist: { id: string; created_at: string }): string {
  const d = new Date(checklist.created_at);
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  return `CHK-${stamp}-${checklist.id.slice(0, 6).toUpperCase()}`;
}

export type CertificateInput = {
  checklist: FleetChecklist;
  vehicle: FleetVehicle | undefined;
  /** Fotos já com URL acessível (assinada). */
  photos?: { category: string; url: string }[];
};

/** Gera o certificado A4 retrato do checklist e dispara o download. */
export async function generateChecklistCertificate({
  checklist,
  vehicle,
  photos = [],
}: CertificateInput): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = 210;
  const M = 14;
  const code = certificateCode(checklist);

  /* ---------------- Cabeçalho ---------------- */
  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.rect(0, 0, W, 34, "F");
  doc.setFillColor(ORANGE.r, ORANGE.g, ORANGE.b);
  doc.rect(0, 34, W, 1.6, "F");

  const logo = await toDataUrl(logoAsset.url);
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M, 9, 38, 16, undefined, "FAST");
    } catch {
      /* logo opcional */
    }
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("CERTIFICADO DE INSPEÇÃO VEICULAR", W - M, 17, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(215, 220, 230);
  doc.text(
    `Checklist ${checklist.kind === "saida" ? "de saída" : "de retorno"} · Frota e Abastecimento`,
    W - M,
    23,
    { align: "right" },
  );
  doc.text(`Protocolo ${code}`, W - M, 28.5, { align: "right" });

  /* ---------------- Faixa de status ---------------- */
  const st = STATUS_RGB[checklist.overall_status] ?? STATUS_RGB.ok;
  let y = 44;
  doc.setFillColor(st[0], st[1], st[2]);
  doc.roundedRect(M, y - 6, W - M * 2, 12, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.text(
    `RESULTADO GERAL: ${(STATUS_LABEL[checklist.overall_status] ?? checklist.overall_status).toUpperCase()}`,
    M + 4,
    y + 1.6,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(new Date(checklist.created_at).toLocaleString("pt-BR"), W - M - 4, y + 1.6, {
    align: "right",
  });

  /* ---------------- Dados do veículo ---------------- */
  y += 16;
  doc.setDrawColor(226, 230, 238);
  doc.setFillColor(249, 250, 252);
  doc.roundedRect(M, y, W - M * 2, 30, 2, 2, "FD");

  const info: [string, string][] = [
    ["Prefixo", vehicle?.prefix ?? "—"],
    ["Placa", vehicle?.plate ?? "—"],
    ["Veículo", vehicle ? vehicleTitle(vehicle) : "—"],
    ["Ano/Cor", `${vehicle?.year_model ?? "—"} · ${vehicle?.color ?? "—"}`],
    ["Condutor", checklist.driver_name],
    ["Odômetro", `${Number(checklist.odometer_km).toLocaleString("pt-BR")} km`],
    [
      "Combustível",
      checklist.fuel_level_pct == null ? "—" : `${checklist.fuel_level_pct}% do tanque`,
    ],
    ["Itens avaliados", String((checklist.items ?? []).length)],
  ];
  const colW = (W - M * 2) / 4;
  info.forEach(([label, value], i) => {
    const cx = M + 4 + (i % 4) * colW;
    const cy = y + 8 + Math.floor(i / 4) * 13;
    doc.setFontSize(7);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(label.toUpperCase(), cx, cy);
    doc.setFontSize(9.5);
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    doc.setFont("helvetica", "bold");
    doc.text(String(value).slice(0, 26), cx, cy + 5);
    doc.setFont("helvetica", "normal");
  });

  /* ---------------- Desenho a lápis do veículo ---------------- */
  y += 36;
  const sketch = renderVehicleSketch(
    inferSketchKind(`${vehicle?.brand ?? ""} ${vehicle?.model ?? ""} ${vehicle?.version ?? ""}`),
    {
      label: vehicle ? `${vehicle.prefix} — ${vehicleTitle(vehicle)}` : "Veículo inspecionado",
      scale: 2,
    },
  );
  const sketchH = 54;
  doc.setDrawColor(226, 230, 238);
  doc.roundedRect(M, y, W - M * 2, sketchH, 2, 2, "S");
  if (sketch) {
    try {
      doc.addImage(sketch, "PNG", M + 3, y + 2, W - M * 2 - 6, sketchH - 4, undefined, "FAST");
    } catch {
      /* desenho opcional */
    }
  }
  doc.setFontSize(7);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text("Representação técnica ilustrativa do veículo inspecionado", M + 3, y + sketchH + 4);

  /* ---------------- Itens verificados ---------------- */
  y += sketchH + 10;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
  doc.text("ITENS VERIFICADOS", M, y);
  doc.setFont("helvetica", "normal");
  y += 4;

  const items = checklist.items ?? [];
  const half = Math.ceil(items.length / 2);
  const rowH = 7;
  items.forEach((item, i) => {
    const col = i < half ? 0 : 1;
    const row = i < half ? i : i - half;
    const x = M + col * ((W - M * 2) / 2 + 2);
    const ry = y + row * rowH;
    const cw = (W - M * 2) / 2 - 2;
    doc.setFillColor(row % 2 === 0 ? 246 : 252, row % 2 === 0 ? 248 : 253, 255);
    doc.rect(x, ry, cw, rowH - 1, "F");
    doc.setFontSize(8.5);
    doc.setTextColor(40, 46, 58);
    doc.text(String(item.label).slice(0, 40), x + 2.5, ry + 4.4);
    const c = STATUS_RGB[item.status] ?? STATUS_RGB.ok;
    doc.setTextColor(c[0], c[1], c[2]);
    doc.setFont("helvetica", "bold");
    doc.text(STATUS_LABEL[item.status] ?? item.status, x + cw - 2.5, ry + 4.4, { align: "right" });
    doc.setFont("helvetica", "normal");
  });
  y += half * rowH + 6;

  /* ---------------- Observações ---------------- */
  if (checklist.notes) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    doc.text("OBSERVAÇÕES", M, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 66, 78);
    const lines = doc.splitTextToSize(checklist.notes, W - M * 2);
    doc.text(lines.slice(0, 5), M, y + 5);
    y += 6 + Math.min(lines.length, 5) * 4.4;
  }

  /* ---------------- Assinaturas e rodapé ---------------- */
  const sigY = Math.max(y + 12, 252);
  doc.setDrawColor(150, 156, 168);
  doc.line(M, sigY, M + 70, sigY);
  doc.line(W - M - 70, sigY, W - M, sigY);
  doc.setFontSize(8);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(checklist.driver_name, M, sigY + 4);
  doc.text("Condutor responsável", M, sigY + 8);
  doc.text("Gestor de frota", W - M, sigY + 4, { align: "right" });
  doc.text("Validação da inspeção", W - M, sigY + 8, { align: "right" });

  doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
  doc.rect(0, 283, W, 14, "F");
  doc.setTextColor(220, 224, 232);
  doc.setFontSize(7.5);
  doc.text(
    `Documento gerado eletronicamente em ${new Date().toLocaleString("pt-BR")} · Protocolo ${code}`,
    M,
    291,
  );
  doc.setTextColor(ORANGE.r, ORANGE.g, ORANGE.b);
  doc.text("In-Haus Industrial", W - M, 291, { align: "right" });

  /* ---------------- Página de evidências ---------------- */
  const withUrls = photos.filter((p) => p.url);
  if (withUrls.length > 0) {
    const images = await Promise.all(
      withUrls.slice(0, 8).map(async (p) => ({ ...p, data: await toDataUrl(p.url) })),
    );
    const ok = images.filter((i) => i.data);
    if (ok.length > 0) {
      doc.addPage();
      doc.setFillColor(NAVY.r, NAVY.g, NAVY.b);
      doc.rect(0, 0, W, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("EVIDÊNCIAS FOTOGRÁFICAS", M, 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(code, W - M, 14, { align: "right" });

      const cw = (W - M * 2 - 6) / 2;
      const ch = 55;
      ok.forEach((img, i) => {
        const x = M + (i % 2) * (cw + 6);
        const py = 30 + Math.floor(i / 2) * (ch + 12);
        try {
          doc.addImage(img.data!, "JPEG", x, py, cw, ch, undefined, "FAST");
        } catch {
          /* ignora imagem inválida */
        }
        doc.setDrawColor(226, 230, 238);
        doc.rect(x, py, cw, ch, "S");
        doc.setFontSize(8);
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text(
          PHOTO_CATEGORIES.find((c) => c.key === img.category)?.label ?? img.category,
          x,
          py + ch + 5,
        );
      });
    }
  }

  doc.save(`certificado-${code}.pdf`);
}

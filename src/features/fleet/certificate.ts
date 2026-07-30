import { jsPDF } from "jspdf";

import fiorinoAsset from "@/assets/fiorino-sketch.png.asset.json";
import logoAsset from "@/assets/in-haus-logo.png.asset.json";
import saveiroAsset from "@/assets/saveiro-sketch.png.asset.json";
import type { FleetChecklist, FleetVehicle } from "@/features/fleet/api";
import { vehicleTitle } from "@/features/fleet/api";
import { PHOTO_CATEGORIES, STATUS_LABEL } from "@/features/fleet/checklist-items";

const NAVY = { r: 17, g: 24, b: 39 };
const ORANGE = { r: 245, g: 158, b: 11 };
const GRAY = { r: 110, g: 116, b: 128 };
const LINE = { r: 223, g: 228, b: 236 };

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

/** Escolhe a ilustração real conforme marca/modelo do veículo. */
function vehicleArt(text: string): { url: string; label: string } {
  const t = (text || "").toLowerCase();
  if (/(fiorino|doblo|doblò|ducato|kangoo|partner|van|furg)/.test(t))
    return { url: fiorinoAsset.url, label: "Fiat Fiorino — vista lateral" };
  return { url: saveiroAsset.url, label: "VW Saveiro — vista lateral" };
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
  const M = 15;
  const CW = W - M * 2;
  const code = certificateCode(checklist);

  const sectionTitle = (text: string, y: number) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    doc.text(text.toUpperCase(), M, y);
    doc.setDrawColor(ORANGE.r, ORANGE.g, ORANGE.b);
    doc.setLineWidth(0.7);
    doc.line(M, y + 1.9, M + doc.getTextWidth(text.toUpperCase()), y + 1.9);
    doc.setLineWidth(0.2);
    doc.setFont("helvetica", "normal");
  };

  /* ---------------- Cabeçalho ---------------- */
  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, 297, "F");
  doc.setDrawColor(LINE.r, LINE.g, LINE.b);
  doc.roundedRect(M, 12, CW, 26, 2, 2, "S");

  const logo = await toDataUrl(logoAsset.url);
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M + 5, 17, 34, 15, undefined, "FAST");
    } catch {
      /* logo opcional */
    }
  }
  doc.line(M + 45, 12, M + 45, 38);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
  doc.text("CHECK LIST DE VEÍCULOS", M + 52, 23);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(
    `Certificado de inspeção ${checklist.kind === "saida" ? "de saída" : "de retorno"} · Frota e Abastecimento`,
    M + 52,
    29,
  );
  doc.setFontSize(8);
  doc.text(
    `${new Date(checklist.created_at).toLocaleString("pt-BR")}   ·   Protocolo ${code}`,
    M + 52,
    34,
  );

  /* ---------------- Faixa de resultado ---------------- */
  const st = STATUS_RGB[checklist.overall_status] ?? STATUS_RGB.ok;
  let y = 43;
  doc.setFillColor(st[0], st[1], st[2]);
  doc.roundedRect(M, y, CW, 11, 2, 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(
    `RESULTADO GERAL: ${(STATUS_LABEL[checklist.overall_status] ?? checklist.overall_status).toUpperCase()}`,
    M + 5,
    y + 7,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(`${(checklist.items ?? []).length} itens avaliados`, W - M - 5, y + 7, {
    align: "right",
  });

  /* ---------------- Dados do veículo / condutor ---------------- */
  y += 19;
  sectionTitle("Identificação", y);
  y += 5;
  doc.setDrawColor(LINE.r, LINE.g, LINE.b);
  doc.setFillColor(250, 251, 253);
  doc.roundedRect(M, y, CW, 28, 2, 2, "FD");

  const info: [string, string][] = [
    ["Prefixo", vehicle?.prefix ?? "—"],
    ["Placa", vehicle?.plate ?? "—"],
    ["Marca / Modelo", vehicle ? vehicleTitle(vehicle) : "—"],
    ["Ano / Cor", `${vehicle?.year_model ?? "—"} · ${vehicle?.color ?? "—"}`],
    ["Motorista", checklist.driver_name],
    ["Odômetro", `${Number(checklist.odometer_km).toLocaleString("pt-BR")} km`],
    [
      "Combustível",
      checklist.fuel_level_pct == null ? "—" : `${checklist.fuel_level_pct}% do tanque`,
    ],
    ["Tipo", checklist.kind === "saida" ? "Saída" : "Retorno"],
  ];
  const colW = CW / 4;
  info.forEach(([label, value], i) => {
    const cx = M + 5 + (i % 4) * colW;
    const cy = y + 9 + Math.floor(i / 4) * 12;
    doc.setFontSize(6.8);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(label.toUpperCase(), cx, cy);
    doc.setFontSize(9);
    doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
    doc.setFont("helvetica", "bold");
    doc.text(String(value).slice(0, 24), cx, cy + 5);
    doc.setFont("helvetica", "normal");
  });

  /* ---------------- Ilustração do veículo ---------------- */
  y += 36;
  sectionTitle("Avarias — vista lateral do veículo", y);
  y += 5;

  const art = vehicleArt(
    `${vehicle?.brand ?? ""} ${vehicle?.model ?? ""} ${vehicle?.version ?? ""}`,
  );
  const boxH = 62;
  doc.setDrawColor(LINE.r, LINE.g, LINE.b);
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(M, y, CW, boxH, 2, 2, "FD");

  const artData = await toDataUrl(art.url);
  if (artData) {
    // proporção original 4:3 — encaixa na altura útil do quadro
    const availH = boxH - 12;
    const availW = CW - 12;
    const imgW = Math.min(availW, availH * (4 / 3));
    const imgH = imgW * (3 / 4);
    try {
      doc.addImage(
        artData,
        "PNG",
        M + (CW - imgW) / 2,
        y + 4,
        imgW,
        imgH,
        undefined,
        "FAST",
      );
    } catch {
      /* ilustração opcional */
    }
  }
  doc.setFontSize(7);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(
    `${art.label} — assinale avarias: [X] batido · [-] riscado · [O] amassado · [*] quebrado`,
    W / 2,
    y + boxH - 3.5,
    { align: "center" },
  );

  /* ---------------- Itens verificados ---------------- */
  y += boxH + 9;
  sectionTitle("Itens verificados", y);
  y += 6;

  const items = checklist.items ?? [];
  const half = Math.ceil(items.length / 2);
  const rowH = 7;
  const colGap = 6;
  const cw = (CW - colGap) / 2;
  items.forEach((item, i) => {
    const col = i < half ? 0 : 1;
    const row = i < half ? i : i - half;
    const x = M + col * (cw + colGap);
    const ry = y + row * rowH;
    if (row % 2 === 0) {
      doc.setFillColor(247, 249, 252);
      doc.rect(x, ry, cw, rowH - 1, "F");
    }
    doc.setFontSize(8.2);
    doc.setTextColor(45, 51, 62);
    doc.text(String(item.label).slice(0, 40), x + 3, ry + 4.4);
    const c = STATUS_RGB[item.status] ?? STATUS_RGB.ok;
    doc.setTextColor(c[0], c[1], c[2]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.text((STATUS_LABEL[item.status] ?? item.status).toUpperCase(), x + cw - 3, ry + 4.4, {
      align: "right",
    });
    doc.setFont("helvetica", "normal");
  });
  y += half * rowH + 7;

  /* ---------------- Observações ---------------- */
  if (checklist.notes) {
    sectionTitle("Observações", y);
    doc.setFontSize(8.6);
    doc.setTextColor(60, 66, 78);
    const lines = doc.splitTextToSize(checklist.notes, CW);
    doc.text(lines.slice(0, 5), M, y + 7);
    y += 10 + Math.min(lines.length, 5) * 4.2;
  }

  /* ---------------- Assinaturas e rodapé ---------------- */
  const sigY = Math.max(y + 14, 258);
  doc.setDrawColor(150, 156, 168);
  doc.line(M, sigY, M + 74, sigY);
  doc.line(W - M - 74, sigY, W - M, sigY);
  doc.setFontSize(8.5);
  doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
  doc.text(checklist.driver_name, M, sigY + 4.5);
  doc.text("Gestor de frota", W - M, sigY + 4.5, { align: "right" });
  doc.setFontSize(7.2);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text("Condutor responsável", M, sigY + 8.8);
  doc.text("Validação da inspeção", W - M, sigY + 8.8, { align: "right" });

  doc.setDrawColor(LINE.r, LINE.g, LINE.b);
  doc.line(M, 283, W - M, 283);
  doc.setFontSize(7.2);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(
    `Documento gerado eletronicamente em ${new Date().toLocaleString("pt-BR")} · Protocolo ${code}`,
    M,
    288,
  );
  doc.setTextColor(ORANGE.r, ORANGE.g, ORANGE.b);
  doc.setFont("helvetica", "bold");
  doc.text("In-Haus Industrial", W - M, 288, { align: "right" });
  doc.setFont("helvetica", "normal");

  /* ---------------- Página de evidências ---------------- */
  const withUrls = photos.filter((p) => p.url);
  if (withUrls.length > 0) {
    const images = await Promise.all(
      withUrls.slice(0, 8).map(async (p) => ({ ...p, data: await toDataUrl(p.url) })),
    );
    const ok = images.filter((i) => i.data);
    if (ok.length > 0) {
      doc.addPage();
      doc.setDrawColor(LINE.r, LINE.g, LINE.b);
      doc.roundedRect(M, 12, CW, 18, 2, 2, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(NAVY.r, NAVY.g, NAVY.b);
      doc.text("EVIDÊNCIAS FOTOGRÁFICAS", M + 5, 23.5);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
      doc.text(code, W - M - 5, 23.5, { align: "right" });

      const pw = (CW - 6) / 2;
      const ph = 54;
      ok.forEach((img, i) => {
        const x = M + (i % 2) * (pw + 6);
        const py = 38 + Math.floor(i / 2) * (ph + 12);
        try {
          doc.addImage(img.data!, "JPEG", x, py, pw, ph, undefined, "FAST");
        } catch {
          /* ignora imagem inválida */
        }
        doc.setDrawColor(LINE.r, LINE.g, LINE.b);
        doc.rect(x, py, pw, ph, "S");
        doc.setFontSize(7.6);
        doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
        doc.text(
          PHOTO_CATEGORIES.find((c) => c.key === img.category)?.label ?? img.category,
          x,
          py + ph + 4.5,
        );
      });
    }
  }

  doc.save(`certificado-${code}.pdf`);
}

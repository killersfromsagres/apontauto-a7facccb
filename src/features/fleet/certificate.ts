import { jsPDF } from "jspdf";

import fiorinoAsset from "@/assets/fiorino-sketch.png.asset.json";
import logoAsset from "@/assets/in-haus-logo.png.asset.json";
import saveiroAsset from "@/assets/saveiro-sketch.png.asset.json";
import type { FleetChecklist, FleetVehicle } from "@/features/fleet/api";
import { vehicleTitle } from "@/features/fleet/api";
import { PHOTO_CATEGORIES, STATUS_LABEL } from "@/features/fleet/checklist-items";

const INK = { r: 20, g: 22, b: 26 };
const GRAY = { r: 110, g: 116, b: 128 };
const LINE = { r: 190, g: 195, b: 204 };
const ORANGE = { r: 240, g: 138, b: 30 };
const HEAD = { r: 45, g: 48, b: 54 };

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
    return { url: fiorinoAsset.url, label: "Fiat Fiorino" };
  return { url: saveiroAsset.url, label: "VW Saveiro" };
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

/** Gera o certificado A4 no padrão oficial "Check List de Veículo" da In-Haus. */
export async function generateChecklistCertificate({
  checklist,
  vehicle,
  photos = [],
}: CertificateInput): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = 210;
  const M = 12;
  const CW = W - M * 2;
  const code = certificateCode(checklist);
  const created = new Date(checklist.created_at);

  doc.setLineWidth(0.15);

  doc.setDrawColor(LINE.r, LINE.g, LINE.b);

  /* ---------- moldura geral ---------- */
  doc.setDrawColor(60, 64, 70);
  doc.setLineWidth(0.6);
  doc.rect(M - 4, 8, CW + 8, 281, "S");
  doc.setLineWidth(0.15);
  doc.setDrawColor(LINE.r, LINE.g, LINE.b);

  /* ---------- cabeçalho ---------- */
  let y = 12;
  const headH = 24;
  doc.rect(M, y, CW, headH, "S");

  const logo = await toDataUrl(logoAsset.url);
  if (logo) {
    try {
      doc.addImage(logo, "PNG", M + 4, y + 5, 32, 14, undefined, "FAST");
    } catch {
      /* logo opcional */
    }
  }
  doc.line(M + 40, y, M + 40, y + headH);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16); // Reduzido levemente para evitar serrilhado
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.text("CHECK LIST DE VEÍCULO", M + 44, y + 11);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text("Certificado de Inspeção Veicular", M + 44, y + 17);
  doc.setDrawColor(ORANGE.r, ORANGE.g, ORANGE.b);
  doc.setLineWidth(0.4);
  doc.line(M + 44, y + 19.5, M + 80, y + 19.5);
  doc.setLineWidth(0.15); // Linhas ultra-finas para evitar borrões
  doc.setDrawColor(LINE.r, LINE.g, LINE.b);

  // caixa DATA (preenchida com a data real)
  const dateX = W - M - 46;
  doc.line(dateX, y, dateX, y + headH);
  doc.setFillColor(HEAD.r, HEAD.g, HEAD.b);
  doc.rect(dateX + 4, y + 4, 38, 6, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("DATA", dateX + 23, y + 8.2, { align: "center" });
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.setFontSize(12);
  doc.text(created.toLocaleDateString("pt-BR"), dateX + 23, y + 17.5, { align: "center" });
  doc.setFont("helvetica", "normal");

  /* ---------- aviso ---------- */
  y += headH + 3;
  const avisoH = 17;
  doc.roundedRect(M, y, CW, avisoH, 1.5, 1.5, "S");
  doc.setFillColor(ORANGE.r, ORANGE.g, ORANGE.b);
  doc.circle(M + 9, y + avisoH / 2, 4.2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("!", M + 9, y + avisoH / 2 + 1.8, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.4);
  doc.setTextColor(70, 75, 84);
  const aviso = [
    "Este Check List deverá ser preenchido antes da saída pelos usuários dos veículos, com intervalo de turno.",
    "Após o Check List, o mesmo deverá ser entregue para o responsável pela área de Suprimentos.",
    "Todos os itens desconformes deverão ser anotados, avisados e, se possível, corrigidos de imediato.",
  ];
  aviso.forEach((l, i) => doc.text(l, M + 16, y + 6 + i * 4));

  /* ---------- dados preenchidos ---------- */
  y += avisoH + 3;
  const rowH = 8.6;
  const field = (x: number, w: number, ry: number, label: string, value: string) => {
    doc.rect(x, ry, w, rowH, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(HEAD.r, HEAD.g, HEAD.b);
    doc.text(label.toUpperCase(), x + 2.5, ry + 5.6);
    const lw = doc.getTextWidth(label.toUpperCase());
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8); // Reduzido para garantir alinhamento nas linhas
    doc.setTextColor(INK.r, INK.g, INK.b);
    const maxW = w - lw - 7;
    let v = value || "—";
    while (doc.getTextWidth(v) > maxW && v.length > 4) v = `${v.slice(0, -2)}…`;
    doc.text(v, x + lw + 5, ry + 5.6);
  };

  const hSaida = created.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const isSaida = checklist.kind === "saida";
  const rows: [string, string, number][][] = [
    [
      ["Motorista:", checklist.driver_name, 0.42],
      ["Setor:", "Manutenção / PCM", 0.33],
      ["Unidade:", vehicle?.prefix ?? "—", 0.25],
    ],
    [
      ["Placa do veículo:", vehicle?.plate ?? "—", 0.42],
      ["Marca / Modelo:", vehicle ? vehicleTitle(vehicle) : "—", 0.58],
    ],
    [
      [
        "KM inicial:",
        isSaida ? `${Number(checklist.odometer_km).toLocaleString("pt-BR")} km` : "—",
        0.42,
      ],
      [
        "KM final:",
        isSaida ? "—" : `${Number(checklist.odometer_km).toLocaleString("pt-BR")} km`,
        0.58,
      ],
    ],
    [
      [
        "Itinerário / Destino:",
        checklist.notes ? "Conforme observações" : "Rota operacional interna",
        1,
      ],
    ],
    [
      ["Horário de saída:", isSaida ? hSaida : "—", 0.42],
      ["Horário de chegada:", isSaida ? "—" : hSaida, 0.58],
    ],
    [
      ["Responsável pela inspeção:", checklist.driver_name, 0.62],
      [
        "Combustível:",
        checklist.fuel_level_pct == null ? "—" : `${checklist.fuel_level_pct}%`,
        0.38,
      ],
    ],
  ];
  rows.forEach((cells) => {
    let x = M;
    cells.forEach(([label, value, frac]) => {
      const w = CW * frac;
      field(x, w, y, label, value);
      x += w;
    });
    y += rowH;
  });

  /* ---------- avarias / inspeção visual ---------- */
  y += 3;
  const bandH = 6.5;
  doc.setFillColor(HEAD.r, HEAD.g, HEAD.b);
  doc.rect(M, y, 62, bandH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.4);
  doc.text("AVARIAS / INSPEÇÃO VISUAL", M + 3, y + 4.6);
  doc.setFont("helvetica", "normal");

  y += bandH;
  const artH = 56;
  doc.setDrawColor(LINE.r, LINE.g, LINE.b);
  doc.setLineWidth(0.15);
  doc.rect(M, y, CW, artH, "S");
  const legendW = 52;
  doc.line(W - M - legendW, y, W - M - legendW, y + artH);


  const art = vehicleArt(
    `${vehicle?.brand ?? ""} ${vehicle?.model ?? ""} ${vehicle?.version ?? ""}`,
  );
  const artData = await toDataUrl(art.url);
  if (artData) {
    const availW = CW - legendW - 4;
    const availH = artH - 6;
    // Aumentado o tamanho da imagem do carro (de 10 para 6 de margem vertical)
    const imgW = Math.min(availW, availH * (16 / 9)); 
    const imgH = imgW * (9 / 16);
    try {
      doc.addImage(
        artData,
        "PNG",
        M + 2 + (availW - imgW) / 2,
        y + 2,
        imgW,
        imgH,
        undefined,
        "FAST"
      );
    } catch {
      /* ilustração opcional */
    }
  }
  doc.setFontSize(7);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(`${art.label} — ${vehicle?.plate ?? ""}`, M + 4, y + artH - 3);

  const lx = W - M - legendW + 4;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(INK.r, INK.g, INK.b);
  doc.text("LEGENDA DE AVARIAS", lx, y + 6);
  doc.setFontSize(7.8);
  const legenda: [string, string][] = [
    ["[X]", "Batido"],
    ["[ ]", "Riscado"],
    ["[O]", "Amassado"],
    ["[*]", "Quebrado"],
    ["[B]", "Barulho"],
  ];
  legenda.forEach(([sym, label], i) => {
    const ly = y + 13 + i * 6;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(INK.r, INK.g, INK.b);
    doc.text(sym, lx, ly);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(70, 75, 84);
    doc.text(label, lx + 10, ly);
  });
  doc.setFontSize(6.6);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(
    doc.splitTextToSize(
      "Marque os locais das avarias usando a legenda. Detalhe nas observações.",
      legendW - 8,
    ),
    lx,
    y + 47,
  );

  /* ---------- check list de itens ---------- */
  y += artH + 3;
  const items = checklist.items ?? [];
  const colOk = W - M - 78;
  const colNok = W - M - 62;
  const colObs = W - M - 46;

  doc.setFillColor(HEAD.r, HEAD.g, HEAD.b);
  doc.rect(M, y, CW, bandH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.4);
  doc.text("CHECK LIST DE ITENS", M + 3, y + 4.6);
  doc.setFontSize(7.6);
  doc.text("OK", colOk + 8, y + 4.6, { align: "center" });
  doc.text("N/OK", colNok + 8, y + 4.6, { align: "center" });
  doc.text("OBSERVAÇÕES", colObs + 4, y + 4.6);
  doc.setFont("helvetica", "normal");
  y += bandH;

  const irH = 7;
  items.forEach((item, i) => {
    const ry = y + i * irH;
    doc.setLineWidth(0.15);
    doc.rect(M, ry, CW, irH, "S");
    doc.line(M + 10, ry, M + 10, ry + irH);
    doc.line(colOk, ry, colOk, ry + irH);
    doc.line(colNok, ry, colNok, ry + irH);
    doc.line(colObs, ry, colObs, ry + irH);


    doc.setFontSize(7.6);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(String(i + 1).padStart(2, "0"), M + 5, ry + 4.7, { align: "center" });
    doc.setFontSize(8.4);
    doc.setTextColor(INK.r, INK.g, INK.b);
    doc.text(String(item.label).slice(0, 46), M + 13, ry + 4.7);

    const conforme = item.status === "ok";
    const box = (cx: number, marked: boolean, rgb: [number, number, number]) => {
      doc.setDrawColor(90, 96, 106);
      doc.rect(cx - 2.1, ry + 2.3, 4.2, 4.2, "S");
      if (marked) {
        doc.setTextColor(rgb[0], rgb[1], rgb[2]);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8.2);
        doc.text("X", cx, ry + 5.6, { align: "center" });
        doc.setFont("helvetica", "normal");
      }
    };
    box(colOk + 8, conforme, STATUS_RGB.ok);
    box(colNok + 8, !conforme, STATUS_RGB[item.status] ?? STATUS_RGB.critico);

    const c = STATUS_RGB[item.status] ?? STATUS_RGB.ok;
    doc.setTextColor(c[0], c[1], c[2]);
    doc.setFontSize(7.6);
    doc.text((STATUS_LABEL[item.status] ?? item.status).toUpperCase(), colObs + 4, ry + 4.7);
    doc.setTextColor(INK.r, INK.g, INK.b);
  });
  y += items.length * irH + 3;

  /* ---------- observações ---------- */
  doc.setFillColor(HEAD.r, HEAD.g, HEAD.b);
  doc.rect(M, y, 42, bandH, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.4);
  doc.text("OBSERVAÇÕES", M + 3, y + 4.6);
  doc.setFont("helvetica", "normal");
  y += bandH;

  const obsH = 20;
  doc.setDrawColor(LINE.r, LINE.g, LINE.b);
  doc.rect(M, y, CW, obsH, "S");
  const st = STATUS_RGB[checklist.overall_status] ?? STATUS_RGB.ok;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(st[0], st[1], st[2]);
  doc.text(
    `RESULTADO GERAL: ${(STATUS_LABEL[checklist.overall_status] ?? checklist.overall_status).toUpperCase()} · ${items.length} itens avaliados`,
    M + 3,
    y + 5.5,
  );
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(50, 55, 64);
  const notes = doc.splitTextToSize(checklist.notes || "Sem observações registradas.", CW - 6);
  doc.text(notes.slice(0, 3), M + 3, y + 11);
  y += obsH + 4;

  /* ---------- assinaturas ---------- */
  const sigH = 20;
  const sigW = (CW - 4) / 2;
  const sigY = Math.min(y, 258);
  [
    ["MOTORISTA", checklist.driver_name],
    ["RESPONSÁVEL", "Gestor de Frota — Suprimentos"],
  ].forEach(([title, name], i) => {
    const x = M + i * (sigW + 4);
    doc.roundedRect(x, sigY, sigW, sigH, 1.5, 1.5, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.6);
    doc.setTextColor(HEAD.r, HEAD.g, HEAD.b);
    doc.text(title, x + 3, sigY + 5.5);
    doc.setDrawColor(120, 126, 136);
    doc.line(x + 6, sigY + 13, x + sigW - 6, sigY + 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.4);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(name, x + sigW / 2, sigY + 17, { align: "center" });
  });

  doc.setFontSize(6.8);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(
    `Documento gerado eletronicamente em ${new Date().toLocaleString("pt-BR")} · Protocolo ${code}`,
    M,
    sigY + sigH + 5,
  );
  doc.setTextColor(ORANGE.r, ORANGE.g, ORANGE.b);
  doc.setFont("helvetica", "bold");
  doc.text("In-Haus Industrial", W - M, sigY + sigH + 5, { align: "right" });
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
      doc.rect(M, 12, CW, 18, "S");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(INK.r, INK.g, INK.b);
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

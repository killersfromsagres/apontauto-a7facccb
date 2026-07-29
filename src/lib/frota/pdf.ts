import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import { maskCpf } from "@/lib/frota/cpf";
import { vehicleLabel, type Checklist, type Vehicle } from "@/lib/frota/api";

const NAVY = [8, 14, 24] as const;
const TEAL = [24, 160, 168] as const;

async function loadImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const fr = new FileReader();
      fr.onload = () => resolve(String(fr.result));
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function exportChecklistPdf(opts: {
  checklist: Checklist;
  vehicle: Vehicle | undefined;
  items: any[];
  photos: any[];
  collaborators: any[];
  responsibleName?: string;
}) {
  const { checklist, vehicle, items, photos, collaborators } = opts;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const W = doc.internal.pageSize.getWidth();

  doc.setFillColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.rect(0, 0, W, 26, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("APONT AUTO — Checklist Veicular", 12, 12);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Protocolo ${checklist.protocol}`, 12, 19);
  doc.text(
    new Date(checklist.submitted_at).toLocaleString("pt-BR"),
    W - 12,
    19,
    { align: "right" },
  );

  const veic = vehicle
    ? [
        ["Prefixo", vehicle.prefix],
        ["Placa", vehicle.plate ?? "não cadastrada"],
        ["Veículo", vehicleLabel(vehicle)],
        ["Combustível", vehicle.fuel_type],
      ]
    : [["Veículo", "não identificado"]];

  autoTable(doc, {
    startY: 32,
    head: [["Dados do veículo", ""]],
    body: veic,
    theme: "grid",
    headStyles: { fillColor: [TEAL[0], TEAL[1], TEAL[2]], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 45, fontStyle: "bold" } },
  });

  autoTable(doc, {
    head: [["Dados do registro", ""]],
    body: [
      ["Tipo", checklist.checklist_type],
      ["Quilometragem", `${checklist.odometer_km} km`],
      ["Nível de combustível", `${checklist.fuel_level_pct ?? "-"}%`],
      ["Local", checklist.location ?? "-"],
      ["Finalidade", checklist.purpose ?? "-"],
      ["OS relacionada", checklist.work_order_number ?? "-"],
      ["Status geral", checklist.overall_status],
      ["Score de integridade", `${checklist.integrity_score}/100`],
      ["Bloqueio crítico", checklist.critical_block ? "SIM" : "não"],
    ],
    theme: "grid",
    headStyles: { fillColor: [TEAL[0], TEAL[1], TEAL[2]], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    columnStyles: { 0: { cellWidth: 45, fontStyle: "bold" } },
  });

  autoTable(doc, {
    head: [["Colaborador", "Papel", "CPF"]],
    body: collaborators.map((c) => [
      c.full_name_snapshot,
      c.role_in_checklist === "principal" ? "Principal" : "Acompanhante",
      maskCpf(c.cpf_last4),
    ]),
    theme: "striped",
    headStyles: { fillColor: [TEAL[0], TEAL[1], TEAL[2]], fontSize: 9 },
    bodyStyles: { fontSize: 9 },
  });

  autoTable(doc, {
    head: [["Item", "Categoria", "Situação", "Gravidade", "Observação"]],
    body: items.map((i) => [
      i.label,
      i.category,
      i.status === "conforme"
        ? "Conforme"
        : i.status === "nao_conforme"
          ? "NÃO CONFORME"
          : "N/A",
      i.severity ?? "-",
      i.notes ?? "-",
    ]),
    theme: "grid",
    headStyles: { fillColor: [TEAL[0], TEAL[1], TEAL[2]], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    didParseCell: (data) => {
      if (data.section === "body" && data.column.index === 2 && data.cell.raw === "NÃO CONFORME") {
        data.cell.styles.textColor = [190, 40, 40];
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // Fotos (evidências)
  const usable = photos.slice(0, 12);
  if (usable.length) {
    doc.addPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(20, 20, 20);
    doc.text("Evidências fotográficas", 12, 16);
    let x = 12;
    let y = 22;
    const w = (W - 30) / 2;
    const h = w * 0.7;
    for (const p of usable) {
      const dataUrl = await loadImage(p.url);
      if (dataUrl) {
        try {
          doc.addImage(dataUrl, "JPEG", x, y, w, h);
        } catch {
          /* formato não suportado */
        }
      }
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(String(p.photo_slot ?? ""), x, y + h + 4);
      if (x === 12) {
        x = 18 + w;
      } else {
        x = 12;
        y += h + 10;
        if (y + h > 280) {
          doc.addPage();
          y = 16;
        }
      }
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(110, 110, 110);
    doc.text(
      `Protocolo ${checklist.protocol} · Integridade ${checklist.integrity_hash?.slice(0, 16) ?? "-"} · página ${i}/${pages}`,
      12,
      291,
    );
  }

  doc.save(`checklist-${checklist.protocol}.pdf`);
}

import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

import type { CalibrationData, TaludeMap, TaludeMarcacao } from "./api";
import { areaPx, formatArea, formatLength, metersPerPixel, perimeterPx } from "./geometry";
import { renderMapToBlob } from "./render";

export function scaleOf(map: TaludeMap): number | null {
  const cal = map.calibration as CalibrationData | null;
  if (map.meters_per_unit && map.meters_per_unit > 0) return map.meters_per_unit;
  if (!cal) return null;
  const mpp = metersPerPixel(cal, map.image_width, map.image_height);
  return mpp > 0 ? mpp : null;
}

export interface Medidas {
  areaM2: number | null;
  perimetroM: number | null;
}

export function medidas(map: TaludeMap, m: TaludeMarcacao): Medidas {
  const mpp = scaleOf(map);
  if (!mpp) return { areaM2: null, perimetroM: null };
  const aPx = areaPx(m.polygon, map.image_width, map.image_height);
  const pPx = perimeterPx(m.polygon, map.image_width, map.image_height);
  return { areaM2: aPx * mpp * mpp, perimetroM: pPx * mpp };
}

function fmtBr(iso?: string | null) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

/* -------------------------------- PNG HD -------------------------------- */

export async function exportPng(map: TaludeMap, marcacoes: TaludeMarcacao[]): Promise<Blob> {
  return renderMapToBlob(map.image_url, marcacoes.filter((m) => m.visivel !== false));
}

/* ---------------------------------- PDF ---------------------------------- */

export async function exportPdf(
  map: TaludeMap,
  marcacoes: TaludeMarcacao[],
  responsavel: string,
): Promise<Blob> {
  const png = await exportPng(map, marcacoes);
  const dataUrl = await blobToDataUrl(png);

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 10;

  doc.setFillColor(5, 7, 12);
  doc.rect(0, 0, pageW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(`Mapa de Taludes — ${map.nome}`, margin, 11.5);
  doc.setFontSize(9);
  doc.text(
    `Emitido em ${new Date().toLocaleString("pt-BR")}  ·  Responsável: ${responsavel || "—"}`,
    pageW - margin,
    11.5,
    { align: "right" },
  );

  const scale = scaleOf(map);
  doc.setTextColor(40, 40, 40);
  doc.setFontSize(9);
  doc.text(
    scale
      ? `Escala calibrada: 1 px ≈ ${scale.toFixed(4)} m  ·  ${marcacoes.length} talude(s)`
      : `Mapa NÃO calibrado — áreas e perímetros não disponíveis  ·  ${marcacoes.length} talude(s)`,
    margin,
    25,
  );

  // imagem proporcional
  const imgRatio = map.image_width / map.image_height;
  const maxW = pageW - margin * 2;
  const maxH = pageH - 34 - margin;
  let w = maxW;
  let h = w / imgRatio;
  if (h > maxH) {
    h = maxH;
    w = h * imgRatio;
  }
  doc.addImage(dataUrl, "PNG", margin + (maxW - w) / 2, 29, w, h, undefined, "FAST");

  // legenda em nova página
  doc.addPage("a4", "landscape");
  doc.setFillColor(5, 7, 12);
  doc.rect(0, 0, pageW, 18, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13);
  doc.text("Legenda e relação de taludes", margin, 11.5);

  autoTable(doc, {
    startY: 24,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [15, 42, 56], textColor: 255 },
    head: [[
      "Nº",
      "Código",
      "Nome",
      "Setor",
      "Risco",
      "Serviço",
      "Equipe",
      "Prevista",
      "Executada",
      "Estado",
      "Área",
      "Perímetro",
    ]],
    body: marcacoes.map((m) => {
      const med = medidas(map, m);
      return [
        String(m.numero),
        m.codigo ?? "—",
        m.nome ?? m.rotulo ?? "—",
        m.setor ?? "—",
        m.risco ?? "—",
        m.servico_atual ?? "—",
        m.equipe ?? "—",
        fmtBr(m.data_prevista),
        fmtBr(m.data_executada),
        m.estado_operacional ?? "—",
        med.areaM2 != null ? formatArea(med.areaM2) : "n/c",
        med.perimetroM != null ? formatLength(med.perimetroM) : "n/c",
      ];
    }),
  });

  return doc.output("blob");
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Falha ao ler imagem"));
    fr.readAsDataURL(blob);
  });
}

/* --------------------------------- JSON ---------------------------------- */

export function exportJson(map: TaludeMap, marcacoes: TaludeMarcacao[]): Blob {
  const payload = {
    kind: "apontauto.taludes.backup",
    version: 1,
    exported_at: new Date().toISOString(),
    map,
    marcacoes,
  };
  return new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
}

/* -------------------------------- GeoJSON -------------------------------- */

export function exportGeoJson(map: TaludeMap, marcacoes: TaludeMarcacao[]): Blob {
  const mpp = scaleOf(map);
  if (!mpp) throw new Error("Calibre o mapa antes de exportar GeoJSON.");
  const toXY = (p: { x: number; y: number }) => [
    (p.x / 100) * map.image_width * mpp,
    -((p.y / 100) * map.image_height * mpp),
  ];
  const fc = {
    type: "FeatureCollection",
    name: map.nome,
    crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::0" } },
    features: marcacoes.map((m) => {
      const med = medidas(map, m);
      return {
        type: "Feature",
        properties: {
          numero: m.numero,
          codigo: m.codigo,
          nome: m.nome ?? m.rotulo,
          setor: m.setor,
          risco: m.risco,
          inclinacao: m.inclinacao,
          tipo_solo: m.tipo_solo,
          vegetacao: m.vegetacao,
          servico_atual: m.servico_atual,
          equipe: m.equipe,
          data_prevista: m.data_prevista,
          data_executada: m.data_executada,
          estado_operacional: m.estado_operacional,
          ultima_inspecao: m.ultima_inspecao,
          proxima_inspecao: m.proxima_inspecao,
          area_m2: med.areaM2,
          perimetro_m: med.perimetroM,
          cor: m.cor,
        },
        geometry: {
          type: "Polygon",
          coordinates: [[...m.polygon.map(toXY), toXY(m.polygon[0])]],
        },
      };
    }),
  };
  return new Blob([JSON.stringify(fc, null, 2)], { type: "application/geo+json" });
}

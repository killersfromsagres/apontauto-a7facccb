// Exportação DXF (AutoCAD R2000) dos polígonos de taludes do mapa atual.
// Cada talude vira uma LWPOLYLINE fechada em uma layer própria (TALUDE_<n>).
// Coordenadas são convertidas de % do mapa para pixels da imagem base,
// com o eixo Y invertido (DXF é Y-up, tela é Y-down). Quando o mapa não
// tem dimensões em pixels, usa-se 1000×1000 como referência unitária.

import type { Point } from "./geometry";
import type { TaludeStatus } from "./constants";

export interface DxfTalude {
  numero: number;
  nome: string | null;
  status: TaludeStatus;
  polygon: Point[];
}

export interface DxfExportOptions {
  mapName: string;
  imageWidthPx?: number | null;
  imageHeightPx?: number | null;
  metersPerPixel?: number | null;
  taludes: DxfTalude[];
}

// Cor ACI por status (indices AutoCAD Color Index).
const STATUS_ACI: Record<TaludeStatus, number> = {
  programado: 5, // blue
  em_execucao: 2, // yellow
  finalizado: 3, // green
};

function line(code: number, value: string | number): string {
  return `${code}\n${value}\n`;
}

export function buildTaludesDxf(opts: DxfExportOptions): string {
  const W = opts.imageWidthPx && opts.imageWidthPx > 0 ? opts.imageWidthPx : 1000;
  const H = opts.imageHeightPx && opts.imageHeightPx > 0 ? opts.imageHeightPx : 1000;
  const mpp = opts.metersPerPixel && opts.metersPerPixel > 0 ? opts.metersPerPixel : 1;

  // % → pixels → metros (se calibrado). Y invertido.
  const toX = (pctX: number) => (pctX / 100) * W * mpp;
  const toY = (pctY: number) => ((100 - pctY) / 100) * H * mpp;

  let s = "";
  // Header mínimo
  s += line(0, "SECTION");
  s += line(2, "HEADER");
  s += line(9, "$ACADVER");
  s += line(1, "AC1015");
  s += line(9, "$INSUNITS");
  s += line(70, opts.metersPerPixel ? 6 : 0); // 6 = metros, 0 = sem unidade
  s += line(0, "ENDSEC");

  // Tables → Layers
  s += line(0, "SECTION");
  s += line(2, "TABLES");
  s += line(0, "TABLE");
  s += line(2, "LAYER");
  s += line(70, opts.taludes.length + 1);
  // Layer 0 padrão
  s += line(0, "LAYER");
  s += line(2, "0");
  s += line(70, 0);
  s += line(62, 7);
  s += line(6, "CONTINUOUS");
  for (const t of opts.taludes) {
    const name = `TALUDE_${String(t.numero).padStart(2, "0")}`;
    s += line(0, "LAYER");
    s += line(2, name);
    s += line(70, 0);
    s += line(62, STATUS_ACI[t.status] ?? 7);
    s += line(6, "CONTINUOUS");
  }
  s += line(0, "ENDTAB");
  s += line(0, "ENDSEC");

  // Entities
  s += line(0, "SECTION");
  s += line(2, "ENTITIES");

  for (const t of opts.taludes) {
    if (t.polygon.length < 3) continue;
    const layer = `TALUDE_${String(t.numero).padStart(2, "0")}`;

    // LWPOLYLINE fechada
    s += line(0, "LWPOLYLINE");
    s += line(8, layer);
    s += line(100, "AcDbEntity");
    s += line(100, "AcDbPolyline");
    s += line(90, t.polygon.length);
    s += line(70, 1); // closed
    for (const p of t.polygon) {
      s += line(10, toX(p.x).toFixed(4));
      s += line(20, toY(p.y).toFixed(4));
    }

    // TEXT com o número no centróide
    const cx = t.polygon.reduce((a, p) => a + p.x, 0) / t.polygon.length;
    const cy = t.polygon.reduce((a, p) => a + p.y, 0) / t.polygon.length;
    const textHeight = Math.max((W * mpp) / 80, 0.5);
    s += line(0, "TEXT");
    s += line(8, layer);
    s += line(10, toX(cx).toFixed(4));
    s += line(20, toY(cy).toFixed(4));
    s += line(40, textHeight.toFixed(4));
    s += line(1, String(t.numero));
    s += line(72, 1); // horizontal center
    s += line(73, 2); // vertical middle
    s += line(11, toX(cx).toFixed(4));
    s += line(21, toY(cy).toFixed(4));
  }

  s += line(0, "ENDSEC");
  s += line(0, "EOF");
  return s;
}

export function dxfBlob(opts: DxfExportOptions): Blob {
  const text = buildTaludesDxf(opts);
  return new Blob([text], { type: "application/dxf" });
}

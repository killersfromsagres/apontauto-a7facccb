// Extrai polígonos de um arquivo .PSD (Photoshop), tratando cada camada
// visível como um talude. O contorno é derivado do alpha da camada
// (renderizada dentro da bounding box do PSD) — independe da cor usada,
// então funciona mesmo em PSDs monocromáticos.

import { readPsd, initializeCanvas } from "ag-psd";
import type { Psd, Layer } from "ag-psd";
import { regionsFromMask, type DetectedRegion } from "./auto-detect";

export interface PsdDetectResult {
  regions: Array<DetectedRegion & { layerName: string }>;
  workWidth: number;
  workHeight: number;
  previewDataUrl: string;
}

// ag-psd precisa de um "canvas factory" para materializar as camadas.
initializeCanvas((width: number, height: number) => {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = height;
  return c as unknown as HTMLCanvasElement;
});

function collectLeafLayers(psd: Psd): Layer[] {
  const out: Layer[] = [];
  const walk = (layers?: Layer[]) => {
    if (!layers) return;
    for (const l of layers) {
      if (l.children && l.children.length) walk(l.children);
      else if (l.canvas || l.imageData) out.push(l);
    }
  };
  walk(psd.children);
  return out;
}

export async function detectPolygonsFromPsd(
  file: Blob,
  opts: { maxDim?: number; minAreaPct?: number; simplifyPct?: number } = {},
): Promise<PsdDetectResult> {
  const maxDim = opts.maxDim ?? 1800;
  const minAreaPct = opts.minAreaPct ?? 0.05;
  const simplifyPct = opts.simplifyPct ?? 0.20;

  const buf = await file.arrayBuffer();
  const psd = readPsd(buf, { skipCompositeImageData: false, skipThumbnail: true });
  const srcW = psd.width;
  const srcH = psd.height;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const W = Math.max(1, Math.round(srcW * scale));
  const H = Math.max(1, Math.round(srcH * scale));

  // Preview: composite do PSD (fallback = fundo cinza).
  const previewCanvas = document.createElement("canvas");
  previewCanvas.width = W;
  previewCanvas.height = H;
  const pctx = previewCanvas.getContext("2d", { willReadFrequently: true });
  if (!pctx) throw new Error("Canvas indisponível");
  pctx.fillStyle = "#0f172a";
  pctx.fillRect(0, 0, W, H);
  if (psd.canvas) {
    pctx.drawImage(psd.canvas as unknown as CanvasImageSource, 0, 0, W, H);
  }
  const previewDataUrl = previewCanvas.toDataURL("image/jpeg", 0.85);

  const leaves = collectLeafLayers(psd);
  const totalPx = W * H;
  const minAreaPx = Math.max(80, Math.floor((minAreaPct / 100) * totalPx));
  const epsilon = Math.max(0.5, (simplifyPct / 100) * Math.max(W, H));

  const regions: PsdDetectResult["regions"] = [];

  for (const layer of leaves) {
    if (layer.hidden) continue;
    // Renderiza a camada dentro do PSD full-size (respeitando left/top da camada)
    // e reduz para W×H. A máscara vem do canal alpha (>=32/255).
    const layerCanvas = document.createElement("canvas");
    layerCanvas.width = W;
    layerCanvas.height = H;
    const lctx = layerCanvas.getContext("2d", { willReadFrequently: true });
    if (!lctx) continue;
    lctx.clearRect(0, 0, W, H);

    const lw = (layer.right ?? 0) - (layer.left ?? 0);
    const lh = (layer.bottom ?? 0) - (layer.top ?? 0);
    if (!layer.canvas || lw <= 0 || lh <= 0) continue;

    const dstX = ((layer.left ?? 0) / srcW) * W;
    const dstY = ((layer.top ?? 0) / srcH) * H;
    const dstW = (lw / srcW) * W;
    const dstH = (lh / srcH) * H;
    lctx.drawImage(layer.canvas as unknown as CanvasImageSource, dstX, dstY, dstW, dstH);

    const data = lctx.getImageData(0, 0, W, H).data;
    const mask = new Uint8Array(W * H);
    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    for (let i = 0, p = 0; p < mask.length; i += 4, p++) {
      const a = data[i + 3];
      if (a >= 32) {
        mask[p] = 1;
        sumR += data[i];
        sumG += data[i + 1];
        sumB += data[i + 2];
        count++;
      }
    }
    if (count < minAreaPx) continue;

    const layerColor = count > 0
      ? `rgb(${Math.round(sumR / count)}, ${Math.round(sumG / count)}, ${Math.round(sumB / count)})`
      : "rgb(59,130,246)";

    const regs = regionsFromMask(mask, W, H, {
      minAreaPx,
      epsilon,
      colorSampler: (p: number) => {
        const off = p * 4;
        return [data[off], data[off + 1], data[off + 2]];
      },
    });
    for (const r of regs) {
      regions.push({
        ...r,
        color: r.color || layerColor,
        layerName: layer.name || "camada",
      });
    }
  }

  regions.sort((a, b) => a.centroid.y - b.centroid.y || a.centroid.x - b.centroid.x);
  return { regions, workWidth: W, workHeight: H, previewDataUrl };
}

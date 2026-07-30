/**
 * Worker de processamento de imagem (item 24 — "processamento de imagem fora
 * do thread principal quando possível").
 *
 * Recebe o arquivo original, redimensiona com OffscreenCanvas, gera a
 * miniatura e calcula o hash SHA-256 sem travar a interface durante a
 * execução em campo (celulares de baixo desempenho).
 */

export interface ImageWorkerRequest {
  id: string;
  file: Blob;
  maxDim: number;
  quality: number;
  thumbDim: number;
  mime: string;
}

export interface ImageWorkerResponse {
  id: string;
  ok: boolean;
  error?: string;
  blob?: Blob;
  thumbBlob?: Blob;
  hash?: string;
  largura?: number;
  altura?: number;
  mime?: string;
}

async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

self.onmessage = async (event: MessageEvent<ImageWorkerRequest>) => {
  const { id, file, maxDim, quality, thumbDim, mime } = event.data;
  try {
    const bmp = await createImageBitmap(file);
    const alvo = Math.min(1600, Math.max(1280, maxDim));
    const ratio = Math.min(1, alvo / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * ratio));
    const h = Math.max(1, Math.round(bmp.height * ratio));

    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("sem contexto 2d");
    ctx.drawImage(bmp, 0, 0, w, h);
    const blob = await canvas.convertToBlob({ type: mime, quality });

    const tRatio = Math.min(1, thumbDim / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * tRatio));
    const th = Math.max(1, Math.round(h * tRatio));
    const tCanvas = new OffscreenCanvas(tw, th);
    tCanvas.getContext("2d")?.drawImage(canvas, 0, 0, tw, th);
    const thumbBlob = await tCanvas.convertToBlob({ type: "image/jpeg", quality: 0.6 });

    bmp.close?.();

    const res: ImageWorkerResponse = {
      id,
      ok: true,
      blob,
      thumbBlob,
      hash: await sha256(blob),
      largura: w,
      altura: h,
      mime: blob.type || mime,
    };
    (self as unknown as Worker).postMessage(res);
  } catch (e) {
    (self as unknown as Worker).postMessage({
      id,
      ok: false,
      error: (e as Error)?.message ?? "falha no processamento",
    } satisfies ImageWorkerResponse);
  }
};

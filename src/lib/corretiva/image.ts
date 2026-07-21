// Compressão client-side para reduzir tamanho antes de gravar no IndexedDB / subir.
export async function compressImage(
  file: Blob,
  { maxDim = 1600, quality = 0.75 }: { maxDim?: number; quality?: number } = {},
): Promise<Blob> {
  if (typeof createImageBitmap === "undefined") return file;
  try {
    const bmp = await createImageBitmap(file);
    const ratio = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * ratio);
    const h = Math.round(bmp.height * ratio);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, "image/jpeg", quality),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

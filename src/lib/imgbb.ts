/**
 * Upload de imagem para o ImgBB via proxy interno /api/public/imgbb-upload.
 * Retorna a URL pública que deve ser gravada no banco (nunca o binário).
 */
export type ImgBBUploadResult = {
  url: string;
  display_url: string;
  delete_url: string;
  thumb: string | null;
};

export async function uploadImageToImgBB(
  blob: Blob,
  filename = "photo.jpg",
): Promise<ImgBBUploadResult> {
  const form = new FormData();
  form.append("image", blob, filename);
  form.append("name", filename.replace(/\.[^.]+$/, ""));

  const res = await fetch("/api/public/imgbb-upload", {
    method: "POST",
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !json?.url) {
    throw new Error(json?.error ?? `Upload falhou (${res.status})`);
  }
  return json as ImgBBUploadResult;
}

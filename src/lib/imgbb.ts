/**
 * Upload de imagem para o ImgBB via proxy interno /api/imgbb-upload.
 * Retorna a URL pública que deve ser gravada no banco (nunca o binário).
 */
export type ImgBBUploadResult = {
  url: string;
  display_url: string;
  /** Só é devolvido a administradores (ação destrutiva). */
  delete_url: string | null;
  thumb: string | null;
};

export type ImgBBUploadOrigin = {
  /** Módulo de origem (ex.: "refrigeracao", "corretiva"). */
  module?: string;
  entityType?: string;
  entityId?: string;
};

export async function uploadImageToImgBB(
  blob: Blob,
  filename = "photo.jpg",
  origin: ImgBBUploadOrigin = {},
): Promise<ImgBBUploadResult> {
  const form = new FormData();
  form.append("image", blob, filename);
  form.append("name", filename.replace(/\.[^.]+$/, ""));
  // Metadados de rastreabilidade gravados na trilha de auditoria do servidor.
  if (origin.module) form.append("module", origin.module);
  if (origin.entityType) form.append("entity_type", origin.entityType);
  if (origin.entityId) form.append("entity_id", origin.entityId);

  // O proxy exige sessão válida e permissão de escrita no módulo informado.
  const { postImgbbForm } = await import("@/lib/imgbb-post");
  const json = await postImgbbForm(form);

  return json as ImgBBUploadResult;
}

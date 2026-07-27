import { supabase } from "@/integrations/supabase/client";
import { uploadImageToImgBB } from "@/lib/imgbb";

export type UploadedPhoto = {
  /** URL pública (ImgBB) ou URL assinada longa (Storage) */
  url: string;
  /** Caminho no Storage quando o fallback foi usado */
  storagePath: string | null;
};

const TEN_YEARS = 60 * 60 * 24 * 365 * 10;

function safeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
}

/**
 * Sobe a imagem para o ImgBB. Se o ImgBB falhar por qualquer motivo
 * (chave ausente, formato recusado, rede, rate limit), grava no bucket
 * do Supabase para que a foto NUNCA se perca.
 */
export async function uploadPhotoWithFallback(
  blob: Blob,
  filename: string,
  bucket: string,
): Promise<UploadedPhoto> {
  try {
    const up = await uploadImageToImgBB(blob, filename);
    if (up?.url) return { url: up.url, storagePath: null };
    throw new Error("ImgBB sem URL");
  } catch (imgbbErr) {
    console.warn("[upload] ImgBB falhou, usando Storage:", imgbbErr);
    const path = `${new Date().toISOString().slice(0, 10)}/${Date.now()}-${safeName(filename)}`;
    const { error } = await supabase.storage.from(bucket).upload(path, blob, {
      contentType: blob.type || "image/jpeg",
      upsert: true,
    });
    if (error) {
      throw new Error(
        `Falha ao enviar imagem (ImgBB e armazenamento): ${error.message}`,
      );
    }
    const { data } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, TEN_YEARS);
    return { url: data?.signedUrl ?? "", storagePath: path };
  }
}

import { supabase } from "@/integrations/supabase/client";

export type PhotoReference = {
  image_url?: string | null;
  storage_path?: string | null;
};

const STORAGE_MARKERS = [
  "/storage/v1/object/sign/",
  "/storage/v1/object/authenticated/",
  "/storage/v1/object/public/",
];

function clean(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

/**
 * Recupera o caminho original de uma URL do Supabase Storage.
 * Isso permite reparar registros antigos que salvaram uma signed URL no banco
 * em vez de manter somente o storage_path permanente.
 */
export function extractStoragePathFromUrl(
  url: string | null | undefined,
  bucket: string,
): string | null {
  const value = clean(url);
  if (!value) return null;

  for (const marker of STORAGE_MARKERS) {
    const token = `${marker}${bucket}/`;
    const index = value.indexOf(token);
    if (index < 0) continue;

    const encodedPath = value.slice(index + token.length).split("?")[0].split("#")[0];
    if (!encodedPath) return null;

    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return encodedPath;
    }
  }

  return null;
}

export function isSupabaseStorageUrl(
  url: string | null | undefined,
  bucket?: string,
): boolean {
  const value = clean(url);
  if (!value) return false;
  return STORAGE_MARKERS.some((marker) =>
    bucket ? value.includes(`${marker}${bucket}/`) : value.includes(marker),
  );
}

/**
 * Resolve uma foto para uma URL utilizável no momento da visualização.
 *
 * Ordem de prioridade:
 * 1. storage_path persistente -> signed URL nova;
 * 2. caminho extraído de uma signed URL legada -> signed URL nova;
 * 3. URL pública externa (ImgBB etc.) -> uso direto.
 *
 * Uma signed URL antiga do Supabase nunca é reutilizada como fonte permanente.
 */
export async function resolvePhotoUrl(
  photo: PhotoReference,
  bucket: string,
  expiresIn = 60 * 60 * 24,
): Promise<string | null> {
  const imageUrl = clean(photo.image_url);
  const storagePath =
    clean(photo.storage_path) ?? extractStoragePathFromUrl(imageUrl, bucket);

  if (storagePath) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresIn);

    if (data?.signedUrl) return data.signedUrl;

    if (error) {
      console.warn(
        `[photo-url] Não foi possível renovar a URL de ${bucket}/${storagePath}:`,
        error.message,
      );
    }
  }

  if (imageUrl && /^https?:\/\//i.test(imageUrl) && !isSupabaseStorageUrl(imageUrl, bucket)) {
    return imageUrl;
  }

  return null;
}

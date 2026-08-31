import { supabase } from "@/integrations/supabase/client";

export type MaterialEvidencePhoto = {
  id: string;
  os_id: string;
  origem: "refrigeracao" | "corretiva";
  image_url: string;
  legenda?: string | null;
  created_at?: string | null;
};

export type MaterialPhotosByOs = Map<string, MaterialEvidencePhoto[]>;

const CHUNK_SIZE = 100;
const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

const PHOTO_STORAGE_BUCKET = {
  refrigeracao: "refrigeracao-fotos",
  corretiva: "corretiva-fotos",
} as const;

export function materialPhotoKey(origem: "refrigeracao" | "corretiva", osId: string | null | undefined) {
  return `${origem}:${String(osId || "")}`;
}

function uniqueIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

function chunks<T>(values: T[], size = CHUNK_SIZE) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function resolvePhotoUrl(row: any, origem: "refrigeracao" | "corretiva") {
  const imageUrl = String(row?.image_url || "").trim();
  if (imageUrl) return imageUrl;

  const storagePath = String(row?.storage_path || "").trim();
  if (!storagePath) return "";
  if (/^https?:\/\//i.test(storagePath)) return storagePath;

  const { data, error } = await supabase.storage
    .from(PHOTO_STORAGE_BUCKET[origem])
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (error) {
    console.warn(
      `[CentralMateriais] Não foi possível assinar a foto ${String(row?.id || "")} de ${origem}:`,
      error,
    );
    return "";
  }

  return data?.signedUrl || "";
}

async function fetchOriginPhotos(
  origem: "refrigeracao" | "corretiva",
  osIds: string[],
): Promise<MaterialEvidencePhoto[]> {
  const table = origem === "refrigeracao" ? "refrigeracao_fotos" : "corretiva_fotos";
  const photos: MaterialEvidencePhoto[] = [];

  for (const batch of chunks(uniqueIds(osIds))) {
    const { data, error } = await supabase
      .from(table)
      .select("id, os_id, image_url, storage_path, legenda, created_at")
      .in("os_id", batch)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn(`[CentralMateriais] Não foi possível carregar fotos de ${origem}:`, error);
      continue;
    }

    const resolved = await Promise.all(
      (data || []).map(async (row) => ({ row, url: await resolvePhotoUrl(row, origem) })),
    );

    for (const { row, url } of resolved) {
      if (!url || !row.os_id) continue;
      photos.push({
        id: String(row.id),
        os_id: String(row.os_id),
        origem,
        image_url: url,
        legenda: row.legenda ?? null,
        created_at: row.created_at ?? null,
      });
    }
  }

  return photos;
}

export async function loadMaterialRequestPhotos(
  refrigeracaoOsIds: Array<string | null | undefined>,
  corretivaOsIds: Array<string | null | undefined>,
): Promise<MaterialPhotosByOs> {
  const [refrigeracao, corretiva] = await Promise.all([
    fetchOriginPhotos("refrigeracao", uniqueIds(refrigeracaoOsIds)),
    fetchOriginPhotos("corretiva", uniqueIds(corretivaOsIds)),
  ]);

  const map: MaterialPhotosByOs = new Map();
  const seen = new Set<string>();

  for (const photo of [...refrigeracao, ...corretiva]) {
    const identity = `${photo.origem}:${photo.id}:${photo.image_url}`;
    if (seen.has(identity)) continue;
    seen.add(identity);

    const key = materialPhotoKey(photo.origem, photo.os_id);
    const current = map.get(key) || [];
    current.push(photo);
    map.set(key, current);
  }

  return map;
}

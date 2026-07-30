import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/corretiva/image";

export const FLEET_BUCKET = "frota-fotos";

/**
 * Envio de imagem simples e à prova de erro de sessão.
 *
 * Usa o próprio client do Supabase (que renova o token sozinho) em vez de um
 * proxy HTTP com `Authorization` manual — era daí que vinham os "Unauthorized"
 * e o logout no meio do checklist. Aqui, se o token expirou, o SDK renova e
 * repete; nada derruba a sessão do usuário.
 */
export async function uploadChecklistPhoto(file: Blob, filename: string): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("Sessão não encontrada. Recarregue a página.");

  const blob = await compressImage(file, { maxDim: 1600, quality: 0.72 });
  const ext = "jpg";
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "-").slice(-40);
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safe}.${ext}`;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const { error } = await supabase.storage
      .from(FLEET_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: true });
    if (!error) return path;
    lastError = error;
    await new Promise((r) => setTimeout(r, 600 * attempt));
  }
  throw new Error(
    `Não foi possível enviar a foto agora. ${(lastError as any)?.message ?? ""}`.trim(),
  );
}

/** Gera URLs assinadas (1h) para exibir as fotos do histórico. */
export async function signPhotoUrls(paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await supabase.storage.from(FLEET_BUCKET).createSignedUrls(paths, 3600);
  if (error) return {};
  const map: Record<string, string> = {};
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) map[item.path] = item.signedUrl;
  }
  return map;
}

export async function removePhoto(path: string): Promise<void> {
  await supabase.storage.from(FLEET_BUCKET).remove([path]);
}

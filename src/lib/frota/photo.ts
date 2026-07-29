import { compressImage } from "@/lib/corretiva/image";
import { supabase } from "@/integrations/supabase/client";

export type FrotaUpload = { url: string; hash: string | null };

/**
 * Comprime (lado maior ~1600px, re-encode remove EXIF) e envia a evidência
 * pelo proxy autenticado `/api/imgbb-upload`, que valida a permissão do módulo.
 */
export async function uploadFrotaPhoto(
  file: Blob,
  filename: string,
  opts: { module?: string; entityType?: string; entityId?: string } = {},
): Promise<FrotaUpload> {
  const compressed = await compressImage(file, { maxDim: 1600, quality: 0.78 });

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente.");

  const form = new FormData();
  form.append("image", compressed, filename);
  form.append("name", filename.replace(/\.[^.]+$/, ""));
  form.append("module", opts.module ?? "frota-checklist");
  if (opts.entityType) form.append("entity_type", opts.entityType);
  if (opts.entityId) form.append("entity_id", opts.entityId);

  const res = await fetch("/api/imgbb-upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !json?.url) {
    throw new Error(json?.error ?? `Falha no envio da imagem (${res.status})`);
  }
  return { url: json.url as string, hash: (json.hash as string) ?? null };
}

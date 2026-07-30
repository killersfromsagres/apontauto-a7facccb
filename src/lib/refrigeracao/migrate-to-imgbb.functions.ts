import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Migração one-shot: baixa fotos legadas do bucket privado
 * `refrigeracao-fotos` (registros com storage_path preenchido e image_url NULL),
 * republica no ImgBB e atualiza o registro para apontar para o link hospedado,
 * removendo o objeto do Storage. Processa em lotes pequenos para caber no
 * limite do worker.
 *
 * Somente admins podem chamar.
 */
export const migrateRefrigLegacyPhotosToImgBB = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { batchSize?: number } | undefined) => ({
    batchSize: Math.max(1, Math.min(20, Number(input?.batchSize ?? 8))),
  }))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin, error: roleErr } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isAdmin) throw new Error("Forbidden");

    const imgbbKey = process.env.IMGBB_API_KEY;
    if (!imgbbKey) throw new Error("IMGBB_API_KEY ausente");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pending, error: selErr } = await supabaseAdmin
      .from("refrigeracao_fotos")
      .select("id, os_id, storage_path")
      .not("storage_path", "is", null)
      .is("image_url", null)
      .order("created_at", { ascending: true })
      .limit(data.batchSize);
    if (selErr) throw new Error(selErr.message);

    const rows = pending ?? [];
    const results: Array<{ id: string; ok: boolean; error?: string; url?: string }> = [];

    for (const row of rows) {
      try {
        const path = row.storage_path as string;
        const dl = await supabaseAdmin.storage.from("refrigeracao-fotos").download(path);
        if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "download falhou");

        const buf = await dl.data.arrayBuffer();
        const b64 = bufToBase64(buf);

        const form = new FormData();
        form.append("image", b64);
        form.append("name", `legacy-${row.id}`);

        const up = await fetch(
          `https://api.imgbb.com/1/upload?key=${encodeURIComponent(imgbbKey)}`,
          { method: "POST", body: form },
        );
        const json = (await up.json().catch(() => null)) as any;
        if (!up.ok || !json?.success || !json?.data?.url) {
          throw new Error(json?.error?.message ?? `imgbb ${up.status}`);
        }

        const publicUrl: string = json.data.url;

        const { error: updErr } = await supabaseAdmin
          .from("refrigeracao_fotos")
          .update({ image_url: publicUrl, storage_path: null })
          .eq("id", row.id);
        if (updErr) throw new Error(updErr.message);

        const del = await supabaseAdmin.storage.from("refrigeracao-fotos").remove([path]);
        if (del.error) {
          // Não falha a migração — só loga; o registro já aponta pro ImgBB.
          console.warn("[migrate] falha ao remover objeto", path, del.error.message);
        }

        results.push({ id: row.id, ok: true, url: publicUrl });
      } catch (err: any) {
        results.push({ id: row.id, ok: false, error: err?.message ?? String(err) });
      }
    }

    const { count: remaining } = await supabaseAdmin
      .from("refrigeracao_fotos")
      .select("id", { count: "exact", head: true })
      .not("storage_path", "is", null)
      .is("image_url", null);

    return {
      processed: results.length,
      migrated: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok),
      remaining: remaining ?? 0,
    };
  });

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ImageSourceKey } from "@/lib/admin/images.server";

/** Inventário completo dos buckets de imagem (somente admin). */
export const inventoryStorageImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { assertAdmin, inventorySource, IMAGE_SOURCES } =
      await import("@/lib/admin/images.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const sources = [];
    for (const src of IMAGE_SOURCES) {
      sources.push(await inventorySource(supabaseAdmin as never, src));
    }
    return {
      generatedAt: new Date().toISOString(),
      imgbbConfigured: !!process.env.IMGBB_API_KEY,
      sources,
      totals: {
        objects: sources.reduce((a, s) => a + s.objects, 0),
        bytes: sources.reduce((a, s) => a + s.bytes, 0),
        pendingRows: sources.reduce((a, s) => a + s.pendingRows, 0),
        orphans: sources.reduce((a, s) => a + s.orphans, 0),
      },
    };
  });

/** Migra um lote de imagens de uma origem para o ImgBB (somente admin). */
export const migrateStorageImagesBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { source: ImageSourceKey; batchSize?: number }) => ({
    source: input.source,
    batchSize: Math.max(1, Math.min(15, Number(input?.batchSize ?? 6))),
  }))
  .handler(async ({ data, context }) => {
    const { assertAdmin, migrateSourceBatch, sourceByKey } =
      await import("@/lib/admin/images.server");
    await assertAdmin(context.supabase, context.userId);

    const src = sourceByKey(data.source);
    if (!src) throw new Error("Origem desconhecida");

    const imgbbKey = process.env.IMGBB_API_KEY;
    if (!imgbbKey) throw new Error("IMGBB_API_KEY não configurada");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return migrateSourceBatch(supabaseAdmin as never, src, {
      batchSize: data.batchSize,
      imgbbKey,
      userId: context.userId,
    });
  });

/** Apaga objetos órfãos (sem linha correspondente) do bucket. */
export const purgeStorageOrphans = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { source: ImageSourceKey }) => ({ source: input.source }))
  .handler(async ({ data, context }) => {
    const { assertAdmin, purgeSourceOrphans, sourceByKey } =
      await import("@/lib/admin/images.server");
    await assertAdmin(context.supabase, context.userId);

    const src = sourceByKey(data.source);
    if (!src) throw new Error("Origem desconhecida");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return purgeSourceOrphans(supabaseAdmin as never, src);
  });

/** Últimos links de imagens hospedadas no ImgBB (auditoria/consulta). */
export const listImgbbLinks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { limit?: number } | undefined) => ({
    limit: Math.max(1, Math.min(200, Number(input?.limit ?? 50))),
  }))
  .handler(async ({ data, context }) => {
    const { assertAdmin } = await import("@/lib/admin/images.server");
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin
      .from("image_uploads")
      .select("id, url, module_key, entity_type, entity_id, size_bytes, mime_type, created_at")
      .not("url", "is", null)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

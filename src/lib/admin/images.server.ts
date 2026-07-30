/**
 * Inventário e migração de imagens do Storage do backend para o ImgBB.
 *
 * Regra do sistema: o binário nunca deve ficar no Storage — o Storage é apenas
 * um *fallback* quando o ImgBB falha no momento do upload. Este módulo varre os
 * buckets, republica cada objeto no ImgBB, atualiza a linha correspondente no
 * banco (link do ImgBB) e só então remove o objeto local, liberando espaço.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type ImageSourceKey = "refrigeracao" | "corretiva" | "agua";

type SourceDef = {
  key: ImageSourceKey;
  label: string;
  bucket: string;
  table: string;
  /** Coluna que recebe o link público do ImgBB. */
  urlColumn: string;
  moduleKey: string;
};

export const IMAGE_SOURCES: SourceDef[] = [
  {
    key: "refrigeracao",
    label: "Refrigeração — fotos de OS",
    bucket: "refrigeracao-fotos",
    table: "refrigeracao_fotos",
    urlColumn: "image_url",
    moduleKey: "refrigeracao",
  },
  {
    key: "corretiva",
    label: "Corretiva — fotos de OS",
    bucket: "corretiva-fotos",
    table: "corretiva_fotos",
    urlColumn: "image_url",
    moduleKey: "corretiva",
  },
  {
    key: "agua",
    label: "Entrega de água — evidências",
    bucket: "agua-fotos",
    table: "agua_prog_fotos",
    urlColumn: "url",
    moduleKey: "abastecimento",
  },
];

export function sourceByKey(key: string): SourceDef | undefined {
  return IMAGE_SOURCES.find((s) => s.key === key);
}

export async function assertAdmin(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc("has_role" as never, {
    _user_id: userId,
    _role: "admin",
  } as never);
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

type StorageObject = { path: string; size: number; createdAt: string | null };

/** Lista recursivamente (2 níveis: `uid/arquivo`) todos os objetos do bucket. */
export async function listBucketObjects(
  admin: SupabaseClient,
  bucket: string,
  hardLimit = 4000,
): Promise<{ objects: StorageObject[]; truncated: boolean; missing: boolean }> {
  const out: StorageObject[] = [];
  const root = await admin.storage.from(bucket).list("", { limit: 1000 });
  if (root.error) {
    const msg = root.error.message.toLowerCase();
    if (msg.includes("not found")) return { objects: [], truncated: false, missing: true };
    throw new Error(`${bucket}: ${root.error.message}`);
  }

  const push = (prefix: string, entry: any) => {
    out.push({
      path: prefix ? `${prefix}/${entry.name}` : entry.name,
      size: Number(entry?.metadata?.size ?? 0),
      createdAt: entry?.created_at ?? null,
    });
  };

  for (const entry of root.data ?? []) {
    if (out.length >= hardLimit) return { objects: out, truncated: true, missing: false };
    // Objetos reais têm metadata; "pastas" virtuais não.
    if (entry.id) {
      push("", entry);
      continue;
    }
    const sub = await admin.storage.from(bucket).list(entry.name, { limit: 1000 });
    if (sub.error) continue;
    for (const child of sub.data ?? []) {
      if (out.length >= hardLimit) return { objects: out, truncated: true, missing: false };
      if (!child.id) continue;
      push(entry.name, child);
    }
  }
  return { objects: out, truncated: false, missing: false };
}

export type SourceInventory = {
  key: ImageSourceKey;
  label: string;
  bucket: string;
  missing: boolean;
  truncated: boolean;
  objects: number;
  bytes: number;
  /** Objetos referenciados por alguma linha (migráveis). */
  linked: number;
  /** Objetos sem linha correspondente (lixo — podem ser apagados). */
  orphans: number;
  /** Linhas pendentes de migração. */
  pendingRows: number;
  sample: Array<{ path: string; size: number; linked: boolean }>;
};

export async function inventorySource(
  admin: SupabaseClient,
  src: SourceDef,
): Promise<SourceInventory> {
  const { objects, truncated, missing } = await listBucketObjects(admin, src.bucket);

  const { data: rows, error } = await admin
    .from(src.table as never)
    .select("id, storage_path")
    .not("storage_path", "is", null)
    .limit(5000);
  if (error) throw new Error(`${src.table}: ${error.message}`);

  const referenced = new Set(
    ((rows ?? []) as Array<{ storage_path: string | null }>)
      .map((r) => r.storage_path)
      .filter((p): p is string => !!p),
  );

  const bytes = objects.reduce((acc, o) => acc + o.size, 0);
  const linked = objects.filter((o) => referenced.has(o.path)).length;

  return {
    key: src.key,
    label: src.label,
    bucket: src.bucket,
    missing,
    truncated,
    objects: objects.length,
    bytes,
    linked,
    orphans: objects.length - linked,
    pendingRows: referenced.size,
    sample: objects.slice(0, 25).map((o) => ({
      path: o.path,
      size: o.size,
      linked: referenced.has(o.path),
    })),
  };
}

function bufToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  return btoa(bin);
}

async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export type MigrationBatchResult = {
  source: ImageSourceKey;
  processed: number;
  migrated: number;
  freedBytes: number;
  remaining: number;
  failures: Array<{ id: string; path: string; error: string }>;
  links: Array<{ id: string; path: string; url: string }>;
};

export async function migrateSourceBatch(
  admin: SupabaseClient,
  src: SourceDef,
  opts: { batchSize: number; imgbbKey: string; userId: string },
): Promise<MigrationBatchResult> {
  const { data: rows, error } = await admin
    .from(src.table as never)
    .select("id, storage_path")
    .not("storage_path", "is", null)
    .limit(opts.batchSize);
  if (error) throw new Error(`${src.table}: ${error.message}`);

  const failures: MigrationBatchResult["failures"] = [];
  const links: MigrationBatchResult["links"] = [];
  let freedBytes = 0;

  for (const row of (rows ?? []) as Array<{ id: string; storage_path: string }>) {
    const path = row.storage_path;
    try {
      const dl = await admin.storage.from(src.bucket).download(path);
      if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "download falhou");

      const buf = await dl.data.arrayBuffer();
      const size = buf.byteLength;
      const mime = dl.data.type || "image/jpeg";

      const form = new FormData();
      form.append("image", bufToBase64(buf));
      form.append("name", `${src.key}-${row.id}`);
      const up = await fetch(
        `https://api.imgbb.com/1/upload?key=${encodeURIComponent(opts.imgbbKey)}`,
        { method: "POST", body: form },
      );
      const json = (await up.json().catch(() => null)) as any;
      if (!up.ok || !json?.success || !json?.data?.url) {
        throw new Error(json?.error?.message ?? `ImgBB respondeu ${up.status}`);
      }
      const publicUrl: string = json.data.url;

      // 1) grava o link antes de apagar o binário (integridade acima de espaço)
      const { error: updErr } = await admin
        .from(src.table as never)
        .update({ [src.urlColumn]: publicUrl, storage_path: null } as never)
        .eq("id", row.id);
      if (updErr) throw new Error(updErr.message);

      // 2) trilha de links migrados
      await admin.from("image_uploads" as never).insert({
        user_id: opts.userId,
        module_key: src.moduleKey,
        entity_type: src.table,
        entity_id: row.id,
        url: publicUrl,
        delete_url: json?.data?.delete_url ?? null,
        mime_type: mime,
        size_bytes: size,
        sha256: await sha256Hex(buf),
      } as never);

      // 3) libera o espaço local
      const del = await admin.storage.from(src.bucket).remove([path]);
      if (!del.error) freedBytes += size;

      links.push({ id: row.id, path, url: publicUrl });
    } catch (err: any) {
      failures.push({ id: row.id, path, error: err?.message ?? String(err) });
    }
  }

  const { count } = await admin
    .from(src.table as never)
    .select("id", { count: "exact", head: true })
    .not("storage_path", "is", null);

  return {
    source: src.key,
    processed: (rows ?? []).length,
    migrated: links.length,
    freedBytes,
    remaining: count ?? 0,
    failures,
    links,
  };
}

/** Remove objetos que não são referenciados por nenhuma linha (lixo puro). */
export async function purgeSourceOrphans(
  admin: SupabaseClient,
  src: SourceDef,
): Promise<{ source: ImageSourceKey; removed: number; freedBytes: number }> {
  const { objects } = await listBucketObjects(admin, src.bucket);
  if (objects.length === 0) return { source: src.key, removed: 0, freedBytes: 0 };

  const { data: rows, error } = await admin
    .from(src.table as never)
    .select("storage_path")
    .not("storage_path", "is", null)
    .limit(5000);
  if (error) throw new Error(`${src.table}: ${error.message}`);
  const referenced = new Set(
    ((rows ?? []) as Array<{ storage_path: string | null }>)
      .map((r) => r.storage_path)
      .filter((p): p is string => !!p),
  );

  const orphans = objects.filter((o) => !referenced.has(o.path));
  let removed = 0;
  let freedBytes = 0;
  for (let i = 0; i < orphans.length; i += 100) {
    const slice = orphans.slice(i, i + 100);
    const del = await admin.storage.from(src.bucket).remove(slice.map((o) => o.path));
    if (del.error) continue;
    removed += slice.length;
    freedBytes += slice.reduce((acc, o) => acc + o.size, 0);
  }
  return { source: src.key, removed, freedBytes };
}

// Camada de dados do catálogo de ativos (Supabase).
// Mantém compatibilidade com a base legada `assets_ref`.

import { supabase } from "@/integrations/supabase/client";
import type { AssetCatalog, AssetRecord } from "../types";
import { normalizeCode } from "./asset-resolver";

// As tabelas novas podem ainda não estar nos tipos gerados; usamos um cliente
// destipado apenas para elas (RLS continua valendo normalmente).
const db = supabase as any;

export async function listCatalogs(): Promise<AssetCatalog[]> {
  const { data, error } = await db
    .from("asset_catalogs")
    .select("*")
    .order("imported_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as AssetCatalog[];
}

export async function getActiveCatalog(): Promise<AssetCatalog | null> {
  const { data, error } = await db
    .from("asset_catalogs")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return (data as AssetCatalog | null) ?? null;
}

/** Lê todos os ativos de um catálogo, paginando para passar do limite do PostgREST. */
export async function fetchCatalogAssets(catalogId: string): Promise<AssetRecord[]> {
  const pageSize = 1000;
  const out: AssetRecord[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("assets")
      .select("code, normalized_code, name, level, parent_code, parent_name, business_unit")
      .eq("catalog_id", catalogId)
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    out.push(
      ...rows.map((r) => ({
        code: r.normalized_code ?? r.code,
        name: r.name,
        level: r.level,
        parentCode: r.parent_code,
        parentName: r.parent_name,
        businessUnit: r.business_unit,
      })),
    );
    if (rows.length < pageSize) break;
  }
  return out;
}

/** Fallback: lê a base legada `assets_ref`. */
export async function fetchLegacyAssets(): Promise<AssetRecord[]> {
  const pageSize = 1000;
  const out: AssetRecord[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("assets_ref")
      .select("ativo, denominacao, nivel, codigo_pai, descricao_pai, unidade_negocio")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as any[];
    out.push(
      ...rows.map((r) => ({
        code: r.ativo,
        name: r.denominacao,
        level: r.nivel,
        parentCode: r.codigo_pai,
        parentName: r.descricao_pai,
        businessUnit: r.unidade_negocio,
      })),
    );
    if (rows.length < pageSize) break;
  }
  return out;
}

export async function setActiveCatalog(catalogId: string) {
  const { error } = await db
    .from("asset_catalogs")
    .update({ is_active: true })
    .eq("id", catalogId);
  if (error) throw error;
}

export async function deleteCatalog(catalogId: string) {
  const { error } = await db.from("asset_catalogs").delete().eq("id", catalogId);
  if (error) throw error;
}

export interface ImportCatalogInput {
  name: string;
  businessUnit?: string | null;
  sourceFilename?: string | null;
  records: AssetRecord[];
  activate?: boolean;
  metadata?: Record<string, unknown>;
  onProgress?: (done: number, total: number) => void;
}

/** Cria um novo catálogo versionado e grava os ativos em lotes. */
export async function importCatalog(input: ImportCatalogInput): Promise<AssetCatalog> {
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes?.user?.id ?? null;

  const { data: last } = await db
    .from("asset_catalogs")
    .select("version")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = ((last?.version as number | undefined) ?? 0) + 1;

  const { data: created, error: createErr } = await db
    .from("asset_catalogs")
    .insert({
      name: input.name,
      business_unit: input.businessUnit ?? null,
      version,
      source_filename: input.sourceFilename ?? null,
      total_assets: input.records.length,
      is_active: false,
      imported_by: userId,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();
  if (createErr) throw createErr;

  const catalog = created as AssetCatalog;
  const rows = input.records.map((r) => ({
    catalog_id: catalog.id,
    code: String(r.code ?? "").trim(),
    normalized_code: normalizeCode(r.code),
    name: String(r.name ?? "").trim(),
    level: String(r.level ?? "").trim(),
    parent_code: normalizeCode(r.parentCode) || null,
    parent_name: String(r.parentName ?? "").trim(),
    business_unit: String(r.businessUnit ?? "").trim(),
    metadata: r.metadata ?? {},
  }));

  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const { error } = await db
      .from("assets")
      .upsert(rows.slice(i, i + chunk), { onConflict: "catalog_id,normalized_code" });
    if (error) {
      await deleteCatalog(catalog.id).catch(() => undefined);
      throw error;
    }
    input.onProgress?.(Math.min(i + chunk, rows.length), rows.length);
  }

  if (input.activate) {
    await setActiveCatalog(catalog.id);
    catalog.is_active = true;
  }
  return catalog;
}

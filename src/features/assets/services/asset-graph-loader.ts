// Adaptador de compatibilidade: entrega o grafo de ativos para os módulos
// legados (Backorder etc.) usando o catálogo ativo e, se não houver nenhum,
// caindo na base antiga `assets_ref`.

import type { AssetGraph, AssetRecord } from "../types";
import { buildAssetGraph } from "./asset-resolver";
import { fetchCatalogAssets, fetchLegacyAssets, getActiveCatalog } from "./asset-catalog";

export interface LoadedAssetGraph {
  graph: AssetGraph;
  source: "catalog" | "legacy" | "empty";
  catalogId: string | null;
  catalogName: string | null;
  total: number;
}

let cache: { at: number; value: LoadedAssetGraph } | null = null;
const TTL_MS = 60_000;

export function invalidateAssetGraphCache() {
  cache = null;
}

/** Carrega o grafo de ativos vigente (com cache curto em memória). */
export async function loadActiveAssetGraph(force = false): Promise<LoadedAssetGraph> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.value;

  let records: AssetRecord[] = [];
  let source: LoadedAssetGraph["source"] = "empty";
  let catalogId: string | null = null;
  let catalogName: string | null = null;

  try {
    const catalog = await getActiveCatalog();
    if (catalog) {
      records = await fetchCatalogAssets(catalog.id);
      if (records.length > 0) {
        source = "catalog";
        catalogId = catalog.id;
        catalogName = catalog.name;
      }
    }
  } catch {
    // segue para o fallback legado
  }

  if (records.length === 0) {
    try {
      records = await fetchLegacyAssets();
      if (records.length > 0) source = "legacy";
    } catch {
      records = [];
    }
  }

  const value: LoadedAssetGraph = {
    graph: buildAssetGraph(records),
    source,
    catalogId,
    catalogName,
    total: records.length,
  };
  cache = { at: Date.now(), value };
  return value;
}

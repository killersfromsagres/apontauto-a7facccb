// Shim de compatibilidade.
//
// A regra de resolução foi extraída para
// `src/features/assets/services/asset-resolver.ts`. Este arquivo mantém a API
// antiga (usada por Backorder: reader, fill-locations, export e a tela) para
// que a migração aconteça sem quebrar nada.

import {
  buildAssetGraph,
  classifyLevel,
  normalizeCode,
  resolveAsset,
} from "@/features/assets/services/asset-resolver";
import type { AssetGraph, AssetLevel, AssetNode as CatalogNode } from "@/features/assets/types";

export type NivelAtivo = AssetLevel;

export interface AssetNode {
  codigo: string;
  nome: string;
  nivel: NivelAtivo;
  codigoPai: string | null;
}

export interface AssetsIndex {
  byCodigo: Map<string, AssetNode>;
  /** true quando a base tem informação de hierarquia real (nível/pai). */
  hasTree: boolean;
  /** Grafo novo, usado internamente pelo motor. */
  graph: AssetGraph;
}

export type AssetsMap = AssetsIndex;

export interface ResolveResult {
  predio: string;
  andar: string;
  espaco: string;
  found: boolean;
}

export function classifyNivel(raw: string): NivelAtivo {
  return classifyLevel(raw);
}

type LegacyRow = {
  ativo: string;
  denominacao?: string;
  nivel?: string;
  codigo_pai?: string | null;
};

const toNode = (n: CatalogNode): AssetNode => ({
  codigo: n.normalizedCode,
  nome: n.name,
  nivel: n.level,
  codigoPai: n.parentCode,
});

export function buildAssetsIndex(rows: LegacyRow[]): AssetsIndex {
  const graph = buildAssetGraph(
    rows.map((r) => ({
      code: r.ativo,
      name: r.denominacao,
      level: r.nivel,
      parentCode: r.codigo_pai,
    })),
  );
  const byCodigo = new Map<string, AssetNode>();
  graph.byCode.forEach((n, k) => byCodigo.set(k, toNode(n)));
  return { byCodigo, hasTree: graph.hasTree, graph };
}

export function makeAssetsMap(rows: LegacyRow[]): AssetsMap {
  return buildAssetsIndex(rows);
}

/** Constrói o índice legado a partir do grafo novo (adaptador). */
export function assetsIndexFromGraph(graph: AssetGraph): AssetsIndex {
  const byCodigo = new Map<string, AssetNode>();
  graph.byCode.forEach((n, k) => byCodigo.set(k, toNode(n)));
  return { byCodigo, hasTree: graph.hasTree, graph };
}

export function resolveAtivoTree(index: AssetsIndex, ativo: string): ResolveResult {
  const r = resolveAsset(index.graph, ativo);
  return {
    predio: r.predio,
    andar: r.andar,
    espaco: r.ambiente,
    found: r.method !== "unmatched",
  };
}

export function resolveAtivo(
  map: AssetsMap,
  ativo: string,
): { predio: string; andar: string; espaco: string } {
  const r = resolveAtivoTree(map, ativo);
  return { predio: r.predio, andar: r.andar, espaco: r.espaco };
}

/** Diagnóstico do Ativo para decidir badges "—" (não aplicável) vs "não encontrado". */
export function describeAtivo(
  index: AssetsIndex,
  ativo: string,
): {
  found: boolean;
  nivelSelf: NivelAtivo;
  naFields: { predio: boolean; andar: boolean; espaco: boolean };
} {
  const node = index.graph.byCode.get(normalizeCode(ativo));
  if (!node) {
    return {
      found: false,
      nivelSelf: "",
      naFields: { predio: false, andar: false, espaco: false },
    };
  }
  const r = resolveAsset(index.graph, ativo);
  return {
    found: true,
    nivelSelf: node.level,
    naFields: {
      predio: r.notApplicable.predio,
      andar: r.notApplicable.andar,
      espaco: r.notApplicable.ambiente,
    },
  };
}

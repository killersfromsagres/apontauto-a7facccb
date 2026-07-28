// Tipos compartilhados do catálogo de ativos (PCM).

export type AssetLevel =
  | "PLANTA"
  | "PREDIO"
  | "ANDAR"
  | "AMBIENTE"
  | "EQUIPAMENTO"
  | "";

/** Como o valor de localização foi obtido. */
export type ResolutionMethod =
  | "tree"
  | "legacy"
  | "existing-value"
  | "manual"
  | "unmatched";

/** Registro cru de um ativo (linha da planilha ou da tabela `assets`). */
export interface AssetRecord {
  code: string;
  name?: string | null;
  level?: string | null;
  parentCode?: string | null;
  parentName?: string | null;
  businessUnit?: string | null;
  metadata?: Record<string, unknown>;
}

/** Nó já normalizado dentro do grafo. */
export interface AssetNode {
  code: string;
  normalizedCode: string;
  name: string;
  level: AssetLevel;
  rawLevel: string;
  parentCode: string | null;
  parentName: string;
  businessUnit: string;
}

export interface AssetGraph {
  byCode: Map<string, AssetNode>;
  /** true quando existe informação real de hierarquia (nível e/ou pai). */
  hasTree: boolean;
}

export interface ResolvedLocation {
  predio: string;
  andar: string;
  ambiente: string;
  /** Método predominante utilizado na resolução. */
  method: ResolutionMethod;
  /** O código foi encontrado no catálogo. */
  found: boolean;
  level: AssetLevel;
  /** Campos em que "vazio" é esperado (o próprio ativo já é aquele nível ou acima). */
  notApplicable: { predio: boolean; andar: boolean; ambiente: boolean };
  /** Problemas detectados (ciclo, pai inexistente, código vazio...). */
  issues: string[];
}

export interface AssetCatalog {
  id: string;
  name: string;
  business_unit: string | null;
  version: number;
  source_filename: string | null;
  total_assets: number | null;
  is_active: boolean | null;
  imported_by: string | null;
  imported_at: string | null;
  metadata: Record<string, unknown> | null;
}

// Motor central de resolução hierárquica de ativos.
//
// Regras (ver especificação PCM):
//  1. Normaliza o código (trim, uppercase, remove caracteres invisíveis).
//  2. Localiza o ativo exato no catálogo.
//  3. Sobe por `parentCode` até achar Prédio / Andar / Ambiente.
//  4. Ambiente        -> o próprio nome é o Ambiente.
//  5. Equipamento     -> Ambiente é o ancestral Ambiente mais próximo.
//  6. Andar           -> Ambiente "não aplicável".
//  7. Prédio          -> Andar e Ambiente "não aplicáveis".
//  8. Detecta ciclos e pais inexistentes.
//  9. Fallback legado (VLOOKUP do Excel): LEFT(5) / LEFT(7) / código completo.
// 10. Devolve o método utilizado.

import type {
  AssetGraph,
  AssetLevel,
  AssetNode,
  AssetRecord,
  ResolutionMethod,
  ResolvedLocation,
} from "../types";

/** Caracteres invisíveis: zero-width, BOM, NBSP e controles. */
// eslint-disable-next-line no-control-regex -- remoção intencional de caracteres de controle
const INVISIBLE_RE = /[\u0000-\u001F\u007F\u00A0\u200B-\u200F\u2028\u2029\uFEFF]/g;

/** Normaliza o código do ativo sem descartar caracteres válidos. */
export function normalizeCode(value: unknown): string {
  return String(value ?? "")
    .replace(INVISIBLE_RE, "")
    .trim()
    .toUpperCase();
}

const stripAccents = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Traduz a descrição livre do nível para o enum interno. */
export function classifyLevel(raw: unknown): AssetLevel {
  const s = stripAccents(raw);
  if (!s) return "";
  if (s.includes("PLANTA")) return "PLANTA";
  if (s.includes("PREDIO") || s.includes("AREA")) return "PREDIO";
  if (s.includes("ANDAR") || s.includes("PAVIMENT")) return "ANDAR";
  if (s.includes("AMBIENTE") || s.includes("LOCAL")) return "AMBIENTE";
  if (s.includes("EQUIP")) return "EQUIPAMENTO";
  return "";
}

/** Monta o grafo de ativos a partir de registros crus. */
export function buildAssetGraph(records: AssetRecord[]): AssetGraph {
  const byCode = new Map<string, AssetNode>();
  let hasTree = false;
  for (const r of records) {
    const normalizedCode = normalizeCode(r.code);
    if (!normalizedCode) continue;
    const level = classifyLevel(r.level);
    const parentCode = normalizeCode(r.parentCode) || null;
    if (level || parentCode) hasTree = true;
    byCode.set(normalizedCode, {
      code: String(r.code ?? "").trim(),
      normalizedCode,
      name: String(r.name ?? "").trim(),
      level,
      rawLevel: String(r.level ?? "").trim(),
      parentCode,
      parentName: String(r.parentName ?? "").trim(),
      businessUnit: String(r.businessUnit ?? "").trim(),
    });
  }
  return { byCode, hasTree };
}

export interface AncestorWalk {
  chain: AssetNode[];
  cycle: boolean;
  missingParent: string | null;
}

/** Caminha do nó até a raiz, protegido contra ciclos. */
export function walkAncestors(graph: AssetGraph, startCode: string): AncestorWalk {
  const chain: AssetNode[] = [];
  const seen = new Set<string>();
  let cursor = graph.byCode.get(normalizeCode(startCode)) ?? null;
  let cycle = false;
  let missingParent: string | null = null;

  while (cursor) {
    if (seen.has(cursor.normalizedCode)) {
      cycle = true;
      break;
    }
    seen.add(cursor.normalizedCode);
    chain.push(cursor);
    if (!cursor.parentCode) break;
    const parent = graph.byCode.get(cursor.parentCode);
    if (!parent) {
      missingParent = cursor.parentCode;
      break;
    }
    cursor = parent;
  }

  return { chain, cycle, missingParent };
}

export interface ResolveOptions {
  /** Valores já presentes na planilha — quando completos, são preservados. */
  existing?: { predio?: string; andar?: string; ambiente?: string };
  /** Correção manual do operador — sempre vence. */
  manual?: { predio?: string; andar?: string; ambiente?: string };
  /** Desliga o fallback LEFT(5)/LEFT(7). */
  disableLegacyFallback?: boolean;
}

const clean = (v: unknown) => String(v ?? "").trim();

/** Resolve Prédio / Andar / Ambiente de um código de ativo. */
export function resolveAsset(
  graph: AssetGraph,
  rawCode: string,
  options: ResolveOptions = {},
): ResolvedLocation {
  const code = normalizeCode(rawCode);
  const issues: string[] = [];

  const manual = options.manual;
  if (manual && (clean(manual.predio) || clean(manual.andar) || clean(manual.ambiente))) {
    return {
      predio: clean(manual.predio),
      andar: clean(manual.andar),
      ambiente: clean(manual.ambiente),
      method: "manual",
      found: graph.byCode.has(code),
      level: graph.byCode.get(code)?.level ?? "",
      notApplicable: { predio: false, andar: false, ambiente: false },
      issues,
    };
  }

  const existing = options.existing;
  if (existing && clean(existing.predio) && clean(existing.andar) && clean(existing.ambiente)) {
    return {
      predio: clean(existing.predio),
      andar: clean(existing.andar),
      ambiente: clean(existing.ambiente),
      method: "existing-value",
      found: graph.byCode.has(code),
      level: graph.byCode.get(code)?.level ?? "",
      notApplicable: { predio: false, andar: false, ambiente: false },
      issues,
    };
  }

  if (!code) {
    return {
      predio: "",
      andar: "",
      ambiente: "",
      method: "unmatched",
      found: false,
      level: "",
      notApplicable: { predio: false, andar: false, ambiente: false },
      issues: ["empty-code"],
    };
  }

  const legacyByPrefix = (n: number) => {
    if (options.disableLegacyFallback) return "";
    if (code.length < n) return "";
    return graph.byCode.get(code.slice(0, n))?.name ?? "";
  };

  const self = graph.byCode.get(code);

  // --- Ativo desconhecido: só resta o fallback legado ---------------------
  if (!self) {
    const predio = legacyByPrefix(5);
    const andar = legacyByPrefix(7);
    const matched = Boolean(predio || andar);
    return {
      predio,
      andar,
      ambiente: "",
      method: matched ? "legacy" : "unmatched",
      found: false,
      level: "",
      notApplicable: { predio: false, andar: false, ambiente: false },
      issues: [matched ? "unknown-code-legacy-fallback" : "unmatched-code"],
    };
  }

  const walk = walkAncestors(graph, code);
  if (walk.cycle) issues.push("cycle-detected");
  if (walk.missingParent) issues.push(`missing-parent:${walk.missingParent}`);

  const pick = (level: AssetLevel) => walk.chain.find((n) => n.level === level) ?? null;

  const predioNode = pick("PREDIO");
  const andarNode = pick("ANDAR");

  let ambienteNode: AssetNode | null = null;
  if (self.level === "AMBIENTE" || self.level === "") ambienteNode = self;
  else if (self.level === "EQUIPAMENTO") ambienteNode = pick("AMBIENTE");

  let predio = predioNode?.name ?? "";
  let andar = andarNode?.name ?? "";
  let ambiente = ambienteNode?.name ?? "";
  let usedLegacy = false;

  if (!predio && self.level !== "PLANTA") {
    const fb = legacyByPrefix(5);
    if (fb) {
      predio = fb;
      usedLegacy = true;
    }
  }
  if (!andar && self.level !== "PLANTA" && self.level !== "PREDIO") {
    const fb = legacyByPrefix(7);
    if (fb) {
      andar = fb;
      usedLegacy = true;
    }
  }
  if (!ambiente && self.level !== "PLANTA" && self.level !== "PREDIO" && self.level !== "ANDAR") {
    // VLOOKUP direto: o próprio ativo responde pelo Ambiente.
    if (self.name) {
      ambiente = self.name;
      if (self.level !== "AMBIENTE") usedLegacy = true;
    }
  }

  return {
    predio,
    andar,
    ambiente,
    method: usedLegacy ? "legacy" : "tree",
    found: true,
    level: self.level,
    notApplicable: {
      predio: self.level === "PLANTA",
      andar: self.level === "PLANTA" || self.level === "PREDIO",
      ambiente: self.level === "PLANTA" || self.level === "PREDIO" || self.level === "ANDAR",
    },
    issues,
  };
}

export interface CatalogValidationIssue {
  type: "empty-code" | "duplicate-code" | "missing-parent" | "cycle" | "unknown-level";
  code: string;
  row: number;
  detail?: string;
}

/** Valida uma lista de registros antes de gravar um novo catálogo. */
export function validateAssetRecords(records: AssetRecord[]): {
  issues: CatalogValidationIssue[];
  valid: AssetRecord[];
} {
  const issues: CatalogValidationIssue[] = [];
  const seen = new Map<string, number>();
  const valid: AssetRecord[] = [];

  records.forEach((r, i) => {
    const row = i + 2; // linha na planilha (1 = cabeçalho)
    const code = normalizeCode(r.code);
    if (!code) {
      issues.push({ type: "empty-code", code: "", row });
      return;
    }
    if (seen.has(code)) {
      issues.push({
        type: "duplicate-code",
        code,
        row,
        detail: `já presente na linha ${seen.get(code)}`,
      });
      return;
    }
    seen.set(code, row);
    if (!classifyLevel(r.level)) {
      issues.push({
        type: "unknown-level",
        code,
        row,
        detail: clean(r.level) || "(vazio)",
      });
    }
    valid.push({ ...r, code });
  });

  const graph = buildAssetGraph(valid);
  valid.forEach((r, i) => {
    const row = i + 2;
    const code = normalizeCode(r.code);
    const parent = normalizeCode(r.parentCode);
    if (parent && !graph.byCode.has(parent)) {
      issues.push({ type: "missing-parent", code, row, detail: parent });
    }
    const walk = walkAncestors(graph, code);
    if (walk.cycle) issues.push({ type: "cycle", code, row });
  });

  return { issues, valid };
}

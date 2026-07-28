// Motor de preenchimento de planilhas (substitui o PROCV manual).
//
// Este arquivo NÃO duplica a regra de resolução: ele apenas detecta cabeçalhos,
// colunas e aplica o serviço central `asset-resolver`.

import { normalizeCode, resolveAsset } from "./asset-resolver";
import type { AssetGraph, ResolutionMethod } from "../types";

/* -------------------------------------------------------------------------- */
/* Normalização                                                                */
/* -------------------------------------------------------------------------- */

export const normHeader = (v: unknown) =>
  String(v ?? "")
    .replace(/[\u0000-\u001F\u00A0\u200B-\u200F\uFEFF]/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[.:;,_/\\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* -------------------------------------------------------------------------- */
/* Aliases                                                                     */
/* -------------------------------------------------------------------------- */

const ATIVO_EXACT = [
  "ATIVO",
  "CODIGO DO ATIVO",
  "COD ATIVO",
  "COD DO ATIVO",
  "CODIGO ATIVO",
  "TAG",
  "ASSET",
  "LOCAL DA INSTALACAO",
  "LOCAL DE INSTALACAO",
  "LOCAL INSTALACAO",
];

/** Cabeçalhos que contêm "ATIVO" mas NÃO são o código. */
const ATIVO_NEGATIVE = [
  "DENOMINACAO",
  "DESCRICAO",
  "NOME",
  "PAI",
  "SUPERIOR",
  "STATUS",
  "TIPO",
];

const PREDIO_ALIASES = ["PREDIO", "EDIFICIO", "BLOCO", "PREDIO EDIFICIO"];
const ANDAR_ALIASES = ["ANDAR", "PAVIMENTO", "PISO", "ANDAR PAVIMENTO", "NIVEL ANDAR"];
const AMBIENTE_ALIASES = [
  "AMBIENTE",
  "LOCAL",
  "ESPACO",
  "SALA",
  "AREA",
  "LOCALIZACAO",
  "AMBIENTE LOCAL",
];

export const STATUS_HEADER = "Status do Match";
export const METHOD_HEADER = "Método de Resolução";

/** Abas ignoradas por padrão (base de ativos). */
export function isAssetSheetName(name: string) {
  const n = normHeader(name);
  return n === "ATIVOS" || n === "BASE DE ATIVOS" || n === "BASE ATIVOS" || n === "CADASTRO DE ATIVOS";
}

/* -------------------------------------------------------------------------- */
/* Detecção do cabeçalho real                                                  */
/* -------------------------------------------------------------------------- */

const KEYWORDS = [
  ...ATIVO_EXACT,
  ...PREDIO_ALIASES,
  ...ANDAR_ALIASES,
  ...AMBIENTE_ALIASES,
  "OS",
  "EQUIPE",
  "DATA",
];

/** Procura a linha de cabeçalho nas primeiras 20 linhas. */
export function detectHeaderRow(rows: string[][]): number {
  let best = 0;
  let bestScore = -1;
  const limit = Math.min(rows.length, 20);
  for (let i = 0; i < limit; i++) {
    const cells = (rows[i] ?? []).map((c) => normHeader(c));
    const filled = cells.filter(Boolean).length;
    if (filled < 2) continue;
    let score = filled;
    for (const c of cells) {
      if (!c) continue;
      if (KEYWORDS.some((k) => c === k || c.includes(k))) score += 4;
      if (c.length > 60) score -= 2;
    }
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Detecção da coluna Ativo                                                    */
/* -------------------------------------------------------------------------- */

export interface ColumnCandidate {
  index: number;
  header: string;
  score: number;
  reason: string;
  sampleHitRate: number;
}

export interface AtivoDetection {
  index: number;
  confidence: "high" | "medium" | "low";
  candidates: ColumnCandidate[];
}

/** Detecta a coluna do código do ativo por cabeçalho + amostragem de valores. */
export function detectAtivoColumn(
  headers: string[],
  dataRows: string[][],
  graph?: AssetGraph | null,
): AtivoDetection {
  const sample = dataRows.slice(0, 200);
  const candidates: ColumnCandidate[] = headers.map((raw, index) => {
    const h = normHeader(raw);
    let score = 0;
    let reason = "";

    if (ATIVO_EXACT.includes(h)) {
      score += 100;
      reason = "cabeçalho exato";
    } else if (h.includes("ATIVO") && !ATIVO_NEGATIVE.some((n) => h.includes(n))) {
      score += 45;
      reason = "cabeçalho contém “Ativo”";
    } else if (h.includes("TAG")) {
      score += 35;
      reason = "cabeçalho contém “TAG”";
    }
    if (ATIVO_NEGATIVE.some((n) => h.includes(n)) && h.includes("ATIVO")) {
      score -= 60;
      reason = "descarte: descrição de ativo";
    }

    // Amostragem: quantos valores existem no catálogo ativo?
    let hits = 0;
    let filled = 0;
    for (const row of sample) {
      const v = normalizeCode(row[index]);
      if (!v) continue;
      filled++;
      if (graph?.byCode.has(v)) hits++;
    }
    const hitRate = filled ? hits / filled : 0;
    if (graph && filled >= 3) {
      score += Math.round(hitRate * 120);
      if (hitRate >= 0.6 && !reason) reason = "valores batem com o catálogo";
    }
    // Códigos costumam ser curtos, alfanuméricos e sem espaço.
    const shapeOk =
      filled > 0 &&
      sample
        .map((r) => String(r[index] ?? "").trim())
        .filter(Boolean)
        .slice(0, 50)
        .every((v) => v.length <= 24 && !/\s{2,}/.test(v));
    if (shapeOk) score += 5;

    return { index, header: raw, score, reason: reason || "—", sampleHitRate: hitRate };
  });

  const sorted = candidates.slice().sort((a, b) => b.score - a.score);
  const top = sorted[0];
  const second = sorted[1];
  let confidence: AtivoDetection["confidence"] = "low";
  if (top && top.score >= 90 && (!second || top.score - second.score >= 25)) confidence = "high";
  else if (top && top.score >= 45 && (!second || top.score - second.score >= 10)) confidence = "medium";

  return { index: top && top.score > 0 ? top.index : -1, confidence, candidates: sorted };
}

/* -------------------------------------------------------------------------- */
/* Colunas de destino                                                          */
/* -------------------------------------------------------------------------- */

export interface TargetColumns {
  predio: number;
  andar: number;
  ambiente: number;
  status: number;
  method: number;
}

const findAlias = (headers: string[], aliases: string[], taken: Set<number>) => {
  const norm = headers.map(normHeader);
  let idx = norm.findIndex((h, i) => !taken.has(i) && aliases.includes(h));
  if (idx < 0)
    idx = norm.findIndex(
      (h, i) => !taken.has(i) && h.length > 0 && aliases.some((a) => h === a || h.startsWith(a + " ")),
    );
  if (idx >= 0) taken.add(idx);
  return idx;
};

export function detectTargetColumns(headers: string[], ativoIndex: number): TargetColumns {
  const taken = new Set<number>([ativoIndex]);
  return {
    predio: findAlias(headers, PREDIO_ALIASES, taken),
    andar: findAlias(headers, ANDAR_ALIASES, taken),
    ambiente: findAlias(headers, AMBIENTE_ALIASES, taken),
    status: headers.findIndex((h) => normHeader(h) === normHeader(STATUS_HEADER)),
    method: headers.findIndex((h) => normHeader(h) === normHeader(METHOD_HEADER)),
  };
}

/* -------------------------------------------------------------------------- */
/* Processamento                                                               */
/* -------------------------------------------------------------------------- */

export type MatchStatus =
  | "exact"
  | "tree"
  | "legacy"
  | "preserved"
  | "conflict"
  | "unmatched"
  | "empty";

export interface FillOptions {
  /** Sobrescrever valores já preenchidos. */
  overwrite: boolean;
  /** Adicionar coluna "Método de Resolução". */
  addMethodColumn: boolean;
  /** Adicionar comentário na célula com código + catálogo. */
  addComment: boolean;
}

export const DEFAULT_FILL_OPTIONS: FillOptions = {
  overwrite: false,
  addMethodColumn: true,
  addComment: false,
};

export interface RowResult {
  /** Índice dentro das linhas de dados (0-based). */
  i: number;
  /** Número da linha na planilha (1-based). */
  row: number;
  code: string;
  current: [string, string, string];
  computed: [string, string, string];
  /** Valor final que será gravado. */
  final: [string, string, string];
  method: ResolutionMethod;
  status: MatchStatus;
  changed: boolean;
  issues: string[];
}

export const STATUS_LABEL: Record<MatchStatus, string> = {
  exact: "Correspondência exata",
  tree: "Hierarquia",
  legacy: "Legado",
  preserved: "Valor preservado",
  conflict: "Conflito",
  unmatched: "Não encontrado",
  empty: "Sem ativo",
};

export interface ProcessInput {
  rows: string[][];
  ativoIndex: number;
  targets: TargetColumns;
  headerRow: number;
  options: FillOptions;
}

const s = (v: unknown) => String(v ?? "").trim();

/** Processa um bloco de linhas contra o grafo já carregado. */
export function processRows(graph: AssetGraph, input: ProcessInput): RowResult[] {
  const { rows, ativoIndex, targets, headerRow, options } = input;
  const out: RowResult[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const code = s(row[ativoIndex]);
    const current: [string, string, string] = [
      targets.predio >= 0 ? s(row[targets.predio]) : "",
      targets.andar >= 0 ? s(row[targets.andar]) : "",
      targets.ambiente >= 0 ? s(row[targets.ambiente]) : "",
    ];

    if (!code) {
      out.push({
        i,
        row: headerRow + 2 + i,
        code: "",
        current,
        computed: ["", "", ""],
        final: current,
        method: "unmatched",
        status: "empty",
        changed: false,
        issues: [],
      });
      continue;
    }

    const r = resolveAsset(graph, code, { disableLegacyFallback: false });
    const computed: [string, string, string] = [r.predio, r.andar, r.ambiente];

    const final: [string, string, string] = [0, 1, 2].map((k) => {
      const cur = current[k];
      const calc = computed[k];
      if (options.overwrite) return calc || cur;
      return cur || calc;
    }) as [string, string, string];

    const changed = final.some((v, k) => v !== current[k]);
    const hasAnyCalc = computed.some(Boolean);
    const hadAll = current.every(Boolean);
    const conflict =
      hasAnyCalc &&
      [0, 1, 2].some((k) => current[k] && computed[k] && normHeader(current[k]) !== normHeader(computed[k]));

    let status: MatchStatus;
    if (!r.found && !hasAnyCalc) status = "unmatched";
    else if (conflict) status = "conflict";
    else if (hadAll && !options.overwrite) status = "preserved";
    else if (r.method === "legacy" || !r.found) status = "legacy";
    else if (r.found && r.level === "EQUIPAMENTO") status = "tree";
    else status = "exact";

    out.push({
      i,
      row: headerRow + 2 + i,
      code,
      current,
      computed,
      final,
      method: r.method,
      status,
      changed,
      issues: r.issues,
    });
  }
  return out;
}

export interface Totals {
  sheets: number;
  rowsWithAsset: number;
  tree: number;
  legacy: number;
  preserved: number;
  conflicts: number;
  unmatched: number;
  changed: number;
}

export function emptyTotals(): Totals {
  return {
    sheets: 0,
    rowsWithAsset: 0,
    tree: 0,
    legacy: 0,
    preserved: 0,
    conflicts: 0,
    unmatched: 0,
    changed: 0,
  };
}

export function accumulate(totals: Totals, results: RowResult[]) {
  for (const r of results) {
    if (r.status === "empty") continue;
    totals.rowsWithAsset++;
    if (r.changed) totals.changed++;
    switch (r.status) {
      case "exact":
      case "tree":
        totals.tree++;
        break;
      case "legacy":
        totals.legacy++;
        break;
      case "preserved":
        totals.preserved++;
        break;
      case "conflict":
        totals.conflicts++;
        break;
      case "unmatched":
        totals.unmatched++;
        break;
    }
  }
  return totals;
}

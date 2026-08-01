// Execução determinística do plano devolvido pela IA sobre o dataset local.

import type { Dataset, DataRow, Filtro, Metrica, TabelaSpec } from "./types";

export interface TabelaResultado {
  id: string;
  nome: string;
  descricao: string | null;
  headers: string[];
  rows: (string | number)[][];
  total: number;
}

const txt = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Chave de comparação de nomes de coluna (ignora acento, caixa e pontuação). */
export const colKey = (v: unknown) => txt(v).replace(/[^a-z0-9]/g, "");

/**
 * Resolve o nome informado pela IA para uma coluna real do dataset.
 * Tolera acentos, caixa, espaços e abreviações ("Predio" → "Prédio").
 */
export function resolveColumn(columns: string[], name: unknown): string | null {
  const target = colKey(name);
  if (!target) return null;
  const exact = columns.find((c) => colKey(c) === target);
  if (exact) return exact;
  const partial = columns.find((c) => {
    const k = colKey(c);
    return k.includes(target) || target.includes(k);
  });
  return partial ?? null;
}

export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "")
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}\b)/g, "")
    .replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function matchFiltro(row: DataRow, f: Filtro): boolean {
  const raw = row[f.campo];
  const val = txt(raw);
  const alvo = txt(f.valor);
  switch (f.operador) {
    case "igual":
      return val === alvo;
    case "diferente":
      return val !== alvo;
    case "contem":
      return val.includes(alvo);
    case "naoContem":
      return !val.includes(alvo);
    case "vazio":
      return val === "";
    case "naoVazio":
      return val !== "";
    case "maior": {
      const a = toNumber(raw);
      const b = toNumber(f.valor);
      return a != null && b != null && a > b;
    }
    case "menor": {
      const a = toNumber(raw);
      const b = toNumber(f.valor);
      return a != null && b != null && a < b;
    }
    default:
      return true;
  }
}

function aplicarMetrica(rows: DataRow[], m: Metrica): number {
  if (m.agregacao === "contagem" || !m.campo) return rows.length;
  if (m.agregacao === "distintos") {
    return new Set(rows.map((r) => String(r[m.campo as string] ?? "").trim())).size;
  }
  const nums = rows
    .map((r) => toNumber(r[m.campo as string]))
    .filter((n): n is number => n != null);
  if (nums.length === 0) return 0;
  switch (m.agregacao) {
    case "soma":
      return round(nums.reduce((a, b) => a + b, 0));
    case "media":
      return round(nums.reduce((a, b) => a + b, 0) / nums.length);
    case "min":
      return round(Math.min(...nums));
    case "max":
      return round(Math.max(...nums));
    default:
      return rows.length;
  }
}

const round = (n: number) => Math.round(n * 100) / 100;

export function runTabela(ds: Dataset, spec: TabelaSpec): TabelaResultado {
  const col = (c: unknown) => resolveColumn(ds.columns, c);

  let rows = ds.rows;
  for (const f of spec.filtros) {
    const campo = col(f.campo);
    if (!campo) continue;
    rows = rows.filter((r) => matchFiltro(r, { ...f, campo }));
  }

  const total = rows.length;
  let headers: string[];
  let out: (string | number)[][];

  const grupos = spec.agruparPor.map(col).filter((c): c is string => !!c);

  if (spec.tipo === "agrupado" && grupos.length > 0) {
    const metricas: Metrica[] =
      spec.metricas.length > 0
        ? spec.metricas.map((m) => ({ ...m, campo: m.campo ? col(m.campo) : null }))
        : [{ rotulo: "Chamados", campo: null, agregacao: "contagem" }];

    const buckets = new Map<string, { keys: string[]; rows: DataRow[] }>();
    for (const r of rows) {
      const keys = grupos.map((g) => String(r[g] ?? "").trim() || "(vazio)");
      const id = keys.join(" ▸ ");
      const b = buckets.get(id) ?? { keys, rows: [] };
      b.rows.push(r);
      buckets.set(id, b);
    }

    headers = [...grupos, ...metricas.map((m) => m.rotulo)];
    out = Array.from(buckets.values()).map((b) => [
      ...b.keys,
      ...metricas.map((m) => aplicarMetrica(b.rows, m)),
    ]);

    const ordIdx = spec.ordenarPor
      ? headers.findIndex((h) => colKey(h) === colKey(spec.ordenarPor))
      : grupos.length;
    const idx = ordIdx >= 0 ? ordIdx : grupos.length;
    out.sort((a, b) => compare(a[idx], b[idx], spec.ordem));
  } else {
    // Detalhe: se a IA não indicou colunas válidas, usa a base completa —
    // nunca devolvemos uma tabela vazia sem os dados do arquivo enviado.
    const cols = spec.colunas.map(col).filter((c): c is string => !!c);
    headers = cols.length > 0 ? Array.from(new Set(cols)) : ds.columns;
    out = rows.map((r) => headers.map((h) => r[h] ?? ""));
    if (spec.ordenarPor) {
      const idx = headers.findIndex((h) => colKey(h) === colKey(spec.ordenarPor));
      if (idx >= 0) out.sort((a, b) => compare(a[idx], b[idx], spec.ordem));
    }
  }

  if (spec.limite && out.length > spec.limite) out = out.slice(0, spec.limite);

  return { id: spec.id, nome: spec.nome, descricao: spec.descricao, headers, rows: out, total };
}

function compare(a: unknown, b: unknown, ordem: "asc" | "desc") {
  const na = toNumber(a);
  const nb = toNumber(b);
  let cmp: number;
  if (na != null && nb != null) cmp = na - nb;
  else cmp = String(a ?? "").localeCompare(String(b ?? ""), "pt-BR");
  return ordem === "asc" ? cmp : -cmp;
}

export function runSpecTables(ds: Dataset, tabelas: TabelaSpec[]): TabelaResultado[] {
  return tabelas.map((t) => runTabela(ds, t));
}

// Leitura e mapeamento de planilhas da base de ativos (XLSX / XLS / CSV).

import type { AssetRecord } from "../types";

export type AssetField = "code" | "name" | "level" | "parentCode" | "parentName" | "businessUnit";

export const FIELD_LABELS: Record<AssetField, string> = {
  code: "Ativo",
  name: "Denominação Ativo",
  level: "Denominação Nível de Empresa",
  parentCode: "Ativo Pai",
  parentName: "Descrição Ativo Pai",
  businessUnit: "Unidade de Negócio",
};

export type ColumnMapping = Partial<Record<AssetField, string>>;

const norm = (v: unknown) =>
  String(v ?? "")
    // eslint-disable-next-line no-control-regex -- remoção intencional de caracteres de controle
    .replace(/[\u0000-\u001F\u00A0\u200B-\u200F\uFEFF]/g, " ")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

/** Aliases exatos, avaliados antes de qualquer casamento por prefixo. */
const EXACT_ALIASES: Record<AssetField, string[]> = {
  code: ["ATIVO", "CODIGO", "CODIGO ATIVO", "TAG", "EQUIPAMENTO"],
  name: ["DENOMINACAO ATIVO", "DENOMINACAO", "NOME", "DESCRICAO", "DESCRICAO ATIVO"],
  level: ["DENOMINACAO NIVEL DE EMPRESA", "NIVEL DE EMPRESA", "NIVEL", "DENOMINACAO NIVEL"],
  parentCode: ["ATIVO PAI", "CODIGO PAI", "PAI", "ATIVO SUPERIOR"],
  parentName: ["DESCRICAO ATIVO PAI", "DENOMINACAO ATIVO PAI", "DESCRICAO PAI"],
  businessUnit: ["UNIDADE DE NEGOCIO", "UNIDADE NEGOCIO", "UN", "PLANTA"],
};

const CONTAINS_ALIASES: Record<AssetField, string[]> = {
  code: [],
  name: ["DENOMINACAO ATIVO"],
  level: ["NIVEL DE EMPRESA", "NIVEL"],
  parentCode: ["ATIVO PAI"],
  parentName: ["DESCRICAO ATIVO PAI"],
  businessUnit: ["UNIDADE DE NEGOCIO"],
};

const FIELDS: AssetField[] = ["code", "name", "level", "parentCode", "parentName", "businessUnit"];

/** Casa cabeçalhos com os campos — exato primeiro, depois "contém". */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const used = new Set<string>();
  const normalized = headers.map((h) => ({ raw: h, n: norm(h) }));

  for (const field of FIELDS) {
    const hit = normalized.find((h) => !used.has(h.raw) && EXACT_ALIASES[field].includes(h.n));
    if (hit) {
      mapping[field] = hit.raw;
      used.add(hit.raw);
    }
  }
  for (const field of FIELDS) {
    if (mapping[field]) continue;
    const hit = normalized.find(
      (h) => !used.has(h.raw) && CONTAINS_ALIASES[field].some((a) => h.n.includes(a)),
    );
    if (hit) {
      mapping[field] = hit.raw;
      used.add(hit.raw);
    }
  }
  return mapping;
}

export interface SheetPreview {
  sheetNames: string[];
  /** Aba detectada como sendo a base de ativos. */
  detectedSheet: string;
  headers: string[];
  rows: Record<string, string>[];
  totalRows: number;
  mapping: ColumnMapping;
}

function scoreSheet(name: string, headers: string[]) {
  const n = norm(name);
  let score = 0;
  if (n.includes("ATIVO") || n.includes("CADASTRO")) score += 5;
  const map = autoMapColumns(headers);
  score += Object.keys(map).length;
  if (!map.code) score -= 10;
  return score;
}

/** Lê a planilha inteira e devolve a aba mais provável + prévia. */
export async function readAssetSheet(file: File, forcedSheet?: string): Promise<SheetPreview> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const candidates = wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], {
      defval: "",
      raw: false,
    });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { name, rows, headers, score: scoreSheet(name, headers) };
  });

  const chosen =
    (forcedSheet && candidates.find((c) => c.name === forcedSheet)) ||
    candidates.slice().sort((a, b) => b.score - a.score)[0];

  if (!chosen) {
    return {
      sheetNames: wb.SheetNames,
      detectedSheet: "",
      headers: [],
      rows: [],
      totalRows: 0,
      mapping: {},
    };
  }

  const rows = chosen.rows.map((r) => {
    const out: Record<string, string> = {};
    for (const k of Object.keys(r)) out[k] = String(r[k] ?? "").trim();
    return out;
  });

  return {
    sheetNames: wb.SheetNames,
    detectedSheet: chosen.name,
    headers: chosen.headers,
    rows,
    totalRows: rows.length,
    mapping: autoMapColumns(chosen.headers),
  };
}

/** Converte as linhas cruas em registros de ativo conforme o mapeamento. */
export function rowsToRecords(
  rows: Record<string, string>[],
  mapping: ColumnMapping,
): AssetRecord[] {
  const get = (row: Record<string, string>, field: AssetField) => {
    const col = mapping[field];
    return col ? (row[col] ?? "") : "";
  };
  return rows.map((row) => ({
    code: get(row, "code"),
    name: get(row, "name"),
    level: get(row, "level"),
    parentCode: get(row, "parentCode") || null,
    parentName: get(row, "parentName"),
    businessUnit: get(row, "businessUnit"),
  }));
}

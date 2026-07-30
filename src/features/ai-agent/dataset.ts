// Leitura + enriquecimento da planilha de chamados enviada pelo usuário.
//
// O enriquecimento usa exatamente a mesma "fórmula" já aprendida pelo sistema:
// resolução hierárquica de Prédio / Andar / Ambiente pelo código do ativo e
// classificação automática de equipe.

import * as XLSX from "xlsx";

import { loadActiveAssetGraph } from "@/features/assets/services/asset-graph-loader";
import { resolveAsset } from "@/features/assets/services/asset-resolver";
import { CATEGORIA_TO_EQUIPE, classifyBackorder } from "@/lib/backorder/classify";

import type { Dataset, DataRow } from "./types";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export const COL_EQUIPE = "Equipe (IA)";
export const COL_CATEGORIA = "Categoria (IA)";
export const COL_PREDIO = "Prédio";
export const COL_ANDAR = "Andar";
export const COL_AMBIENTE = "Ambiente";
export const COL_STATUS_ATIVO = "Status do Ativo";

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");

export function validateFile(file: File): string | null {
  const ext = file.name.toLowerCase().split(".").pop() ?? "";
  if (!["xlsx", "xls", "csv"].includes(ext)) {
    return "Formato não suportado. Envie um arquivo .xlsx, .xls ou .csv.";
  }
  if (file.size === 0) return "O arquivo está vazio ou corrompido.";
  if (file.size > MAX_FILE_BYTES) {
    return `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)} MB). O limite é 25 MB.`;
  }
  return null;
}

/** Encontra a primeira coluna cujo nome casa com algum dos candidatos. */
function findColumn(columns: string[], candidates: string[]): string | null {
  const slugs = columns.map((c) => ({ col: c, slug: norm(c) }));
  for (const cand of candidates) {
    const target = norm(cand);
    const exact = slugs.find((s) => s.slug === target);
    if (exact) return exact.col;
  }
  for (const cand of candidates) {
    const target = norm(cand);
    if (!target) continue;
    const partial = slugs.find((s) => s.slug.includes(target));
    if (partial) return partial.col;
  }
  return null;
}

export interface DetectedColumns {
  ativo: string | null;
  descricao: string | null;
  os: string | null;
  solicitante: string | null;
  categoria: string | null;
}

export function detectColumns(columns: string[]): DetectedColumns {
  return {
    ativo: findColumn(columns, ["ativo", "codigo do ativo", "equipamento", "tag", "local"]),
    descricao: findColumn(columns, [
      "descricao",
      "descricao do servico",
      "servico",
      "problema",
      "ocorrencia",
      "titulo",
      "nome",
    ]),
    os: findColumn(columns, ["os", "numero da os", "ordem", "chamado", "ticket", "numero"]),
    solicitante: findColumn(columns, ["solicitante", "requisitante", "denominacao do solicitante"]),
    categoria: findColumn(columns, ["categoria", "tipo de servico", "especialidade", "equipe"]),
  };
}

function cellToValue(v: unknown): string | number {
  if (v == null) return "";
  if (typeof v === "number") return v;
  if (v instanceof Date) return v.toLocaleDateString("pt-BR");
  return String(v).trim();
}

/** Lê a planilha (primeira aba com dados) e devolve linhas cruas. */
export async function readSpreadsheet(file: File): Promise<{
  columns: string[];
  rows: DataRow[];
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  let best: { columns: string[]; rows: DataRow[] } = { columns: [], rows: [] };
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    if (!sheet) continue;
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
    if (json.length === 0) continue;
    const columns = Object.keys(json[0]).filter((c) => c && !c.startsWith("__EMPTY"));
    const rows: DataRow[] = json.map((r) => {
      const out: DataRow = {};
      for (const c of columns) out[c] = cellToValue(r[c]);
      return out;
    });
    if (rows.length > best.rows.length) best = { columns, rows };
  }

  if (best.rows.length === 0) {
    throw new Error("Não encontrei linhas de dados na planilha enviada.");
  }
  return best;
}

/** Aplica a inteligência de ativos + equipes sobre as linhas lidas. */
export async function enrichDataset(file: File): Promise<Dataset> {
  const { columns, rows } = await readSpreadsheet(file);
  const det = detectColumns(columns);
  const { graph } = await loadActiveAssetGraph();

  let resolvidos = 0;
  let naoResolvidos = 0;

  const enriched: DataRow[] = rows.map((row) => {
    const ativo = det.ativo ? String(row[det.ativo] ?? "") : "";
    const descricao = det.descricao ? String(row[det.descricao] ?? "") : "";
    const solicitante = det.solicitante ? String(row[det.solicitante] ?? "") : "";
    const categoriaOrigem = det.categoria ? String(row[det.categoria] ?? "") : "";

    const loc = ativo
      ? resolveAsset(graph, ativo)
      : {
          predio: "",
          andar: "",
          ambiente: "",
          method: "unmatched" as const,
          notApplicable: { predio: false, andar: false, ambiente: false },
        };

    const achou = ativo !== "" && loc.method !== "unmatched";
    if (achou) resolvidos += 1;
    else naoResolvidos += 1;

    const categoria = classifyBackorder({
      descricao,
      servico: `${ativo} ${solicitante}`,
      categoria: categoriaOrigem,
    });

    return {
      ...row,
      [COL_EQUIPE]: CATEGORIA_TO_EQUIPE[categoria],
      [COL_CATEGORIA]: categoria,
      [COL_PREDIO]: loc.predio || (achou ? "—" : "Não encontrado"),
      [COL_ANDAR]: loc.andar || (achou ? "—" : "Não encontrado"),
      [COL_AMBIENTE]: loc.ambiente || (achou ? "—" : "Não encontrado"),
      [COL_STATUS_ATIVO]: achou ? "Resolvido" : ativo ? "Não encontrado" : "Sem ativo",
    };
  });

  const outColumns = [
    ...columns,
    COL_EQUIPE,
    COL_CATEGORIA,
    COL_PREDIO,
    COL_ANDAR,
    COL_AMBIENTE,
    COL_STATUS_ATIVO,
  ];

  return {
    columns: outColumns,
    rows: enriched,
    fileName: file.name,
    resolvidos,
    naoResolvidos,
  };
}

/** Resumo compacto usado como contexto para a IA (nunca envia a base toda). */
export function summarizeDataset(ds: Dataset) {
  const amostras: Record<string, string[]> = {};
  for (const col of ds.columns) {
    const vals = new Set<string>();
    for (const row of ds.rows) {
      const v = String(row[col] ?? "").trim();
      if (v) vals.add(v);
      if (vals.size >= 8) break;
    }
    amostras[col] = Array.from(vals);
  }

  const contar = (col: string) => {
    const map = new Map<string, number>();
    for (const row of ds.rows) {
      const v = String(row[col] ?? "").trim() || "(vazio)";
      map.set(v, (map.get(v) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([k, v]) => `${k}: ${v}`);
  };

  return {
    arquivo: ds.fileName,
    totalLinhas: ds.rows.length,
    colunas: ds.columns,
    amostrasPorColuna: amostras,
    distribuicaoEquipe: contar(COL_EQUIPE),
    distribuicaoPredio: contar(COL_PREDIO),
    ativosResolvidos: ds.resolvidos,
    ativosNaoResolvidos: ds.naoResolvidos,
  };
}

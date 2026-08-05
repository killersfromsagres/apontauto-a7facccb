// Leitor de planilhas para o módulo Backorder de Corretivas.

import { classifyBackorder, CATEGORIA_TO_EQUIPE, type Categoria } from "./classify";
import { resolveAtivoTree, type AssetsMap } from "./assets";
import { toStatusCat, isCancelado, isConcluido, type StatusCat } from "./status";

export interface BackorderRow {
  os: string;
  nome: string;
  ativo: string;
  predio: string;
  andar: string;
  espaco: string;
  atividade: Categoria;
  equipe: string;
  /** Texto da COLUNA C — sugestão de equipe vinda da planilha (nem sempre correta). */
  equipe_hint: string;
  termino_sla: string | null;
  data_solicitacao: string; // ISO
  outros: string; // Solicitante (COLUNA E)
  centro_custo: string;
  criticidade: string; // Criticidade original da OS
  finalizado: boolean;
  /** OS cancelada / recusada na origem. */
  cancelado: boolean;
  /** Data de conclusão/cancelamento vinda da planilha (ISO) quando existir. */
  data_conclusao: string | null;
  status_origem: string;
  /** Categoria normalizada do status da COLUNA G. */
  status_cat: StatusCat;
  /** true quando o ativo não foi encontrado na base OU a classificação
   *  caiu no fallback ("Outros"). O card fica marcado para revisão. */
  revisao_manual: boolean;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Normalização "forte" — só letras e dígitos. Usada para casar
 *  cabeçalhos aproximados (ignora espaços, pontuação, plural etc.). */
const slug = (v: unknown) => norm(v).replace(/[^A-Z0-9]/g, "");

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  const byNorm = new Map<string, unknown>();
  const bySlug = new Map<string, unknown>();
  for (const k of Object.keys(row)) {
    byNorm.set(norm(k), row[k]);
    bySlug.set(slug(k), row[k]);
  }
  for (const k of keys) {
    const v = byNorm.get(norm(k)) ?? bySlug.get(slug(k));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  // Última tentativa: match por "contém" no slug (ex.: "NUMOS" contém "OS").
  for (const k of keys) {
    const target = slug(k);
    if (!target) continue;
    for (const [sk, sv] of bySlug) {
      if (sk.includes(target) && sv !== undefined && sv !== null && String(sv).trim() !== "") {
        return String(sv).trim();
      }
    }
  }
  return "";
}

function parseDateISO(v: string): string | null {
  if (!v) return null;
  const asNum = Number(v);
  if (!Number.isNaN(asNum) && asNum > 20000 && asNum < 80000) {
    const utcMs = Math.round((asNum - 25569) * 86400 * 1000);
    return new Date(utcMs).toISOString();
  }
  const br = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (br) {
    const [, d, m, y, hh, mm] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(year, Number(m) - 1, Number(d), Number(hh ?? 12), Number(mm ?? 0));
    return date.toISOString();
  }
  const iso = new Date(v);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  return null;
}

/** Heurística: escolhe a aba mais parecida com um "backorder" (tem
 *  colunas de Ativo + Descrição/Nome + OS). Cai para a primeira caso
 *  nenhuma bata os critérios. Ignora abas do tipo "ativos" (base de
 *  hierarquia) e planilhas resumo do tipo "plano". */
function pickBackorderSheet(wb: any, XLSX: any): string {
  const names: string[] = wb.SheetNames;
  let best = names[0];
  let bestScore = -1;
  for (const n of names) {
    const sn = norm(n);
    if (sn === "ATIVOS" || sn === "ATIVO") continue;
    if (sn.startsWith("PLANO")) continue;
    const ws = wb.Sheets[n];
    if (!ws || !ws["!ref"]) continue;
    const wsData = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, defval: "" }).slice(0, 10);
    const flat = norm(JSON.stringify(wsData));
    let score = 0;
    if (flat.includes("ATIVO")) score += 2;
    if (flat.includes("DESCRICAO OS") || flat.includes("DESCRICAO DA OS") || flat.includes("DESCRICAO")) score += 3;
    if (flat.includes("NUMERO OS") || flat.includes("NUMERO DA OS") || flat.includes("OS"))
      score += 2;
    if (flat.includes("SOLICITANTE") || flat.includes("DENOMINACAO DO SOLICITANTE")) score += 1;
    if (flat.includes("CRITICIDADE")) score += 1;
    if (flat.includes("STATUS")) score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = n;
    }
  }
  if (bestScore <= 0) {
    // Se nenhuma aba parece ser de backorder, tenta achar a maior aba que não seja Ativos
    let maxRows = -1;
    for (const n of names) {
      const sn = norm(n);
      if (sn === "ATIVOS" || sn === "ATIVO") continue;
      const ws = wb.Sheets[n];
      if (!ws || !ws["!ref"]) continue;
      const range = XLSX.utils.decode_range(ws["!ref"]);
      const rowCount = range.e.r - range.s.r;
      if (rowCount > maxRows) {
        maxRows = rowCount;
        best = n;
      }
    }
  }
  return best;
}

/** Extrai a árvore de ativos embutida no mesmo workbook (aba "ativos",
 *  "cadastro de ativos" etc.), se existir. Retorna [] quando ausente. */
function extractEmbeddedAssets(XLSX: typeof import("xlsx"), wb: any): AssetImportRow[] {
  const name = (wb.SheetNames as string[]).find((n) => {
    const s = norm(n);
    return (
      s === "ATIVOS" ||
      s === "ATIVO" ||
      s.includes("CADASTRO DE ATIVO") ||
      s.includes("ARVORE DE ATIVO")
    );
  });
  if (!name) return [];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: "" });
  const out: AssetImportRow[] = [];
  for (const r of raw) {
    const ativo = pick(r, "ATIVO", "CODIGO", "CÓDIGO", "TAG");
    if (!ativo) continue;
    const p = pick(r, "ATIVO PAI", "CODIGO PAI", "CÓDIGO PAI", "PAI");
    out.push({
      ativo: ativo.toUpperCase(),
      denominacao: pick(
        r,
        "DENOMINAÇÃO ATIVO",
        "DENOMINACAO ATIVO",
        "DENOMINAÇÃO",
        "DENOMINACAO",
        "NOME",
      ),
      nivel: pick(
        r,
        "DENOMINAÇÃO NÍVEL DE EMPRESA",
        "DENOMINACAO NIVEL DE EMPRESA",
        "NIVEL",
        "NÍVEL",
        "NIVEL DE EMPRESA",
      ),
      codigo_pai: p ? p.toUpperCase() : null,
      descricao_pai: pick(
        r,
        "DESCRIÇÃO ATIVO PAI",
        "DESCRICAO ATIVO PAI",
        "DESCRIÇÃO PAI",
        "DESCRICAO PAI",
      ),
      unidade_negocio: pick(
        r,
        "DENOMINAÇÃO UNIDADE NEGÓCIO",
        "DENOMINACAO UNIDADE NEGOCIO",
        "UNIDADE NEGOCIO",
        "UNIDADE",
      ),
    });
  }
  return out;
}

export interface BackorderReadResult {
  rows: BackorderRow[];
  /** Ativos extraídos do próprio arquivo (quando o workbook trouxe a
   *  aba `ativos` embutida). Vazio quando o arquivo é só a lista de
   *  chamados — nesse caso o motor usa apenas a base já persistida. */
  embeddedAssets: AssetImportRow[];
  sheetName: string;
}

export async function readBackorderFile(file: File, assets: AssetsMap): Promise<BackorderRow[]> {
  const r = await readBackorderWorkbook(file, assets);
  return r.rows;
}

/** Versão rica: além das linhas, devolve a lista de ativos embutida no
 *  próprio workbook (quando presente) para que o chamador possa hidratar
 *  a base `assets_ref` antes de resolver Prédio/Andar/Ambiente. */
export async function readBackorderWorkbook(
  file: File,
  assets: AssetsMap,
): Promise<BackorderReadResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  const embeddedAssets = extractEmbeddedAssets(XLSX, wb);
  // Se a planilha trouxe hierarquia embutida, fundimos com `assets` antes de resolver.
  const effective: AssetsMap = embeddedAssets.length
    ? (await import("./assets")).buildAssetsIndex([
        ...Array.from((assets as any).byCodigo?.values?.() ?? []).map((n: any) => ({
          ativo: n.codigo,
          denominacao: n.nome,
          nivel: n.nivel,
          codigo_pai: n.codigoPai,
        })),
        ...embeddedAssets,
      ])
    : assets;

  const sheetName = pickBackorderSheet(wb, XLSX);
  const sheet = wb.Sheets[sheetName];

  // Leitura posicional: a planilha oficial usa colunas fixas —
  // B = descrição do chamado, C = equipe sugerida, E = solicitante,
  // G = status da OS. Montamos os objetos manualmente para manter
  // tanto o acesso por cabeçalho (pick) quanto o acesso por índice.
  const COLS = Symbol.for("bo.cols");
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
  const notEmpty = (arr: unknown[]) =>
    Array.isArray(arr) && arr.some((c) => String(c ?? "").trim() !== "");
  const looksLikeHeader = (row: unknown[]) => {
    const cells = row.map(slug);
    const hasOs = cells.some((c) =>
      ["OS", "NUMEROOS", "NUMERODAOS", "NROOS", "CHAMADO", "ORDEMDESERVICO"].includes(c),
    );
    const hasDescription = cells.some((c) =>
      ["DESCRICAOOS", "DESCRICAODAOS", "DESCRICAO", "NOME"].includes(c),
    );
    return hasOs && hasDescription;
  };
  const detectedHeader = aoa.findIndex((r) => Array.isArray(r) && looksLikeHeader(r));
  const headerIdx =
    detectedHeader >= 0
      ? detectedHeader
      : Math.max(
          0,
          aoa.findIndex((r) => notEmpty(r)),
        );
  const header = (aoa[headerIdx] ?? []).map((h, i) => String(h ?? "").trim() || `COL${i}`);
  const raw: Record<string, unknown>[] = aoa
    .slice(headerIdx + 1)
    .filter(notEmpty)
    .map((arr) => {
      const obj: Record<string, unknown> = {};
      header.forEach((h, i) => {
        if (h && obj[h] === undefined) obj[h] = arr[i] ?? "";
      });
      Object.defineProperty(obj, COLS, { value: arr, enumerable: false });
      return obj;
    });

  const colAt = (r: Record<string, unknown>, i: number) => {
    const arr = (r as unknown as Record<symbol, unknown[]>)[COLS];
    return String(arr?.[i] ?? "").trim();
  };

  const out: BackorderRow[] = [];

  for (const r of raw) {
    const os = pick(
      r,
      "OS",
      "NUMERO OS",
      "NUMERO DA OS",
      "N OS",
      "NRO OS",
      "CHAMADO",
      "ORDEM DE SERVIÇO",
      "ORDEM DE SERVICO",
    );
    if (!os) continue;
    // COLUNA B — descrição real do chamado (nunca a coluna C, que traz a equipe).
    const descricao =
      colAt(r, 1) ||
      pick(
        r,
        "DESCRIÇÃO OS",
        "DESCRICAO OS",
        "DESCRICAO DA OS",
        "DESCRIÇÃO DA OS",
        "DESCRIÇÃO",
        "DESCRICAO",
        "NOME",
      );
    // COLUNA C — equipe sugerida pela planilha (usada só como pista).
    const equipeHint = colAt(r, 2);
    const categoriaOrig = pick(r, "CATEGORIA");
    const servico = pick(r, "SERVIÇO", "SERVICO", "TAREFA EXECUTADA");
    const ativo = pick(
      r,
      "ATIVO",
      "CODIGO DO ATIVO",
      "CÓDIGO DO ATIVO",
      "COD ATIVO",
      "COD. ATIVO",
      "TAG",
      "LOCAL DA INSTALAÇÃO",
      "LOCAL DA INSTALACAO",
    );
    // COLUNA D/E — solicitante e centro de custo
    const solicitanteVal = colAt(r, 3) || pick(r, "DENOMINACAO DO SOLICITANTE", "DENOMINACAO SOLICITANTE", "SOLICITANTE");
    const centroCusto = colAt(r, 4) || pick(r, "CENTRO DE CUSTO", "CC");
    
    // COLUNA F — data de abertura
    const aberturaVal = colAt(r, 5) || pick(r, "DATA ABERTURA", "DATA HORA SOLICITACAO", "DATA/HORA ABERTURA", "DATA HORA ABERTURA", "ABERTURA", "DATA SOLICITACAO");
    
    // COLUNA G — status
    const statusVal = colAt(r, 6) || pick(r, "STATUS", "SITUACAO");

    const conclusao = pick(
      r,
      "DATA/HORA CONCLUSÃO",
      "DATA HORA CONCLUSAO",
      "DATA CONCLUSÃO",
      "DATA CONCLUSAO",
      "DATA DE CONCLUSÃO",
      "DATA DE CONCLUSAO",
      "DATA ENCERRAMENTO",
      "DATA DE ENCERRAMENTO",
      "DATA FECHAMENTO",
      "DATA DE FECHAMENTO",
      "DATA/HORA FECHAMENTO",
      "DATA CANCELAMENTO",
      "DATA DE CANCELAMENTO",
      "DATA FINALIZAÇÃO",
      "DATA FINALIZACAO",
    );
    const abertura = pick(
      r,
      "DATA/HORA ABERTURA",
      "DATA HORA ABERTURA",
      "DATA ABERTURA",
      "DATA DE ABERTURA",
      "ABERTURA",
      "DATA/HORA SOLICITAÇÃO",
      "DATA HORA SOLICITACAO",
    );
    const sla = pick(
      r,
      "PRAZO SLA",
      "TERMINO SLA",
      "TÉRMINO SLA",
      "DATA LIMITE",
      "DATA PREVISTA MAXIMA",
      "DATA PREVISTA MÁXIMA",
    );

    const criticidade = pick(
      r,
      "CRITICIDADE",
      "PRIORIDADE",
      "NÍVEL DE CRITICIDADE",
      "NIVEL DE CRITICIDADE",
    );

    // Prédio / Andar / Ambiente vindos da planilha (fallback).
    const sheetPredio = pick(
      r,
      "PREDIO",
      "PRÉDIO",
      "PREDIO / AREA",
      "PRÉDIO / ÁREA",
      "AREA",
      "ÁREA",
    );
    const sheetAndar = pick(r, "ANDAR", "PAVIMENTO");
    const sheetEspaco = pick(r, "AMBIENTE", "ESPAÇO", "ESPACO", "LOCAL");

    const atividade = classifyBackorder({
      descricao,
      categoria: categoriaOrig,
      servico,
    });

    // A árvore de ativos é a fonte primária da localização exata
    // (prédio / andar / ambiente). A planilha só entra como fallback.
    const tree = resolveAtivoTree(effective, ativo);
    const predio = tree.predio || sheetPredio;
    const andar = tree.andar || sheetAndar;
    const espaco = tree.espaco || sheetEspaco;
    const found = tree.found || !!(sheetPredio || sheetAndar || sheetEspaco);

    const dataConclusao = parseDateISO(conclusao);
    const statusCat = toStatusCat(statusVal);
    const cancelado = isCancelado(statusCat);
    const finalizado = cancelado || isConcluido(statusCat);
    const revisao_manual = !finalizado && ((!!ativo && !found) || atividade === "Outros");

    out.push({
      os,
      nome: descricao || servico || "",
      ativo,
      predio,
      andar,
      espaco,
      centro_custo: centroCusto,
      atividade,
      equipe: CATEGORIA_TO_EQUIPE[atividade],
      equipe_hint: equipeHint,
      termino_sla: parseDateISO(sla),
      data_solicitacao: parseDateISO(aberturaVal) ?? new Date().toISOString(),
      outros: solicitanteVal,
      criticidade,
      finalizado,
      cancelado,
      data_conclusao: dataConclusao,
      status_origem: statusVal,
      status_cat: statusCat,
      revisao_manual,
    });
  }

  return { rows: out, embeddedAssets, sheetName };
}

export interface AssetImportRow {
  ativo: string;
  denominacao: string;
  nivel: string;
  codigo_pai: string | null;
  descricao_pai: string;
  unidade_negocio: string;
}

export async function readAssetsFile(file: File): Promise<AssetImportRow[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  // Preferir aba chamada "ativos" — cai na primeira caso não exista.
  const name = wb.SheetNames.find((n) => norm(n).includes("ATIVO")) ?? wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: "" });
  const out: AssetImportRow[] = [];
  for (const r of raw) {
    const ativo = pick(r, "ATIVO", "CODIGO", "CÓDIGO", "TAG");
    const denominacao = pick(
      r,
      "DENOMINAÇÃO ATIVO",
      "DENOMINACAO ATIVO",
      "DENOMINAÇÃO",
      "DENOMINACAO",
      "NOME",
      "DESCRIÇÃO",
      "DESCRICAO",
    );
    const nivel = pick(
      r,
      "DENOMINAÇÃO NÍVEL DE EMPRESA",
      "DENOMINACAO NIVEL DE EMPRESA",
      "NIVEL",
      "NÍVEL",
      "NIVEL DE EMPRESA",
    );
    const pai = pick(r, "ATIVO PAI", "CODIGO PAI", "CÓDIGO PAI", "PAI");
    const descPai = pick(
      r,
      "DESCRIÇÃO ATIVO PAI",
      "DESCRICAO ATIVO PAI",
      "DESCRIÇÃO PAI",
      "DESCRICAO PAI",
    );
    const unidade = pick(
      r,
      "DENOMINAÇÃO UNIDADE NEGÓCIO",
      "DENOMINACAO UNIDADE NEGOCIO",
      "UNIDADE NEGOCIO",
      "UNIDADE",
    );
    if (!ativo) continue;
    out.push({
      ativo: ativo.toUpperCase(),
      denominacao,
      nivel,
      codigo_pai: pai ? pai.toUpperCase() : null,
      descricao_pai: descPai,
      unidade_negocio: unidade,
    });
  }
  return out;
}

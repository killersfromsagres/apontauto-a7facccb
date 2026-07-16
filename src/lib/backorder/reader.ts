// Leitura de planilha XLSX de Backorder.
// Retorna linhas normalizadas prontas para upsert.

import { classifyAtividade, type Atividade } from "./classify";

export interface BackorderImportRow {
  os: string;
  nome: string;
  ativo: string;
  equipe: string;
  termino_sla: string | null; // ISO
  data_solicitacao: string;   // ISO (obrigatório)
  outros: string;
  atividade_auto: Atividade;
}

export interface BackorderImportResult {
  rows: BackorderImportRow[];
  ignoradasSemOS: number;
  ignoradasSemData: number;
}

const norm = (v: unknown) =>
  String(v ?? "").trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  const map = new Map<string, unknown>();
  for (const k of Object.keys(row)) map.set(norm(k), row[k]);
  for (const k of keys) {
    const v = map.get(norm(k));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

function parseDate(v: string): string | null {
  if (!v) return null;
  const asNum = Number(v);
  if (!Number.isNaN(asNum) && asNum > 20000 && asNum < 80000) {
    const utcMs = Math.round((asNum - 25569) * 86400 * 1000);
    const u = new Date(utcMs);
    return new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), 12).toISOString();
  }
  const br = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (br) {
    const [, d, m, y, hh, mm] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return new Date(year, Number(m) - 1, Number(d), Number(hh ?? 12), Number(mm ?? 0)).toISOString();
  }
  const iso = new Date(v);
  if (!Number.isNaN(iso.getTime())) return iso.toISOString();
  return null;
}

export async function readBackorderFile(file: File): Promise<BackorderImportResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => norm(n).includes("BACKORDER") || norm(n).includes("CORRETIV")) ??
    wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: "",
  });

  const rows: BackorderImportRow[] = [];
  let ignoradasSemOS = 0;
  let ignoradasSemData = 0;

  for (const r of raw) {
    const os = pick(r, "OS", "ORDEM DE SERVIÇO", "ORDEM DE SERVICO", "NUMERO OS", "NÚMERO OS");
    if (!os) {
      ignoradasSemOS++;
      continue;
    }
    const dataRaw = pick(
      r,
      "DATA SOLICITAÇÃO", "DATA SOLICITACAO", "DATA DE SOLICITAÇÃO", "DATA DE SOLICITACAO",
      "INICIO SLA", "INÍCIO SLA", "ABERTURA", "DATA ABERTURA", "DATA DE ABERTURA",
    );
    const dataISO = parseDate(dataRaw);
    if (!dataISO) {
      ignoradasSemData++;
      continue;
    }
    const nome = pick(r, "NOME OS", "NOME", "DESCRIÇÃO OS", "DESCRICAO OS", "DESCRIÇÃO", "DESCRICAO");
    const ativo = pick(r, "ATIVO", "TAG", "CÓDIGO ATIVO", "CODIGO ATIVO");
    const equipe = pick(r, "EQUIPE", "TIME", "GRUPO");
    const terminoSla = parseDate(
      pick(r, "TERMINO SLA", "TÉRMINO SLA", "DATA LIMITE", "PRAZO", "VENCIMENTO SLA"),
    );
    const outros = pick(r, "OUTROS", "CRITICIDADE", "OBSERVAÇÃO", "OBSERVACAO", "SOLICITANTE");

    rows.push({
      os,
      nome,
      ativo,
      equipe,
      termino_sla: terminoSla,
      data_solicitacao: dataISO,
      outros,
      atividade_auto: classifyAtividade(nome),
    });
  }

  return { rows, ignoradasSemOS, ignoradasSemData };
}

export async function readAssetsRefFile(file: File): Promise<
  { ativo: string; denominacao: string }[]
> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheetName =
    wb.SheetNames.find((n) => norm(n).includes("ATIVO")) ?? wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: "",
  });
  const out: { ativo: string; denominacao: string }[] = [];
  for (const r of raw) {
    const ativo = pick(r, "ATIVO", "CÓDIGO", "CODIGO", "TAG");
    if (!ativo) continue;
    const denominacao = pick(r, "DENOMINAÇÃO ATIVO", "DENOMINACAO ATIVO", "DENOMINAÇÃO", "DENOMINACAO", "DESCRIÇÃO", "DESCRICAO", "NOME");
    out.push({ ativo, denominacao });
  }
  return out;
}

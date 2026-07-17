// Leitor de planilhas para o módulo Backorder de Corretivas.

import { classifyBackorder, CATEGORIA_TO_EQUIPE, type Categoria } from "./classify";
import { resolveAtivo, type AssetsMap } from "./assets";

export interface BackorderRow {
  os: string;
  nome: string;
  ativo: string;
  predio: string;
  andar: string;
  espaco: string;
  atividade: Categoria;
  equipe: string;
  termino_sla: string | null;
  data_solicitacao: string; // ISO
  outros: string; // Solicitante (Denominação do Solicitante)
  criticidade: string; // Criticidade original da OS
  finalizado: boolean;
  status_origem: string;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  const map = new Map<string, unknown>();
  for (const k of Object.keys(row)) map.set(norm(k), row[k]);
  for (const k of keys) {
    const v = map.get(norm(k));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
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
  const br = v.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2}))?/);
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

export async function readBackorderFile(file: File, assets: AssetsMap): Promise<BackorderRow[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const out: BackorderRow[] = [];
  for (const r of raw) {
    const os = pick(r, "OS", "CHAMADO", "ORDEM DE SERVIÇO", "ORDEM DE SERVICO");
    if (!os) continue;
    const descricao = pick(r, "DESCRIÇÃO OS", "DESCRICAO OS", "DESCRIÇÃO", "DESCRICAO", "NOME");
    const categoriaOrig = pick(r, "CATEGORIA");
    const servico = pick(r, "SERVIÇO", "SERVICO");
    const ativo = pick(r, "ATIVO");
    const status = pick(r, "STATUS RESUMIDO", "STATUS");
    const abertura = pick(r, "DATA/HORA ABERTURA", "DATA ABERTURA", "ABERTURA");
    const sla = pick(r, "PRAZO SLA", "TERMINO SLA", "TÉRMINO SLA", "DATA LIMITE");
    const solicitante = pick(
      r,
      "DENOMINAÇÃO DO SOLICITANTE",
      "DENOMINACAO DO SOLICITANTE",
      "SOLICITANTE",
      "NOME DO SOLICITANTE",
    );
    const criticidade = pick(r, "CRITICIDADE", "PRIORIDADE", "NÍVEL DE CRITICIDADE", "NIVEL DE CRITICIDADE");

    const atividade = classifyBackorder({
      descricao,
      categoria: categoriaOrig,
      servico,
    });

    const { predio, andar, espaco } = resolveAtivo(assets, ativo);
    const finalizado = /FINAL|CONCLU|ENCERR/.test(norm(status));

    out.push({
      os,
      nome: descricao || servico || "",
      ativo,
      predio,
      andar,
      espaco,
      atividade,
      equipe: CATEGORIA_TO_EQUIPE[atividade],
      termino_sla: parseDateISO(sla),
      data_solicitacao: parseDateISO(abertura) ?? new Date().toISOString(),
      outros: solicitante,
      criticidade,
      finalizado,
      status_origem: status,
    });

  }
  return out;
}

export async function readAssetsFile(file: File): Promise<Array<{ ativo: string; denominacao: string }>> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  // Preferir aba chamada "ativos" — cai na primeira caso não exista.
  const name = wb.SheetNames.find((n) => norm(n).includes("ATIVO")) ?? wb.SheetNames[0];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[name], { defval: "" });
  const out: Array<{ ativo: string; denominacao: string }> = [];
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
    if (!ativo) continue;
    out.push({ ativo: ativo.toUpperCase(), denominacao });
  }
  return out;
}

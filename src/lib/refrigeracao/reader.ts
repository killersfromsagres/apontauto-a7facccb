// Leitura da planilha .xlsx do módulo Refrigeração.
// Cabeçalhos esperados (case/acento insensível, tolera pequenas variações):
//   Ordem de Serviço · Nome OS · Prédio · Andar · Local · Tipo · Equipe
//   Data SLA · Data Programada · Início · Fim · Ativo · Equipamento

import { autoAssignEquipes } from "./auto-equipe";


export type RefrigOsImport = {
  numero_os: string;
  nome_os: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  tipo: string | null;
  equipe: string | null;
  data_sla: string | null;
  data_programada: string | null;
  inicio: string | null;
  fim: string | null;
  ativo: string;
  equipamento: string;
};

const norm = (s: unknown) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");

const HEADER_ALIASES: Record<keyof RefrigOsImport, string[]> = {
  numero_os: ["ordemdeservico", "os", "numeroos", "nos", "ordemservico"],
  nome_os: ["nomeos", "nome", "descricao", "descricaoos"],
  predio: ["predio", "edificio"],
  andar: ["andar", "pavimento"],
  local: ["local", "localizacao", "sala"],
  tipo: ["tipo", "tipoos", "tipomanutencao"],
  equipe: ["equipe", "time", "responsavel"],
  data_sla: ["datasla", "sla", "prazosla"],
  data_programada: ["dataprogramada", "programada", "dataprevista"],
  inicio: ["inicio", "datainicio", "dtinicio"],
  fim: ["fim", "datafim", "dtfim", "termino", "conclusao"],
  ativo: ["ativo", "tag", "codigoativo"],
  equipamento: ["equipamento", "descricaoequip", "descequipamento"],
};

function excelSerialToDate(n: number): Date | null {
  if (!Number.isFinite(n) || n < 20000 || n > 90000) return null;
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number") return excelSerialToDate(v);
  const s = String(v).trim();
  const asNum = Number(s);
  if (!Number.isNaN(asNum)) {
    const d = excelSerialToDate(asNum);
    if (d) return d;
  }
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (br) {
    const [, d, m, y, hh, mm, ss] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    return new Date(
      year,
      Number(m) - 1,
      Number(d),
      hh ? Number(hh) : 0,
      mm ? Number(mm) : 0,
      ss ? Number(ss) : 0,
    );
  }
  const iso = new Date(s);
  return Number.isNaN(iso.getTime()) ? null : iso;
}

function toISODate(d: Date | null): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toISODateTime(d: Date | null): string | null {
  if (!d) return null;
  return d.toISOString();
}

export async function readRefrigOsFile(file: File): Promise<RefrigOsImport[]> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error("Planilha vazia.");
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  if (rows.length === 0) return [];

  // Mapeia cada header do arquivo para uma chave do RefrigOsImport
  const firstRow = rows[0];
  const headerMap = new Map<string, keyof RefrigOsImport>();
  for (const rawKey of Object.keys(firstRow)) {
    const nk = norm(rawKey);
    for (const [target, aliases] of Object.entries(HEADER_ALIASES) as [
      keyof RefrigOsImport,
      string[],
    ][]) {
      if (aliases.some((a) => nk === a || nk.startsWith(a))) {
        headerMap.set(rawKey, target);
        break;
      }
    }
  }

  const required: (keyof RefrigOsImport)[] = ["numero_os", "ativo", "equipamento"];
  const present = new Set(headerMap.values());
  const missing = required.filter((r) => !present.has(r));
  if (missing.length) {
    throw new Error(
      `Colunas obrigatórias ausentes: ${missing.join(", ")}. Cabeçalhos esperados: Ordem de Serviço, Ativo, Equipamento.`,
    );
  }

  const out: RefrigOsImport[] = [];
  for (const r of rows) {
    const rec: Partial<RefrigOsImport> = {};
    for (const [rawKey, target] of headerMap) {
      const raw = r[rawKey];
      const val = raw === "" || raw == null ? null : String(raw).trim();
      if (target === "data_sla" || target === "data_programada") {
        rec[target] = toISODate(parseDate(raw));
      } else if (target === "inicio" || target === "fim") {
        rec[target] = toISODateTime(parseDate(raw));
      } else {
        (rec as any)[target] = val || null;
      }
    }
    const numero = (rec.numero_os ?? "").toString().trim();
    const ativo = (rec.ativo ?? "").toString().trim();
    const equipamento = (rec.equipamento ?? "").toString().trim();
    if (!numero || !ativo || !equipamento) continue;
    out.push({
      numero_os: numero,
      nome_os: rec.nome_os ?? null,
      predio: rec.predio ?? null,
      andar: rec.andar ?? null,
      local: rec.local ?? null,
      tipo: rec.tipo ?? null,
      equipe: rec.equipe ?? null,
      data_sla: rec.data_sla ?? null,
      data_programada: rec.data_programada ?? null,
      inicio: rec.inicio ?? null,
      fim: rec.fim ?? null,
      ativo,
      equipamento,
    });
  }

  // Dedup por numero_os (mantém a última ocorrência)
  const map = new Map<string, RefrigOsImport>();
  for (const r of out) map.set(r.numero_os, r);
  // Separa automaticamente entre as 3 equipes de Refrigeração
  return autoAssignEquipes(Array.from(map.values()));
}

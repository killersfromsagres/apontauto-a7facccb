// Parser genérico para planilhas de chamados (Backorder ou Preventiva).
// Reconhece automaticamente as colunas presentes e mapeia para um shape
// unificado usado no dashboard.

export interface ChamadoRow {
  os: string;
  descricao: string;
  categoria: string; // Categoria / Atividade
  equipe: string; // Derivado de categoria
  criticidade: string; // Alta / Média / Baixa (normalizado)
  criticidadeOriginal: string;
  status: string;
  statusNorm: "aberto" | "andamento" | "concluido" | "outros";
  solicitante: string;
  predio: string;
  andar: string;
  local: string;
  ativo: string;
  equipamento: string;
  dataAbertura: string | null; // ISO
  dataAberturaTs: number | null;
  dataLimite: string | null; // ISO (SLA)
  dataLimiteTs: number | null;
  dataConclusao: string | null;
  origem: "backorder" | "preventiva" | "generico";
}

export interface ParseResult {
  rows: ChamadoRow[];
  origem: "backorder" | "preventiva" | "generico";
  totalLidas: number;
  descartadas: number;
  arquivo: string;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const slug = (v: unknown) => norm(v).replace(/[^A-Z0-9]/g, "");

function pick(row: Record<string, unknown>, ...keys: string[]): string {
  const bySlug = new Map<string, unknown>();
  for (const k of Object.keys(row)) bySlug.set(slug(k), row[k]);
  for (const k of keys) {
    const v = bySlug.get(slug(k));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  for (const k of keys) {
    const t = slug(k);
    if (!t) continue;
    for (const [sk, sv] of bySlug) {
      if (sk.includes(t) && sv !== undefined && sv !== null && String(sv).trim() !== "") {
        return String(sv).trim();
      }
    }
  }
  return "";
}

function parseDate(v: string): { iso: string | null; ts: number | null } {
  if (!v) return { iso: null, ts: null };
  const asNum = Number(v);
  if (!Number.isNaN(asNum) && asNum > 20000 && asNum < 80000) {
    const utcMs = Math.round((asNum - 25569) * 86400 * 1000);
    const d = new Date(utcMs);
    return { iso: d.toISOString(), ts: d.getTime() };
  }
  const br = v.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})(?:[ T](\d{1,2}):(\d{1,2}))?/);
  if (br) {
    const [, d, m, y, hh, mm] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(year, Number(m) - 1, Number(d), Number(hh ?? 12), Number(mm ?? 0));
    return { iso: date.toISOString(), ts: date.getTime() };
  }
  const iso = new Date(v);
  if (!Number.isNaN(iso.getTime())) return { iso: iso.toISOString(), ts: iso.getTime() };
  return { iso: null, ts: null };
}

function detectCategoria(raw: string): string {
  const n = norm(raw);
  if (!n) return "OUTROS";
  if (n.includes("ABASTEC")) return "ABASTECIMENTO";
  if (n.includes("CLIMAT") || n.includes("REFRIG") || n.includes("AR CONDIC"))
    return "CLIMATIZAÇÃO";
  if (n.includes("ELETR")) return "ELÉTRICA";
  if (n.includes("JARDIN") || n.includes("PAISAG")) return "JARDINAGEM";
  if (n.includes("LIMPEZ")) return "LIMPEZA";
  if (n.includes("HIDR")) return "HIDRÁULICA";
  if (n.includes("CHAVE")) return "CHAVEIRO";
  if (n.includes("CIVIL")) return "CIVIL";
  return n;
}

function categoriaToEquipe(cat: string): string {
  const c = norm(cat);
  if (c.includes("CLIMAT") || c.includes("REFRIG")) return "Refrigeração";
  if (c.includes("ELETR")) return "Elétrica";
  if (c.includes("HIDR")) return "Hidráulica";
  if (c.includes("CIVIL")) return "Civil";
  if (c.includes("CHAVE")) return "Chaveiro";
  if (c.includes("JARDIN") || c.includes("PAISAG")) return "Jardinagem";
  if (c.includes("LIMPEZ")) return "Limpeza";
  if (c.includes("ABASTEC")) return "Abastecimento";
  return "Outros";
}

function normalizeCriticidade(raw: string): string {
  const n = norm(raw);
  if (!n) return "NÃO INFORMADA";
  if (n.includes("ALTA") || n.includes("URGE") || n.includes("CRITIC")) return "ALTA";
  if (n.includes("MED") || n.includes("MOD")) return "MÉDIA";
  if (n.includes("BAIX")) return "BAIXA";
  return n;
}

function normalizeStatus(raw: string): ChamadoRow["statusNorm"] {
  const n = norm(raw);
  if (!n) return "outros";
  if (/CONCLU|FINAL|ENCERR|FECHAD/.test(n)) return "concluido";
  if (/ANDAM|EXECU|PROGR|ATEND/.test(n)) return "andamento";
  if (/ABERT|PENDEN|AGUARD|NOV/.test(n)) return "aberto";
  return "outros";
}

export async function parseChamadosFile(file: File): Promise<ParseResult> {
  const XLSX = await import("xlsx");
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  // Prefere aba com "preventiv" ou "backorder" ou "chamado", senão a primeira.
  const preferred =
    wb.SheetNames.find((n) => /PREVENTIV|BACKORDER|CHAMADO|OS/.test(norm(n))) ??
    wb.SheetNames[0];
  const sheet = wb.Sheets[preferred];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

  const rows: ChamadoRow[] = [];
  let descartadas = 0;

  // Detecta origem por presença de colunas.
  const firstKeys = raw.length > 0 ? Object.keys(raw[0]).map(slug).join("|") : "";
  const isPrev = /PREVENT|TIPOOS|INICIOSLA/.test(firstKeys);
  const isBack = /BACKORDER|TERMINOSLA|PRAZOSLA/.test(firstKeys);
  const origem: ParseResult["origem"] = isPrev ? "preventiva" : isBack ? "backorder" : "generico";

  for (const r of raw) {
    const os = pick(r, "OS", "NUMEROOS", "ORDEMDESERVICO", "CHAMADO");
    if (!os) {
      descartadas++;
      continue;
    }
    const descricao = pick(r, "DESCRIÇÃOOS", "DESCRICAO", "NOMEOS", "NOME");
    const catRaw = pick(r, "CATEGORIA", "SERVICO", "ATIVIDADE");
    const categoria = detectCategoria(catRaw);
    const equipe = categoriaToEquipe(categoria);
    const critRaw = pick(r, "CRITICIDADE", "PRIORIDADE");
    const status = pick(r, "STATUSRESUMIDO", "STATUS");
    const solicitante = pick(
      r,
      "DENOMINACAODOSOLICITANTE",
      "SOLICITANTE",
      "NOMEDOSOLICITANTE",
      "REQUISITANTE",
    );
    const abertura = pick(r, "DATAHORAABERTURA", "DATAABERTURA", "ABERTURA", "INICIOSLA");
    const limite = pick(r, "TERMINOSLA", "PRAZOSLA", "DATALIMITE", "DATAPREVISTAMAXIMA");
    const conclusao = pick(r, "DATACONCLUSAO", "DATASTATUS");
    const predio = pick(r, "PREDIO");
    const andar = pick(r, "ANDAR");
    const local = pick(r, "LOCAL", "ESPACO");
    const ativo = pick(r, "ATIVO", "TAG", "CODIGODOATIVO");
    const equipamento = pick(r, "EQUIPAMENTO");

    const ab = parseDate(abertura);
    const lm = parseDate(limite);
    const cc = parseDate(conclusao);

    rows.push({
      os,
      descricao,
      categoria,
      equipe,
      criticidade: normalizeCriticidade(critRaw),
      criticidadeOriginal: critRaw,
      status,
      statusNorm: normalizeStatus(status),
      solicitante: solicitante || "NÃO INFORMADO",
      predio,
      andar,
      local,
      ativo,
      equipamento,
      dataAbertura: ab.iso,
      dataAberturaTs: ab.ts,
      dataLimite: lm.iso,
      dataLimiteTs: lm.ts,
      dataConclusao: cc.iso,
      origem,
    });
  }

  return {
    rows,
    origem,
    totalLidas: rows.length,
    descartadas,
    arquivo: file.name,
  };
}

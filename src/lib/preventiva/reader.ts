// Multi-file XLSX reader + classification by REAL Categoria column.
// Ignora nome do arquivo — reclassifica linha a linha.

export type Categoria =
  | "CIVIL"
  | "CLIMATIZAÇÃO E REFRIGERAÇÃO"
  | "ELÉTRICA"
  | "ABASTECIMENTO"
  | "LIMPEZA"
  | "JARDINAGEM E PAISAGISMO"
  | "OUTROS";

export interface RawRow {
  arquivo: string;
  os: string;
  chamado: string;
  tipo: string;
  nomeOS: string;
  descricao: string;
  categoria: Categoria;
  criticidade: string;
  unidadeNegocio: string;
  ativo: string;
  solicitante: string;
  inicioSLA: string;
  dataLimite: string;
  dataPrevistaMaxima: string;
  status: string;
  dataStatus: string;
  site: string;
  predio: string;
  andar: string;
  local: string;
  equipamento: string;
  terminoSLA: string;
  terminoSLATs: number;
  dataConclusao: string;
  raw: Record<string, unknown>;
}

export interface FileAlert {
  arquivo: string;
  esperado: Categoria | null;
  real: Categoria;
  percentual: number;
}

export interface AtivoIndexEntry {
  ativo: string;
  equipamento: string;
}

export interface ReadResult {
  rows: RawRow[];
  discartadasSite: number;
  discartadasVazias: number;
  alerts: FileAlert[];
  ativoIndex: Map<string, AtivoIndexEntry>;
  porCategoria: Record<Categoria, number>;
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

function detectCategoria(raw: string): Categoria {
  const n = norm(raw);
  if (!n) return "OUTROS";
  if (n.includes("ABASTEC")) return "ABASTECIMENTO";
  if (n.includes("CLIMAT") || n.includes("REFRIG") || n.includes("AR CONDIC") || n.includes("AC") || n.includes("FANCOIL") || n.includes("SPLIT"))
    return "CLIMATIZAÇÃO E REFRIGERAÇÃO";
  if (n.includes("ELETR") || n.includes("SUBEST") || n.includes("GERADOR") || n.includes("PAINEL")) return "ELÉTRICA";
  if (n.includes("JARDIN") || n.includes("PAISAG")) return "JARDINAGEM E PAISAGISMO";
  if (n.includes("LIMPEZ")) return "LIMPEZA";
  if (n.includes("CIVIL") || n.includes("CHAVE") || n.includes("HIDR") || n.includes("PINTURA") || n.includes("ALVENARIA") || n.includes("TELHADO")) return "CIVIL";
  if (n.includes("OUTRO") || n.includes("DIVERSOS")) return "OUTROS";
  return "OUTROS";
}

function guessCategoriaFromFilename(name: string): Categoria | null {
  const n = norm(name);
  if (n.includes("ABASTEC")) return "ABASTECIMENTO";
  if (n.includes("CLIMAT") || n.includes("REFRIG")) return "CLIMATIZAÇÃO E REFRIGERAÇÃO";
  if (n.includes("ELETR")) return "ELÉTRICA";
  if (n.includes("JARDIN") || n.includes("PAISAG")) return "JARDINAGEM E PAISAGISMO";
  if (n.includes("LIMPEZ")) return "LIMPEZA";
  if (n.includes("CIVIL") || n.includes("CHAVE") || n.includes("HIDR")) return "CIVIL";
  return null;
}

function parseDate(v: string): { iso: string; ts: number } {
  if (!v) return { iso: "", ts: Number.MAX_SAFE_INTEGER };
  const asNum = Number(v);
  if (!Number.isNaN(asNum) && asNum > 20000 && asNum < 80000) {
    const utcMs = Math.round((asNum - 25569) * 86400 * 1000);
    const u = new Date(utcMs);
    const d = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), 12, 0, 0);
    return { iso: d.toISOString(), ts: d.getTime() };
  }
  const br = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (br) {
    const [, d, m, y] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(year, Number(m) - 1, Number(d), 12, 0, 0);
    return { iso: date.toISOString(), ts: date.getTime() };
  }
  const iso = new Date(v);
  if (!Number.isNaN(iso.getTime())) return { iso: iso.toISOString(), ts: iso.getTime() };
  return { iso: v, ts: Number.MAX_SAFE_INTEGER };
}

function ativoKey(predio: string, andar: string, local: string): string {
  return `${norm(predio)}|${norm(andar)}|${norm(local)}`;
}

export async function readPreventivaFiles(files: File[]): Promise<ReadResult> {
  const XLSX = await import("xlsx");
  const rows: RawRow[] = [];
  const alerts: FileAlert[] = [];
  const ativoIndex = new Map<string, AtivoIndexEntry>();
  let discartadasSite = 0;
  let discartadasVazias = 0;

  for (const file of files) {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });

    // Aba PREVENTIVAS ou primeira aba
    const mainSheetName =
      wb.SheetNames.find((n) => norm(n).includes("PREVENTIV")) ?? wb.SheetNames[0];
    const mainSheet = wb.Sheets[mainSheetName];
    const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(mainSheet, { defval: "" });

    const fileRows: RawRow[] = [];
    const catCount = new Map<Categoria, number>();

    for (const r of raw) {
      const os = pick(r, "OS", "ORDEM DE SERVIÇO", "ORDEM DE SERVICO", "ID OS", "NÚMERO OS", "NUMERO OS");
      if (!os) {
        discartadasVazias++;
        continue;
      }
      const site = pick(r, "SITE", "UNIDADE");
      if (site && !norm(site).includes("DEMARCHI")) {
        discartadasSite++;
        continue;
      }
      const categoriaRaw = pick(r, "CATEGORIA", "CATEGORY");
      const categoria = detectCategoria(categoriaRaw || file.name);
      const terminoSLARaw = pick(r, "TERMINO SLA", "TÉRMINO SLA", "TERMINO_SLA", "DATA LIMITE");
      const tSLA = parseDate(terminoSLARaw);
      const row: RawRow = {
        arquivo: file.name,
        os,
        chamado: pick(r, "CHAMADO PRISMA", "CHAMADO"),
        tipo: pick(r, "TIPO"),
        nomeOS: pick(r, "NOME OS", "NOME_OS"),
        descricao: pick(r, "DESCRIÇÃO OS", "DESCRICAO OS", "DESCRIÇÃO", "DESCRICAO"),
        categoria,
        criticidade: pick(r, "CRITICIDADE"),
        unidadeNegocio: pick(r, "UNIDADE DE NEGOCIO", "UNIDADE DE NEGÓCIO"),
        ativo: pick(r, "ATIVO"),
        solicitante: pick(r, "SOLICITANTE"),
        inicioSLA: pick(r, "INICIO SLA", "INÍCIO SLA"),
        dataLimite: pick(r, "DATA LIMITE"),
        dataPrevistaMaxima: pick(r, "DATA PREVISTA MAXIMA", "DATA PREVISTA MÁXIMA"),
        status: pick(r, "STATUS"),
        dataStatus: pick(r, "DATA STATUS"),
        site: site || "DEMARCHI",
        predio: pick(r, "PRÉDIO", "PREDIO"),
        andar: pick(r, "ANDAR"),
        local: pick(r, "LOCAL"),
        equipamento: pick(r, "EQUIPAMENTO"),
        terminoSLA: tSLA.iso,
        terminoSLATs: tSLA.ts,
        dataConclusao: pick(r, "DATA CONCLUSÃO", "DATA CONCLUSAO"),
        raw: r,
      };
      fileRows.push(row);
      catCount.set(categoria, (catCount.get(categoria) ?? 0) + 1);
    }

    // Detectar arquivo trocado
    const esperado = guessCategoriaFromFilename(file.name);
    if (esperado && fileRows.length > 0) {
      const real = [...catCount.entries()].sort((a, b) => b[1] - a[1])[0];
      if (real && real[0] !== esperado) {
        const pct = real[1] / fileRows.length;
        if (pct >= 0.9) {
          alerts.push({
            arquivo: file.name,
            esperado,
            real: real[0],
            percentual: pct,
          });
        }
      }
    }

    rows.push(...fileRows);

    // Aba "Ativos e Equipamentos"
    const ativosSheetName = wb.SheetNames.find(
      (n) => norm(n).includes("ATIVOS") && norm(n).includes("EQUIP"),
    );
    if (ativosSheetName) {
      const ativosRaw = XLSX.utils.sheet_to_json<Record<string, unknown>>(
        wb.Sheets[ativosSheetName],
        { defval: "" },
      );
      for (const a of ativosRaw) {
        const predio = pick(a, "PRÉDIO", "PREDIO");
        const andar = pick(a, "ANDAR");
        const local = pick(a, "LOCAL");
        const ativo = pick(a, "ATIVO", "TAG");
        const equipamento = pick(a, "EQUIPAMENTO", "EQUIP");
        if (!predio && !ativo && !equipamento) continue;
        const key = ativoKey(predio, andar, local);
        if (!ativoIndex.has(key)) {
          ativoIndex.set(key, { ativo, equipamento });
        }
      }
    }
  }

  const porCategoria: Record<Categoria, number> = {
    CIVIL: 0,
    "CLIMATIZAÇÃO E REFRIGERAÇÃO": 0,
    ELÉTRICA: 0,
    ABASTECIMENTO: 0,
    LIMPEZA: 0,
    "JARDINAGEM E PAISAGISMO": 0,
    OUTROS: 0,
  };
  for (const r of rows) porCategoria[r.categoria]++;

  return { rows, discartadasSite, discartadasVazias, alerts, ativoIndex, porCategoria };
}

export function lookupAtivo(
  index: Map<string, AtivoIndexEntry>,
  predio: string,
  andar: string,
  local: string,
): string {
  const hit = index.get(ativoKey(predio, andar, local));
  if (hit) return hit.ativo || hit.equipamento || "";
  // fallback: só prédio+local
  for (const [k, v] of index) {
    if (k.startsWith(`${norm(predio)}|`) && k.endsWith(`|${norm(local)}`)) {
      return v.ativo || v.equipamento || "";
    }
  }
  return "";
}

export function lookupAtivoEntry(
  index: Map<string, AtivoIndexEntry>,
  predio: string,
  andar: string,
  local: string,
): AtivoIndexEntry | null {
  const hit = index.get(ativoKey(predio, andar, local));
  if (hit) return hit;
  for (const [k, v] of index) {
    if (k.startsWith(`${norm(predio)}|`) && k.endsWith(`|${norm(local)}`)) {
      return v;
    }
  }
  return null;
}

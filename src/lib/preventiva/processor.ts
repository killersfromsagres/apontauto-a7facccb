// Pure processing logic for the Preventiva module.
// No UI imports here — testable in isolation.

export type RawRow = Record<string, unknown>;

export type Category =
  | "Abastecimento"
  | "Civil"
  | "Climatização e Refrigeração"
  | "Elétrica"
  | "Jardinagem e Paisagismo"
  | "Limpeza"
  | "Outros Serviços";

export type Team =
  | "Civil"
  | "Chaveiro"
  | "Hidráulica"
  | "Elétrica"
  | "Refrigeração 1"
  | "Refrigeração 2"
  | "Refrigeração 3"
  | "Abastecimento"
  | "Limpeza"
  | "Jardinagem"
  | "Outros";

export interface ProcessedOS {
  ordemServico: string;
  nomeOS: string;
  predio: string;
  andar: string;
  local: string;
  tipo: "Preventiva" | "Corretiva";
  equipe: Team;
  dataSLA: string; // ISO
  slaTimestamp: number;
  ativo: string;
  equipamento: string;
  categoria: Category;
  site: string;
}

// ---------- Config ----------

export const SITE_ALLOWED = "DEMARCHI";

const HIDRAULICA_KEYWORDS = [
  "caixa pluvial",
  "caixas pluviais",
  "fluente",
  "fluentes",
  "canaleta",
  "canaletas",
  "tubulação",
  "tubulacao",
  "tubulações",
  "tubulacoes",
  "limpeza de calha",
  "limpeza de calhas",
  "grelha",
  "grelhas",
  "ralo",
  "ralos",
  "boca de lobo",
  "bocas de lobo",
];

export const REFRIG_1 = ["A160", "A170", "ADC", "AMBULATÓRIO", "AMBULATORIO", "B203"];
export const REFRIG_2 = [
  "A220","B115","B290","C110","C120","C340","C380","C45","C46","C49","C65","C70",
  "D240","D246",
];
export const REFRIG_3 = [
  "D270","D295","D345","D55","E105","E125","E130","E171","E200","E310","E35","E70","E80",
  "F30","FUNDAÇÃO ECO+","FUNDACAO ECO+","Z210","Z310","Z500",
];

export const TEAM_COLORS: Record<Team, string> = {
  Civil: "#2563EB",
  Chaveiro: "#EAB308",
  Hidráulica: "#F97316",
  Elétrica: "#DC2626",
  "Refrigeração 1": "#10B981",
  "Refrigeração 2": "#9333EA",
  "Refrigeração 3": "#06B6D4",
  Abastecimento: "#F59E0B",
  Limpeza: "#14B8A6",
  Jardinagem: "#16A34A",
  Outros: "#6B7280",
};

// ---------- Helpers ----------

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

const pick = (row: RawRow, ...keys: string[]) => {
  const map = new Map<string, unknown>();
  for (const k of Object.keys(row)) map.set(norm(k), row[k]);
  for (const k of keys) {
    const v = map.get(norm(k));
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
};

const parseSLA = (v: string): { iso: string; ts: number } => {
  if (!v) return { iso: "", ts: Number.MAX_SAFE_INTEGER };
  // Excel serial number
  const asNum = Number(v);
  if (!Number.isNaN(asNum) && asNum > 20000 && asNum < 80000) {
    const d = new Date(Math.round((asNum - 25569) * 86400 * 1000));
    return { iso: d.toISOString(), ts: d.getTime() };
  }
  const br = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (br) {
    const [, d, m, y] = br;
    const year = y.length === 2 ? 2000 + Number(y) : Number(y);
    const date = new Date(year, Number(m) - 1, Number(d));
    return { iso: date.toISOString(), ts: date.getTime() };
  }
  const iso = new Date(v);
  if (!Number.isNaN(iso.getTime())) return { iso: iso.toISOString(), ts: iso.getTime() };
  return { iso: v, ts: Number.MAX_SAFE_INTEGER };
};

const detectCategory = (row: RawRow): Category => {
  const raw = norm(
    pick(row, "CATEGORIA", "CATEGORY", "GRUPO", "TIPO DE SERVIÇO", "TIPO DE SERVICO", "FAMÍLIA", "FAMILIA"),
  );
  if (raw.includes("ABASTEC")) return "Abastecimento";
  if (raw.includes("CIVIL")) return "Civil";
  if (raw.includes("CLIMAT") || raw.includes("REFRIG") || raw.includes("AR CONDICIONADO"))
    return "Climatização e Refrigeração";
  if (raw.includes("ELETR") || raw.includes("ELÉTR")) return "Elétrica";
  if (raw.includes("JARDIN") || raw.includes("PAISAG")) return "Jardinagem e Paisagismo";
  if (raw.includes("LIMPEZ")) return "Limpeza";
  return "Outros Serviços";
};

const isHidraulica = (row: RawRow, keywords: string[]) => {
  const bag = norm(
    [
      pick(row, "NOME OS", "DESCRIÇÃO", "DESCRICAO", "SERVIÇO", "SERVICO"),
      pick(row, "LOCAL"),
      pick(row, "ATIVO"),
      pick(row, "EQUIPAMENTO"),
      pick(row, "TIPO"),
    ].join(" | "),
  );
  return keywords.some((k) => bag.includes(norm(k)));
};

const refrigTeamForPredio = (
  predio: string,
  r1: string[],
  r2: string[],
  r3: string[],
): Team => {
  const p = norm(predio);
  const match = (arr: string[]) => arr.some((x) => norm(x) === p || p.startsWith(norm(x)));
  if (match(r1)) return "Refrigeração 1";
  if (match(r2)) return "Refrigeração 2";
  if (match(r3)) return "Refrigeração 3";
  return "Refrigeração 1";
};

// ---------- Main ----------

export interface ProcessOptions {
  tipo?: "Preventiva" | "Corretiva";
  siteAllowed?: string;
  refrig1?: string[];
  refrig2?: string[];
  refrig3?: string[];
  hidraulicaKeywords?: string[];
}

export interface ProcessResult {
  total: number;
  discardedBySite: number;
  byCategory: Record<Category, ProcessedOS[]>;
  byTeam: Record<Team, ProcessedOS[]>;
  ordered: ProcessedOS[];
}

export function processPreventiva(rows: RawRow[], opts: ProcessOptions = {}): ProcessResult {
  const tipo = opts.tipo ?? "Preventiva";
  const siteAllowed = norm(opts.siteAllowed ?? SITE_ALLOWED);
  const r1 = opts.refrig1 ?? REFRIG_1;
  const r2 = opts.refrig2 ?? REFRIG_2;
  const r3 = opts.refrig3 ?? REFRIG_3;
  const keywords = opts.hidraulicaKeywords ?? HIDRAULICA_KEYWORDS;
  const filtered: RawRow[] = [];
  let discarded = 0;

  for (const row of rows) {
    const site = norm(pick(row, "SITE", "UNIDADE", "PLANTA", "LOCAL SITE"));
    if (site && !site.includes(siteAllowed)) {
      discarded++;
      continue;
    }
    filtered.push(row);
  }

  // Build ProcessedOS list with initial category detection and SLA
  const partial = filtered.map<ProcessedOS>((row) => {
    const category = detectCategory(row);
    const slaStr = pick(row, "DATA SLA", "SLA", "DATA_SLA", "PRAZO", "VENCIMENTO");
    const sla = parseSLA(slaStr);
    return {
      ordemServico: pick(row, "ORDEM DE SERVIÇO", "ORDEM DE SERVICO", "OS", "ORDEM"),
      nomeOS: pick(row, "NOME OS", "NOME_OS", "DESCRIÇÃO", "DESCRICAO"),
      predio: pick(row, "PRÉDIO", "PREDIO", "BUILDING"),
      andar: pick(row, "ANDAR", "PAVIMENTO", "FLOOR"),
      local: pick(row, "LOCAL", "SETOR"),
      tipo,
      equipe: "Outros",
      dataSLA: sla.iso,
      slaTimestamp: sla.ts,
      ativo: pick(row, "ATIVO", "TAG"),
      equipamento: pick(row, "EQUIPAMENTO", "EQUIP"),
      categoria: category,
      site: pick(row, "SITE", "UNIDADE") || SITE_ALLOWED,
    };
  });

  // Sort globally by SLA
  partial.sort((a, b) => a.slaTimestamp - b.slaTimestamp);

  // Assign teams
  const civilPool: ProcessedOS[] = [];
  for (const os of partial) {
    switch (os.categoria) {
      case "Elétrica":
        os.equipe = "Elétrica";
        break;
      case "Climatização e Refrigeração":
        os.equipe = refrigTeamForPredio(os.predio, r1, r2, r3);
        break;
      case "Civil":
        if (isHidraulica(rawFromProcessed(os), keywords)) {
          os.equipe = "Hidráulica";
        } else {
          civilPool.push(os);
        }
        break;
      case "Abastecimento":
        os.equipe = "Abastecimento";
        break;
      case "Limpeza":
        os.equipe = "Limpeza";
        break;
      case "Jardinagem e Paisagismo":
        os.equipe = "Jardinagem";
        break;
      default:
        os.equipe = "Outros";
    }
  }

  // Balance Civil <-> Chaveiro (already sorted by SLA)
  civilPool.forEach((os, i) => {
    os.equipe = i % 2 === 0 ? "Civil" : "Chaveiro";
  });

  // Elétrica secondary sort: SLA → Prédio → Andar
  partial
    .filter((o) => o.equipe === "Elétrica")
    .sort(
      (a, b) =>
        a.slaTimestamp - b.slaTimestamp ||
        a.predio.localeCompare(b.predio) ||
        a.andar.localeCompare(b.andar),
    );

  const byCategory = {} as Record<Category, ProcessedOS[]>;
  const byTeam = {} as Record<Team, ProcessedOS[]>;
  for (const os of partial) {
    (byCategory[os.categoria] ||= []).push(os);
    (byTeam[os.equipe] ||= []).push(os);
  }

  return {
    total: partial.length,
    discardedBySite: discarded,
    byCategory,
    byTeam,
    ordered: partial,
  };
}

// Helper: recreate a raw-row-like object from ProcessedOS for keyword search
function rawFromProcessed(os: ProcessedOS): RawRow {
  return {
    "NOME OS": os.nomeOS,
    LOCAL: os.local,
    ATIVO: os.ativo,
    EQUIPAMENTO: os.equipamento,
    TIPO: os.tipo,
  };
}

// Mapeamento oficial da planilha "Centro de Custo.xlsx" fornecida em 02/09/2026.
// A planilha contém 12.337 linhas válidas, 58 prédios e 24 centros de custo.
// O CC é estável por prédio; andar/local são usados como contexto e fallback de identificação.

export type CostCenterInput = {
  predio?: string | null;
  andar?: string | null;
  local?: string | null;
};

export type CostCenterResolution = {
  codigo: string;
  predioReferencia: string;
  fonte: "predio" | "alias" | "local";
};

const COST_CENTER_BY_BUILDING: Record<string, string> = {
  "A100": "9I670617",
  "A160": "9I670617",
  "A170": "9I670619",
  "A180": "9I660008",
  "A220": "9I670620",
  "A380": "9I670620",
  "A460": "9I670620",
  "A470": "9I670644",
  "ADC": "9I670646",
  "AREA V.E": "9I632017",
  "B115": "9I670619",
  "B120": "9I670622",
  "B158": "9I670620",
  "B203": "9I670618",
  "B290": "9I670620",
  "B380": "9I670620",
  "B440": "9I670644",
  "B70": "9I670619",
  "B90": "9I670620",
  "C065/125": "9I670649",
  "C110": "9I670618",
  "C120": "9I670622",
  "C340": "9I670620",
  "C380": "9I670649",
  "C45-C49": "9I670619",
  "C46": "9I670619",
  "C65": "9I670619",
  "C70": "9I670616",
  "CONTAINER Z500": "9I670620",
  "D240": "9I623000",
  "D265": "9I670615",
  "D270": "9I632017",
  "D295": "9I120070",
  "D345": "9I670619",
  "D35": "9I670649",
  "D55-D85": "9I670649",
  "D85": "9I670649",
  "E105": "9I670615",
  "E130": "9I632017",
  "E165": "9I632017",
  "E170": "9I670615",
  "E171": "9I670615",
  "E200": "9I632017",
  "E210": "9I670620",
  "E310": "9I678017",
  "E340": "9I670617",
  "E35": "9I670618",
  "E70": "9I632017",
  "F30": "9I670619",
  "F60": "9I670621",
  "FUNDAÇÃO ECO+": "9I670647",
  "JARDIM": "9I632017",
  "PERIMETRO EXTERNO": "9I632017",
  "PORTARIA 1": "9I670619",
  "Z210": "9I670619",
  "Z310": "9I686001",
  "Z400": "9I670620",
  "Z500": "9I670620",
};

// Nomes encontrados no sistema que representam um prédio consolidado na planilha.
// Só entram aqui aliases sustentados pela planilha/localização; valores incertos ficam sem CC.
const BUILDING_ALIASES: Record<string, string> = {
  "C45": "C45-C49",
  "C49": "C45-C49",
  "D55": "D55-D85",
  "AMBULATORIO": "C110",
  "AMBULATÓRIO": "C110",
  "PERÍMETRO EXTERNO": "PERIMETRO EXTERNO",
  "AREA VE": "AREA V.E",
  "ÁREA V.E": "AREA V.E",
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const NORMALIZED_BUILDINGS = new Map(
  Object.keys(COST_CENTER_BY_BUILDING).map((building) => [normalize(building), building]),
);

const NORMALIZED_ALIASES = new Map(
  Object.entries(BUILDING_ALIASES).map(([alias, building]) => [normalize(alias), building]),
);

function directBuilding(value: string | null | undefined): CostCenterResolution | null {
  const normalized = normalize(value);
  if (!normalized) return null;

  const exact = NORMALIZED_BUILDINGS.get(normalized);
  if (exact) {
    return { codigo: COST_CENTER_BY_BUILDING[exact], predioReferencia: exact, fonte: "predio" };
  }

  const alias = NORMALIZED_ALIASES.get(normalized);
  if (alias) {
    return { codigo: COST_CENTER_BY_BUILDING[alias], predioReferencia: alias, fonte: "alias" };
  }

  // Tolera valores como "Prédio A160", "A160 - Administrativo" etc.,
  // mas apenas quando há uma única referência oficial inequívoca no texto.
  const candidates = [...NORMALIZED_BUILDINGS.entries()].filter(([key]) => {
    if (key.length < 3) return false;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(normalized);
  });

  if (candidates.length === 1) {
    const building = candidates[0][1];
    return { codigo: COST_CENTER_BY_BUILDING[building], predioReferencia: building, fonte: "predio" };
  }

  // Faixas consolidadas que aparecem separadas no sistema.
  if (/\bC(?:0?45|49)\b/.test(normalized)) {
    return { codigo: COST_CENTER_BY_BUILDING["C45-C49"], predioReferencia: "C45-C49", fonte: "alias" };
  }
  if (/\bD(?:55|85)\b/.test(normalized)) {
    return { codigo: COST_CENTER_BY_BUILDING["D55-D85"], predioReferencia: "D55-D85", fonte: "alias" };
  }

  return null;
}

export function resolveCostCenter(input: CostCenterInput): CostCenterResolution | null {
  const fromBuilding = directBuilding(input.predio);
  if (fromBuilding) return fromBuilding;

  // O arquivo possui o detalhe de andar/local. Quando o campo Prédio chega vazio
  // ou com um rótulo operacional, usamos o texto completo somente se houver uma
  // referência oficial inequívoca. Isso evita inferência por ambiente genérico.
  const contextual = [input.andar, input.local].filter(Boolean).join(" · ");
  const normalizedContext = normalize(contextual);
  if (!normalizedContext) return null;

  if (/AMBULATORIO|AMBULATÓRIO/.test(String(input.predio ?? "")) || /AMBULATORIO MEDICO/.test(normalizedContext)) {
    return { codigo: COST_CENTER_BY_BUILDING.C110, predioReferencia: "C110", fonte: "local" };
  }

  const contextualCandidates = [...NORMALIZED_BUILDINGS.entries()].filter(([key]) => {
    if (!/^[A-Z]\d/.test(key) && !key.includes("Z500")) return false;
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Z0-9])${escaped}([^A-Z0-9]|$)`).test(normalizedContext);
  });

  if (contextualCandidates.length === 1) {
    const building = contextualCandidates[0][1];
    return { codigo: COST_CENTER_BY_BUILDING[building], predioReferencia: building, fonte: "local" };
  }

  if (/\bC(?:0?45|49)\b/.test(normalizedContext)) {
    return { codigo: COST_CENTER_BY_BUILDING["C45-C49"], predioReferencia: "C45-C49", fonte: "local" };
  }
  if (/\bD(?:55|85)\b/.test(normalizedContext)) {
    return { codigo: COST_CENTER_BY_BUILDING["D55-D85"], predioReferencia: "D55-D85", fonte: "local" };
  }

  return null;
}

export function automaticCostCenter(input: CostCenterInput): string | null {
  return resolveCostCenter(input)?.codigo ?? null;
}

export function effectiveCostCenter(input: CostCenterInput & { manual?: string | null }): string | null {
  const manual = String(input.manual ?? "").trim();
  return manual || automaticCostCenter(input);
}

export const COST_CENTER_BUILDING_COUNT = Object.keys(COST_CENTER_BY_BUILDING).length;
export const COST_CENTER_CODES = [...new Set(Object.values(COST_CENTER_BY_BUILDING))].sort();

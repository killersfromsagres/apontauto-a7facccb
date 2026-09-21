import ExcelJS from "exceljs";

import { classifyTeamByText, type Equipe } from "@/lib/backorder/team-classifier";
import type { ProgramacaoExportRow } from "@/lib/corretiva/programacao-excel";

export const BACKORDER_BUILDER_TEAMS = [
  "Elétrica",
  "Hidráulica",
  "Civil",
  "Chaveiro",
  "Pintura",
  "Refrigeração",
  "Limpeza",
] as const satisfies readonly Equipe[];

export type BackorderBuilderTeam = (typeof BACKORDER_BUILDER_TEAMS)[number];
export type BackorderBuilderConfidence = "alta" | "media" | "baixa" | "manual";

export type BackorderBuilderRow = ProgramacaoExportRow & {
  builderId: string;
  sourceRow: number;
  sourceSheet: string;
  confidence: BackorderBuilderConfidence;
  ambiguous: boolean;
  secondTeam?: BackorderBuilderTeam;
  score: number;
  originalTeam: string | null;
};

export type BackorderBuilderResult = {
  rows: BackorderBuilderRow[];
  sourceSheet: string;
  headerRow: number;
  ignoredRows: number;
  duplicateRows: number;
  completedRows: number;
  mappedFields: string[];
};

type FieldKey =
  | "os"
  | "description"
  | "requester"
  | "building"
  | "floor"
  | "location"
  | "openedAt"
  | "material"
  | "pieces"
  | "team"
  | "status"
  | "asset"
  | "equipment"
  | "patrimony";

type HeaderMap = Partial<Record<FieldKey, number>>;

const FIELD_ALIASES: Record<FieldKey, string[]> = {
  os: [
    "OS",
    "N OS",
    "Nº OS",
    "NUMERO OS",
    "NUMERO DA OS",
    "ORDEM DE SERVICO",
    "ORDEM SERVICO",
    "ORDEM",
    "CHAMADO ID",
    "ID CHAMADO",
  ],
  description: [
    "DESCRICAO DO CHAMADO",
    "DESCRICAO DO SERVICO",
    "DESCRICAO",
    "NOME OS",
    "NOME DA OS",
    "SERVICO",
    "SOLICITACAO",
    "CHAMADO",
    "TITULO",
  ],
  requester: ["SOLICITANTE", "REQUISITANTE", "ABERTO POR", "SOLICITADO POR", "USUARIO"],
  building: ["PREDIO", "EDIFICIO", "BUILDING"],
  floor: ["ANDAR", "PAVIMENTO", "PISO ANDAR"],
  location: ["LOCAL", "AMBIENTE", "ESPACO", "LOCALIZACAO", "AREA"],
  openedAt: [
    "ABERTURA",
    "DATA ABERTURA",
    "DATA DE ABERTURA",
    "DATA CRIACAO",
    "CRIADO EM",
    "DATA SOLICITACAO",
    "DATA DA SOLICITACAO",
  ],
  material: [
    "MATERIAL SOLICITADO",
    "STATUS MATERIAL",
    "MATERIAL STATUS",
    "MATERIAL",
    "PECA SOLICITADA",
  ],
  pieces: ["PECAS SOLICITADAS", "PEÇAS SOLICITADAS", "DETALHES DO MATERIAL", "MATERIAIS", "PECAS"],
  team: ["EQUIPE", "DISCIPLINA", "ESPECIALIDADE", "CATEGORIA"],
  status: ["STATUS", "STATUS ATUAL", "SITUACAO", "SITUAÇÃO"],
  asset: ["ATIVO", "CODIGO ATIVO", "CÓDIGO ATIVO", "TAG"],
  equipment: ["EQUIPAMENTO", "EQUIPMENT"],
  patrimony: ["PATRIMONIO", "PATRIMÔNIO"],
};

const NORMALIZED_ALIASES = Object.fromEntries(
  Object.entries(FIELD_ALIASES).map(([key, aliases]) => [key, aliases.map(normalize)]),
) as Record<FieldKey, string[]>;

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function cellText(cell: ExcelJS.Cell): string {
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  const raw = cell.text?.trim();
  if (raw) return raw;
  if (typeof cell.value === "number") return String(cell.value);
  if (typeof cell.value === "string") return cell.value.trim();
  return "";
}

function valueAt(row: ExcelJS.Row, column: number | undefined): string {
  if (!column) return "";
  const cell = row.getCell(column);
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  if (typeof cell.value === "number" && cell.value > 20_000 && cell.value < 80_000) {
    const epoch = Date.UTC(1899, 11, 30);
    return new Date(epoch + cell.value * 86_400_000).toISOString().slice(0, 10);
  }
  return cellText(cell);
}

function headerField(value: string): FieldKey | null {
  const normalized = normalize(value);
  if (!normalized) return null;

  let best: { key: FieldKey; score: number } | null = null;
  for (const [key, aliases] of Object.entries(NORMALIZED_ALIASES) as Array<[FieldKey, string[]]>) {
    for (const alias of aliases) {
      let score = 0;
      if (normalized === alias) score = 100 + alias.length;
      else if (normalized.startsWith(`${alias} `) || normalized.endsWith(` ${alias}`)) score = 55 + alias.length;
      else if (alias.length >= 8 && normalized.includes(alias)) score = 30 + alias.length;
      if (score > (best?.score ?? 0)) best = { key, score };
    }
  }
  return best?.key ?? null;
}

function inspectHeader(row: ExcelJS.Row): { map: HeaderMap; score: number } {
  const map: HeaderMap = {};
  let recognized = 0;
  row.eachCell({ includeEmpty: false }, (cell, column) => {
    const field = headerField(cellText(cell));
    if (field && !map[field]) {
      map[field] = column;
      recognized += 1;
    }
  });

  let score = recognized * 10;
  if (map.description) score += 45;
  if (map.os) score += 20;
  if (map.building) score += 8;
  if (map.location) score += 6;
  if (map.openedAt) score += 6;
  return { map, score };
}

function sheetNameBonus(name: string) {
  const normalized = normalize(name);
  if (normalized.includes("BACKORDER")) return 14;
  if (normalized.includes("GERAL")) return 9;
  if (normalized.includes("BASE")) return 4;
  return 0;
}

function detectSource(workbook: ExcelJS.Workbook) {
  let best:
    | { sheet: ExcelJS.Worksheet; headerRow: number; map: HeaderMap; score: number }
    | undefined;

  for (const sheet of workbook.worksheets) {
    const limit = Math.min(30, Math.max(1, sheet.rowCount));
    for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
      const inspected = inspectHeader(sheet.getRow(rowNumber));
      const score = inspected.score + sheetNameBonus(sheet.name);
      if (!inspected.map.description) continue;
      if (!best || score > best.score) {
        best = { sheet, headerRow: rowNumber, map: inspected.map, score };
      }
    }
  }

  if (!best || best.score < 55) {
    throw new Error(
      "Não encontrei uma tabela de Backorder válida. A planilha precisa ter pelo menos uma coluna de descrição do chamado.",
    );
  }
  return best;
}

function completedStatus(value: string) {
  const status = normalize(value);
  return ["CONCLUID", "FINALIZ", "FECHAD", "ENCERRAD", "CANCELAD"].some((part) =>
    status.includes(part),
  );
}

function materialRequested(value: string, pieces: string) {
  const material = normalize(value);
  if (pieces.trim()) return true;
  return ["SIM", "SOLICIT", "PEDIDO", "REQUISIT", "COMPR", "AGUARDANDO MATERIAL"].some((part) =>
    material.includes(part),
  );
}

function canonicalTeam(value: string): BackorderBuilderTeam | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  if (normalized.includes("ELETR")) return "Elétrica";
  if (normalized.includes("HIDRAUL")) return "Hidráulica";
  if (normalized.includes("REFRIG") || normalized.includes("CLIMAT") || normalized.includes("AR COND")) return "Refrigeração";
  if (normalized.includes("CHAVE")) return "Chaveiro";
  if (normalized.includes("PINT")) return "Pintura";
  if (normalized.includes("LIMPE") || normalized.includes("HIGIEN") || normalized.includes("CONSERV")) return "Limpeza";
  if (normalized.includes("CIVIL")) return "Civil";
  return null;
}

function classify(description: string, equipment: string, asset: string, location: string, sourceTeam: string) {
  const technicalText = [description, equipment, asset].filter(Boolean).join(" · ");
  const contextualText = [technicalText, location].filter(Boolean).join(" · ");
  const result = classifyTeamByText(contextualText);
  const source = canonicalTeam(sourceTeam);
  const scores = Object.values(result.scores);
  const score = Math.max(...scores, 0);
  const hasSignal = score > 0;

  if (!hasSignal && source) {
    return {
      team: source,
      confidence: "media" as const,
      ambiguous: false,
      secondTeam: undefined,
      score: 1,
    };
  }

  return {
    team: result.equipe as BackorderBuilderTeam,
    confidence: result.confianca,
    ambiguous: result.ambiguo || !hasSignal,
    secondTeam: result.segunda as BackorderBuilderTeam | undefined,
    score,
  };
}

function rowLooksEmpty(values: string[]) {
  return values.every((value) => !value.trim());
}

function mappedFieldLabels(map: HeaderMap) {
  const labels: Record<FieldKey, string> = {
    os: "OS",
    description: "Descrição",
    requester: "Solicitante",
    building: "Prédio",
    floor: "Andar",
    location: "Local",
    openedAt: "Abertura",
    material: "Material",
    pieces: "Peças",
    team: "Equipe",
    status: "Status",
    asset: "Ativo",
    equipment: "Equipamento",
    patrimony: "Patrimônio",
  };
  return (Object.keys(map) as FieldKey[]).filter((key) => map[key]).map((key) => labels[key]);
}

export async function parseBackorderSpreadsheet(file: File): Promise<BackorderBuilderResult> {
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const source = detectSource(workbook);
  const rows: BackorderBuilderRow[] = [];
  const seen = new Set<string>();
  let ignoredRows = 0;
  let duplicateRows = 0;
  let completedRows = 0;
  const now = new Date().toISOString();

  for (let rowNumber = source.headerRow + 1; rowNumber <= source.sheet.rowCount; rowNumber += 1) {
    const row = source.sheet.getRow(rowNumber);
    const os = valueAt(row, source.map.os);
    const description = valueAt(row, source.map.description);
    const requester = valueAt(row, source.map.requester);
    const building = valueAt(row, source.map.building);
    const floor = valueAt(row, source.map.floor);
    const location = valueAt(row, source.map.location);
    const openedAt = valueAt(row, source.map.openedAt);
    const material = valueAt(row, source.map.material);
    const pieces = valueAt(row, source.map.pieces);
    const sourceTeam = valueAt(row, source.map.team);
    const status = valueAt(row, source.map.status);
    const asset = valueAt(row, source.map.asset);
    const equipment = valueAt(row, source.map.equipment);
    const patrimony = valueAt(row, source.map.patrimony);

    if (rowLooksEmpty([os, description, requester, building, floor, location, openedAt, material, pieces])) {
      ignoredRows += 1;
      continue;
    }
    if (!description.trim()) {
      ignoredRows += 1;
      continue;
    }
    if (completedStatus(status)) {
      completedRows += 1;
      continue;
    }

    const dedupeKey = os.trim()
      ? `OS:${normalize(os)}`
      : `ROW:${normalize(description)}|${normalize(building)}|${normalize(location)}`;
    if (seen.has(dedupeKey)) {
      duplicateRows += 1;
      continue;
    }
    seen.add(dedupeKey);

    const classification = classify(description, equipment, asset, `${building} ${floor} ${location}`, sourceTeam);
    const requested = materialRequested(material, pieces);
    const displayOs = os.trim() || `SEM-OS-${String(rows.length + 1).padStart(3, "0")}`;

    rows.push({
      id: `backorder-builder:${source.sheet.id}:${rowNumber}:${displayOs}`,
      builderId: `${source.sheet.id}-${rowNumber}-${rows.length}`,
      sourceRow: rowNumber,
      sourceSheet: source.sheet.name,
      numero_os: displayOs,
      nome_os: description.trim(),
      predio: building.trim() || null,
      andar: floor.trim() || null,
      local: location.trim() || null,
      tipo: "BACKORDER",
      tipo_importacao: "backorder_planilha_rapida",
      equipe: classification.team,
      data_sla: null,
      data_programada: null,
      inicio: null,
      fim: null,
      ativo: asset.trim(),
      equipamento: equipment.trim(),
      patrimonio: patrimony.trim() || null,
      status: status.trim() || "aberta",
      updated_at: now,
      solicitante: requester.trim() || null,
      data_criacao: openedAt.trim() || null,
      material_status: requested ? "solicitado" : null,
      pecas_solicitadas: pieces.trim() || null,
      confidence: classification.confidence,
      ambiguous: classification.ambiguous,
      secondTeam: classification.secondTeam,
      score: classification.score,
      originalTeam: sourceTeam.trim() || null,
    });
  }

  if (!rows.length) {
    throw new Error("A planilha foi lida, mas nenhum Backorder aberto com descrição válida foi encontrado.");
  }

  return {
    rows,
    sourceSheet: source.sheet.name,
    headerRow: source.headerRow,
    ignoredRows,
    duplicateRows,
    completedRows,
    mappedFields: mappedFieldLabels(source.map),
  };
}

export function changeBackorderBuilderTeam(
  row: BackorderBuilderRow,
  team: BackorderBuilderTeam,
): BackorderBuilderRow {
  return {
    ...row,
    equipe: team,
    confidence: "manual",
    ambiguous: false,
    secondTeam: undefined,
  };
}

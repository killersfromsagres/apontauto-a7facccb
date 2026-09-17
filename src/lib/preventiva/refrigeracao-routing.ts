import {
  REFRIG_1,
  REFRIG_2,
  REFRIG_3,
  type Equipe,
} from "./triage";

export interface RefrigeracaoRoutingRow {
  equipe?: unknown;
  nome_os?: unknown;
  tipo?: unknown;
  ativo?: unknown;
  equipamento?: unknown;
  predio?: unknown;
}

const norm = (value: unknown) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

function predioMatches(predio: unknown, buildings: string[]): boolean {
  const normalized = norm(predio);
  return buildings.some((building) => {
    const target = norm(building);
    return normalized === target || normalized.startsWith(target);
  });
}

/**
 * Mesma matriz operacional usada na triagem das preventivas.
 * Prédios não cadastrados preservam o comportamento legado e ficam na equipe 1.
 */
export function refrigeracaoTeamForPredio(predio: unknown): Equipe {
  if (predioMatches(predio, REFRIG_2)) {
    return "CLIMATIZAÇÃO E REFRIGERAÇÃO 2";
  }
  if (predioMatches(predio, REFRIG_3)) {
    return "CLIMATIZAÇÃO E REFRIGERAÇÃO 3";
  }
  if (predioMatches(predio, REFRIG_1)) {
    return "CLIMATIZAÇÃO E REFRIGERAÇÃO 1";
  }
  return "CLIMATIZAÇÃO E REFRIGERAÇÃO 1";
}

export function isRefrigeracaoCorrective(row: RefrigeracaoRoutingRow): boolean {
  const explicit = norm(row.equipe);
  const context = norm(
    `${row.equipe ?? ""} ${row.nome_os ?? ""} ${row.tipo ?? ""} ${row.ativo ?? ""} ${row.equipamento ?? ""}`,
  );

  return (
    explicit.includes("REFRIG") ||
    explicit.includes("CLIMAT") ||
    context.includes("REFRIG") ||
    context.includes("CLIMAT") ||
    context.includes("AR CONDIC") ||
    context.includes("FANCOIL") ||
    context.includes("CHILLER")
  );
}

/**
 * Força a equipe de uma corretiva de climatização/refrigeração pelo prédio.
 * O número eventualmente informado em `row.equipe` nunca sobrepõe a matriz
 * operacional de prédios usada pela Programação das preventivas.
 */
export function normalizeCorrectiveRefrigeracaoTeam<
  T extends RefrigeracaoRoutingRow,
>(row: T): T {
  if (!isRefrigeracaoCorrective(row)) return row;
  return {
    ...row,
    equipe: refrigeracaoTeamForPredio(row.predio),
  } as T;
}

export function normalizeCorrectiveRefrigeracaoRows<
  T extends RefrigeracaoRoutingRow,
>(rows: T[]): T[] {
  return rows.map(normalizeCorrectiveRefrigeracaoTeam);
}

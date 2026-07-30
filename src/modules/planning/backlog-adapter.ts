import type { ChamadoRow } from "@/lib/dashboard-chamados/parser";
import { scoreBacklog, type BacklogInput, type BacklogScore } from "./backlog-score";

const CRITICIDADE_MAP: Record<string, number> = {
  ALTA: 5,
  MÉDIA: 3,
  MEDIA: 3,
  BAIXA: 2,
};

const RISCO_TERMOS = [
  "incend",
  "eletric",
  "elétric",
  "choque",
  "vazamento de gas",
  "vazamento de gás",
  "queda",
  "curto",
  "fuga",
  "emergenc",
];

const DIA = 86_400_000;

function temRiscoSeguranca(row: ChamadoRow): boolean {
  const texto = `${row.descricao} ${row.categoria}`.toLowerCase();
  return RISCO_TERMOS.some((t) => texto.includes(t));
}

/** Converte um chamado do Backorder nos fatores do score de backlog. */
export function chamadoToBacklogInput(
  row: ChamadoRow,
  reincidencias = 0,
  now = Date.now(),
): BacklogInput {
  const idadeDias = row.dataAberturaTs
    ? Math.max(0, Math.floor((now - row.dataAberturaTs) / DIA))
    : 0;
  const slaHorasRestantes = row.dataLimiteTs ? (row.dataLimiteTs - now) / 3_600_000 : undefined;

  return {
    criticidadeAtivo: CRITICIDADE_MAP[row.criticidade] ?? 3,
    riscoSeguranca: temRiscoSeguranca(row),
    impactoOperacional:
      row.criticidade === "ALTA" ? "alto" : row.criticidade === "BAIXA" ? "baixo" : "medio",
    idadeDias,
    slaHorasRestantes,
    reincidencias,
  };
}

export type ScoredChamado = { row: ChamadoRow; score: BacklogScore };

/**
 * Calcula o score de todos os chamados abertos, considerando reincidência
 * por ativo/local nos últimos 90 dias.
 */
export function scoreChamados(rows: ChamadoRow[], now = Date.now()): ScoredChamado[] {
  const recorrencia = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.ativo || row.local || row.predio}`.trim().toUpperCase();
    if (!key) continue;
    if (row.dataAberturaTs && now - row.dataAberturaTs > 90 * DIA) continue;
    recorrencia.set(key, (recorrencia.get(key) ?? 0) + 1);
  }

  return rows
    .map((row) => {
      const key = `${row.ativo || row.local || row.predio}`.trim().toUpperCase();
      const reincidencias = Math.max(0, (recorrencia.get(key) ?? 1) - 1);
      return { row, score: scoreBacklog(chamadoToBacklogInput(row, reincidencias, now)) };
    })
    .sort((a, b) => b.score.score - a.score.score);
}

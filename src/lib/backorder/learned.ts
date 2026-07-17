// Aprendizado automático a partir de correções manuais na Revisão.
// Chave: codigo_ativo. Regra aprendida tem prioridade sobre a árvore.

import type { Categoria } from "./classify";

export interface LearnedLocation {
  id: string;
  codigo_ativo: string;
  predio: string;
  andar: string;
  espaco: string;
  origem_chamado_os: string | null;
  criado_por: string | null;
  criado_em: string;
  ativo: boolean;
}

export interface LearnedTeam {
  id: string;
  codigo_ativo: string | null;
  equipe: string;
  origem_chamado_os: string | null;
  criado_por: string | null;
  criado_em: string;
  ativo: boolean;
}

export interface LearnedIndex {
  loc: Map<string, LearnedLocation>;
  team: Map<string, LearnedTeam>;
}

const up = (v: unknown) => String(v ?? "").trim().toUpperCase();

/** Constrói o índice de regras aprendidas, mantendo a mais recente por ativo. */
export function buildLearnedIndex(
  locations: LearnedLocation[],
  teams: LearnedTeam[],
): LearnedIndex {
  const loc = new Map<string, LearnedLocation>();
  for (const r of locations) {
    if (!r.ativo) continue;
    const k = up(r.codigo_ativo);
    if (!k) continue;
    const prev = loc.get(k);
    if (!prev || new Date(r.criado_em) > new Date(prev.criado_em)) loc.set(k, r);
  }
  const team = new Map<string, LearnedTeam>();
  for (const r of teams) {
    if (!r.ativo || !r.codigo_ativo) continue;
    const k = up(r.codigo_ativo);
    const prev = team.get(k);
    if (!prev || new Date(r.criado_em) > new Date(prev.criado_em)) team.set(k, r);
  }
  return { loc, team };
}

export function learnedLocation(index: LearnedIndex, ativo: string): LearnedLocation | null {
  return index.loc.get(up(ativo)) ?? null;
}

export function learnedTeam(index: LearnedIndex, ativo: string): LearnedTeam | null {
  return index.team.get(up(ativo)) ?? null;
}

/** Aplica as regras aprendidas sobre um resultado já resolvido pela árvore.
 *  Regra aprendida vence a árvore. Retorna também a origem de cada campo. */
export function applyLearnedToResolved(
  index: LearnedIndex,
  ativo: string,
  fromTree: { predio: string; andar: string; espaco: string; found: boolean },
  atividadeAuto: Categoria,
): {
  predio: string;
  andar: string;
  espaco: string;
  atividade: Categoria;
  origem_predio_andar_espaco: "regra_aprendida" | "arvore_ativos" | "pendente";
  origem_equipe: "regra_aprendida" | "classificacao_automatica" | "pendente";
  revisao_manual: boolean;
} {
  const loc = learnedLocation(index, ativo);
  const team = learnedTeam(index, ativo);

  const predio = loc?.predio ?? fromTree.predio;
  const andar = loc?.andar ?? fromTree.andar;
  const espaco = loc?.espaco ?? fromTree.espaco;
  const origem_pae: "regra_aprendida" | "arvore_ativos" | "pendente" = loc
    ? "regra_aprendida"
    : fromTree.found
      ? "arvore_ativos"
      : "pendente";

  const atividade = (team?.equipe as Categoria | undefined) ?? atividadeAuto;
  const origem_eq: "regra_aprendida" | "classificacao_automatica" | "pendente" = team
    ? "regra_aprendida"
    : atividadeAuto === "Outros"
      ? "pendente"
      : "classificacao_automatica";

  const revisao_manual = origem_pae === "pendente" || origem_eq === "pendente";
  return {
    predio,
    andar,
    espaco,
    atividade,
    origem_predio_andar_espaco: origem_pae,
    origem_equipe: origem_eq,
    revisao_manual,
  };
}

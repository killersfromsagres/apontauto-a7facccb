// Classificação automática de equipe para OS do módulo Corretiva.
// Centraliza a decisão no motor contextual de Corretivas para evitar divergência
// entre importação, sugestões automáticas e o botão Designar.

import {
  designateCorrectiveTeam,
  type CorrectiveDesignationInput,
} from "@/lib/corretiva/designation-engine";
import type { Equipe } from "@/lib/backorder/team-classifier";

export type { Equipe };

const norm = (s: unknown) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Chave canônica de cada equipe, usada para casar com nomes cadastrados. */
const CANON: Record<Equipe, string[]> = {
  Hidráulica: ["hidraulica", "hidraulico"],
  Elétrica: ["eletrica", "eletrico"],
  Civil: ["civil", "alvenaria", "predial"],
  Chaveiro: ["chaveiro", "serralheria"],
  Pintura: ["pintura", "pintor"],
  Refrigeração: ["refrigeracao", "climatizacao", "ar condicionado"],
  Limpeza: ["limpeza", "conservacao", "gerenciamento", "orcamento", "compra"],
};

export type ClassificacaoOs = {
  equipe: Equipe;
  /** Nome exatamente como cadastrado em corretiva_equipes, quando houver correspondência. */
  equipeCadastrada: string | null;
  confianca: "alta" | "media" | "baixa";
  ambiguo: boolean;
};

/**
 * Classifica uma OS usando o contexto técnico disponível.
 * O tipo aceita campos adicionais sem quebrar os chamadores antigos.
 */
export function classificarEquipeOs(
  texto: CorrectiveDesignationInput,
  equipesCadastradas: string[] = [],
): ClassificacaoOs {
  const result = designateCorrectiveTeam(texto);
  const alvos = CANON[result.equipe] ?? [];
  const match =
    equipesCadastradas.find((nome) =>
      alvos.some((alias) => norm(nome).includes(alias)),
    ) ?? null;

  return {
    equipe: result.equipe,
    equipeCadastrada: match,
    confianca: result.confianca,
    ambiguo: result.ambiguo,
  };
}

/** Verifica se o valor de equipe vindo da planilha já é reconhecido. */
export function equipeReconhecida(valor: string | null | undefined): boolean {
  const n = norm(valor);
  if (!n) return false;
  return Object.values(CANON).some((alvos) =>
    alvos.some((alias) => n.includes(alias)),
  );
}

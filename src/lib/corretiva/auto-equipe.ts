// Classificação automática de equipe para OS de Corretiva.
// Usa o motor determinístico do módulo Backorder (mesmas regras já validadas)
// e casa o resultado com os nomes de equipe cadastrados em `corretiva_equipes`.

import { classifyTeamByText, type Equipe } from "@/lib/backorder/team-classifier";

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
};

export type ClassificacaoOs = {
  equipe: Equipe;
  /** Nome exatamente como cadastrado em corretiva_equipes, quando houver correspondência. */
  equipeCadastrada: string | null;
  confianca: "alta" | "media" | "baixa";
  ambiguo: boolean;
};

/**
 * Classifica uma OS pelo texto (nome da OS + equipamento + ativo).
 * `equipesCadastradas` permite devolver o nome exato usado no sistema.
 */
export function classificarEquipeOs(
  texto: { nome_os?: string | null; equipamento?: string | null; ativo?: string | null },
  equipesCadastradas: string[] = [],
): ClassificacaoOs {
  const base = [texto.nome_os, texto.equipamento, texto.ativo].filter(Boolean).join(" ");
  const r = classifyTeamByText(base);

  const alvos = CANON[r.equipe] ?? [];
  const match =
    equipesCadastradas.find((nome) => alvos.some((a) => norm(nome).includes(a))) ?? null;

  return {
    equipe: r.equipe,
    equipeCadastrada: match,
    confianca: r.confianca,
    ambiguo: r.ambiguo,
  };
}

/** Verifica se o valor de equipe vindo da planilha já é reconhecido. */
export function equipeReconhecida(valor: string | null | undefined): boolean {
  const n = norm(valor);
  if (!n) return false;
  return Object.values(CANON).some((alvos) => alvos.some((a) => n.includes(a)));
}

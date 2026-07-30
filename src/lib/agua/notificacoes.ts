// Item 17 — eventos de notificação do módulo de Abastecimento de Água.
// Um único catálogo define título, corpo, prioridade, categoria, link direto
// e público-alvo (usuários, papéis ou módulos) de cada evento operacional.

import { supabase } from "@/integrations/supabase/client";

export type AguaEvento =
  | "rota_atribuida"
  | "rota_alterada"
  | "lembrete_inicio"
  | "parada_atrasada"
  | "rota_nao_iniciada"
  | "foto_pendente"
  | "divergencia_bags"
  | "falha_upload"
  | "filtro_solicitacao_criada"
  | "filtro_solicitacao_aprovada"
  | "filtro_material_pendente"
  | "filtro_troca_programada"
  | "filtro_troca_atrasada"
  | "filtro_solicitacao_concluida"
  | "filtro_solicitacao_reaberta"
  | "filtro_proximo_vencimento";

export type Prioridade = "info" | "warn" | "critical";

export interface EventoMeta {
  titulo: string;
  categoria: string;
  prioridade: Prioridade;
  /** Papéis avisados por padrão além dos alvos explícitos. */
  papeis: string[];
  requerCiencia?: boolean;
}

/** Catálogo dos 16 eventos exigidos no item 17. */
export const AGUA_EVENTOS: Record<AguaEvento, EventoMeta> = {
  rota_atribuida: {
    titulo: "Rota de água atribuída",
    categoria: "informacao",
    prioridade: "info",
    papeis: [],
  },
  rota_alterada: {
    titulo: "Rota de água alterada",
    categoria: "atencao",
    prioridade: "warn",
    papeis: [],
  },
  lembrete_inicio: {
    titulo: "Lembrete: início da rota de água",
    categoria: "informacao",
    prioridade: "info",
    papeis: [],
  },
  parada_atrasada: {
    titulo: "Parada de água atrasada",
    categoria: "atencao",
    prioridade: "warn",
    papeis: ["gestor_frota"],
  },
  rota_nao_iniciada: {
    titulo: "Rota de água não iniciada",
    categoria: "critico",
    prioridade: "critical",
    papeis: ["gestor_frota"],
    requerCiencia: true,
  },
  foto_pendente: {
    titulo: "Evidência fotográfica pendente",
    categoria: "atencao",
    prioridade: "warn",
    papeis: [],
  },
  divergencia_bags: {
    titulo: "Divergência de bags na rota",
    categoria: "critico",
    prioridade: "critical",
    papeis: ["gestor_frota"],
    requerCiencia: true,
  },
  falha_upload: {
    titulo: "Falha no envio de evidências",
    categoria: "atencao",
    prioridade: "warn",
    papeis: [],
  },
  filtro_solicitacao_criada: {
    titulo: "Nova solicitação de filtro",
    categoria: "informacao",
    prioridade: "info",
    papeis: ["gestor_frota", "tecnico_filtro"],
  },
  filtro_solicitacao_aprovada: {
    titulo: "Solicitação de filtro aprovada",
    categoria: "sucesso",
    prioridade: "info",
    papeis: ["tecnico_filtro"],
  },
  filtro_material_pendente: {
    titulo: "Filtro aguardando material",
    categoria: "atencao",
    prioridade: "warn",
    papeis: ["gestor_frota"],
  },
  filtro_troca_programada: {
    titulo: "Troca de filtro programada",
    categoria: "informacao",
    prioridade: "info",
    papeis: ["tecnico_filtro"],
  },
  filtro_troca_atrasada: {
    titulo: "Troca de filtro atrasada",
    categoria: "critico",
    prioridade: "critical",
    papeis: ["gestor_frota", "tecnico_filtro"],
  },
  filtro_solicitacao_concluida: {
    titulo: "Troca de filtro concluída",
    categoria: "sucesso",
    prioridade: "info",
    papeis: [],
  },
  filtro_solicitacao_reaberta: {
    titulo: "Solicitação de filtro reaberta",
    categoria: "atencao",
    prioridade: "warn",
    papeis: ["gestor_frota", "tecnico_filtro"],
  },
  filtro_proximo_vencimento: {
    titulo: "Filtro próximo do vencimento",
    categoria: "atencao",
    prioridade: "warn",
    papeis: ["gestor_frota", "tecnico_filtro"],
  },
};

export interface Alvo {
  user_id?: string | null;
  role_key?: string | null;
  module_key?: string | null;
  team_key?: string | null;
}

export interface NotificarInput {
  evento: AguaEvento;
  corpo?: string | null;
  /** Sobrescreve o título padrão do catálogo. */
  titulo?: string;
  deepLink?: string | null;
  /** Usuários específicos (ex.: o colaborador atribuído à rota). */
  usuarios?: Array<string | null | undefined>;
  /** Papéis extras além dos do catálogo. */
  papeis?: string[];
  /** Chave de repetição — mesmo evento não é reenviado em 12 h. */
  chave?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Publica um aviso na central de notificações.
 * Nunca lança: notificação é efeito colateral e não pode quebrar a operação.
 */
export async function notificarAgua(input: NotificarInput): Promise<string | null> {
  const meta = AGUA_EVENTOS[input.evento];
  if (!meta) return null;

  const usuarios = [...new Set((input.usuarios ?? []).filter(Boolean) as string[])];
  const papeis = [...new Set([...meta.papeis, ...(input.papeis ?? [])])];

  const alvos: Alvo[] = usuarios.length
    ? usuarios.map((user_id) => ({ user_id }))
    : papeis.length
      ? papeis.map((role_key) => ({ role_key }))
      : [{ module_key: "abastecimento-agua" }];

  try {
    const { data, error } = await (supabase as any).rpc("notificar_evento", {
      p_evento: input.evento,
      p_titulo: input.titulo ?? meta.titulo,
      p_corpo: input.corpo ?? null,
      p_categoria: meta.categoria,
      p_severidade: meta.prioridade,
      p_deep_link: input.deepLink ?? null,
      p_modulo: "abastecimento-agua",
      p_requires_ack: Boolean(meta.requerCiencia),
      p_dedupe_key: input.chave ?? input.evento,
      p_alvos: alvos,
      p_metadata: input.metadata ?? {},
    });
    if (error) throw error;
    return (data as string) ?? null;
  } catch (err) {
    console.warn("[agua/notificacoes]", (err as Error)?.message);
    return null;
  }
}

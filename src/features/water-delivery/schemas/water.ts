// Contratos de entrada do módulo Entrega de Água (Zod).
// Usados tanto pelos formulários (React Hook Form) quanto pelas mutations,
// para que a validação de negócio não fique presa à camada de apresentação.

import { z } from "zod";

const texto = (max = 160) => z.string().trim().max(max);

export const pontoSchema = z.object({
  id: z.string().uuid().optional(),
  codigo: texto(80).optional(),
  predio: texto(80).min(1, "Informe o prédio."),
  andar: texto(80).min(1, "Informe o andar/setor."),
  espaco: texto(120).min(1, "Informe o espaço."),
  descricao: texto(400).nullish(),
  bags_padrao: z.coerce.number().int().min(0).max(999).default(1),
  bag_tipo: texto(60).nullish(),
  bag_capacidade_litros: z.coerce.number().min(0).max(10000).nullish(),
  estoque_minimo: z.coerce.number().int().min(0).max(9999).nullish(),
  frequencia: texto(40).nullish(),
  prioridade: z.enum(["baixa", "media", "alta", "critica"]).default("media"),
  tempo_estimado_min: z.coerce.number().int().min(0).max(1440).nullish(),
  ordem: z.coerce.number().int().min(0).max(9999).default(0),
  responsavel: texto(120).nullish(),
  contato_telefone: texto(30).nullish(),
  acesso_observacoes: texto(400).nullish(),
  requer_epi: z.boolean().default(false),
  epi_descricao: texto(200).nullish(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  observacao: texto(400).nullish(),
  ativo: z.boolean().default(true),
});

export type PontoInput = z.infer<typeof pontoSchema>;

export const entregaSchema = z.object({
  visita_id: z.string().uuid(),
  bags_entregues: z.coerce.number().int().min(0).max(999),
  bags_recolhidas: z.coerce.number().int().min(0).max(999),
  estoque_antes: z.coerce.number().int().min(0).max(999).nullish(),
  estoque_depois: z.coerce.number().int().min(0).max(999).nullish(),
  condicao: texto(120).nullish(),
  recebido_por: texto(120).nullish(),
  observacao: texto(400).nullish(),
  fotos: z.array(z.string().url()).default([]),
});

export type EntregaInput = z.infer<typeof entregaSchema>;

export const filtroSolicitacaoSchema = z.object({
  ponto_id: z.string().uuid("Selecione o ponto."),
  tipo: texto(40).min(1, "Informe o tipo de serviço."),
  prioridade: z.enum(["baixa", "media", "alta"]).default("media"),
  descricao: texto(600).nullish(),
  solicitante_nome: texto(120).nullish(),
  telefone: texto(30).nullish(),
  motivos: z.array(texto(80)).default([]),
  motivo_outro: texto(200).nullish(),
  disponibilidade_acesso: texto(200).nullish(),
});

export type FiltroSolicitacaoInput = z.infer<typeof filtroSolicitacaoSchema>;

export const movimentoBagSchema = z.object({
  tipo: z.enum(["entrada", "saida", "perda", "avaria", "ajuste", "retorno"]),
  quantidade: z.coerce.number().int().min(1).max(9999),
  motivo: texto(300).nullish(),
});

export type MovimentoBagInput = z.infer<typeof movimentoBagSchema>;

/** Mensagem curta do primeiro erro — usada nos toasts dos formulários. */
export function primeiroErro(erro: z.ZodError): string {
  return erro.issues[0]?.message ?? "Dados inválidos.";
}

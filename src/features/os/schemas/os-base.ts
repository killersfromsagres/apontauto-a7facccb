import { z } from "zod";

export const osStatusSchema = z.enum([
  "aberto",
  "backorder",
  "concluido",
  "cancelado",
  "aguardando_aprovacao",
  "em_execucao",
  "fechado",
  "nao_executada",
  "nao_validado",
  "pendente",
  "programado",
  "validado",
]);

export type OSStatus = z.infer<typeof osStatusSchema>;

export const osPrioritySchema = z.enum(["baixa", "media", "alta", "critica"]);
export type OSPriority = z.infer<typeof osPrioritySchema>;

export const osBaseSchema = z.object({
  id: z.string().uuid(),
  numero: z.string(),
  descricao: z.string(),
  local: z.string(),
  equipe: z.string(),
  status: osStatusSchema,
  prioridade: osPrioritySchema,
  data_criacao: z.string(),
  data_vencimento: z.string().optional(),
  sla_horas: z.number().optional(),
  tecnico_responsavel: z.string().optional(),
  fotos: z.array(z.string()).default([]),
  pecas: z.array(z.any()).default([]),
  problemas: z.array(z.any()).default([]),
});

export type OSBase = z.infer<typeof osBaseSchema>;

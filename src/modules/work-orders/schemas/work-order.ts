import { z } from "zod";

export const workOrderStatusSchema = z.enum([
  "aberta",
  "programada",
  "em_execucao",
  "aguardando_material",
  "aguardando_aprovacao",
  "pausada",
  "concluida",
  "cancelada",
]);

export const workOrderPrioritySchema = z.enum(["critica", "alta", "media", "baixa"]);

export const workOrderModalitySchema = z.enum([
  "corretiva",
  "refrigeracao",
  "eletrica",
  "civil",
  "hidraulica",
  "chaveiro",
  "pintura",
  "jardinagem",
  "preventiva",
  "inspecao",
  "pmoc",
]);

const trimmed = (max: number) => z.string().trim().max(max);

export const workOrderInputSchema = z.object({
  numeroOs: trimmed(40).min(1, "Informe o número da OS"),
  modalidade: workOrderModalitySchema,
  descricao: trimmed(2000).min(3, "Descreva a atividade"),
  solicitante: trimmed(160).optional().or(z.literal("")),
  predio: trimmed(120).optional().or(z.literal("")),
  andar: trimmed(120).optional().or(z.literal("")),
  local: trimmed(160).optional().or(z.literal("")),
  equipe: trimmed(80).optional().or(z.literal("")),
  prioridade: workOrderPrioritySchema.default("media"),
  status: workOrderStatusSchema.default("aberta"),
  criadoEm: z.string().datetime().optional(),
});

export type WorkOrderInput = z.infer<typeof workOrderInputSchema>;

export const workOrderTransitionSchema = z.object({
  id: z.string().min(1),
  modalidade: workOrderModalitySchema,
  de: workOrderStatusSchema,
  para: workOrderStatusSchema,
  motivo: trimmed(500).optional(),
});

export const materialRequestSchema = z.object({
  descricao: trimmed(300).min(2, "Descreva o material"),
  quantidade: z.coerce.number().int().min(1).max(9999),
  urgencia: z.enum(["baixa", "media", "alta"]).default("media"),
  observacao: trimmed(500).optional().or(z.literal("")),
});

export type MaterialRequest = z.infer<typeof materialRequestSchema>;

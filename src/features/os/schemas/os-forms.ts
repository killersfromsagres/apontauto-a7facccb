import { z } from "zod";

export const equipeSchema = z.object({
  id: z.string().uuid(),
  nome: z.string(),
  colaboradores: z.string(),
  ordem: z.number().default(0),
});

export type Equipe = z.infer<typeof equipeSchema>;

export const osFormSchema = z.object({
  numero_os: z.string().min(1, "Número da OS é obrigatório"),
  nome_os: z.string().min(1, "Descrição é obrigatória"),
  predio: z.string().optional(),
  andar: z.string().optional(),
  local: z.string().optional(),
  tipo: z.string().optional(),
  equipe: z.string().optional(),
  prioridade: z.string().default("media"),
  solicitante: z.string().optional(),
});

export type OSFormValues = z.infer<typeof osFormSchema>;

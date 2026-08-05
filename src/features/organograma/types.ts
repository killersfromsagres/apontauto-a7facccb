import { z } from "zod";

export const NodeSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().min(2),
  cargo: z.string().min(2),
  email: z.string().email().optional(),
  foto_url: z.string().url().optional(),
  parent_id: z.string().uuid().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type OrgNode = z.infer<typeof NodeSchema>;

export type OrgMemberInput = {
  nome: string;
  cargo: string;
  email?: string;
  foto_url?: string;
  parent_id: string | null;
};

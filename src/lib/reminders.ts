import { supabase } from "@/integrations/supabase/client";

export type Priority = "baixa" | "media" | "alta" | "critica";

export interface Reminder {
  id: string;
  titulo: string;
  categoria: string;
  data: string; // YYYY-MM-DD
  prioridade: Priority;
  observacoes: string;
  anexos: string[];
  concluido: boolean;
  createdAt: number;
}

interface Row {
  id: string;
  titulo: string;
  categoria: string;
  data: string;
  prioridade: string;
  observacoes: string | null;
  anexos: unknown;
  concluido: boolean;
  created_at: string;
}

function fromRow(r: Row): Reminder {
  return {
    id: r.id,
    titulo: r.titulo,
    categoria: r.categoria,
    data: r.data,
    prioridade: (r.prioridade as Priority) ?? "media",
    observacoes: r.observacoes ?? "",
    anexos: Array.isArray(r.anexos) ? (r.anexos as string[]) : [],
    concluido: r.concluido,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export async function listReminders(): Promise<Reminder[]> {
  const { data, error } = await supabase
    .from("reminders")
    .select("*")
    .order("data", { ascending: true });
  if (error) throw error;
  return (data as Row[]).map(fromRow);
}

export async function createReminder(input: Omit<Reminder, "id" | "createdAt">): Promise<Reminder> {
  const { data: userRes } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("reminders")
    .insert({
      titulo: input.titulo,
      categoria: input.categoria,
      data: input.data,
      prioridade: input.prioridade,
      observacoes: input.observacoes,
      anexos: input.anexos as never,
      concluido: input.concluido,
      created_by: userRes.user?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as Row);
}

export async function updateReminder(id: string, patch: Partial<Reminder>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.titulo !== undefined) payload.titulo = patch.titulo;
  if (patch.categoria !== undefined) payload.categoria = patch.categoria;
  if (patch.data !== undefined) payload.data = patch.data;
  if (patch.prioridade !== undefined) payload.prioridade = patch.prioridade;
  if (patch.observacoes !== undefined) payload.observacoes = patch.observacoes;
  if (patch.anexos !== undefined) payload.anexos = patch.anexos;
  if (patch.concluido !== undefined) payload.concluido = patch.concluido;
  const { error } = await supabase.from("reminders").update(payload as never).eq("id", id);
  if (error) throw error;
}

export async function deleteReminder(id: string): Promise<void> {
  const { error } = await supabase.from("reminders").delete().eq("id", id);
  if (error) throw error;
}

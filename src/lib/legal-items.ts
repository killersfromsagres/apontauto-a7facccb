import { supabase } from "@/integrations/supabase/client";

export type Periodicidade = "bimestral" | "semestral" | "anual";
export type LegalStatus = "em_dia" | "proximo" | "vencido" | "concluido";

export interface LegalItem {
  id: string;
  titulo: string;
  descricao: string;
  periodicidade: Periodicidade;
  ultimaExecucao: string | null; // YYYY-MM-DD
  proximaExecucao: string; // YYYY-MM-DD
  responsavel: string;
  concluido: boolean;
  createdAt: number;
}

interface Row {
  id: string;
  titulo: string;
  descricao: string | null;
  periodicidade: string;
  ultima_execucao: string | null;
  proxima_execucao: string;
  responsavel: string | null;
  concluido: boolean;
  created_at: string;
}

function fromRow(r: Row): LegalItem {
  return {
    id: r.id,
    titulo: r.titulo,
    descricao: r.descricao ?? "",
    periodicidade: (r.periodicidade as Periodicidade) ?? "anual",
    ultimaExecucao: r.ultima_execucao,
    proximaExecucao: r.proxima_execucao,
    responsavel: r.responsavel ?? "",
    concluido: r.concluido,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export function monthsFor(p: Periodicidade): number {
  return p === "bimestral" ? 2 : p === "semestral" ? 6 : 12;
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function statusOf(item: LegalItem): LegalStatus {
  if (item.concluido) return "concluido";
  const d = daysUntil(item.proximaExecucao);
  if (d < 0) return "vencido";
  if (d <= 15) return "proximo";
  return "em_dia";
}

export async function listLegalItems(): Promise<LegalItem[]> {
  const { data, error } = await supabase
    .from("legal_items" as never)
    .select("*")
    .order("proxima_execucao", { ascending: true });
  if (error) throw error;
  return (data as unknown as Row[]).map(fromRow);
}

export async function createLegalItem(
  input: Omit<LegalItem, "id" | "createdAt">,
): Promise<LegalItem> {
  const { data: userRes } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("legal_items" as never)
    .insert({
      titulo: input.titulo,
      descricao: input.descricao || null,
      periodicidade: input.periodicidade,
      ultima_execucao: input.ultimaExecucao,
      proxima_execucao: input.proximaExecucao,
      responsavel: input.responsavel || null,
      concluido: input.concluido,
      created_by: userRes.user?.id ?? null,
    } as never)
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as unknown as Row);
}

export async function updateLegalItem(id: string, patch: Partial<LegalItem>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.titulo !== undefined) payload.titulo = patch.titulo;
  if (patch.descricao !== undefined) payload.descricao = patch.descricao || null;
  if (patch.periodicidade !== undefined) payload.periodicidade = patch.periodicidade;
  if (patch.ultimaExecucao !== undefined) payload.ultima_execucao = patch.ultimaExecucao;
  if (patch.proximaExecucao !== undefined) payload.proxima_execucao = patch.proximaExecucao;
  if (patch.responsavel !== undefined) payload.responsavel = patch.responsavel || null;
  if (patch.concluido !== undefined) payload.concluido = patch.concluido;
  const { error } = await supabase
    .from("legal_items" as never)
    .update(payload as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteLegalItem(id: string): Promise<void> {
  const { error } = await supabase.from("legal_items" as never).delete().eq("id", id);
  if (error) throw error;
}

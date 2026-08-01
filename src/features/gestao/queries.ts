import { supabase } from "@/integrations/supabase/client";
import type { GestaoNota, GestaoOverview } from "./types";

/** Visão consolidada da operação (RPC protegida por `can_access_gestao`). */
export async function fetchGestaoOverview(dias: number): Promise<GestaoOverview> {
  const { data, error } = await supabase.rpc("gestao_overview", { p_dias: dias });
  if (error) throw error;
  return data as unknown as GestaoOverview;
}

export async function fetchGestaoNotas(): Promise<GestaoNota[]> {
  const { data, error } = await supabase
    .from("gestao_notas")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as GestaoNota[];
}

export async function createGestaoNota(input: {
  titulo: string;
  detalhe: string;
  modulo: string;
  prioridade: string;
}) {
  const { data: s } = await supabase.auth.getUser();
  const uid = s.user?.id;
  if (!uid) throw new Error("Sessão expirada. Entre novamente.");
  const { error } = await supabase.from("gestao_notas").insert({ ...input, created_by: uid });
  if (error) throw error;
}

export async function updateGestaoNotaSituacao(id: string, situacao: string) {
  const { error } = await supabase.from("gestao_notas").update({ situacao }).eq("id", id);
  if (error) throw error;
}

export async function deleteGestaoNota(id: string) {
  const { error } = await supabase.from("gestao_notas").delete().eq("id", id);
  if (error) throw error;
}

// Registro de evidências de chuva — persistência e listagem.
import { supabase } from "@/integrations/supabase/client";

export type ChuvaEvidencia = {
  id: string;
  data: string; // YYYY-MM-DD
  mensagem: string;
  imagem_data_url: string;
  temperatura: number | null;
  condicao: string | null;
  precipitacao_mm: number | null;
  prob_chuva: number | null;
  created_at: string;
  created_by: string | null;
};

export async function listarEvidencias(limit = 50): Promise<ChuvaEvidencia[]> {
  const { data, error } = await supabase
    .from("taludes_chuva_evidencias" as never)
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as ChuvaEvidencia[];
}

export async function registrarEvidencia(input: {
  data: string;
  mensagem: string;
  imagem_data_url: string;
  temperatura: number | null;
  condicao: string | null;
  precipitacao_mm: number | null;
  prob_chuva: number | null;
}): Promise<ChuvaEvidencia> {
  const { data: sess } = await supabase.auth.getUser();
  const uid = sess.user?.id ?? null;
  const { data, error } = await supabase
    .from("taludes_chuva_evidencias" as never)
    .insert({ ...input, created_by: uid } as never)
    .select("*")
    .single();
  if (error) throw error;
  return data as unknown as ChuvaEvidencia;
}

export async function removerEvidencia(id: string): Promise<void> {
  const { error } = await supabase
    .from("taludes_chuva_evidencias" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

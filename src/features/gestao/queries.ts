import { supabase } from "@/integrations/supabase/client";
import type {
  DashboardPrefs,
  GestaoFiltros,
  GestaoNota,
  GestaoOverviewV2,
  OsConsolidada,
} from "./types";

/** Visão consolidada da operação (RPC protegida por `can_access_gestao`). */
export async function fetchGestaoOverview(dias: number): Promise<GestaoOverviewV2> {
  const { data, error } = await supabase.rpc("gestao_overview_v2", { p_dias: dias });
  if (error) throw error;
  return data as unknown as GestaoOverviewV2;
}

/** OS consolidadas (backorder + corretiva + refrigeração) sem duplicar registros. */
export async function fetchOsConsolidada(f: GestaoFiltros): Promise<OsConsolidada[]> {
  const { data, error } = await supabase.rpc("gestao_os_consolidada", {
    p_dias: f.dias,
    p_modulo: f.modulo,
    p_equipe: f.equipe,
    p_predio: f.predio,
    p_status: f.status,
    p_criticidade: f.criticidade,
    p_limit: 800,
  });
  if (error) throw error;
  return (data ?? []) as unknown as OsConsolidada[];
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
  const uid = (await supabase.auth.getUser()).data.user?.id;
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

const PREFS_PADRAO: DashboardPrefs = { layout_json: {}, filters_json: {}, favorites_json: [] };

export async function fetchPrefs(): Promise<DashboardPrefs> {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return PREFS_PADRAO;
  const { data, error } = await supabase
    .from("gestor_dashboard_preferences")
    .select("layout_json, filters_json, favorites_json")
    .eq("user_id", uid)
    .maybeSingle();
  if (error) throw error;
  if (!data) return PREFS_PADRAO;
  return {
    layout_json: (data.layout_json ?? {}) as DashboardPrefs["layout_json"],
    filters_json: (data.filters_json ?? {}) as DashboardPrefs["filters_json"],
    favorites_json: (data.favorites_json ?? []) as string[],
  };
}

export async function savePrefs(prefs: DashboardPrefs) {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) throw new Error("Sessão expirada. Entre novamente.");
  const { error } = await supabase
    .from("gestor_dashboard_preferences")
    .upsert({ user_id: uid, ...prefs }, { onConflict: "user_id" });
  if (error) throw error;
}

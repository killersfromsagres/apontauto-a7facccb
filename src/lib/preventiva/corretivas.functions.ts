import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export const getLatestCorretivas = createServerFn({ method: "GET" }).handler(
  async () => {
    const query = supabase
      .from("corretiva_os")
      .select("*, corretiva_problemas(gravidade, status_gestor)")
      .in("status", ["aberta", "em_andamento"])
      .or("tipo_importacao.is.null,tipo_importacao.neq.backorder_mensal")
      .order("data_criacao", { ascending: true })
      .limit(1000);

    const { data, error } = await query;
    if (!error) return data ?? [];

    // Mantém a programação operacional mesmo se a relação de criticidade
    // estiver temporariamente indisponível por cache de schema ou permissão.
    const fallback = await supabase
      .from("corretiva_os")
      .select("*")
      .in("status", ["aberta", "em_andamento"])
      .or("tipo_importacao.is.null,tipo_importacao.neq.backorder_mensal")
      .order("data_criacao", { ascending: true })
      .limit(1000);

    if (fallback.error) throw fallback.error;
    return (fallback.data ?? []).map((item: Record<string, unknown>) => ({
      ...item,
      corretiva_problemas: [],
    }));
  },
);

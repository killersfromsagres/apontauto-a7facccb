import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const isOpenCorrective = (status: unknown) => {
  const normalized = String(status ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return !["concluida", "concluido", "cancelada", "cancelado"].includes(
    normalized,
  );
};

export const getLatestCorretivas = createServerFn({ method: "GET" }).handler(
  async () => {
    const query = supabase
      .from("corretiva_os")
      .select("*, corretiva_problemas(gravidade, status_gestor)")
      .or("tipo_importacao.is.null,tipo_importacao.neq.backorder_mensal")
      .order("data_sla", { ascending: true, nullsFirst: false })
      .order("data_programada", { ascending: true, nullsFirst: false })
      .order("data_criacao", { ascending: true, nullsFirst: false })
      .limit(1000);

    const { data, error } = await query;
    if (!error)
      return (data ?? []).filter((item: { status?: unknown }) =>
        isOpenCorrective(item.status),
      );

    // Mantém a programação operacional mesmo se a relação de criticidade
    // estiver temporariamente indisponível por cache de schema ou permissão.
    const fallback = await supabase
      .from("corretiva_os")
      .select("*")
      .or("tipo_importacao.is.null,tipo_importacao.neq.backorder_mensal")
      .order("data_sla", { ascending: true, nullsFirst: false })
      .order("data_programada", { ascending: true, nullsFirst: false })
      .order("data_criacao", { ascending: true, nullsFirst: false })
      .limit(1000);

    if (fallback.error) throw fallback.error;
    return (fallback.data ?? [])
      .filter((item: { status?: unknown }) => isOpenCorrective(item.status))
      .map((item: Record<string, unknown>) => ({
        ...item,
        corretiva_problemas: [],
      }));
  },
);

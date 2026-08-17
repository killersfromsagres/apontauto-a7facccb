import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Busca a árvore de ativos (prédios, andares, locais) para geração automática.
 */
export const getAssetTree = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    // Busca prédios, andares e locais únicos da base de ativos
    const { data, error } = await supabaseAdmin
      .from("agua_filtro_ativos")
      .select("predio, andar_setor, local_instalacao")
      .not("predio", "is", null);

    if (error) throw error;

    const tree: Record<string, Record<string, string[]>> = {};

    data?.forEach(item => {
      const p = item.predio || "Sem Prédio";
      const a = item.andar_setor || "Térreo";
      const l = item.local_instalacao || "Geral";

      if (!tree[p]) tree[p] = {};
      if (!tree[p][a]) tree[p][a] = [];
      if (!tree[p][a].includes(l)) {
        tree[p][a].push(l);
      }
    });

    return tree;
  });

export const saveProgramacaoHistory = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    nome_arquivo: z.string(),
    configuracao: z.any(),
    total_os: z.number(),
    resumo_equipes: z.record(z.number()),
  }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    
    const { data: inserted, error } = await supabaseAdmin
      .from("preventiva_programacao_historico")
      .insert({
        nome_arquivo: data.nome_arquivo,
        configuracao: data.configuracao,
        total_os: data.total_os,
        resumo_equipes: data.resumo_equipes,
      })
      .select()
      .single();

    if (error) throw error;
    return inserted;
  });

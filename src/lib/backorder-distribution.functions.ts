import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const distributeBackorderToField = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        osList: z.array(
          z.object({
            os: z.string(),
            nome: z.string(),
            ativo: z.string(),
            predio: z.string(),
            andar: z.string(),
            espaco: z.string(),
            equipe: z.string(),
            data_solicitacao: z.string(),
            outros: z.string(),
            centro_custo: z.string().optional(),
            status_origem: z.string(),
          }),
        ),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { osList } = data;
    if (!osList.length) return { success: true, count: 0 };

    // Separamos por módulo baseado na equipe
    const refrig = osList.filter((os) => os.equipe.toUpperCase().includes("REFRIGERACAO") || os.equipe.toUpperCase().includes("CLIMATIZACAO"));
    const corretiva = osList.filter((os) => !refrig.includes(os));

    const results = { refrig: 0, corretiva: 0 };

    if (refrig.length > 0) {
      const { error } = await supabaseAdmin.from("refrigeracao_os").upsert(
        refrig.map((os) => ({
          numero_os: os.os,
          nome_os: os.nome,
          ativo: os.ativo,
          predio: os.predio,
          andar: os.andar,
          local: os.espaco,
          equipe: os.equipe,
          status: "aberta",
          tipo: "Corretiva",
          equipamento: os.nome, // Usamos o nome como fallback de equipamento
          patrimonio: "",
        })),
        { onConflict: "numero_os" }
      );
      if (error) throw new Error(`Refrigeração sync failed: ${error.message}`);
      results.refrig = refrig.length;
    }

    if (corretiva.length > 0) {
      const { error } = await supabaseAdmin.from("corretiva_os").upsert(
        corretiva.map((os) => ({
          numero_os: os.os,
          nome_os: os.nome,
          ativo: os.ativo,
          predio: os.predio,
          andar: os.andar,
          local: os.espaco,
          equipe: os.equipe,
          status: "aberta",
          tipo: "Corretiva",
          equipamento: os.nome,
          solicitante: os.outros,
          data_criacao: new Date(os.data_solicitacao).toISOString().split('T')[0],
        })),
        { onConflict: "numero_os" }
      );
      if (error) throw new Error(`Corretiva sync failed: ${error.message}`);
      results.corretiva = corretiva.length;
    }

    return { success: true, ...results };
  });

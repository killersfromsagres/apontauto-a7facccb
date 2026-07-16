import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RowSchema = z.object({
  os: z.string().min(1),
  nome: z.string().default(""),
  ativo: z.string().default(""),
  equipe: z.string().default(""),
  termino_sla: z.string().nullable().optional(),
  data_solicitacao: z.string(),
  outros: z.string().default(""),
  atividade_auto: z.string().default("Outros Serviços"),
});

const UpsertInput = z.object({
  rows: z.array(RowSchema).max(5000),
});

/** Lista todas as OS (ativas + finalizadas). O front separa por status. */
export const listBackorder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("backorder_os")
      .select("*")
      .order("data_solicitacao", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/** Faz o upsert das linhas da planilha, aplicando overrides manuais. */
export const upsertBackorderRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertInput.parse(d))
  .handler(async ({ context, data }) => {
    if (data.rows.length === 0) return { upserted: 0 };

    // Buscar overrides manuais para as OSs importadas
    const osList = data.rows.map((r) => r.os);
    const { data: overrides, error: eOvr } = await context.supabase
      .from("backorder_atividade_override")
      .select("os, atividade")
      .in("os", osList);
    if (eOvr) throw new Error(eOvr.message);
    const ovrMap = new Map<string, string>();
    (overrides ?? []).forEach((o: { os: string; atividade: string }) =>
      ovrMap.set(o.os, o.atividade),
    );

    // Buscar linhas já existentes para preservar `finalizado`/`atividade_manual`
    const { data: existing, error: eEx } = await context.supabase
      .from("backorder_os")
      .select("os, finalizado, atividade_manual, atividade, data_finalizacao, predio, andar, espaco")
      .in("os", osList);
    if (eEx) throw new Error(eEx.message);
    const exMap = new Map<string, {
      finalizado: boolean;
      atividade_manual: boolean;
      atividade: string;
      data_finalizacao: string | null;
      predio: string;
      andar: string;
      espaco: string;
    }>();
    (existing ?? []).forEach((e: {
      os: string;
      finalizado: boolean;
      atividade_manual: boolean;
      atividade: string;
      data_finalizacao: string | null;
      predio: string;
      andar: string;
      espaco: string;
    }) => exMap.set(e.os, e));

    const payload = data.rows.map((r) => {
      const ex = exMap.get(r.os);
      const ovr = ovrMap.get(r.os);
      const atividade = ex?.atividade_manual
        ? ex.atividade
        : (ovr ?? r.atividade_auto ?? "Outros Serviços");
      return {
        os: r.os,
        nome: r.nome,
        ativo: r.ativo,
        equipe: r.equipe,
        termino_sla: r.termino_sla ?? null,
        data_solicitacao: r.data_solicitacao,
        outros: r.outros,
        atividade,
        atividade_manual: ex?.atividade_manual ?? Boolean(ovr),
        finalizado: ex?.finalizado ?? false,
        data_finalizacao: ex?.data_finalizacao ?? null,
        predio: ex?.predio ?? "",
        andar: ex?.andar ?? "",
        espaco: ex?.espaco ?? "",
      };
    });

    const { error } = await context.supabase
      .from("backorder_os")
      .upsert(payload, { onConflict: "os" });
    if (error) throw new Error(error.message);
    return { upserted: payload.length };
  });

/** Atualiza a localização (Prédio/Andar/Espaço) já resolvida no cliente. */
export const updateBackorderLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      updates: z.array(z.object({
        os: z.string(),
        predio: z.string().default(""),
        andar: z.string().default(""),
        espaco: z.string().default(""),
      })).max(5000),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    for (const u of data.updates) {
      await context.supabase
        .from("backorder_os")
        .update({ predio: u.predio, andar: u.andar, espaco: u.espaco })
        .eq("os", u.os);
    }
    return { ok: true };
  });

export const toggleFinalizado = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ os: z.string(), finalizado: z.boolean() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("backorder_os")
      .update({
        finalizado: data.finalizado,
        data_finalizacao: data.finalizado ? new Date().toISOString() : null,
      })
      .eq("os", data.os);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setAtividadeManual = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ os: z.string(), atividade: z.string().min(1) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase
      .from("backorder_os")
      .update({ atividade: data.atividade, atividade_manual: true })
      .eq("os", data.os);
    if (error) throw new Error(error.message);
    await context.supabase
      .from("backorder_atividade_override")
      .upsert({ os: data.os, atividade: data.atividade }, { onConflict: "os" });
    return { ok: true };
  });

export const deleteBackorderOS = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ os: z.string() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("backorder_os").delete().eq("os", data.os);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* -------- assets_ref -------- */

export const listAssetsRef = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("assets_ref")
      .select("ativo, denominacao")
      .order("ativo");
    if (error) throw new Error(error.message);
    return (data ?? []) as { ativo: string; denominacao: string }[];
  });

export const upsertAssetsRef = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      rows: z.array(z.object({
        ativo: z.string().min(1),
        denominacao: z.string().default(""),
      })).max(20000),
      replaceAll: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ context, data }) => {
    if (data.replaceAll) {
      await context.supabase.from("assets_ref").delete().neq("ativo", "");
    }
    if (data.rows.length === 0) return { upserted: 0 };
    const { error } = await context.supabase
      .from("assets_ref")
      .upsert(data.rows, { onConflict: "ativo" });
    if (error) throw new Error(error.message);
    return { upserted: data.rows.length };
  });

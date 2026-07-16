import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PointSchema = z.object({ x: z.number(), y: z.number() });
const PolygonSchema = z.array(PointSchema);

export const listMaps = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("talude_maps")
      .select("id, nome, image_path, image_width, image_height, periodicidade_dias, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMapDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const [{ data: map, error: e1 }, { data: taludes, error: e2 }] = await Promise.all([
      context.supabase.from("talude_maps").select("*").eq("id", data.id).maybeSingle(),
      context.supabase.from("taludes").select("*").eq("map_id", data.id).order("numero"),
    ]);
    if (e1) throw new Error(e1.message);
    if (e2) throw new Error(e2.message);
    if (!map) throw new Error("Mapa não encontrado");
    return { map, taludes: taludes ?? [] };
  });

export const createMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    nome: string;
    image_path: string;
    image_width?: number;
    image_height?: number;
    periodicidade_dias?: number;
  }) =>
    z
      .object({
        nome: z.string().min(1).max(200),
        image_path: z.string().min(1),
        image_width: z.number().int().positive().optional(),
        image_height: z.number().int().positive().optional(),
        periodicidade_dias: z.number().int().positive().max(3650).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { data: row, error } = await context.supabase
      .from("talude_maps")
      .insert({
        owner_id: context.userId,
        nome: data.nome,
        image_path: data.image_path,
        image_width: data.image_width ?? null,
        image_height: data.image_height ?? null,
        periodicidade_dias: data.periodicidade_dias ?? 180,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("talude_maps").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertTalude = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    map_id: string;
    numero: number;
    nome?: string | null;
    polygon: Array<{ x: number; y: number }>;
    status?: "programado" | "em_execucao" | "finalizado";
    data_programada?: string | null;
    data_execucao?: string | null;
    data_conclusao?: string | null;
    proxima_data?: string | null;
    periodicidade_dias?: number | null;
    observacoes?: string | null;
  }) =>
    z
      .object({
        id: z.string().uuid().optional(),
        map_id: z.string().uuid(),
        numero: z.number().int().positive(),
        nome: z.string().max(200).nullable().optional(),
        polygon: PolygonSchema,
        status: z.enum(["programado", "em_execucao", "finalizado"]).optional(),
        data_programada: z.string().nullable().optional(),
        data_execucao: z.string().nullable().optional(),
        data_conclusao: z.string().nullable().optional(),
        proxima_data: z.string().nullable().optional(),
        periodicidade_dias: z.number().int().positive().nullable().optional(),
        observacoes: z.string().max(2000).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const payload = {
      owner_id: context.userId,
      map_id: data.map_id,
      numero: data.numero,
      nome: data.nome ?? null,
      polygon: data.polygon,
      ...(data.status !== undefined ? { status: data.status } : {}),
      ...(data.data_programada !== undefined ? { data_programada: data.data_programada } : {}),
      ...(data.data_execucao !== undefined ? { data_execucao: data.data_execucao } : {}),
      ...(data.data_conclusao !== undefined ? { data_conclusao: data.data_conclusao } : {}),
      ...(data.proxima_data !== undefined ? { proxima_data: data.proxima_data } : {}),
      ...(data.periodicidade_dias !== undefined ? { periodicidade_dias: data.periodicidade_dias } : {}),
      ...(data.observacoes !== undefined ? { observacoes: data.observacoes } : {}),
    };


    if (data.id) {
      const { data: row, error } = await context.supabase
        .from("taludes")
        .update(payload)
        .eq("id", data.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return row;
    }
    const { data: row, error } = await context.supabase
      .from("taludes")
      .insert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteTalude = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { error } = await context.supabase.from("taludes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

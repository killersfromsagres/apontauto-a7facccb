import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export interface Point {
  x: number;
  y: number;
}

export interface TaludeMarcacao {
  id: string;
  map_id: string;
  nome: string | null;
  rotulo: string | null;
  polygon: Point[];
  cor: string;
  opacidade: number;
  created_at?: string;
  bloqueado: boolean;
  visivel: boolean;
  espessura_linha?: number;
  numero?: number;
  tamanho_legenda?: number;
  numero_x?: number | null;
  numero_y?: number | null;
  numero_scale?: number;
  numero_cor_fundo?: string;
  numero_cor_texto?: string;
  data_x?: number | null;
  data_y?: number | null;
  data_scale?: number;
  data_text_scale?: number;
  prazo_rotulo?: string | null;
  numero_visivel?: boolean;
  data_visivel?: boolean;
  icone_tipo?: "arvore" | "interdicao" | null;
  icone_x?: number | null;
  icone_y?: number | null;
  icone_scale?: number;
  icone_visivel?: boolean;
  icone_data_x?: number | null;
  icone_data_y?: number | null;
  icone_data_scale?: number;
  icone_data_visivel?: boolean;
  icone_data_texto?: string | null;
}

export interface TaludeMap {
  id: string;
  nome: string;
  image_url: string;
  image_width: number;
  image_height: number;
  created_at: string;
}

export const getTaludeMaps = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("talude_maps")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as TaludeMap[];
});

export const getTaludeMarcacoes = createServerFn({ method: "GET" })
  .validator((mapId: string) => mapId)
  .handler(async ({ data: mapId }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("talude_marcacoes")
      .select("*")
      .eq("map_id", mapId);
    if (error) throw error;
    return (data ?? []).map((m) => ({
      ...m,
      polygon: m.polygon as unknown as Point[],
      numero_cor_fundo: (m as any).numero_cor_fundo || "#0f172a",
      numero_cor_texto: (m as any).numero_cor_texto || "#ffffff",
      data_text_scale: Number((m as any).data_text_scale ?? 1),
    })) as unknown as TaludeMarcacao[];
  });

export const saveTaludeMarcacao = createServerFn({ method: "POST" })
  .validator((data: Partial<TaludeMarcacao> & { map_id: string }) => data)
  .handler(async ({ data }) => {
    console.log("Iniciando salvamento de demarcação:", data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...payload } = data;

    let userId: string;
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const authHeader = request?.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (token) {
      const {
        data: { user },
        error: userError,
      } = await supabaseAdmin.auth.getUser(token);
      if (user) {
        userId = user.id;
      } else {
        console.error("Token inválido no getUser:", userError);
        const { data: sessionResponse } = await supabaseAdmin.auth.getSession();
        if (sessionResponse.session?.user) userId = sessionResponse.session.user.id;
        else throw new Error("Unauthorized: Sessão inválida ou expirada no servidor.");
      }
    } else {
      const { data: sessionResponse } = await supabaseAdmin.auth.getSession();
      if (sessionResponse.session?.user) userId = sessionResponse.session.user.id;
      else throw new Error("Unauthorized: Sessão inválida ou expirada. Por favor, faça login novamente.");
    }

    try {
      if (id) {
        const { error } = await supabaseAdmin
          .from("talude_marcacoes")
          .update({ ...payload, updated_at: new Date().toISOString() } as any)
          .eq("id", id);
        if (error) throw error;
        return { id };
      }

      let nextNumero = 1;
      if (data.map_id) {
        const { data: maxRecord, error: fetchError } = await supabaseAdmin
          .from("talude_marcacoes")
          .select("numero")
          .eq("map_id", data.map_id)
          .order("numero", { ascending: false })
          .limit(1);
        if (!fetchError && maxRecord?.length) nextNumero = (maxRecord[0].numero || 0) + 1;
      }

      const insertPayload = {
        ...payload,
        owner_id: userId,
        numero: payload.numero ?? nextNumero,
        map_id: data.map_id,
        cor: payload.cor || "#ef4444",
        opacidade: payload.opacidade ?? 0.3,
        visivel: payload.visivel ?? true,
        bloqueado: payload.bloqueado ?? false,
        espessura_linha: payload.espessura_linha ?? 4,
        tamanho_legenda: payload.tamanho_legenda ?? 1,
        numero_x: payload.numero_x ?? null,
        numero_y: payload.numero_y ?? null,
        numero_scale: payload.numero_scale ?? 1,
        numero_cor_fundo: payload.numero_cor_fundo ?? "#0f172a",
        numero_cor_texto: payload.numero_cor_texto ?? "#ffffff",
        data_x: payload.data_x ?? null,
        data_y: payload.data_y ?? null,
        data_scale: payload.data_scale ?? 1,
        data_text_scale: payload.data_text_scale ?? 1,
        numero_visivel: payload.numero_visivel ?? true,
        data_visivel: payload.data_visivel ?? true,
        icone_tipo: payload.icone_tipo ?? null,
        icone_x: payload.icone_x ?? null,
        icone_y: payload.icone_y ?? null,
        icone_scale: payload.icone_scale ?? 1,
        icone_visivel: payload.icone_visivel ?? true,
        icone_data_x: payload.icone_data_x ?? null,
        icone_data_y: payload.icone_data_y ?? null,
        icone_data_scale: payload.icone_data_scale ?? 1,
        icone_data_visivel: payload.icone_data_visivel ?? true,
        icone_data_texto: payload.icone_data_texto ?? null,
      };

      const { data: inserted, error } = await supabaseAdmin
        .from("talude_marcacoes")
        .insert(insertPayload as any)
        .select()
        .single();
      if (error) throw error;
      return inserted;
    } catch (err: any) {
      console.error("Falha fatal no saveTaludeMarcacao:", err);
      throw new Error(`Erro ao salvar demarcação: ${err.message || "Erro desconhecido"}`);
    }
  });

export const deleteTaludeMarcacao = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("talude_marcacoes").delete().eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const createTaludeMap = createServerFn({ method: "POST" })
  .validator((data: { nome: string; image_url: string; image_width: number; image_height: number }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let userId: string;
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const authHeader = request?.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (token) {
      const {
        data: { user },
      } = await supabaseAdmin.auth.getUser(token);
      if (user) userId = user.id;
      else {
        const { data: sessionResponse } = await supabaseAdmin.auth.getSession();
        if (sessionResponse.session?.user) userId = sessionResponse.session.user.id;
        else throw new Error("Unauthorized: Sessão inválida no servidor.");
      }
    } else {
      const { data: sessionResponse } = await supabaseAdmin.auth.getSession();
      if (sessionResponse.session?.user) userId = sessionResponse.session.user.id;
      else throw new Error("Unauthorized: Sessão necessária para criar mapas.");
    }

    const insertData: any = { ...data, owner_id: userId };
    const { data: inserted, error } = await supabaseAdmin
      .from("talude_maps")
      .insert(insertData)
      .select()
      .maybeSingle();
    if (error) throw error;
    if (!inserted) throw new Error("Failed to insert map record");
    return inserted as unknown as TaludeMap;
  });

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
}

export interface TaludeMap {
  id: string;
  nome: string;
  image_url: string;
  image_width: number;
  image_height: number;
  created_at: string;
}

export const getTaludeMaps = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("talude_maps")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    // Map database field names to our interface if they differ
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
    
    // We store 'polygon' as JSONB in the DB, so we cast it to Point[]
    return (data ?? []).map(m => ({
      ...m,
      polygon: m.polygon as unknown as Point[]
    })) as unknown as TaludeMarcacao[];
  });

export const saveTaludeMarcacao = createServerFn({ method: "POST" })
  .validator((data: Partial<TaludeMarcacao> & { map_id: string }) => data)
  .handler(async ({ data }) => {
    console.log("Iniciando salvamento de demarcação:", data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...payload } = data;
    
    // Resolve owner_id safely
    let userId: string;
    
    // Obtemos os headers da requisição atual para extrair o token
    const { getWebRequest } = await import("@tanstack/react-start/server");
    const request = getWebRequest();
    const authHeader = request?.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.substring(7) : null;

    if (token) {
      const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
      if (user) {
        userId = user.id;
      } else {
        console.error("Token inválido no getUser:", userError);
        throw new Error("Unauthorized: Sessão inválida ou expirada no servidor.");
      }
    } else {
      // Fallback para getSession se o token não estiver no header
      const { data: sessionResponse } = await supabaseAdmin.auth.getSession();
      if (sessionResponse.session?.user) {
        userId = sessionResponse.session.user.id;
      } else {
        console.error("Nenhum token ou sessão encontrada nos headers/contexto.");
        throw new Error("Unauthorized: Sessão inválida ou expirada. Por favor, faça login novamente.");
      }
    }

    try {
      if (id) {
        console.log("Atualizando demarcação existente:", id);
        const { error } = await supabaseAdmin
          .from("talude_marcacoes")
          .update({
            ...payload,
            updated_at: new Date().toISOString()
          } as any)
          .eq("id", id);
        
        if (error) {
          console.error("Erro ao atualizar talude_marcacao:", error);
          throw error;
        }
        return { id };
      } else {
        console.log("Inserindo nova demarcação para o mapa:", data.map_id);
        
        let nextNumero = 1;
        if (data.map_id) {
          const { data: maxRecord, error: fetchError } = await supabaseAdmin
            .from("talude_marcacoes")
            .select("numero")
            .eq("map_id", data.map_id)
            .order("numero", { ascending: false })
            .limit(1);
          
          if (!fetchError && maxRecord && maxRecord.length > 0) {
            nextNumero = (maxRecord[0].numero || 0) + 1;
          }
        }

        const insertPayload = {
          ...payload,
          owner_id: userId,
          numero: nextNumero,
          map_id: data.map_id,
          cor: payload.cor || "#ef4444",
          opacidade: payload.opacidade ?? 0.3,
          visivel: payload.visivel ?? true,
          bloqueado: payload.bloqueado ?? false,
          espessura_linha: payload.espessura_linha ?? 4
        };
        
        console.log("Payload de inserção:", insertPayload);

        const { data: inserted, error } = await supabaseAdmin
          .from("talude_marcacoes")
          .insert(insertPayload as any)
          .select()
          .single();
          
        if (error) {
          console.error("Erro ao inserir talude_marcacao:", error);
          throw error;
        }
        console.log("Demarcação inserida com sucesso:", inserted.id);
        return inserted;
      }
    } catch (err: any) {
      console.error("Falha fatal no saveTaludeMarcacao:", err);
      throw new Error(`Erro ao salvar demarcação: ${err.message || 'Erro desconhecido'}`);
    }
  });

export const deleteTaludeMarcacao = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("talude_marcacoes")
      .delete()
      .eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const createTaludeMap = createServerFn({ method: "POST" })
  .validator((data: { nome: string; image_url: string; image_width: number; image_height: number }) => data)
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: userResponse, error: userError } = await supabaseAdmin.auth.getUser();
    
    if (userError) throw userError;

    const insertData: any = {
      ...data,
      owner_id: userResponse.user?.id
    };

    console.log("Inserting map data:", insertData);

    const { data: inserted, error } = await supabaseAdmin
      .from("talude_maps")
      .insert(insertData)
      .select()
      .maybeSingle();
    
    if (error) {
      console.error("Database error inserting map:", error);
      throw error;
    }
    if (!inserted) throw new Error("Failed to insert map record");
    return inserted as unknown as TaludeMap;
  });




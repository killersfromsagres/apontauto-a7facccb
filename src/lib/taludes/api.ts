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
    const { id, ...payload } = data;
    
    if (id) {
      const { error } = await supabase
        .from("talude_marcacoes")
        .update(payload as any)
        .eq("id", id);
      if (error) throw error;
      return { id };
    } else {
      // Need owner_id for insert policies if not using admin
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Unauthorized");

      const { data: inserted, error } = await supabase
        .from("talude_marcacoes")
        .insert({
          ...payload,
          owner_id: userData.user.id,
          numero: Math.floor(Math.random() * 1000000) // Dummy numero for constraint
        } as any)
        .select()
        .single();
      if (error) throw error;
      return inserted;
    }
  });

export const deleteTaludeMarcacao = createServerFn({ method: "POST" })
  .validator((id: string) => id)
  .handler(async ({ data: id }) => {
    const { error } = await supabase
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
      owner_id: userResponse.user?.id || null
    };

    const { data: inserted, error } = await supabaseAdmin
      .from("talude_maps")
      .insert(insertData)
      .select()
      .single();
    
    if (error) throw error;
    return inserted as unknown as TaludeMap;
  });




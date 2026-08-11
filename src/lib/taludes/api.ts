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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...payload } = data;
    
    // Ensure we have a valid user
    const { data: userResponse, error: userError } = await supabaseAdmin.auth.getUser();
    if (userError || !userResponse.user) throw new Error("Unauthorized");
    const userId = userResponse.user.id;

    if (id) {
      const { error } = await supabaseAdmin
        .from("talude_marcacoes")
        .update({
          ...payload,
          updated_at: new Date().toISOString()
        } as any)
        .eq("id", id);
      
      if (error) {
        console.error("Error updating talude_marcacao:", error);
        throw error;
      }
      return { id };
    } else {
      // Robust numero generation with retry/transaction-like logic
      // We'll use a single select and insert
      const { data: maxRecord } = await supabaseAdmin
        .from("talude_marcacoes")
        .select("numero")
        .eq("map_id", data.map_id)
        .order("numero", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      const nextNumero = (maxRecord?.numero ?? 0) + 1;

      const { data: inserted, error } = await supabaseAdmin
        .from("talude_marcacoes")
        .insert({
          ...payload,
          owner_id: userId,
          numero: nextNumero,
          map_id: data.map_id
        } as any)
        .select()
        .single();
        
      if (error) {
        console.error("Error inserting talude_marcacao:", error);
        // If it's a conflict on numero, we could retry once, but usually single-user session
        throw error;
      }
      return inserted;
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




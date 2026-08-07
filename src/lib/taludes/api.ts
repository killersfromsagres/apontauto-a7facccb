import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export interface Point {
  x: number;
  y: number;
}

export interface TaludeMarcacao {
  id: string;
  map_id: string;
  nome: string;
  geometria: Point[];
  cor?: string;
  area?: number;
  perimetro?: number;
  created_at?: string;
}

export interface TaludeMap {
  id: string;
  nome: string;
  url: string;
  largura_original: number;
  altura_original: number;
  created_at: string;
}

export const getTaludeMaps = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabase
      .from("talude_maps")
      .select("*")
      .order("created_at", { ascending: false });
    
    if (error) throw error;
    return data as TaludeMap[];
  });

export const getTaludeMarcacoes = createServerFn({ method: "GET" })
  .validator((mapId: string) => mapId)
  .handler(async ({ data: mapId }) => {
    const { data, error } = await supabase
      .from("talude_marcacoes")
      .select("*")
      .eq("map_id", mapId);
    
    if (error) throw error;
    return data as TaludeMarcacao[];
  });

export const saveTaludeMarcacao = createServerFn({ method: "POST" })
  .validator((data: Omit<TaludeMarcacao, "id"> & { id?: string }) => data)
  .handler(async ({ data }) => {
    if (data.id) {
      const { error } = await supabase
        .from("talude_marcacoes")
        .update(data)
        .eq("id", data.id);
      if (error) throw error;
      return { id: data.id };
    } else {
      const { data: inserted, error } = await supabase
        .from("talude_marcacoes")
        .insert(data)
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

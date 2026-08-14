import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { RondaInput } from "./types";

export const saveRondasFromExcel = createServerFn({ method: "POST" })
  .validator((data: RondaInput[]) => data)
  .handler(async ({ data }) => {
    const { error } = await supabase
      .from("rondas_calhas")
      .insert(data.map(item => ({
        ...item,
        status: 'pendente' as any
      })));
    
    if (error) throw new Error(error.message);
    return { success: true };
  });

export const updateRonda = createServerFn({ method: "POST" })
  .validator((data: any) => data)
  .handler(async ({ data }) => {
    const { id, ...updates } = data;
    const { error } = await supabase
      .from("rondas_calhas")
      .update({
        ...updates,
        status: 'concluido' as any,
        realizado_em: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", id);
    
    if (error) throw new Error(error.message);
    return { success: true };
  });

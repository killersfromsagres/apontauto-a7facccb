import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export const getLatestCorretivas = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabase
      .from("corretiva_os")
      .select("*")
      .eq("status", "Em Aberto")
      .order("data_criacao", { ascending: true })
      .limit(50);
    
    if (error) throw error;
    return data;
  });

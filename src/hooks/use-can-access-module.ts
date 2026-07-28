import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ModuleAction = "read" | "create" | "update" | "delete" | "export" | "admin";

/**
 * Autorização real (banco): consulta `can_access_module`, a mesma função usada
 * pelas políticas RLS. A proteção visual do menu continua existindo, mas a
 * decisão de verdade vem daqui/do Postgres.
 */
export function useCanAccessModule(moduleKey: string, action: ModuleAction = "read") {
  const query = useQuery({
    queryKey: ["can-access-module", moduleKey, action],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_access_module", {
        module_key: moduleKey,
        required_action: action,
      });
      if (error) throw error;
      return Boolean(data);
    },
  });

  return {
    allowed: query.data ?? false,
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}

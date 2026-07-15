import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyAllowedMenus } from "@/lib/users.functions";

/**
 * Retorna os menus permitidos ao usuário logado.
 * `allowed = null` significa acesso total (default).
 */
export function useAllowedMenus() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getMyAllowedMenus);

  const { data, isLoading } = useQuery({
    queryKey: ["my-allowed-menus"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return null as string[] | null;
      try {
        const res = await fetchFn();
        return res.allowed;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        qc.invalidateQueries({ queryKey: ["my-allowed-menus"] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  return { allowed: (data ?? null) as string[] | null, loading: isLoading };
}

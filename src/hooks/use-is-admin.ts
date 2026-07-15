import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getIsAdmin } from "@/lib/users.functions";

/**
 * Retorna se o usuário logado é admin. Compartilha o cache via React Query
 * (uma única chamada por sessão, revalidada apenas no SIGNED_IN/OUT/USER_UPDATED).
 */
export function useIsAdmin() {
  const qc = useQueryClient();
  const check = useServerFn(getIsAdmin);

  const { data, isLoading } = useQuery({
    queryKey: ["is-admin"],
    // Sem sessão ⇒ resolve como false imediatamente, sem tocar a rede.
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return false;
      try {
        const res = await check();
        return Boolean(res?.isAdmin);
      } catch {
        return false;
      }
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        qc.invalidateQueries({ queryKey: ["is-admin"] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  return { isAdmin: Boolean(data), loading: isLoading };
}

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess } from "@/lib/users.functions";

export type MyAccess = { isAdmin: boolean; allowed: string[] | null };

const EMPTY: MyAccess = { isAdmin: false, allowed: null };

/**
 * Fonte única de verdade para `isAdmin` e `allowedMenus`.
 * Uma chamada por sessão, compartilhada por todos os consumidores via React Query.
 */
export function useMyAccess() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getMyAccess);

  const { data, isLoading } = useQuery<MyAccess>({
    queryKey: ["my-access"],
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return EMPTY;
      try {
        return (await fetchFn()) as MyAccess;
      } catch {
        return EMPTY;
      }
    },
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        qc.invalidateQueries({ queryKey: ["my-access"] });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  return { access: data ?? EMPTY, loading: isLoading };
}

import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess } from "@/lib/users.functions";

export type MyAccess = { isAdmin: boolean; allowed: string[] | null };

const EMPTY: MyAccess = { isAdmin: false, allowed: null };

// Inscrição única global no auth: em vez de cada componente que usa
// `useMyAccess` (sidebar, header, dashboards…) registrar seu próprio
// `onAuthStateChange`, mantemos apenas um listener e propagamos a
// invalidação para todos os QueryClients ativos.
const registeredClients = new Set<QueryClient>();
let globalAuthUnsubscribe: (() => void) | null = null;

function ensureGlobalAuthListener() {
  if (typeof window === "undefined" || globalAuthUnsubscribe) return;
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
    for (const qc of registeredClients) {
      qc.invalidateQueries({ queryKey: ["my-access"] });
    }
  });
  globalAuthUnsubscribe = () => data.subscription.unsubscribe();
}

/**
 * Fonte única de verdade para `isAdmin` e `allowedMenus`.
 * Uma chamada por sessão, compartilhada por todos os consumidores via React Query,
 * com apenas UMA inscrição global de auth para toda a aplicação.
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
    ensureGlobalAuthListener();
    registeredClients.add(qc);
    return () => {
      registeredClients.delete(qc);
    };
  }, [qc]);

  return { access: data ?? EMPTY, loading: isLoading };
}

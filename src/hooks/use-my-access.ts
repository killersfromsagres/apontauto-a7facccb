import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess } from "@/lib/users.functions";

export type MyAccess = { isAdmin: boolean; allowed: string[] | null };

// Falha fechada: `null` significa acesso total, então estados sem sessão,
// erro de rede ou token ainda não anexado não podem cair em "ver tudo".
const EMPTY: MyAccess = { isAdmin: false, allowed: [] };
async function readAccessDirect(uid: string): Promise<MyAccess> {
  const [roleRes, umaRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", uid),
    supabase.from("user_module_access").select("module_key").eq("user_id", uid),
  ]);
  const isAdmin = (roleRes.data ?? []).some((r: any) => r.role === "admin");
  if (isAdmin) return { isAdmin: true, allowed: null };
  // Negação por padrão: a fonte de verdade é `user_module_access`
  // (mesma semântica de `get_my_allowed_menus`/`can_access_module` no banco).
  const allowed = (umaRes.data ?? []).map((r: any) => r.module_key as string);
  return { isAdmin: false, allowed };
}

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
      const uid = s.session.user?.id;
      try {
        const res = (await fetchFn()) as MyAccess;
        // Se o servidor voltou vazio por qualquer motivo transitório,
        // tenta reconstruir a partir do banco via RLS (self-read).
        if (!res.isAdmin && Array.isArray(res.allowed) && res.allowed.length === 0 && uid) {
          return await readAccessDirect(uid);
        }
        return res;
      } catch {
        if (uid) {
          try {
            return await readAccessDirect(uid);
          } catch {
            return EMPTY;
          }
        }
        return EMPTY;
      }
    },

    // Cache curto de 60s: evita refetch a cada navegação/foco (principal
    // gargalo de "piscada" ao trocar de rota), mas mantém latência baixa
    // quando o admin altera permissões (usuário sente em <1 min ou pode
    // clicar em "Recarregar permissões").
    staleTime: 5 * 60_000,
    gcTime: 15 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

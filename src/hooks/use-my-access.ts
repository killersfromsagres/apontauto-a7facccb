import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess } from "@/lib/users.functions";

export type MyAccess = { isAdmin: boolean; allowed: string[] | null };

// Falha fechada: `null` significa acesso total, então estados sem sessão,
// erro de rede ou token ainda não anexado não podem cair em "ver tudo".
const EMPTY: MyAccess = { isAdmin: false, allowed: [] };
const OWNER_ADMIN_EMAIL = "gabrielvlp33@gmail.com";
const FULL_ADMIN: MyAccess = { isAdmin: true, allowed: null };

function isOwnerAdminEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase() === OWNER_ADMIN_EMAIL;
}

async function readAccessDirect(uid: string): Promise<MyAccess> {
  const [roleRes, profRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", uid),
    supabase.from("profiles").select("allowed_menus").eq("id", uid).maybeSingle(),
  ]);
  const isAdmin = (roleRes.data ?? []).some((r: any) => r.role === "admin");
  if (isAdmin) return { isAdmin: true, allowed: null };
  const allowed = (profRes.data?.allowed_menus as string[] | null | undefined) ?? [];
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
      const email = s.session.user?.email ?? null;
      const uid = s.session.user?.id;
      // Fallback fail-open EXCLUSIVO para o dono/admin principal.
      if (isOwnerAdminEmail(email)) {
        try {
          const res = (await fetchFn()) as MyAccess;
          return { ...res, isAdmin: true, allowed: null };
        } catch {
          return FULL_ADMIN;
        }
      }
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

    // Sempre revalida ao montar / focar a aba para que alterações de
    // permissões feitas pelo admin apareçam imediatamente na próxima
    // navegação ou retorno à aba, sem depender de logout/login.
    staleTime: 0,
    gcTime: 5 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
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

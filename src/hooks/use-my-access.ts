import { useEffect } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyAccess } from "@/lib/users.functions";

export type MyAccess = { isAdmin: boolean; allowed: string[] | null };

// Falha fechada: `null` significa acesso total, então estados sem sessão,
// erro de rede ou token ainda não anexado não podem cair em "ver tudo".
const EMPTY: MyAccess = { isAdmin: false, allowed: [] };
const ACCESS_CACHE_PREFIX = "apontauto:my-access:";
const ACCESS_CACHE_TTL_MS = 72 * 60 * 60 * 1000;

type CachedAccess = {
  savedAt: number;
  value: MyAccess;
};

function accessCacheKey(uid: string) {
  return `${ACCESS_CACHE_PREFIX}${uid}`;
}

function readCachedAccess(uid: string): MyAccess | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(accessCacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedAccess;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > ACCESS_CACHE_TTL_MS) return null;
    if (!parsed.value || typeof parsed.value.isAdmin !== "boolean") return null;
    if (parsed.value.allowed !== null && !Array.isArray(parsed.value.allowed)) return null;
    return parsed.value;
  } catch {
    return null;
  }
}

function writeCachedAccess(uid: string, value: MyAccess) {
  if (typeof window === "undefined") return;
  try {
    const payload: CachedAccess = { savedAt: Date.now(), value };
    window.localStorage.setItem(accessCacheKey(uid), JSON.stringify(payload));
  } catch {
    // Storage cheio/privado não pode bloquear o acesso online normal.
  }
}

function clearCachedAccess() {
  if (typeof window === "undefined") return;
  try {
    for (let index = window.localStorage.length - 1; index >= 0; index--) {
      const key = window.localStorage.key(index);
      if (key?.startsWith(ACCESS_CACHE_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // best effort
  }
}

async function readAccessDirect(uid: string): Promise<MyAccess> {
  const [roleRes, umaRes] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", uid),
    supabase.from("user_module_access").select("module_key").eq("user_id", uid),
  ]);
  if (roleRes.error) throw roleRes.error;
  if (umaRes.error) throw umaRes.error;

  const isAdmin = (roleRes.data ?? []).some((r: any) => r.role === "admin");
  if (isAdmin) return { isAdmin: true, allowed: null };
  // Negação por padrão: a fonte de verdade é `user_module_access`
  // (mesma semântica de `get_my_allowed_menus`/`can_access_module` no banco).
  const allowed = (umaRes.data ?? []).map((r: any) => r.module_key as string);
  return { isAdmin: false, allowed };
}

// Inscrição única global no auth: em vez de cada componente que usa
// `useMyAccess` registrar seu próprio `onAuthStateChange`, mantemos apenas um
// listener e propagamos a invalidação para todos os QueryClients ativos.
const registeredClients = new Set<QueryClient>();
let globalAuthUnsubscribe: (() => void) | null = null;

function ensureGlobalAuthListener() {
  if (typeof window === "undefined" || globalAuthUnsubscribe) return;
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") clearCachedAccess();
    if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
    for (const qc of registeredClients) {
      qc.invalidateQueries({ queryKey: ["my-access"] });
    }
  });
  globalAuthUnsubscribe = () => data.subscription.unsubscribe();
}

/**
 * Fonte única de verdade para `isAdmin` e `allowedMenus`.
 *
 * Quando o aparelho está sem internet, usa o último snapshot de permissões do
 * próprio usuário por até 72h. Isso permite abrir Corretiva Novo depois de uma
 * perda de sinal/reabertura do PWA sem transformar uma falha de rede em bloqueio
 * de acesso. Ao reconectar, as permissões voltam a ser validadas no servidor.
 */
export function useMyAccess() {
  const qc = useQueryClient();
  const fetchFn = useServerFn(getMyAccess);

  const { data, isLoading } = useQuery<MyAccess>({
    queryKey: ["my-access"],
    networkMode: "always",
    queryFn: async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) return EMPTY;
      const uid = s.session.user?.id;
      if (!uid) return EMPTY;

      const cached = readCachedAccess(uid);
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return cached ?? EMPTY;
      }

      try {
        const res = (await fetchFn()) as MyAccess;
        // Se o servidor voltou vazio por qualquer motivo transitório,
        // tenta reconstruir a partir do banco via RLS (self-read).
        const resolved =
          !res.isAdmin && Array.isArray(res.allowed) && res.allowed.length === 0
            ? await readAccessDirect(uid)
            : res;
        writeCachedAccess(uid, resolved);
        return resolved;
      } catch {
        try {
          const direct = await readAccessDirect(uid);
          writeCachedAccess(uid, direct);
          return direct;
        } catch {
          return cached ?? EMPTY;
        }
      }
    },

    staleTime: 30_000,
    gcTime: 15 * 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
    refetchOnMount: false,
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

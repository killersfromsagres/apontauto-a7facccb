import { supabase } from "@/integrations/supabase/client";
import { ASSIGNABLE_MENU_KEYS, type MenuKey } from "@/lib/permission-catalog";

type Role = "admin" | "user";

type CreateRestrictedUserInput = {
  login: string;
  password: string;
  fullName?: string;
  role: Role;
  allowedMenus: MenuKey[];
};

const LOGIN_RE = /^[a-z0-9._-]{3,30}$/;

function sanitizeMenus(raw: unknown): MenuKey[] {
  if (!Array.isArray(raw)) return [];
  return Array.from(
    new Set(
      raw
        .filter((key): key is string => typeof key === "string")
        .filter((key): key is MenuKey =>
          (ASSIGNABLE_MENU_KEYS as readonly string[]).includes(key),
        ),
    ),
  );
}

function validateCreate(input: unknown): CreateRestrictedUserInput {
  if (!input || typeof input !== "object") throw new Error("Dados inválidos.");
  const { login, password, fullName, role, allowedMenus } = input as Record<string, unknown>;
  const normalizedLogin = typeof login === "string" ? login.trim().toLowerCase() : "";

  if (!LOGIN_RE.test(normalizedLogin)) {
    throw new Error("Login deve ter 3-30 caracteres (letras minúsculas, números, . _ -).");
  }
  if (typeof password !== "string" || password.length < 6) {
    throw new Error("A senha deve ter pelo menos 6 caracteres.");
  }

  const normalizedRole: Role = role === "admin" ? "admin" : "user";
  return {
    login: normalizedLogin,
    password,
    fullName: typeof fullName === "string" && fullName.trim() ? fullName.trim() : undefined,
    role: normalizedRole,
    allowedMenus: normalizedRole === "admin" ? [] : sanitizeMenus(allowedMenus),
  };
}

async function invokeAdminEdge(body: Record<string, unknown>) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message);

  let accessToken = sessionData.session?.access_token ?? null;
  if (!accessToken) {
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error) throw new Error("Sessão expirada. Entre novamente.");
    accessToken = refreshed.data.session?.access_token ?? null;
  }
  if (!accessToken) throw new Error("Sessão expirada. Entre novamente.");

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!url || !publishableKey) {
    throw new Error("Configuração pública do Supabase indisponível.");
  }

  const response = await fetch(`${url}/functions/v1/admin-user-management`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const json = (await response.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
    [key: string]: unknown;
  };

  if (response.status === 401) {
    throw new Error(json.error || "Sessão expirada. Entre novamente.");
  }
  if (response.status === 403) {
    throw new Error(json.error || "Apenas administradores podem executar esta ação.");
  }
  if (!response.ok) {
    throw new Error(json.error || json.message || `Falha administrativa (${response.status}).`);
  }

  return json;
}

/**
 * Função client-side deliberada: o JWT da sessão ativa é enviado diretamente
 * para a Edge Function segura. Nenhuma service-role key trafega no browser.
 * O `as any` mantém compatibilidade com `useServerFn` já usado pela tela;
 * `useServerFn` apenas estabiliza a referência e invoca a função recebida.
 */
export const createAppUserWithPermissions = (async (options: {
  data: unknown;
}) => {
  const data = validateCreate(options?.data);
  return invokeAdminEdge({
    action: "create",
    login: data.login,
    password: data.password,
    fullName: data.fullName,
    role: data.role,
    allowedMenus: data.allowedMenus,
  });
}) as any;

export const resetAppUserPassword = (async (options: {
  data: unknown;
}) => {
  const input = options?.data as Record<string, unknown> | undefined;
  const userId = input?.userId;
  const password = input?.password;

  if (typeof userId !== "string" || userId.length < 10) {
    throw new Error("Usuário inválido.");
  }
  if (typeof password !== "string" || password.length < 6) {
    throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
  }

  await invokeAdminEdge({
    action: "resetPassword",
    userId,
    password,
  });
  return { ok: true };
}) as any;

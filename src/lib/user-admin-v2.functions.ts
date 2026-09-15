import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ASSIGNABLE_MENU_KEYS, type MenuKey } from "@/lib/permission-catalog";

type Role = "admin" | "user";
type CreateRestrictedUserInput = {
  login: string;
  password: string;
  fullName?: string;
  role: Role;
  allowedMenus: MenuKey[];
};

const LOGIN_DOMAIN = "apontauto.local";
const LOGIN_RE = /^[a-z0-9._-]{3,30}$/;

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (
      isNewSupabaseApiKey(supabaseKey) &&
      headers.get("Authorization") === `Bearer ${supabaseKey}`
    ) {
      headers.delete("Authorization");
    }
    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function projectRefFromUrl(url: string): string | null {
  try {
    const hostname = new URL(url).hostname;
    const suffix = ".supabase.co";
    return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : null;
  } catch {
    return null;
  }
}

function getAuthEnv() {
  const viteUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const viteKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  const viteProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID as string | undefined;

  const url = viteUrl || process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const publishableKey =
    viteKey || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  const expectedProjectId =
    viteProjectId || process.env.VITE_SUPABASE_PROJECT_ID || process.env.SUPABASE_PROJECT_ID;

  if (!url || !publishableKey) {
    throw new Error("Configuração pública do Supabase indisponível no servidor.");
  }

  if (expectedProjectId) {
    const resolvedProjectId = projectRefFromUrl(url);
    if (resolvedProjectId && resolvedProjectId !== expectedProjectId) {
      throw new Error(
        `Configuração Supabase inconsistente: projeto ativo ${resolvedProjectId}, esperado ${expectedProjectId}.`,
      );
    }
  }

  return { url, publishableKey };
}

async function getAdminClient() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    void supabaseAdmin.auth;
    return supabaseAdmin;
  } catch (error) {
    console.error("[user-admin] admin client unavailable", error);
    throw new Error(
      "Configuração administrativa do backend indisponível. Verifique SUPABASE_SERVICE_ROLE_KEY do projeto ativo.",
    );
  }
}

const requireAdmin = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (!request?.headers) throw new Error("Sessão inválida. Entre novamente.");

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Sessão expirada. Entre novamente.");
  }

  const token = authHeader.slice(7).trim();
  if (!token || token.split(".").length !== 3) {
    throw new Error("Sessão inválida. Entre novamente.");
  }

  const { url, publishableKey } = getAuthEnv();
  const supabase = createClient<Database>(url, publishableKey, {
    global: {
      fetch: createSupabaseFetch(publishableKey),
      headers: { Authorization: `Bearer ${token}` },
    },
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims(token);
  const userId = claimsResult?.claims?.sub;
  if (claimsError || !userId) throw new Error("Sessão expirada. Entre novamente.");

  const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (roleError) throw new Error(roleError.message);
  if (!isAdmin) throw new Error("Apenas administradores podem executar esta ação.");

  return next({ context: { userId } });
});

function loginToEmail(login: string) {
  const normalized = login.trim().toLowerCase();
  return normalized.includes("@") ? normalized : `${normalized}@${LOGIN_DOMAIN}`;
}

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

async function syncModuleAccess(
  supabaseAdmin: any,
  userId: string,
  allowed: readonly MenuKey[],
  grantedBy: string,
) {
  const { error: deleteError } = await supabaseAdmin
    .from("user_module_access")
    .delete()
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);

  if (allowed.length === 0) return;

  const { error: insertError } = await supabaseAdmin.from("user_module_access").insert(
    allowed.map((moduleKey) => ({
      user_id: userId,
      module_key: moduleKey,
      actions: ["read"],
      granted_by: grantedBy,
    })),
  );
  if (insertError) throw new Error(insertError.message);
}

/**
 * Cria uma conta e configura o RBAC já na mesma operação. Se qualquer etapa de
 * autorização falhar, a conta Auth recém-criada é removida em best-effort para
 * não deixar um usuário parcialmente provisionado.
 */
export const createAppUserWithPermissions = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validateCreate)
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getAdminClient();
    const email = loginToEmail(data.login);

    const { data: authResult, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { login: data.login, full_name: data.fullName },
    });
    if (authError) throw new Error(authError.message);

    const user = authResult.user;
    if (!user) throw new Error("O backend não retornou o usuário recém-criado.");

    try {
      const { error: roleError } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: user.id, role: data.role });
      if (roleError) throw new Error(roleError.message);

      const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
        {
          id: user.id,
          full_name: data.fullName ?? null,
          allowed_menus: data.role === "admin" ? null : data.allowedMenus,
        } as any,
        { onConflict: "id" },
      );
      if (profileError) throw new Error(profileError.message);

      if (data.role === "admin") {
        const { error: clearAccessError } = await supabaseAdmin
          .from("user_module_access")
          .delete()
          .eq("user_id", user.id);
        if (clearAccessError) throw new Error(clearAccessError.message);
      } else {
        await syncModuleAccess(supabaseAdmin, user.id, data.allowedMenus, context.userId);
      }
    } catch (error) {
      const { error: rollbackError } = await supabaseAdmin.auth.admin.deleteUser(user.id);
      if (rollbackError) {
        console.error("[user-admin] failed to rollback partially-created auth user", rollbackError);
      }
      throw error;
    }

    return {
      id: user.id,
      login: data.login,
      role: data.role,
      allowedMenus: data.role === "admin" ? null : data.allowedMenus,
    };
  });

/** Redefinição administrativa de senha; a senha nunca é retornada ou registrada. */
export const resetAppUserPassword = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((input: unknown) => {
    const userId = (input as any)?.userId;
    const password = (input as any)?.password;
    if (typeof userId !== "string" || userId.length < 10) throw new Error("Usuário inválido.");
    if (typeof password !== "string" || password.length < 6) {
      throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
    }
    return { userId, password };
  })
  .handler(async ({ data }) => {
    const supabaseAdmin = await getAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

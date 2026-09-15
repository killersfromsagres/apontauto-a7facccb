import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ASSIGNABLE_MENU_KEYS, type MenuKey } from "@/lib/permission-catalog";
export { MENU_KEYS, type MenuKey } from "@/lib/permission-catalog";

type Role = "admin" | "user";
type CreateUserInput = {
  login: string;
  password: string;
  fullName?: string;
  role: Role;
};

const LOGIN_DOMAIN = "apontauto.local";
const LOGIN_RE = /^[a-z0-9._-]{3,30}$/;

function isNewSupabaseApiKey(value: string): boolean {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

function createSupabaseFetch(supabaseKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request
        ? input.headers
        : undefined,
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

function getAuthEnv() {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error(
      "Configuração do backend indisponível. Recarregue o sistema e tente novamente.",
    );
  }

  return { url, publishableKey };
}

async function createUsersAdminClient() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    void supabaseAdmin.auth;
    return supabaseAdmin;
  } catch (err) {
    console.error("[users.functions] admin client unavailable", err);
    throw new Error("Configuração administrativa do backend indisponível.");
  }
}

async function invokeAdminEdge(
  token: string,
  body: Record<string, unknown>,
): Promise<Record<string, any>> {
  const { url, publishableKey } = getAuthEnv();
  const response = await fetch(`${url}/functions/v1/admin-user-management`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: publishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<string, any>;
  if (!response.ok) {
    throw new Error(
      payload.error || payload.message || `Falha administrativa (${response.status}).`,
    );
  }
  return payload;
}

const requireUsersAuth = createMiddleware({ type: "function" }).server(
  async ({ next }) => {
    const { url, publishableKey } = getAuthEnv();
    const request = getRequest();

    if (!request?.headers) {
      throw new Error("Sessão inválida. Entre novamente.");
    }

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("Sessão expirada. Entre novamente.");
    }

    const token = authHeader.replace("Bearer ", "");
    if (!token || token.split(".").length !== 3) {
      throw new Error("Sessão inválida. Entre novamente.");
    }

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

    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims?.sub) {
      throw new Error("Sessão expirada. Entre novamente.");
    }

    return next({
      context: {
        supabase,
        userId: data.claims.sub,
        claims: data.claims,
        token,
      },
    });
  },
);

export function loginToEmail(login: string) {
  const normalized = login.trim().toLowerCase();
  if (normalized.includes("@")) return normalized;
  return `${normalized}@${LOGIN_DOMAIN}`;
}

function validateCreate(input: unknown): CreateUserInput {
  if (!input || typeof input !== "object") throw new Error("Dados inválidos");
  const { login, password, fullName, role } = input as Record<string, unknown>;
  if (
    typeof login !== "string" ||
    !LOGIN_RE.test(login.trim().toLowerCase())
  ) {
    throw new Error(
      "Login deve ter 3-30 caracteres (letras minúsculas, números, . _ -).",
    );
  }
  if (typeof password !== "string" || password.length < 6) {
    throw new Error("A senha deve ter pelo menos 6 caracteres.");
  }
  return {
    login: login.trim().toLowerCase(),
    password,
    fullName:
      typeof fullName === "string" && fullName.trim()
        ? fullName.trim()
        : undefined,
    role: role === "admin" ? "admin" : "user",
  };
}

function requireUserId(input: unknown): { userId: string } {
  const userId = (input as any)?.userId;
  if (typeof userId !== "string" || userId.length < 10) {
    throw new Error("userId inválido.");
  }
  return { userId };
}

async function assertCallerIsAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem executar esta ação.");
}

export const getIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error) throw new Error(error.message);
    return { isAdmin: Boolean(data) };
  });

export const getMyAllowedMenus = createServerFn({ method: "GET" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_my_allowed_menus");
    if (error) throw new Error(error.message);
    return { allowed: (data as string[] | null) ?? null };
  });

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    const [adminRes, menusRes] = await Promise.all([
      context.supabase.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      }),
      context.supabase.rpc("get_my_allowed_menus"),
    ]);

    if (adminRes.error) throw new Error(adminRes.error.message);
    const isAdmin = Boolean(adminRes.data);
    if (isAdmin) return { isAdmin: true, allowed: null };

    let allowed: string[] | null;
    if (menusRes.error) {
      const { data: rows } = await context.supabase
        .from("user_module_access")
        .select("module_key")
        .eq("user_id", context.userId);
      allowed = (rows ?? []).map((row: any) => row.module_key as string);
    } else {
      allowed = (menusRes.data as string[] | null) ?? null;
    }

    return { isAdmin: false, allowed };
  });

export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator(validateCreate)
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    return invokeAdminEdge(context.token, {
      action: "create",
      login: data.login,
      password: data.password,
      fullName: data.fullName,
      role: data.role,
      allowedMenus: [],
    });
  });

export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const payload = await invokeAdminEdge(context.token, { action: "list" });
    return { users: Array.isArray(payload.users) ? payload.users : [] };
  });

export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator(requireUserId)
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    return invokeAdminEdge(context.token, {
      action: "delete",
      userId: data.userId,
    });
  });

export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator((input: unknown) => {
    const { userId } = requireUserId(input);
    return { userId, banned: Boolean((input as any)?.banned) };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    return invokeAdminEdge(context.token, {
      action: "setBanned",
      userId: data.userId,
      banned: data.banned,
    });
  });

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator((input: unknown) => {
    const { userId } = requireUserId(input);
    const role: Role = (input as any)?.role === "admin" ? "admin" : "user";
    return { userId, role };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    return invokeAdminEdge(context.token, {
      action: "setRole",
      userId: data.userId,
      role: data.role,
    });
  });

export const setUserAllowedMenus = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator((input: unknown) => {
    const { userId } = requireUserId(input);
    const raw = (input as any)?.allowed;
    const allowed: MenuKey[] = Array.isArray(raw)
      ? Array.from(
          new Set(
            raw
              .filter((key): key is string => typeof key === "string")
              .filter((key): key is MenuKey =>
                (ASSIGNABLE_MENU_KEYS as readonly string[]).includes(key),
              ),
          ),
        )
      : [];
    return { userId, allowed };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    return invokeAdminEdge(context.token, {
      action: "setMenus",
      userId: data.userId,
      allowedMenus: data.allowed,
    });
  });

export const provisionEncarregadosUser = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    return invokeAdminEdge(context.token, { action: "provisionEncarregados" });
  });

export const provisionChamadosClientLogin = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    return invokeAdminEdge(context.token, { action: "provisionChamados" });
  });

export const updateMemberOrder = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator((data: unknown) => {
    if (!Array.isArray(data)) throw new Error("Dados inválidos");
    return data as { id: string; display_order: number }[];
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const supabaseAdmin = await createUsersAdminClient();

    for (const item of data) {
      const { error } = await supabaseAdmin
        .from("organizational_members")
        .update({ display_order: item.display_order })
        .eq("id", item.id);
      if (error) throw error;
    }
    return { ok: true };
  });

export const updateOrganizationalMember = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") throw new Error("Dados inválidos");
    const { id, ...updates } = data as { id: string; [key: string]: any };
    if (!id) throw new Error("ID do membro é obrigatório");
    return { id, updates };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const supabaseAdmin = await createUsersAdminClient();
    const { error } = await supabaseAdmin
      .from("organizational_members")
      .update(data.updates as any)
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const addOrganizationalMember = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator((data: unknown) => {
    if (!data || typeof data !== "object") throw new Error("Dados inválidos");
    return data as Record<string, any>;
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const supabaseAdmin = await createUsersAdminClient();
    const { data: inserted, error } = await supabaseAdmin
      .from("organizational_members")
      .insert(data)
      .select()
      .single();
    if (error) throw error;
    return inserted;
  });

function generateTempPassword(length = 16): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

export const provisionControleUser = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const password = generateTempPassword();
    const payload = await invokeAdminEdge(context.token, {
      action: "provisionScoped",
      login: "controle",
      password,
      fullName: "Controle de Materiais",
      modules: ["controle-materiais"],
      actions: ["read", "create", "update"],
    });
    return { ...payload, tempPassword: password };
  });

export const provisionScopedUser = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator((input: unknown) => {
    const { login, password, fullName, modules, actions } = (input ?? {}) as Record<
      string,
      unknown
    >;
    if (
      typeof login !== "string" ||
      !LOGIN_RE.test(login.trim().toLowerCase())
    ) {
      throw new Error("Login inválido.");
    }
    if (typeof password !== "string" || password.length < 6) {
      throw new Error("A senha deve ter pelo menos 6 caracteres.");
    }
    if (!Array.isArray(modules) || modules.length === 0) {
      throw new Error("Informe ao menos um módulo.");
    }
    return {
      login: login.trim().toLowerCase(),
      password,
      fullName:
        typeof fullName === "string" && fullName.trim()
          ? fullName.trim()
          : login.trim().toLowerCase(),
      modules: modules.map(String),
      actions: Array.isArray(actions)
        ? actions.map(String)
        : ["read", "create", "update"],
    };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    return invokeAdminEdge(context.token, {
      action: "provisionScoped",
      login: data.login,
      password: data.password,
      fullName: data.fullName,
      modules: data.modules,
      actions: data.actions,
    });
  });

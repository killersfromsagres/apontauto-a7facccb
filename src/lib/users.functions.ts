import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Role = "admin" | "user";
type CreateUserInput = { login: string; password: string; fullName?: string; role: Role };

const OWNER_ADMIN_EMAIL = "gabrielvlp33@gmail.com";
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

    if (isNewSupabaseApiKey(supabaseKey) && headers.get("Authorization") === `Bearer ${supabaseKey}`) {
      headers.delete("Authorization");
    }

    headers.set("apikey", supabaseKey);
    return fetch(input, { ...init, headers });
  };
}

function getAuthEnv() {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    throw new Error("Configuração do backend indisponível. Recarregue o sistema e tente novamente.");
  }

  return { url, publishableKey };
}

async function createUsersAdminClient() {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Trigger the proxy to instantiate now so a missing env var throws here.
    void supabaseAdmin.auth;
    return supabaseAdmin;
  } catch (err) {
    console.error("[users.functions] admin client unavailable", err);
    throw new Error("Configuração administrativa do backend indisponível.");
  }
}


const requireUsersAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
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
      headers: {
        Authorization: `Bearer ${token}`,
      },
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
    },
  });
});

export const MENU_KEYS = [
  "dashboard",
  "programacao",
  "backorder",
  "lavanderia",
  "preventiva",
  "corretiva",
  "taludes",
  "programacao-taludes",
  "apontamentos",
  "painel-legal",
  "refrigeracao",
  "refrigeracao-gestor",
  "configuracoes",
] as const;
export type MenuKey = (typeof MENU_KEYS)[number];

export function loginToEmail(login: string) {
  const l = login.trim().toLowerCase();
  if (l.includes("@")) return l;
  return `${l}@${LOGIN_DOMAIN}`;
}

function validateCreate(input: unknown): CreateUserInput {
  if (!input || typeof input !== "object") throw new Error("Dados inválidos");
  const { login, password, fullName, role } = input as Record<string, unknown>;
  if (typeof login !== "string" || !LOGIN_RE.test(login.trim().toLowerCase())) {
    throw new Error("Login deve ter 3-30 caracteres (letras minúsculas, números, . _ -).");
  }
  if (typeof password !== "string" || password.length < 6) {
    throw new Error("A senha deve ter pelo menos 6 caracteres.");
  }
  const r: Role = role === "admin" ? "admin" : "user";
  return {
    login: login.trim().toLowerCase(),
    password,
    fullName: typeof fullName === "string" ? fullName.trim() : undefined,
    role: r,
  };
}

async function assertCallerIsAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem executar esta ação.");
}

function isOwnerAdminEmail(email: string | null | undefined) {
  return (email ?? "").trim().toLowerCase() === OWNER_ADMIN_EMAIL;
}

/**
 * Retorna se o usuário autenticado atual é administrador.
 */
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

/**
 * Retorna os itens de menu permitidos ao usuário logado. `null` = todos.
 */
export const getMyAllowedMenus = createServerFn({ method: "GET" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("get_my_allowed_menus");
    if (error) throw new Error(error.message);
    return { allowed: (data as string[] | null) ?? null };
  });

/**
 * Retorna admin + menus permitidos numa única chamada (metade dos requests
 * na inicialização do layout autenticado).
 */
export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    const email = typeof context.claims?.email === "string" ? context.claims.email : "";
    const [adminRes, menusRes] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("get_my_allowed_menus"),
    ]);
    if (adminRes.error) throw new Error(adminRes.error.message);
    const isAdmin = Boolean(adminRes.data) || isOwnerAdminEmail(email);
    if (isAdmin) return { isAdmin: true, allowed: null };

    // Se a RPC falhar por qualquer motivo, cair para leitura direta do perfil
    // via RLS (self-read). Nunca devolver `[]` implicitamente.
    let allowed: string[] | null;
    if (menusRes.error) {
      const { data: prof } = await context.supabase
        .from("profiles")
        .select("allowed_menus")
        .eq("id", context.userId)
        .maybeSingle();
      allowed = (prof?.allowed_menus as string[] | null | undefined) ?? null;
    } else {
      allowed = (menusRes.data as string[] | null) ?? null;
    }
    return { isAdmin: false, allowed };
  });

/**
 * Cria um novo usuário no backend com e-mail já confirmado e atribui o papel escolhido.
 */
export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator(validateCreate)
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    throw new Error("Criação de novos usuários está desativada neste sistema.");
    // eslint-disable-next-line no-unreachable
    return { id: "", login: data.login, role: data.role };
  });

/**
 * Lista todos os usuários com papel, status e permissões (admin only).
 */
export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const supabaseAdmin = await createUsersAdminClient();

    const { data: authList, error: authErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (authErr) throw new Error(authErr.message);

    const ids = authList.users.map((u) => u.id);
    const [{ data: roles }, { data: profs }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("profiles").select("id, full_name, allowed_menus").in("id", ids),
    ]);
    const roleMap = new Map<string, Role>();
    (roles ?? []).forEach((r: any) => {
      if (r.role === "admin" || !roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);
    });
    const profMap = new Map<string, { full_name: string | null; allowed_menus: string[] | null }>();
    (profs ?? []).forEach((p: any) =>
      profMap.set(p.id, { full_name: p.full_name, allowed_menus: p.allowed_menus }),
    );

    return {
      users: authList.users.map((u) => {
        const email = u.email ?? "";
        const login =
          (u.user_metadata as any)?.login ??
          (email.endsWith(`@${LOGIN_DOMAIN}`) ? email.split("@")[0] : email);
        const prof = profMap.get(u.id);
        const role = isOwnerAdminEmail(email) ? "admin" : (roleMap.get(u.id) ?? ("user" as Role));
        return {
          id: u.id,
          login,
          email,
          fullName: prof?.full_name ?? ((u.user_metadata as any)?.full_name ?? null),
          role,
          banned: Boolean((u as any).banned_until),
          allowedMenus: role === "admin" ? null : (prof ? prof.allowed_menus : []),
          createdAt: u.created_at,
        };
      }),
    };
  });

function requireUserId(input: unknown): { userId: string } {
  const uid = (input as any)?.userId;
  if (typeof uid !== "string" || uid.length < 10) throw new Error("userId inválido.");
  return { userId: uid };
}

/**
 * Remove um usuário completamente (admin only).
 */
export const deleteAppUser = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator(requireUserId)
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode excluir sua própria conta.");
    const supabaseAdmin = await createUsersAdminClient();
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Ativa/desativa um usuário (ban via Supabase Admin).
 */
export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator((input: unknown) => {
    const { userId } = requireUserId(input);
    const banned = Boolean((input as any)?.banned);
    return { userId, banned };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode desativar sua própria conta.");
    const supabaseAdmin = await createUsersAdminClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      ban_duration: data.banned ? "876000h" : "none",
    } as any);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Define o papel (admin/user) de um usuário.
 */
export const setUserRole = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator((input: unknown) => {
    const { userId } = requireUserId(input);
    const role: Role = (input as any)?.role === "admin" ? "admin" : "user";
    return { userId, role };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const supabaseAdmin = await createUsersAdminClient();
    const { data: target } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (isOwnerAdminEmail(target.user?.email)) {
      throw new Error("O administrador principal não pode perder o perfil admin.");
    }
    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Define quais itens de menu o usuário pode acessar.
 * `allowed = null` significa acesso total.
 */
export const setUserAllowedMenus = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator((input: unknown) => {
    const { userId } = requireUserId(input);
    const raw = (input as any)?.allowed;
    let allowed: string[] | null = null;
    if (Array.isArray(raw)) {
      allowed = raw
        .filter((k): k is string => typeof k === "string")
        .filter((k) => (MENU_KEYS as readonly string[]).includes(k));
    }
    return { userId, allowed };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const supabaseAdmin = await createUsersAdminClient();
    const { data: target } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (isOwnerAdminEmail(target.user?.email)) {
      return { ok: true };
    }
    // Upsert profile row (in case it doesn't exist yet)
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: data.userId, allowed_menus: data.allowed } as any, { onConflict: "id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

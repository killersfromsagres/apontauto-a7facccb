import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "user";
type CreateUserInput = { login: string; password: string; fullName?: string; role: Role };

const OWNER_ADMIN_EMAIL = "gabrielvlp33@gmail.com";
const LOGIN_DOMAIN = "apontauto.local";
const LOGIN_RE = /^[a-z0-9._-]{3,30}$/;

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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = typeof context.claims?.email === "string" ? context.claims.email : "";
    const [adminRes, menusRes] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("get_my_allowed_menus"),
    ]);
    if (adminRes.error) throw new Error(adminRes.error.message);
    if (menusRes.error) throw new Error(menusRes.error.message);
    const isAdmin = Boolean(adminRes.data) || isOwnerAdminEmail(email);
    return {
      isAdmin,
      allowed: isAdmin ? null : (menusRes.data as string[] | null),
    };
  });

/**
 * Cria um novo usuário no backend com e-mail já confirmado e atribui o papel escolhido.
 */
export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(validateCreate)
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: loginToEmail(data.login),
      password: data.password,
      email_confirm: true,
      user_metadata: { login: data.login, ...(data.fullName ? { full_name: data.fullName } : {}) },
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("Falha ao criar usuário.");

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newId, role: data.role });
    if (roleError) throw new Error(roleError.message);

    return { id: newId, login: data.login, role: data.role };
  });

/**
 * Lista todos os usuários com papel, status e permissões (admin only).
 */
export const listAppUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

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
  .middleware([requireSupabaseAuth])
  .validator(requireUserId)
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode excluir sua própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Ativa/desativa um usuário (ban via Supabase Admin).
 */
export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const { userId } = requireUserId(input);
    const banned = Boolean((input as any)?.banned);
    return { userId, banned };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("Você não pode desativar sua própria conta.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) => {
    const { userId } = requireUserId(input);
    const role: Role = (input as any)?.role === "admin" ? "admin" : "user";
    return { userId, role };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
  .middleware([requireSupabaseAuth])
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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

import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Role = "admin" | "user";
type CreateUserInput = { login: string; password: string; fullName?: string; role: Role };

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

function getAuthEnv() {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const publishableKey =
    process.env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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
  "avaliacao-chamados",
  "programacao-gps",
  "backlog-inteligente",
  "capacidade",
  "apontamentos",
  "refrigeracao",
  "refrigeracao-pecas-status",
  "refrigeracao-historico",
  "programacao",
  "corretiva",
  "corretiva-pecas-status",
  "corretiva-historico",
  "corretiva-finalizar-sem-foto",
  "assets-fill",
  "assets-catalog",
  "assets-unmatched",
  "assets-history",
  "confiabilidade",
  "taludes",
  "taludes-pt",
  "clima-tempo",
  "abastecimento",
  "agua-execucao",
  "solicitacao-materiais",
  "controle-materiais",
  "lavanderia",
  "seguranca-trabalho",
  "painel-legal",
  "auditoria",
  "observabilidade",
  "copiloto",
  "agente-ia",
  "bi-studio",
  "notificacoes",
  "notificacoes-admin",
  "qualidade-dados",
  "imagens",
  "usuarios",
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

/** Protege contas administrativas de rebaixamento acidental (papel vem do banco). */
async function isAdminUserId(supabaseAdmin: any, userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

async function assertCallerIsAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Apenas administradores podem executar esta ação.");
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
    const [adminRes, menusRes] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("get_my_allowed_menus"),
    ]);
    if (adminRes.error) throw new Error(adminRes.error.message);
    const isAdmin = Boolean(adminRes.data);
    if (isAdmin) return { isAdmin: true, allowed: null };

    // Se a RPC falhar por qualquer motivo, cair para leitura direta das
    // permissões efetivas via RLS (self-read). Nunca devolver `null` (=tudo).
    let allowed: string[] | null;
    if (menusRes.error) {
      const { data: uma } = await context.supabase
        .from("user_module_access")
        .select("module_key")
        .eq("user_id", context.userId);
      allowed = (uma ?? []).map((r: any) => r.module_key as string);
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
    const supabaseAdmin = await createUsersAdminClient();

    const email = loginToEmail(data.login);
    const { data: res, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { login: data.login, full_name: data.fullName },
    });

    if (error) throw new Error(error.message);

    const user = res.user!;
    await supabaseAdmin.from("user_roles").insert({ user_id: user.id, role: data.role });

    return { id: user.id, login: data.login, role: data.role };
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
    const [{ data: roles }, { data: profs }, { data: umaRows }] = await Promise.all([
      supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", ids),
      supabaseAdmin.from("profiles").select("id, full_name").in("id", ids),
      supabaseAdmin.from("user_module_access").select("user_id, module_key").in("user_id", ids),
    ]);
    const roleMap = new Map<string, Role>();
    (roles ?? []).forEach((r: any) => {
      if (r.role === "admin" || !roleMap.has(r.user_id)) roleMap.set(r.user_id, r.role);
    });
    const profMap = new Map<string, { full_name: string | null }>();
    (profs ?? []).forEach((p: any) => profMap.set(p.id, { full_name: p.full_name }));
    const accessMap = new Map<string, string[]>();
    (umaRows ?? []).forEach((r: any) => {
      const list = accessMap.get(r.user_id) ?? [];
      list.push(r.module_key);
      accessMap.set(r.user_id, list);
    });

    return {
      users: authList.users.map((u) => {
        const email = (u.email ?? "").toLowerCase();
        let login = (u.user_metadata as any)?.login;

        // Fallback robusto para logins históricos ou provisionados via auth
        if (!login) {
          if (email.endsWith(`@${LOGIN_DOMAIN}`)) {
            login = email.split("@")[0];
          } else {
            login = email;
          }
        }

        const prof = profMap.get(u.id);
        const role = roleMap.get(u.id) ?? ("user" as Role);
        return {
          id: u.id,
          login,
          email,
          fullName: prof?.full_name ?? (u.user_metadata as any)?.full_name ?? null,
          role,
          banned: Boolean((u as any).banned_until),
          allowedMenus: role === "admin" ? null : (accessMap.get(u.id) ?? []),
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
    if (data.userId === context.userId)
      throw new Error("Você não pode desativar sua própria conta.");
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
    if (data.role !== "admin" && data.userId === context.userId) {
      throw new Error("Você não pode remover o seu próprio perfil de administrador.");
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
    if (await isAdminUserId(supabaseAdmin, data.userId)) {
      // Admins têm acesso total via papel; não restringimos menus para eles.
      return { ok: true };
    }
    // Upsert profile row (in case it doesn't exist yet)
    const { error } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: data.userId, allowed_menus: data.allowed } as any, { onConflict: "id" });
    if (error) throw new Error(error.message);
    // Fonte de verdade do RBAC: `user_module_access`. O banco nega por padrão,
    // então a lista de menus precisa ser espelhada aqui para valer de fato.
    await syncModuleAccess(supabaseAdmin, data.userId, data.allowed, context.userId);
    return { ok: true };
  });

/**
 * Espelha a lista de módulos liberados em `user_module_access`, que é a
 * fonte única usada pelas políticas RLS (`can_access_module`).
 */
async function syncModuleAccess(
  supabaseAdmin: any,
  userId: string,
  allowed: string[] | null,
  grantedBy: string,
) {
  const keys = Array.isArray(allowed) ? Array.from(new Set(allowed)) : [];
  await supabaseAdmin.from("user_module_access").delete().eq("user_id", userId);
  if (keys.length === 0) return;
  const rows = keys.map((module_key) => ({
    user_id: userId,
    module_key,
    actions: ["all"],
    granted_by: grantedBy,
  }));
  const { error } = await supabaseAdmin.from("user_module_access").insert(rows);
  if (error) throw new Error(error.message);
}

/**
 * Provisiona o login dedicado aos encarregados.
 */
export const provisionEncarregadosUser = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const supabaseAdmin = await createUsersAdminClient();

    const login = "encarregados";
    const password = "15995196";
    const email = loginToEmail(login);
    // Log for debugging (will be visible in server logs if monitored)
    console.log(`[Provision] Provisioning user: ${login} (${email})`);
    const fullName = "Encarregados";
    const metadata = { login, full_name: fullName };
    const modules = [
      "dashboard",
      "programacao-gps",
      "backlog-inteligente",
      "capacidade",
      "apontamentos",
      "refrigeracao",
      "refrigeracao-pecas-status",
      "refrigeracao-historico",
      "programacao",
      "corretiva",
      "corretiva-pecas-status",
      "corretiva-historico",
      "abastecimento",
      "agua-execucao",
    ];

    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw new Error(listErr.message);

    let user = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
    let created = false;

    if (!user) {
      const { data: res, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error) throw new Error(error.message);
      user = res.user!;
      created = true;
    } else {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
        ban_duration: "none",
        user_metadata: metadata,
      });
      if (error) throw new Error(error.message);
      
      // Forçar atualização do email_confirmed_at se necessário e limpar qualquer banimento
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        email_confirm: true,
      });
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: user.id, full_name: fullName, allowed_menus: modules } as any, {
        onConflict: "id",
      });
    if (profErr) throw new Error(profErr.message);

    await supabaseAdmin.from("user_module_access").delete().eq("user_id", user.id);
    const { error: umaErr } = await supabaseAdmin.from("user_module_access").insert(
      modules.map((module_key) => ({
        user_id: user!.id,
        module_key,
        actions: ["read"],
        granted_by: context.userId,
      })),
    );
    if (umaErr) throw new Error(umaErr.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", user.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: user.id, role: "user" });

    return { ok: true, created, login, email };
  });



/** Gera uma senha temporária forte no servidor (nunca fixa, nunca em código). */
function generateTempPassword(length = 16): string {


  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/**
 * Provisiona (cria ou atualiza) o login dedicado ao módulo
 * "Controle de Materiais". Somente administradores podem executar.
 *
 * Segurança: a senha é temporária, gerada aleatoriamente no servidor a cada
 * provisionamento e devolvida uma única vez ao administrador. O usuário é
 * marcado com `must_change_password`, o que obriga a troca no primeiro acesso.
 */
export const provisionControleUser = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .handler(async ({ context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const supabaseAdmin = await createUsersAdminClient();

    const login = "controle";
    const email = loginToEmail(login);
    const password = generateTempPassword();

    const allowed = ["controle-materiais"];
    const metadata = {
      login,
      full_name: "Controle de Materiais",
      must_change_password: true,
    };

    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw new Error(listErr.message);

    let user = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
    let created = false;

    if (!user) {
      const { data: createdRes, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (createErr) throw new Error(createErr.message);
      user = createdRes.user!;
      created = true;
    } else {
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password,
        email_confirm: true,
        ban_duration: "none",
        user_metadata: metadata,
      } as any);
      if (updErr) throw new Error(updErr.message);
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: user.id, full_name: "Controle de Materiais", allowed_menus: allowed } as any, {
        onConflict: "id",
      });
    if (profErr) throw new Error(profErr.message);

    await syncModuleAccess(supabaseAdmin, user.id, allowed as string[], context.userId);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", user.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: user.id, role: "user" });

    // A senha temporária é exibida uma única vez para o administrador.
    return { ok: true, created, login, email, tempPassword: password };
  });

/**
 * Provisiona (cria ou atualiza) um login operacional restrito a módulos
 * específicos com ações limitadas. Somente administradores podem executar.
 * A senha é definida pelo administrador no momento da chamada — nunca
 * fica gravada no código.
 */
export const provisionScopedUser = createServerFn({ method: "POST" })
  .middleware([requireUsersAuth])
  .validator((input: unknown) => {
    const { login, password, fullName, modules, actions } = (input ?? {}) as Record<
      string,
      unknown
    >;
    if (typeof login !== "string" || !LOGIN_RE.test(login.trim().toLowerCase())) {
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
      fullName: typeof fullName === "string" ? fullName.trim() : login,
      modules: modules.map(String),
      actions: Array.isArray(actions) ? actions.map(String) : ["read", "create", "update"],
    };
  })
  .handler(async ({ data, context }) => {
    await assertCallerIsAdmin(context.supabase, context.userId);
    const supabaseAdmin = await createUsersAdminClient();

    const email = loginToEmail(data.login);
    const metadata = { login: data.login, full_name: data.fullName };

    const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) throw new Error(listErr.message);

    let user = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
    let created = false;

    if (!user) {
      const { data: res, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: metadata,
      });
      if (error) throw new Error(error.message);
      user = res.user!;
      created = true;
    } else {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
        password: data.password,
        email_confirm: true,
        ban_duration: "none",
        user_metadata: metadata,
      } as any);
      if (error) throw new Error(error.message);
    }

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .upsert({ id: user.id, full_name: data.fullName, allowed_menus: data.modules } as any, {
        onConflict: "id",
      });
    if (profErr) throw new Error(profErr.message);

    await supabaseAdmin.from("user_module_access").delete().eq("user_id", user.id);
    const { error: umaErr } = await supabaseAdmin.from("user_module_access").insert(
      data.modules.map((module_key) => ({
        user_id: user!.id,
        module_key,
        actions: data.actions,
        granted_by: context.userId,
      })),
    );
    if (umaErr) throw new Error(umaErr.message);

    await supabaseAdmin.from("user_roles").delete().eq("user_id", user.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: user.id, role: "user" });

    return { ok: true, created, login: data.login, email, modules: data.modules };
  });

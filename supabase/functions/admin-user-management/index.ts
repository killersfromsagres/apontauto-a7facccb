import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LOGIN_DOMAIN = "apontauto.local";
const LOGIN_RE = /^[a-z0-9._-]{3,30}$/;
type Role = "admin" | "user";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function safeMenus(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((v): v is string => typeof v === "string")
        .map((v) => v.trim())
        .filter((v) => /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(v)),
    ),
  ).slice(0, 200);
}

function normalizeLogin(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function loginToEmail(login: string) {
  return `${login}@${LOGIN_DOMAIN}`;
}

function tempPassword(length = 18) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*";
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (value) => alphabet[value % alphabet.length]).join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return json({ error: "Backend administrativo não configurado." }, 503);
  }

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return json({ error: "Sessão inválida." }, 401);
  }

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "Sessão expirada. Entre novamente." }, 401);
  }
  const callerId = userData.user.id;

  const { data: isAdmin, error: roleCheckError } = await caller.rpc("has_role", {
    _user_id: callerId,
    _role: "admin",
  });
  if (roleCheckError) return json({ error: roleCheckError.message }, 500);
  if (!isAdmin) {
    return json({ error: "Apenas administradores podem executar esta ação." }, 403);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "Dados inválidos." }, 400);
  }
  const action = String(payload.action ?? "create");

  const syncUser = async (
    userId: string,
    role: Role,
    allowedMenus: string[],
    fullName: string | null | undefined,
  ) => {
    const profilePayload: Record<string, unknown> = {
      id: userId,
      allowed_menus: role === "admin" ? null : allowedMenus,
      updated_at: new Date().toISOString(),
    };
    if (fullName !== undefined) profilePayload.full_name = fullName;

    const { error: profileError } = await admin
      .from("profiles")
      .upsert(profilePayload, { onConflict: "id" });
    if (profileError) throw profileError;

    const { error: clearRoleError } = await admin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (clearRoleError) throw clearRoleError;

    const { error: roleError } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role });
    if (roleError) throw roleError;

    const { error: clearAccessError } = await admin
      .from("user_module_access")
      .delete()
      .eq("user_id", userId);
    if (clearAccessError) throw clearAccessError;

    if (role !== "admin" && allowedMenus.length > 0) {
      const { error: accessError } = await admin
        .from("user_module_access")
        .insert(
          allowedMenus.map((moduleKey) => ({
            user_id: userId,
            module_key: moduleKey,
            actions: ["read", "create", "update"],
            granted_by: callerId,
          })),
        );
      if (accessError) throw accessError;
    }
  };

  const listUsers = async () => {
    const { data: authList, error: authError } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (authError) throw authError;

    const ids = authList.users.map((user) => user.id);
    if (ids.length === 0) return [];

    const [rolesResult, profilesResult, accessResult] = await Promise.all([
      admin.from("user_roles").select("user_id, role").in("user_id", ids),
      admin.from("profiles").select("id, full_name, allowed_menus").in("id", ids),
      admin.from("user_module_access").select("user_id, module_key").in("user_id", ids),
    ]);
    if (rolesResult.error) throw rolesResult.error;
    if (profilesResult.error) throw profilesResult.error;
    if (accessResult.error) throw accessResult.error;

    const roleMap = new Map<string, Role>();
    for (const row of rolesResult.data ?? []) {
      const current = roleMap.get(row.user_id);
      if (row.role === "admin" || !current) roleMap.set(row.user_id, row.role as Role);
    }

    const profileMap = new Map<string, { full_name: string | null; allowed_menus: string[] | null }>();
    for (const row of profilesResult.data ?? []) {
      profileMap.set(row.id, {
        full_name: row.full_name,
        allowed_menus: Array.isArray(row.allowed_menus) ? row.allowed_menus : null,
      });
    }

    const accessMap = new Map<string, string[]>();
    for (const row of accessResult.data ?? []) {
      const current = accessMap.get(row.user_id) ?? [];
      current.push(row.module_key);
      accessMap.set(row.user_id, current);
    }

    return authList.users.map((user) => {
      const email = (user.email ?? "").toLowerCase();
      const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
      const role = roleMap.get(user.id) ?? "user";
      const profile = profileMap.get(user.id);
      let login = typeof metadata.login === "string" ? metadata.login : "";
      if (!login) {
        login = email.endsWith(`@${LOGIN_DOMAIN}`)
          ? email.slice(0, -(`@${LOGIN_DOMAIN}`.length))
          : email;
      }
      return {
        id: user.id,
        login,
        email,
        fullName:
          profile?.full_name ??
          (typeof metadata.full_name === "string" ? metadata.full_name : null),
        role,
        banned: Boolean(user.banned_until && new Date(user.banned_until).getTime() > Date.now()),
        allowedMenus:
          role === "admin"
            ? null
            : Array.from(new Set(accessMap.get(user.id) ?? profile?.allowed_menus ?? [])),
        createdAt: user.created_at,
      };
    });
  };

  const createOrUpdateScoped = async (options: {
    login: string;
    password: string;
    fullName: string;
    modules: string[];
    resetPasswordIfExists?: boolean;
  }) => {
    const email = loginToEmail(options.login);
    const users = await listUsers();
    const existing = users.find((user) => user.email === email);
    let userId: string;
    let created = false;

    if (existing) {
      userId = existing.id;
      const updatePayload: Record<string, unknown> = {
        email_confirm: true,
        ban_duration: "none",
        user_metadata: { login: options.login, full_name: options.fullName },
      };
      if (options.resetPasswordIfExists) updatePayload.password = options.password;
      const { error } = await admin.auth.admin.updateUserById(userId, updatePayload);
      if (error) throw error;
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: options.password,
        email_confirm: true,
        user_metadata: { login: options.login, full_name: options.fullName },
      });
      if (error) throw error;
      if (!data.user) throw new Error("O backend não retornou o usuário recém-criado.");
      userId = data.user.id;
      created = true;
    }

    try {
      await syncUser(userId, "user", options.modules, options.fullName);
    } catch (error) {
      if (created) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
      throw error;
    }

    return { ok: true, created, id: userId, login: options.login, email, modules: options.modules };
  };

  try {
    if (action === "list") {
      return json({ users: await listUsers() });
    }

    if (action === "resetPassword") {
      const userId = typeof payload.userId === "string" ? payload.userId : "";
      const password = typeof payload.password === "string" ? payload.password : "";
      if (userId.length < 10) return json({ error: "Usuário inválido." }, 400);
      if (password.length < 6) {
        return json({ error: "A nova senha deve ter pelo menos 6 caracteres." }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "delete") {
      const userId = typeof payload.userId === "string" ? payload.userId : "";
      if (userId.length < 10) return json({ error: "Usuário inválido." }, 400);
      if (userId === callerId) {
        return json({ error: "Você não pode excluir sua própria conta." }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "setBanned") {
      const userId = typeof payload.userId === "string" ? payload.userId : "";
      const banned = Boolean(payload.banned);
      if (userId.length < 10) return json({ error: "Usuário inválido." }, 400);
      if (userId === callerId && banned) {
        return json({ error: "Você não pode desativar sua própria conta." }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(userId, {
        ban_duration: banned ? "876000h" : "none",
      });
      if (error) throw error;
      return json({ ok: true });
    }

    if (action === "setRole") {
      const userId = typeof payload.userId === "string" ? payload.userId : "";
      const role: Role = payload.role === "admin" ? "admin" : "user";
      if (userId.length < 10) return json({ error: "Usuário inválido." }, 400);
      if (userId === callerId && role !== "admin") {
        return json({ error: "Você não pode remover o seu próprio perfil de administrador." }, 400);
      }

      let allowedMenus: string[] = [];
      if (role !== "admin") {
        const { data: currentAccess, error: accessReadError } = await admin
          .from("user_module_access")
          .select("module_key")
          .eq("user_id", userId);
        if (accessReadError) throw accessReadError;
        allowedMenus = (currentAccess ?? []).map((row) => row.module_key);
      }
      await syncUser(userId, role, allowedMenus, undefined);
      return json({ ok: true });
    }

    if (action === "setMenus") {
      const userId = typeof payload.userId === "string" ? payload.userId : "";
      if (userId.length < 10) return json({ error: "Usuário inválido." }, 400);
      const allowedMenus = safeMenus(payload.allowedMenus ?? payload.allowed);

      const { data: adminRole, error: roleError } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      if (roleError) throw roleError;
      if (adminRole) {
        return json({ error: "Administradores possuem acesso total e não usam restrições por módulo." }, 400);
      }

      const { data: profile, error: profileReadError } = await admin
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      if (profileReadError) throw profileReadError;
      await syncUser(userId, "user", allowedMenus, profile?.full_name ?? undefined);
      return json({ ok: true });
    }

    if (action === "provisionEncarregados" || action === "provisionChamados") {
      const isEncarregados = action === "provisionEncarregados";
      const generatedPassword = tempPassword();
      const result = await createOrUpdateScoped({
        login: isEncarregados ? "encarregados" : "chamados",
        password: generatedPassword,
        fullName: isEncarregados ? "Encarregados" : "Monitoramento de Chamados",
        resetPasswordIfExists: false,
        modules: isEncarregados
          ? [
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
              "corretiva-novo",
              "corretiva-pecas-status",
              "corretiva-historico",
              "abastecimento",
              "agua-execucao",
              "organograma",
              "corretiva-concluir-sem-foto-especial",
            ]
          : ["corretiva-novo", "corretiva-historico"],
      });
      return json({ ...result, tempPassword: result.created ? generatedPassword : undefined });
    }

    if (action === "provisionScoped") {
      const login = normalizeLogin(payload.login);
      const password = typeof payload.password === "string" ? payload.password : "";
      const fullName =
        typeof payload.fullName === "string" && payload.fullName.trim()
          ? payload.fullName.trim().slice(0, 160)
          : login;
      const modules = safeMenus(payload.modules);
      if (!LOGIN_RE.test(login)) return json({ error: "Login inválido." }, 400);
      if (password.length < 6) {
        return json({ error: "A senha deve ter pelo menos 6 caracteres." }, 400);
      }
      if (modules.length === 0) return json({ error: "Informe ao menos um módulo." }, 400);
      return json(
        await createOrUpdateScoped({
          login,
          password,
          fullName,
          modules,
          resetPasswordIfExists: true,
        }),
      );
    }

    if (action !== "create") return json({ error: "Ação inválida." }, 400);

    const login = normalizeLogin(payload.login);
    const password = typeof payload.password === "string" ? payload.password : "";
    const fullName =
      typeof payload.fullName === "string" && payload.fullName.trim()
        ? payload.fullName.trim().slice(0, 160)
        : null;
    const role: Role = payload.role === "admin" ? "admin" : "user";
    const allowedMenus = role === "admin" ? [] : safeMenus(payload.allowedMenus);

    if (!LOGIN_RE.test(login)) {
      return json({ error: "Login deve ter 3-30 caracteres (letras minúsculas, números, . _ -)." }, 400);
    }
    if (password.length < 6) {
      return json({ error: "A senha deve ter pelo menos 6 caracteres." }, 400);
    }

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: loginToEmail(login),
      password,
      email_confirm: true,
      user_metadata: { login, full_name: fullName },
    });
    if (createError) throw createError;
    if (!created.user) {
      return json({ error: "O backend não retornou o usuário recém-criado." }, 500);
    }

    const userId = created.user.id;
    try {
      await syncUser(userId, role, allowedMenus, fullName);
    } catch (error) {
      await admin.auth.admin.deleteUser(userId).catch(() => undefined);
      throw error;
    }

    return json({
      id: userId,
      login,
      role,
      allowedMenus: role === "admin" ? null : allowedMenus,
    });
  } catch (error) {
    console.error("[admin-user-management]", action, error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
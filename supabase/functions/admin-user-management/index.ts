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
  return Array.from(new Set(value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => /^[a-z0-9][a-z0-9._-]{0,79}$/i.test(v))))
    .slice(0, 200);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) return json({ error: "Backend administrativo não configurado." }, 503);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return json({ error: "Sessão inválida." }, 401);

  const caller = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  const { data: userData, error: userError } = await caller.auth.getUser();
  if (userError || !userData.user) return json({ error: "Sessão expirada. Entre novamente." }, 401);

  const { data: isAdmin, error: roleCheckError } = await caller.rpc("has_role", {
    _user_id: userData.user.id,
    _role: "admin",
  });
  if (roleCheckError) return json({ error: roleCheckError.message }, 500);
  if (!isAdmin) return json({ error: "Apenas administradores podem executar esta ação." }, 403);

  let payload: Record<string, unknown>;
  try { payload = await req.json(); } catch { return json({ error: "Dados inválidos." }, 400); }
  const action = String(payload.action ?? "create");

  if (action === "resetPassword") {
    const userId = typeof payload.userId === "string" ? payload.userId : "";
    const password = typeof payload.password === "string" ? payload.password : "";
    if (userId.length < 10) return json({ error: "Usuário inválido." }, 400);
    if (password.length < 6) return json({ error: "A nova senha deve ter pelo menos 6 caracteres." }, 400);
    const { error } = await admin.auth.admin.updateUserById(userId, { password });
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (action !== "create") return json({ error: "Ação inválida." }, 400);

  const login = typeof payload.login === "string" ? payload.login.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";
  const fullName = typeof payload.fullName === "string" && payload.fullName.trim()
    ? payload.fullName.trim().slice(0, 160)
    : null;
  const role: Role = payload.role === "admin" ? "admin" : "user";
  const allowedMenus = role === "admin" ? [] : safeMenus(payload.allowedMenus);

  if (!LOGIN_RE.test(login)) return json({ error: "Login deve ter 3-30 caracteres (letras minúsculas, números, . _ -)." }, 400);
  if (password.length < 6) return json({ error: "A senha deve ter pelo menos 6 caracteres." }, 400);

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: `${login}@${LOGIN_DOMAIN}`,
    password,
    email_confirm: true,
    user_metadata: { login, full_name: fullName },
  });
  if (createError) return json({ error: createError.message }, 400);
  if (!created.user) return json({ error: "O backend não retornou o usuário recém-criado." }, 500);

  const userId = created.user.id;
  try {
    const { error: profileError } = await admin.from("profiles").upsert({
      id: userId,
      full_name: fullName,
      allowed_menus: role === "admin" ? null : allowedMenus,
      updated_at: new Date().toISOString(),
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    const { error: clearRoleError } = await admin.from("user_roles").delete().eq("user_id", userId);
    if (clearRoleError) throw clearRoleError;
    const { error: roleError } = await admin.from("user_roles").insert({ user_id: userId, role });
    if (roleError) throw roleError;

    const { error: clearAccessError } = await admin.from("user_module_access").delete().eq("user_id", userId);
    if (clearAccessError) throw clearAccessError;
    if (role !== "admin" && allowedMenus.length > 0) {
      const { error: accessError } = await admin.from("user_module_access").insert(
        allowedMenus.map((moduleKey) => ({
          user_id: userId,
          module_key: moduleKey,
          actions: ["read", "create", "update"],
          granted_by: userData.user.id,
        })),
      );
      if (accessError) throw accessError;
    }
  } catch (error) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined);
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }

  return json({ id: userId, login, role, allowedMenus: role === "admin" ? null : allowedMenus });
});
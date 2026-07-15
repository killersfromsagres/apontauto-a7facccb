import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "user";
type CreateUserInput = { login: string; password: string; fullName?: string; role: Role };

const LOGIN_DOMAIN = "apontauto.local";
const LOGIN_RE = /^[a-z0-9._-]{3,30}$/;

export function loginToEmail(login: string) {
  const l = login.trim().toLowerCase();
  if (l.includes("@")) return l;
  return `${l}@${LOGIN_DOMAIN}`;
}

function validate(input: unknown): CreateUserInput {
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
 * Cria um novo usuário no backend com e-mail já confirmado e atribui o papel escolhido.
 * Somente administradores podem executar.
 */
export const createAppUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(validate)
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

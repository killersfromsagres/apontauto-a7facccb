import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "user";
type CreateUserInput = { email: string; password: string; fullName?: string; role: Role };

function validate(input: unknown): CreateUserInput {
  if (!input || typeof input !== "object") throw new Error("Dados inválidos");
  const { email, password, fullName, role } = input as Record<string, unknown>;
  if (typeof email !== "string" || !/^\S+@\S+\.\S+$/.test(email.trim())) {
    throw new Error("Informe um e-mail válido.");
  }
  if (typeof password !== "string" || password.length < 6) {
    throw new Error("A senha deve ter pelo menos 6 caracteres.");
  }
  const r: Role = role === "admin" ? "admin" : "user";
  return {
    email: email.trim().toLowerCase(),
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
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: data.fullName ? { full_name: data.fullName } : undefined,
    });
    if (error) throw new Error(error.message);
    const newId = created.user?.id;
    if (!newId) throw new Error("Falha ao criar usuário.");

    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: newId, role: data.role });
    if (roleError) throw new Error(roleError.message);

    return { id: newId, email: created.user?.email, role: data.role };
  });

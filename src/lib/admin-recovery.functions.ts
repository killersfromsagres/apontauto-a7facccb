import { createServerFn } from "@tanstack/react-start";

const ADMIN_EMAIL = "admin@apontauto.local";
const RECOVERY_VERSION = "2026-09-15-v1";

function validateRecovery(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("Dados de recuperação inválidos.");
  const recoveryCode = (input as any).recoveryCode;
  const newPassword = (input as any).newPassword;

  if (typeof recoveryCode !== "string" || recoveryCode.length < 16) {
    throw new Error("Código de recuperação inválido.");
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    throw new Error("A nova senha deve ter pelo menos 6 caracteres.");
  }
  return { recoveryCode, newPassword };
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

async function findAdminUser(supabaseAdmin: any) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(error.message);
    const found = data.users.find((user: any) => (user.email ?? "").toLowerCase() === ADMIN_EMAIL);
    if (found) return found;
    if (data.users.length < 100) return null;
  }
  return null;
}

/**
 * Recuperação excepcional e one-time da conta administrativa.
 *
 * Segurança: o código de recuperação NÃO existe no repositório. Ele precisa
 * estar configurado no servidor como ADMIN_BOOTSTRAP_SECRET. Depois do primeiro
 * uso bem-sucedido, um marcador no app_metadata impede reutilização desta versão.
 */
export const recoverAdministrator = createServerFn({ method: "POST" })
  .validator(validateRecovery)
  .handler(async ({ data }) => {
    const serverSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    if (!serverSecret || serverSecret.length < 16) {
      throw new Error(
        "Recuperação administrativa não habilitada no servidor. Configure ADMIN_BOOTSTRAP_SECRET.",
      );
    }
    if (!constantTimeEqual(data.recoveryCode, serverSecret)) {
      throw new Error("Código de recuperação inválido.");
    }

    let supabaseAdmin: any;
    try {
      ({ supabaseAdmin } = await import("@/integrations/supabase/client.server"));
      void supabaseAdmin.auth;
    } catch (error) {
      console.error("[admin-recovery] admin client unavailable", error);
      throw new Error(
        "Backend administrativo indisponível. Verifique a SUPABASE_SERVICE_ROLE_KEY do projeto ativo.",
      );
    }

    let user = await findAdminUser(supabaseAdmin);
    if (user?.app_metadata?.admin_recovery_version === RECOVERY_VERSION) {
      throw new Error("Esta recuperação administrativa já foi utilizada.");
    }

    const previousUserMetadata = (user?.user_metadata ?? {}) as Record<string, unknown>;
    const previousAppMetadata = (user?.app_metadata ?? {}) as Record<string, unknown>;
    const userMetadata = {
      ...previousUserMetadata,
      login: "admin",
      full_name: "Administrador",
    };

    if (!user) {
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: ADMIN_EMAIL,
        password: data.newPassword,
        email_confirm: true,
        user_metadata: userMetadata,
      });
      if (createError) throw new Error(createError.message);
      user = created.user;
      if (!user) throw new Error("Falha ao criar a conta administrativa.");
    } else {
      const { data: updated, error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        user.id,
        {
          password: data.newPassword,
          email_confirm: true,
          ban_duration: "none",
          user_metadata: userMetadata,
        } as any,
      );
      if (updateError) throw new Error(updateError.message);
      user = updated.user ?? user;
    }

    const { error: deleteRolesError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", user.id);
    if (deleteRolesError) throw new Error(deleteRolesError.message);

    const { error: insertRoleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: user.id, role: "admin" });
    if (insertRoleError) throw new Error(insertRoleError.message);

    const { error: clearAccessError } = await supabaseAdmin
      .from("user_module_access")
      .delete()
      .eq("user_id", user.id);
    if (clearAccessError) throw new Error(clearAccessError.message);

    const { error: profileError } = await supabaseAdmin.from("profiles").upsert(
      { id: user.id, full_name: "Administrador", allowed_menus: null } as any,
      { onConflict: "id" },
    );
    if (profileError) throw new Error(profileError.message);

    const { error: markerError } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      app_metadata: {
        ...previousAppMetadata,
        admin_recovery_version: RECOVERY_VERSION,
      },
    } as any);
    if (markerError) throw new Error(markerError.message);

    return { ok: true, login: "admin" };
  });

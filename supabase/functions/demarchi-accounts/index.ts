import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";
import {
  isValidAccountPassword,
  clientAuthIdentity,
  isClientId,
  normalizeClientId,
} from "../_shared/demarchi-login.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: cors });
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return reply({ error: "Método não permitido." }, 405);
  const token = request.headers.get("Authorization")?.replace(/^Bearer /i, "");
  if (!token) return reply({ error: "Entre novamente para continuar." }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return reply({ error: "Sessão inválida." }, 401);
  const { data: roles, error: roleError } = await admin
    .from("user_roles")
    .select("role")
    .eq("user_id", auth.user.id)
    .eq("role", "admin");
  if (roleError || !roles?.length)
    return reply({ error: "Apenas administradores podem gerenciar acessos." }, 403);
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return reply({ error: "Formulário inválido." }, 400);
  }
  if (input.action === "remove") {
    if (typeof input.personId !== "string" || !/^[0-9a-f-]{36}$/i.test(input.personId))
      return reply({ error: "Cliente inválido." }, 400);
    const { data: person, error: personError } = await admin
      .from("dem_people")
      .select("id,user_id,kind,removed_at")
      .eq("id", input.personId)
      .maybeSingle();
    if (personError || !person || person.kind !== "solicitante")
      return reply({ error: "Cliente não encontrado." }, 404);
    if (person.user_id === auth.user.id)
      return reply({ error: "Você não pode remover o próprio acesso." }, 403);
    if (person.user_id) {
      const { data: targetRoles, error: targetRoleError } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", person.user_id)
        .eq("role", "admin");
      if (targetRoleError || targetRoles?.length)
        return reply({ error: "Contas administradoras não podem ser removidas nesta seção." }, 403);
    }
    if (person.removed_at) return reply({ ok: true });
    // Block new authentication, while the profile/RLS change also blocks
    // existing tokens. Preserve Auth IDs and historical requests.
    if (person.user_id) {
      const { error: banError } = await admin.auth.admin.updateUserById(person.user_id, {
        ban_duration: "876000h",
      });
      if (banError)
        return reply({ error: "Não foi possível bloquear o acesso. Tente novamente." }, 500);
    }
    const { error: removalError } = await admin.rpc("dem_archive_client_account", {
      admin_id: auth.user.id,
      person_id: person.id,
    });
    if (removalError)
      return reply(
        {
          error:
            "O acesso foi bloqueado, mas o cadastro não foi removido da lista. Tente novamente.",
        },
        500,
      );
    return reply({ ok: true });
  }
  if (input.action && input.action !== "create") return reply({ error: "Operação inválida." }, 400);
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  const password = typeof input.password === "string" ? input.password : "";
  const kind = input.kind;
  const loginId = typeof input.loginId === "string" ? normalizeClientId(input.loginId) : "";
  const clientAccount = kind === "solicitante";
  const specialty = typeof input.specialty === "string" ? input.specialty.trim().slice(0, 160) : "";
  if (
    name.length < 2 ||
    name.length > 160 ||
    (clientAccount
      ? !isClientId(loginId)
      : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) ||
    !isValidAccountPassword(password) ||
    !["solicitante", "tecnico"].includes(String(kind))
  ) {
    return reply(
      {
        error: clientAccount
          ? "Informe nome, ID no formato Sherwin + número e senha de 6 a 128 caracteres."
          : "Informe nome, e-mail válido e senha de 6 a 128 caracteres.",
      },
      400,
    );
  }
  const identity = clientAccount ? clientAuthIdentity(loginId) : email;
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: identity,
    password,
    email_confirm: true,
    user_metadata: { full_name: name },
    app_metadata: { demarchi_portal: true },
  });
  if (createError || !created.user)
    return reply(
      {
        error:
          clientAccount && /already|registered|exists/i.test(createError?.message || "")
            ? "Este ID já está cadastrado. Escolha outro ID."
            : createError?.message || "Não foi possível criar o acesso.",
      },
      400,
    );
  const { error: profileError } = clientAccount
    ? await admin.rpc("dem_finish_client_account", {
        admin_id: auth.user.id,
        account_id: created.user.id,
        person_name: name,
        client_login_id: loginId,
      })
    : await admin.rpc("dem_finish_account", {
        admin_id: auth.user.id,
        account_id: created.user.id,
        person_name: name,
        contact_email: email,
        person_kind: kind,
        person_specialty: specialty,
      });
  if (profileError) {
    // Roll back only the account created in THIS request; existing users are never deleted.
    await admin.auth.admin.deleteUser(created.user.id);
    console.error("demarchi account provisioning failed", profileError.code);
    return reply(
      { error: "O cadastro não foi concluído. Nenhum novo acesso foi liberado. Tente novamente." },
      500,
    );
  }
  return reply(clientAccount ? { ok: true, loginId } : { ok: true, email });
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.110.2";
import { clientAuthIdentity, isClientId, normalizeClientId } from "../_shared/demarchi-login.ts";

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
    return reply({ error: "Apenas administradores podem criar acessos." }, 403);
  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return reply({ error: "Formulário inválido." }, 400);
  }
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
    password.length < 10 ||
    password.length > 128 ||
    !["solicitante", "tecnico"].includes(String(kind))
  ) {
    return reply(
      {
        error: clientAccount
          ? "Informe nome, ID válido e senha de 10 a 128 caracteres."
          : "Informe nome, e-mail válido e senha de 10 a 128 caracteres.",
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

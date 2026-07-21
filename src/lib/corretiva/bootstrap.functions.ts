import { createServerFn } from "@tanstack/react-start";

/**
 * One-shot: cria o usuário hidraulica@apontauto.local com senha 123456 se ainda não existir.
 * Público (sem auth) para permitir bootstrap. Idempotente.
 */
export const bootstrapHidraulicaUser = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const email = "hidraulica@apontauto.local";

  const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) throw new Error(listErr.message);
  const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
  if (existing) return { ok: true, created: false, id: existing.id };

  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: "123456",
    email_confirm: true,
    user_metadata: { login: "hidraulica", full_name: "Equipe Hidráulica" },
  });
  if (error) throw new Error(error.message);
  return { ok: true, created: true, id: data.user?.id };
});

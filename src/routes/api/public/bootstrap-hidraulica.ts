import { createFileRoute } from "@tanstack/react-router";

/**
 * Rota one-shot de bootstrap: cria o usuário hidraulica@apontauto.local (senha 123456)
 * se ainda não existir. Idempotente. Pode ser removida após o primeiro sucesso.
 */
export const Route = createFileRoute("/api/public/bootstrap-hidraulica")({
  server: {
    handlers: {
      POST: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const email = "hidraulica@apontauto.local";

        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });
        if (listErr) return Response.json({ ok: false, error: listErr.message }, { status: 500 });
        const existing = list.users.find((u) => (u.email ?? "").toLowerCase() === email);
        if (existing) return Response.json({ ok: true, created: false, id: existing.id });

        const { data, error } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: "123456",
          email_confirm: true,
          user_metadata: { login: "hidraulica", full_name: "Equipe Hidráulica" },
        });
        if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });
        return Response.json({ ok: true, created: true, id: data.user?.id });
      },
    },
  },
});

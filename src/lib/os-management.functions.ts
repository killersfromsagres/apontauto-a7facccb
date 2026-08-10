import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Limpeza em massa das OS de um módulo.
 * Restrito a administradores: a exclusão é irreversível e usa privilégio
 * elevado, então a permissão é verificada no servidor (nunca só na UI).
 */
export const clearOsTable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) =>
    z
      .object({
        module: z.enum(["refrigeracao", "corretiva"]),
        // Preserva o histórico: não apaga OS já concluídas
        keepCompleted: z.boolean().optional().default(false),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error: roleError } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (roleError) throw new Error("Não foi possível validar suas permissões.");
    if (!isAdmin) {
      throw new Error("Apenas administradores podem limpar os chamados.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const table = data.module === "refrigeracao" ? "refrigeracao_os" : "corretiva_os";

    let query = supabaseAdmin
      .from(table)
      .delete({ count: "exact" })
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (data.keepCompleted) {
      // `status` é um enum no Postgres: comparação textual (ilike) não existe
      // para esse tipo, então filtramos pelo valor exato do enum.
      query = query.neq("status", "concluida");
    }

    const { error, count } = await query;

    if (error) {
      throw new Error(`Failed to clear ${data.module} OS: ${error.message}`);
    }

    return { success: true, deleted: count ?? 0 };
  });

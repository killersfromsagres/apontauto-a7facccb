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
  .inputValidator((data) =>
    z
      .object({
        module: z.enum(["refrigeracao", "corretiva"]),
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

    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");

    if (error) {
      throw new Error(`Failed to clear ${data.module} OS: ${error.message}`);
    }

    return { success: true };
  });

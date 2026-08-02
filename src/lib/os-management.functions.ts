import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const clearOsTable = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        module: z.enum(["refrigeracao", "corretiva"]),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    // In production, you would verify roles here.
    // Assuming the caller is authorized via RLS or middleware if this was protected.
    // For now, we perform a bulk delete.

    const table = data.module === "refrigeracao" ? "refrigeracao_os" : "corretiva_os";
    
    // Using admin to bypass RLS for mass cleanup if necessary,
    // though usually, an admin role could do this via standard client.
    const { error } = await supabaseAdmin
      .from(table)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000"); // Standard way to delete all rows

    if (error) {
      throw new Error(`Failed to clear ${data.module} OS: ${error.message}`);
    }

    return { success: true };
  });

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const saveProgramacaoGps = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({
    records: z.array(z.any()),
    team: z.string(),
  }).parse(data))
  .handler(async ({ data, context }) => {
    // This is a placeholder for server-side persistence if needed.
    // For now, we mainly process this on the client for immediate download.
    return { success: true };
  });

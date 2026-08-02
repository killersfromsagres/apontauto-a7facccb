import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { executarAcao, runCopilot } from "@/lib/copilot/core.server";
import type { AcaoTipo, CopilotMensagem } from "@/lib/copilot/types";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error("Não foi possível validar suas permissões.");
  if (data !== true) throw new Error("Área restrita a administradores.");
}

export const copilotChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const messages = (input as any)?.messages;
    if (!Array.isArray(messages) || messages.length === 0) throw new Error("Mensagem vazia.");
    return {
      messages: messages.slice(-16).map((m: any) => ({
        role: m?.role === "assistant" ? "assistant" : "user",
        content: String(m?.content ?? "").slice(0, 8000),
      })) as CopilotMensagem[],
    };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return runCopilot({ messages: data.messages, supabase: context.supabase as any });
  });

export const copilotExecutar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const tipo = (input as any)?.tipo as AcaoTipo;
    const params = (input as any)?.params;
    if (typeof tipo !== "string") throw new Error("Ação inválida.");
    return { tipo, params: (params ?? {}) as Record<string, unknown> };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    return executarAcao({ tipo: data.tipo, params: data.params }, context.userId);
  });

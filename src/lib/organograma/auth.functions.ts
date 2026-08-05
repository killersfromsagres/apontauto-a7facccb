import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// Helper para injetar o cliente Supabase no contexto da função
const requireAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const url = process.env.SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL;
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const request = getRequest();

  if (!request?.headers) throw new Error("Não autorizado");

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Sessão expirada");

  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient<Database>(url!, publishableKey!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Usuário não encontrado");

  return next({
    context: { supabase, userId: user.id, userEmail: user.email },
  });
});

const EDIT_ALLOWED_EMAILS = ["admin", "gabrielvlp33@gmail.com"];

export const checkOrgEditPermission = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const email = context.userEmail;
    if (!email) return { allowed: false };

    const login = email.split("@")[0];
    const isAllowed = EDIT_ALLOWED_EMAILS.includes(email) || EDIT_ALLOWED_EMAILS.includes(login);

    return { allowed: isAllowed };
  });

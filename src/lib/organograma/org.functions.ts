import { createServerFn, createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

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
    context: { supabase, userId: user.id },
  });
});

export const getOrgData = createServerFn({ method: "GET" })
  .middleware([requireAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data as OrgNode[];
  });

export const addOrgMember = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: OrgMemberInput) => d)
  .handler(async ({ data, context }) => {
    const { data: inserted, error } = await context.supabase
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return inserted as OrgNode;
  });

export const updateOrgMember = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: { id: string; patch: Partial<OrgMemberInput> }) => d)
  .handler(async ({ data, context }) => {
    const { data: updated, error } = await context.supabase
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();

    if (error) throw error;
    return updated as OrgNode;
  });

export const deleteOrgMember = createServerFn({ method: "POST" })
  .middleware([requireAuth])
  .validator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .delete()
      .eq("id", data.id);

    if (error) throw error;
    return { success: true };
  });

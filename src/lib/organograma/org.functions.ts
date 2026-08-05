import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { type OrgMemberInput, type OrgNode } from "@/features/organograma/types";

export const getOrgData = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data, error } = await supabase
      .from("organograma")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) throw error;
    return data as OrgNode[];
  });

export const addOrgMember = createServerFn({ method: "POST" })
  .validator((d: OrgMemberInput) => d)
  .handler(async ({ data }) => {
    const { data: inserted, error } = await supabase
      .from("organograma")
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return inserted as OrgNode;
  });

export const updateOrgMember = createServerFn({ method: "POST" })
  .validator((d: { id: string; patch: Partial<OrgMemberInput> }) => d)
  .handler(async ({ data }) => {
    const { data: updated, error } = await supabase
      .from("organograma")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();

    if (error) throw error;
    return updated as OrgNode;
  });

export const deleteOrgMember = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const { error } = await supabase
      .from("organograma")
      .delete()
      .eq("id", data.id);

    if (error) throw error;
    return { success: true };
  });

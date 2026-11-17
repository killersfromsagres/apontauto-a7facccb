import { supabase } from "@/integrations/supabase/client";
import type { DemAsset, DemEvent, DemPerson, DemPlan, DemTicket, DemWorklog } from "./domain";

// The additive migration is versioned separately from the legacy generated types.
const db = supabase as any;
export const DEM_QUERY_KEY = ["demarchi"];
export function dbError(error: any): never {
  if (/42P01|PGRST20[245]/.test(error?.code ?? ""))
    throw new Error(
      "A ativação do banco da Central Demarchi está pendente. Peça ao administrador para aplicar a migração de instalação.",
    );
  throw new Error(error?.message || "Não foi possível salvar. Tente novamente.");
}
async function allRows<T>(table: string, order: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .order(order)
      .order("id")
      .range(from, from + 999);
    if (error) dbError(error);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}
export const loadAssets = () => allRows<DemAsset>("dem_assets", "code");
export const loadPeople = () => allRows<DemPerson>("dem_people", "name");
export const loadTickets = () => allRows<DemTicket>("dem_tickets", "number");
export const loadPlans = () => allRows<DemPlan>("dem_preventive_plans", "id");
export const loadWorklogs = () => allRows<DemWorklog>("dem_worklogs", "id");
export async function ticketEvents(id: string): Promise<DemEvent[]> {
  const { data, error } = await db
    .from("dem_ticket_events")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at");
  if (error) dbError(error);
  return data;
}
export async function myPerson(): Promise<DemPerson | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await db
    .from("dem_people")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) dbError(error);
  return data;
}
export async function createTicket(input: {
  title: string;
  description: string;
  asset_id: string;
  priority: string;
  location_detail: string;
}) {
  const { data, error } = await db.from("dem_tickets").insert(input).select().single();
  if (error) dbError(error);
  return data as DemTicket;
}
export async function updateTicket(ticket: DemTicket, input: Partial<DemTicket>) {
  const { data, error } = await db
    .from("dem_tickets")
    .update(input)
    .eq("id", ticket.id)
    .eq("version", ticket.version)
    .select()
    .maybeSingle();
  if (error) dbError(error);
  if (!data)
    throw new Error("Este chamado foi atualizado por outra pessoa. Recarregue antes de salvar.");
  return data as DemTicket;
}
export async function saveAsset(input: Partial<DemAsset>) {
  const { id, ...values } = input;
  const result = id
    ? await db.from("dem_assets").update(values).eq("id", id)
    : await db.from("dem_assets").insert(values);
  if (result.error) dbError(result.error);
}
export async function savePerson(input: Partial<DemPerson>) {
  const { id, ...values } = input;
  const result = id
    ? await db.from("dem_people").update(values).eq("id", id)
    : await db.from("dem_people").insert(values);
  if (result.error) dbError(result.error);
}
export async function savePlan(input: Partial<DemPlan>) {
  const { id, ...values } = input;
  const result = id
    ? await db.from("dem_preventive_plans").update(values).eq("id", id)
    : await db.from("dem_preventive_plans").insert(values);
  if (result.error) dbError(result.error);
}
export async function reschedulePlans(ids: string[], date: string) {
  const { error } = await db
    .from("dem_preventive_plans")
    .update({ next_due: date, active: true })
    .in("id", ids);
  if (error) dbError(error);
}
export async function generatePreventives(date: string): Promise<number> {
  const { data, error } = await db.rpc("dem_generate_preventives", { through_date: date });
  if (error) dbError(error);
  return data;
}
export async function addWorklog(input: {
  ticket_id: string;
  person_id: string;
  minutes: number;
  description: string;
  performed_on: string;
}) {
  const { error } = await db.from("dem_worklogs").insert(input);
  if (error) dbError(error);
}
export async function addComment(ticketId: string, message: string) {
  const { error } = await db.rpc("dem_comment_ticket", {
    target_ticket: ticketId,
    comment_text: message,
  });
  if (error) dbError(error);
}
export async function createAccount(input: {
  name: string;
  email?: string;
  loginId?: string;
  password: string;
  kind: string;
  specialty: string;
}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("Entre novamente para cadastrar o acesso.");
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/demarchi-accounts`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(input),
    },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Não foi possível criar o acesso.");
  return data;
}

import { supabase } from "@/integrations/supabase/client";

/** O client tipado ainda não conhece as tabelas novas do módulo. */
const db = supabase as unknown as { from: (t: string) => any };

/* ------------------------------------------------------------------ */
/* Veículos                                                            */
/* ------------------------------------------------------------------ */

export type FleetVehicle = {
  id: string;
  prefix: string;
  plate: string | null;
  brand: string;
  model: string;
  version: string | null;
  year_model: number | null;
  color: string | null;
  fuel_type: string;
  current_odometer_km: number;
  status: string;
  notes: string | null;
};

const VEHICLE_FIELDS =
  "id, prefix, plate, brand, model, version, year_model, color, fuel_type, current_odometer_km, status, notes";

export const VEHICLE_STATUS: Record<string, string> = {
  disponivel: "Disponível",
  em_uso: "Em uso",
  manutencao: "Manutenção",
  bloqueado: "Bloqueado",
  inativo: "Inativo",
};

export function vehicleTitle(v: FleetVehicle): string {
  return `${v.brand} ${v.model}${v.version ? ` ${v.version}` : ""}`.trim();
}

export async function listFleetVehicles(): Promise<FleetVehicle[]> {
  const { data, error } = await db.from("vehicles").select(VEHICLE_FIELDS).order("prefix");
  if (error) throw error;
  return (data ?? []) as FleetVehicle[];
}

export type VehicleInput = {
  prefix: string;
  plate: string | null;
  brand: string;
  model: string;
  version?: string | null;
  year_model?: number | null;
  color?: string | null;
  fuel_type: string;
  current_odometer_km: number;
  status: string;
  notes?: string | null;
};

export async function createFleetVehicle(input: VehicleInput): Promise<FleetVehicle> {
  const { data, error } = await db.from("vehicles").insert(input).select(VEHICLE_FIELDS).single();
  if (error) throw error;
  return data as FleetVehicle;
}

export async function updateFleetVehicle(
  id: string,
  patch: Partial<VehicleInput>,
): Promise<FleetVehicle> {
  const { data, error } = await db
    .from("vehicles")
    .update(patch)
    .eq("id", id)
    .select(VEHICLE_FIELDS)
    .single();
  if (error) throw error;
  return data as FleetVehicle;
}

/* ------------------------------------------------------------------ */
/* Abastecimentos (controle financeiro)                                */
/* ------------------------------------------------------------------ */

export type Fueling = {
  id: string;
  vehicle_id: string;
  fueled_at: string;
  driver_name: string | null;
  station: string | null;
  fuel_type: string;
  liters: number;
  total_cost: number;
  odometer_km: number;
  invoice_number: string | null;
  payment_method: string | null;
  notes: string | null;
  created_at: string;
};

const FUELING_FIELDS =
  "id, vehicle_id, fueled_at, driver_name, station, fuel_type, liters, total_cost, odometer_km, invoice_number, payment_method, notes, created_at";

export async function listFuelings(limit = 400): Promise<Fueling[]> {
  const { data, error } = await db
    .from("fleet_fuelings")
    .select(FUELING_FIELDS)
    .order("fueled_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    ...r,
    liters: Number(r.liters),
    total_cost: Number(r.total_cost),
    odometer_km: Number(r.odometer_km),
  })) as Fueling[];
}

export type FuelingInput = Omit<Fueling, "id" | "created_at">;

export async function createFueling(input: FuelingInput): Promise<void> {
  const { error } = await db.from("fleet_fuelings").insert(input);
  if (error) throw error;
}

export async function deleteFueling(id: string): Promise<void> {
  const { error } = await db.from("fleet_fuelings").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------------------------------------------ */
/* Checklist veicular                                                  */
/* ------------------------------------------------------------------ */

export type ChecklistItemResult = { key: string; label: string; status: "ok" | "atencao" | "critico" };

export type FleetChecklist = {
  id: string;
  vehicle_id: string;
  kind: string;
  driver_name: string;
  odometer_km: number;
  fuel_level_pct: number | null;
  items: ChecklistItemResult[];
  overall_status: string;
  notes: string | null;
  created_at: string;
};

const CHECKLIST_FIELDS =
  "id, vehicle_id, kind, driver_name, odometer_km, fuel_level_pct, items, overall_status, notes, created_at";

export async function listFleetChecklists(limit = 200): Promise<FleetChecklist[]> {
  const { data, error } = await db
    .from("fleet_checklists")
    .select(CHECKLIST_FIELDS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as FleetChecklist[];
}

export type ChecklistInput = {
  vehicle_id: string;
  kind: string;
  driver_name: string;
  odometer_km: number;
  fuel_level_pct: number | null;
  items: ChecklistItemResult[];
  overall_status: string;
  notes: string | null;
};

export async function createFleetChecklist(input: ChecklistInput): Promise<string> {
  const { data, error } = await db.from("fleet_checklists").insert(input).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export type ChecklistPhoto = {
  id: string;
  checklist_id: string;
  category: string;
  storage_path: string;
};

export async function listChecklistPhotos(checklistIds: string[]): Promise<ChecklistPhoto[]> {
  if (checklistIds.length === 0) return [];
  const { data, error } = await db
    .from("fleet_checklist_photos")
    .select("id, checklist_id, category, storage_path")
    .in("checklist_id", checklistIds);
  if (error) throw error;
  return (data ?? []) as ChecklistPhoto[];
}

export async function attachChecklistPhotos(
  checklistId: string,
  photos: { category: string; storage_path: string }[],
): Promise<void> {
  if (photos.length === 0) return;
  const { error } = await db
    .from("fleet_checklist_photos")
    .insert(photos.map((p) => ({ ...p, checklist_id: checklistId })));
  if (error) throw error;
}

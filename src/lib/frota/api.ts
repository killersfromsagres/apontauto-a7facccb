import { supabase } from "@/integrations/supabase/client";
import {
  computeIntegrityScore,
  generateProtocol,
  hasCriticalBlock,
  overallStatus,
  type FilledItem,
  type ItemStatus,
  type Severity,
} from "@/lib/frota/checklist-catalog";
import { cpfLast4, normalizeCpf } from "@/lib/frota/cpf";

// O client tipado ainda não conhece as tabelas novas em tempo de build local.
const db = supabase as unknown as {
  from: (t: string) => any;
};

export type VehicleStatus =
  | "disponivel"
  | "em_uso"
  | "bloqueado"
  | "manutencao"
  | "inativo";

export type Vehicle = {
  id: string;
  prefix: string;
  plate: string | null;
  brand: string;
  model: string;
  version: string | null;
  year_model: number | null;
  year_manufacture: number | null;
  color: string | null;
  chassis_last6: string | null;
  fuel_type: string;
  current_odometer_km: number;
  status: VehicleStatus;
  block_reason: string | null;
  thumbnail_url: string | null;
  model_glb_url: string | null;
  model_poster_url: string | null;
};

export const VEHICLE_FIELDS =
  "id, prefix, plate, brand, model, version, year_model, year_manufacture, color, chassis_last6, fuel_type, current_odometer_km, status, block_reason, thumbnail_url, model_glb_url, model_poster_url";

export const VEHICLE_STATUS_LABEL: Record<VehicleStatus, string> = {
  disponivel: "Disponível",
  em_uso: "Em uso",
  bloqueado: "Bloqueado",
  manutencao: "Manutenção",
  inativo: "Inativo",
};

export function vehicleLabel(v: Vehicle): string {
  const ano = v.year_model ? ` ${v.year_model}` : "";
  return `${v.brand} ${v.model}${v.version ? ` ${v.version}` : ""}${ano}`;
}

export async function listVehicles(): Promise<Vehicle[]> {
  const { data, error } = await db.from("vehicles").select(VEHICLE_FIELDS).order("prefix");
  if (error) throw error;
  return (data ?? []) as Vehicle[];
}

export type Checklist = {
  id: string;
  protocol: string;
  vehicle_id: string;
  checklist_type: string;
  odometer_km: number;
  fuel_level_pct: number | null;
  location: string | null;
  purpose: string | null;
  work_order_number: string | null;
  overall_status: string;
  integrity_score: number;
  critical_block: boolean;
  notes: string | null;
  integrity_hash: string | null;
  submitted_at: string;
};

export async function listChecklists(limit = 300): Promise<Checklist[]> {
  const { data, error } = await db
    .from("vehicle_checklists")
    .select(
      "id, protocol, vehicle_id, checklist_type, odometer_km, fuel_level_pct, location, purpose, work_order_number, overall_status, integrity_score, critical_block, notes, integrity_hash, submitted_at",
    )
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as Checklist[];
}

export async function getChecklistDetail(checklistId: string) {
  const [items, photos, colabs] = await Promise.all([
    db.from("vehicle_checklist_items").select("*").eq("checklist_id", checklistId),
    db
      .from("vehicle_checklist_photos")
      .select("*")
      .eq("checklist_id", checklistId)
      .is("removed_at", null),
    db.from("vehicle_checklist_collaborators").select("*").eq("checklist_id", checklistId),
  ]);
  return {
    items: (items.data ?? []) as any[],
    photos: (photos.data ?? []) as any[],
    collaborators: (colabs.data ?? []) as any[],
  };
}

export type Fueling = {
  id: string;
  vehicle_id: string;
  fueled_at: string;
  driver_name: string | null;
  odometer_km: number;
  fuel_type: string;
  liters: number;
  price_per_liter: number | null;
  total_value: number | null;
  station: string | null;
  receipt_number: string | null;
  odometer_photo_url: string | null;
  receipt_photo_url: string | null;
  full_tank: boolean;
  notes: string | null;
  anomalies: string[];
};

export async function listFuelings(limit = 500): Promise<Fueling[]> {
  const { data, error } = await db
    .from("vehicle_fuelings")
    .select("*")
    .order("fueled_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({ ...r, anomalies: r.anomalies ?? [] })) as Fueling[];
}

export type Occurrence = {
  id: string;
  vehicle_id: string;
  checklist_id: string | null;
  occurrence_type: string;
  severity: Severity;
  description: string;
  state: string;
  assignee: string | null;
  opened_at: string;
  resolved_at: string | null;
  resolution_notes: string | null;
};

export async function listOccurrences(): Promise<Occurrence[]> {
  const { data, error } = await db
    .from("vehicle_occurrences")
    .select("*")
    .order("opened_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as Occurrence[];
}

// ---------------------------------------------------------------- checklist

export type CollaboratorInput = {
  employeeId?: string | null;
  fullName: string;
  cpf: string;
  role: "principal" | "acompanhante";
};

export type ChecklistPhotoInput = {
  slot: string;
  url: string;
  itemKey?: string | null;
  hash?: string | null;
};

export type SubmitChecklistInput = {
  vehicleId: string;
  checklistType: string;
  odometerKm: number;
  fuelLevelPct: number;
  location: string;
  purpose: string;
  workOrderNumber?: string;
  notes?: string;
  declarationAccepted: boolean;
  collaborators: CollaboratorInput[];
  items: (FilledItem & { label: string; category: string })[];
  photos: ChecklistPhotoInput[];
};

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Grava checklist + colaboradores + itens + fotos e abre ocorrências. */
export async function submitChecklist(input: SubmitChecklistInput) {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("Sessão expirada. Entre novamente.");
  if (!input.declarationAccepted) throw new Error("Confirme a declaração de veracidade.");

  const filled: FilledItem[] = input.items.map((i) => ({
    key: i.key,
    status: i.status,
    severity: i.severity ?? null,
  }));
  const score = computeIntegrityScore(filled);
  const critical = hasCriticalBlock(filled);
  const status = overallStatus(filled);
  const protocol = generateProtocol();
  const integrityHash = await sha256Hex(
    JSON.stringify({ protocol, v: input.vehicleId, o: input.odometerKm, i: filled }),
  );

  const { data: chk, error } = await db
    .from("vehicle_checklists")
    .insert({
      protocol,
      vehicle_id: input.vehicleId,
      checklist_type: input.checklistType,
      odometer_km: input.odometerKm,
      fuel_level_pct: input.fuelLevelPct,
      location: input.location || null,
      purpose: input.purpose || null,
      work_order_number: input.workOrderNumber || null,
      overall_status: status,
      integrity_score: score,
      critical_block: critical,
      declaration_accepted: true,
      notes: input.notes || null,
      integrity_hash: integrityHash,
      submitted_by: uid,
    })
    .select("id, protocol")
    .single();
  if (error) throw error;
  const checklistId = chk.id as string;

  for (const c of input.collaborators) {
    const { data: row, error: cErr } = await db
      .from("vehicle_checklist_collaborators")
      .insert({
        checklist_id: checklistId,
        employee_id: c.employeeId ?? null,
        role_in_checklist: c.role,
        full_name_snapshot: c.fullName.trim(),
        cpf_last4: cpfLast4(c.cpf),
      })
      .select("id")
      .single();
    if (cErr) throw cErr;
    await db.from("vehicle_checklist_collaborator_pii").insert({
      collaborator_id: row.id,
      cpf_normalized: normalizeCpf(c.cpf),
    });
  }

  const itemRows = input.items.map((i) => ({
    checklist_id: checklistId,
    item_key: i.key,
    category: i.category,
    label: i.label,
    status: i.status,
    severity: i.status === "nao_conforme" ? (i.severity ?? "media") : null,
    notes: i.notes || null,
  }));
  if (itemRows.length) {
    const { data: inserted, error: iErr } = await db
      .from("vehicle_checklist_items")
      .insert(itemRows)
      .select("id, item_key");
    if (iErr) throw iErr;
    const byKey = new Map<string, string>(
      (inserted ?? []).map((r: any) => [r.item_key as string, r.id as string]),
    );
    const photoRows = input.photos.map((p) => ({
      checklist_id: checklistId,
      checklist_item_id: p.itemKey ? (byKey.get(p.itemKey) ?? null) : null,
      photo_slot: p.slot,
      url: p.url,
      image_hash: p.hash ?? null,
      uploaded_by: uid,
    }));
    if (photoRows.length) {
      const { error: pErr } = await db.from("vehicle_checklist_photos").insert(photoRows);
      if (pErr) throw pErr;
    }
  }

  const nonConform = input.items.filter((i) => i.status === "nao_conforme");
  if (nonConform.length) {
    await db.from("vehicle_occurrences").insert(
      nonConform.map((i) => ({
        vehicle_id: input.vehicleId,
        checklist_id: checklistId,
        occurrence_type: "nao_conformidade",
        severity: i.severity ?? "media",
        description: `${i.label}${i.notes ? ` — ${i.notes}` : ""}`,
        state: "aberta",
        created_by: uid,
      })),
    );
  }

  return { checklistId, protocol, score, critical, status };
}

// ------------------------------------------------------------- abastecimento

export type FuelingInput = {
  vehicleId: string;
  fueledAt: string;
  driverName: string;
  odometerKm: number;
  fuelType: string;
  liters: number;
  pricePerLiter: number;
  station: string;
  receiptNumber: string;
  fullTank: boolean;
  notes: string;
  odometerPhotoUrl?: string | null;
  receiptPhotoUrl?: string | null;
};

/** Detecta divergências antes de gravar (odômetro, duplicidade, valor). */
export function detectFuelingAnomalies(
  input: FuelingInput,
  vehicle: Vehicle | undefined,
  previous: Fueling[],
): string[] {
  const out: string[] = [];
  const last = previous
    .filter((f) => f.vehicle_id === input.vehicleId)
    .sort((a, b) => +new Date(b.fueled_at) - +new Date(a.fueled_at))[0];

  if (last && input.odometerKm < Number(last.odometer_km)) {
    out.push("Odômetro menor que o do último abastecimento");
  }
  if (vehicle && input.odometerKm < Number(vehicle.current_odometer_km) - 1) {
    out.push("Odômetro abaixo do registrado no veículo");
  }
  if (last && Math.abs(+new Date(input.fueledAt) - +new Date(last.fueled_at)) < 30 * 60 * 1000) {
    out.push("Possível abastecimento duplicado (menos de 30 min)");
  }
  const total = input.liters * input.pricePerLiter;
  if (input.pricePerLiter > 0 && (input.pricePerLiter < 2 || input.pricePerLiter > 12)) {
    out.push("Preço por litro fora da faixa esperada");
  }
  if (total > 2000) out.push("Valor total incompatível com a frota");
  return out;
}

export async function createFueling(input: FuelingInput, anomalies: string[]) {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("Sessão expirada. Entre novamente.");
  const total = Number((input.liters * input.pricePerLiter).toFixed(2));
  const { error } = await db.from("vehicle_fuelings").insert({
    vehicle_id: input.vehicleId,
    fueled_at: input.fueledAt,
    driver_name: input.driverName || null,
    odometer_km: input.odometerKm,
    fuel_type: input.fuelType,
    liters: input.liters,
    price_per_liter: input.pricePerLiter || null,
    total_value: Number.isFinite(total) && total > 0 ? total : null,
    station: input.station || null,
    receipt_number: input.receiptNumber || null,
    odometer_photo_url: input.odometerPhotoUrl ?? null,
    receipt_photo_url: input.receiptPhotoUrl ?? null,
    full_tank: input.fullTank,
    notes: input.notes || null,
    anomalies,
    created_by: uid,
  });
  if (error) throw error;

  if (input.odometerKm > 0) {
    await db
      .from("vehicles")
      .update({ current_odometer_km: input.odometerKm })
      .eq("id", input.vehicleId);
  }
}

export type ConsumptionRow = {
  vehicleId: string;
  liters: number;
  cost: number;
  km: number;
  kmPerLiter: number | null;
  costPerKm: number | null;
};

/** Consumo médio entre tanques cheios consecutivos e custo por km. */
export function computeConsumption(fuelings: Fueling[]): Map<string, ConsumptionRow> {
  const byVehicle = new Map<string, Fueling[]>();
  for (const f of fuelings) {
    const arr = byVehicle.get(f.vehicle_id) ?? [];
    arr.push(f);
    byVehicle.set(f.vehicle_id, arr);
  }
  const out = new Map<string, ConsumptionRow>();
  for (const [vehicleId, list] of byVehicle) {
    const asc = [...list].sort((a, b) => +new Date(a.fueled_at) - +new Date(b.fueled_at));
    const liters = asc.reduce((s, f) => s + Number(f.liters || 0), 0);
    const cost = asc.reduce((s, f) => s + Number(f.total_value || 0), 0);
    let km = 0;
    let litersBetween = 0;
    let prevFull: Fueling | null = null;
    for (const f of asc) {
      if (prevFull && f.full_tank) {
        const delta = Number(f.odometer_km) - Number(prevFull.odometer_km);
        if (delta > 0 && delta < 5000) {
          km += delta;
          litersBetween += Number(f.liters || 0);
        }
      }
      if (f.full_tank) prevFull = f;
    }
    out.set(vehicleId, {
      vehicleId,
      liters,
      cost,
      km,
      kmPerLiter: km > 0 && litersBetween > 0 ? km / litersBetween : null,
      costPerKm: km > 0 && cost > 0 ? cost / km : null,
    });
  }
  return out;
}

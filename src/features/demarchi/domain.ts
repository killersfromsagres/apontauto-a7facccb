export type Priority = "emergencial" | "alta" | "baixa";
export type TicketStatus =
  "aberto" | "programado" | "em_execucao" | "aguardando_material" | "concluido" | "cancelado";
export type AssetKind = "planta" | "predio" | "andar" | "ambiente" | "equipamento";
export interface DemAsset {
  id: string;
  code: string;
  name: string;
  kind: AssetKind;
  parent_id: string | null;
  source_ref?: string | null;
  enabled: boolean;
}
export interface DemPerson {
  id: string;
  user_id: string | null;
  name: string;
  email: string;
  kind: "solicitante" | "tecnico";
  specialty: string;
  active: boolean;
}
export interface DemTicket {
  id: string;
  number: number;
  title: string;
  description: string;
  asset_id: string;
  requester_id: string;
  requester_name: string;
  requester_email: string;
  priority: Priority;
  status: TicketStatus;
  created_at: string;
  deadline: string;
  scheduled_for: string | null;
  assigned_to: string | null;
  resolution: string;
  location_detail: string;
  preventive_plan_id: string | null;
  version: number;
}
export interface DemPlan {
  id: string;
  source_key: string | null;
  asset_id: string;
  name: string;
  routine_code: string;
  interval_unit: "dia" | "mes";
  interval_value: number;
  next_due: string;
  source_due: string | null;
  tolerance_days: number;
  active: boolean;
  instructions: string;
}
export interface DemWorklog {
  id: string;
  ticket_id: string;
  person_id: string;
  minutes: number;
  description: string;
  performed_on: string;
}
export interface DemEvent {
  id: string;
  ticket_id: string;
  actor_name: string;
  message: string;
  created_at: string;
}
export const PRIORITIES: Record<Priority, { label: string; days: number; description: string }> = {
  emergencial: {
    label: "Emergencial",
    days: 1,
    description: "Risco ou operação interrompida. Atendimento em até 1 dia.",
  },
  alta: { label: "Alta", days: 7, description: "Problema que afeta o uso do local. Até 7 dias." },
  baixa: {
    label: "Baixa",
    days: 30,
    description: "Ajuste ou reparo sem interrupção. Até 30 dias.",
  },
};
export const STATUSES: Record<TicketStatus, string> = {
  aberto: "Aberto",
  programado: "Programado",
  em_execucao: "Em execução",
  aguardando_material: "Aguardando material",
  concluido: "Concluído",
  cancelado: "Cancelado",
};
export const KINDS: Record<AssetKind, string> = {
  planta: "Planta",
  predio: "Prédio / área",
  andar: "Andar",
  ambiente: "Ambiente / local",
  equipamento: "Equipamento",
};
export const isClosed = (status: TicketStatus) => status === "concluido" || status === "cancelado";
export const protocol = (number: number) => `DEM-OS-${String(number).padStart(6, "0")}`;
export function dueState(ticket: Pick<DemTicket, "deadline" | "status">, now = Date.now()) {
  if (isClosed(ticket.status)) return "encerrado";
  const ms = new Date(ticket.deadline).getTime() - now;
  return ms < 0 ? "vencido" : ms <= 86400000 ? "vence_hoje" : "no_prazo";
}
export function assetPath(id: string, assets: readonly DemAsset[]): DemAsset[] {
  const index = new Map(assets.map((a) => [a.id, a]));
  const path: DemAsset[] = [];
  const seen = new Set<string>();
  let current = index.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parent_id ? index.get(current.parent_id) : undefined;
  }
  return path;
}
export const locationText = (id: string, assets: readonly DemAsset[]) =>
  assetPath(id, assets)
    .filter((a) => a.kind !== "planta")
    .map((a) => a.name)
    .join(" / ");
export function locationIndex(assets: readonly DemAsset[]) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  const paths = new Map<string, string>();
  function resolve(id: string, seen = new Set<string>()): string {
    if (paths.has(id)) return paths.get(id)!;
    const a = byId.get(id);
    if (!a || seen.has(id)) return "";
    const parent = a.parent_id ? resolve(a.parent_id, new Set([...seen, id])) : "";
    const path = a.kind === "planta" ? "" : [parent, a.name].filter(Boolean).join(" / ");
    paths.set(id, path);
    return path;
  }
  assets.forEach((a) => resolve(a.id));
  return paths;
}
export function compareTickets(a: DemTicket, b: DemTicket) {
  const weight = { emergencial: 0, alta: 1, baixa: 2 };
  return (
    Number(isClosed(a.status)) - Number(isClosed(b.status)) ||
    weight[a.priority] - weight[b.priority] ||
    a.deadline.localeCompare(b.deadline) ||
    a.number - b.number
  );
}
export function productivity(
  people: readonly DemPerson[],
  logs: readonly DemWorklog[],
  tickets: readonly DemTicket[],
) {
  const closed = new Set(tickets.filter((t) => t.status === "concluido").map((t) => t.id));
  return people
    .filter((p) => p.kind === "tecnico")
    .map((person) => {
      const entries = logs.filter((l) => l.person_id === person.id);
      return {
        id: person.id,
        name: person.name,
        minutes: entries.reduce((s, l) => s + l.minutes, 0),
        completed: new Set(entries.filter((l) => closed.has(l.ticket_id)).map((l) => l.ticket_id))
          .size,
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
}

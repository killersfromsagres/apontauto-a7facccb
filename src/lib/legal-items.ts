import { supabase } from "@/integrations/supabase/client";

export type Periodicidade = "bimestral" | "trimestral" | "semestral" | "anual";
export type LegalStatus = "em_dia" | "proximo" | "vencido" | "concluido" | "sem_agenda";

export interface LegalItem {
  id: string;
  titulo: string;
  descricao: string;
  empresa: string;
  predio: string;
  observacoes: string;
  periodicidade: Periodicidade;
  ultimaExecucao: string | null; // YYYY-MM-DD
  proximaExecucao: string; // YYYY-MM-DD
  agendamento: string | null; // YYYY-MM-DD
  responsavel: string;
  concluido: boolean;
  createdAt: number;
}

export interface LegalExecution {
  id: string;
  itemId: string;
  data: string; // YYYY-MM-DD
  observacao: string | null;
}

export interface LegalAttachment {
  id: string;
  itemId: string;
  storagePath: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

interface Row {
  id: string;
  titulo: string;
  descricao: string | null;
  empresa: string | null;
  observacoes: string | null;
  periodicidade: string;
  ultima_execucao: string | null;
  proxima_execucao: string;
  agendamento: string | null;
  responsavel: string | null;
  concluido: boolean;
  created_at: string;
}

function fromRow(r: Row): LegalItem {
  return {
    id: r.id,
    titulo: r.titulo,
    descricao: r.descricao ?? "",
    empresa: r.empresa ?? "",
    observacoes: r.observacoes ?? "",
    periodicidade: (r.periodicidade as Periodicidade) ?? "anual",
    ultimaExecucao: r.ultima_execucao,
    proximaExecucao: r.proxima_execucao,
    agendamento: r.agendamento,
    responsavel: r.responsavel ?? "",
    concluido: r.concluido,
    createdAt: new Date(r.created_at).getTime(),
  };
}

export function monthsFor(p: Periodicidade): number {
  return p === "bimestral" ? 2 : p === "trimestral" ? 3 : p === "semestral" ? 6 : 12;
}

export function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

export function daysUntil(dateStr: string | null): number {
  if (!dateStr) return Number.POSITIVE_INFINITY;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(dateStr + "T00:00:00");
  return Math.round((d.getTime() - today.getTime()) / 86400000);
}

export function statusOf(item: LegalItem): LegalStatus {
  if (item.concluido) return "concluido";
  if (!item.proximaExecucao) return "sem_agenda";
  const d = daysUntil(item.proximaExecucao);
  if (d < 0) return "vencido";
  if (d <= 15) return "proximo";
  return "em_dia";
}

export const statusMeta: Record<
  LegalStatus,
  { label: string; dot: string; text: string; bg: string; ring: string }
> = {
  em_dia: {
    label: "Em dia",
    dot: "bg-emerald-500",
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
  },
  proximo: {
    label: "Próximo",
    dot: "bg-amber-500",
    text: "text-amber-400",
    bg: "bg-amber-500/10",
    ring: "ring-amber-500/30",
  },
  vencido: {
    label: "Vencido",
    dot: "bg-red-500",
    text: "text-red-400",
    bg: "bg-red-500/10",
    ring: "ring-red-500/40",
  },
  concluido: {
    label: "Concluído",
    dot: "bg-emerald-500",
    text: "text-emerald-400",
    bg: "bg-emerald-500/10",
    ring: "ring-emerald-500/30",
  },
  sem_agenda: {
    label: "Sem agenda",
    dot: "bg-slate-500",
    text: "text-slate-300",
    bg: "bg-slate-500/10",
    ring: "ring-slate-500/30",
  },
};

export async function listLegalItems(): Promise<LegalItem[]> {
  const { data, error } = await supabase
    .from("legal_items" as never)
    .select("*")
    .order("proxima_execucao", { ascending: true });
  if (error) throw error;
  return (data as unknown as Row[]).map(fromRow);
}

export async function createLegalItem(
  input: Omit<LegalItem, "id" | "createdAt">,
): Promise<LegalItem> {
  const { data: userRes } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("legal_items" as never)
    .insert({
      titulo: input.titulo,
      descricao: input.descricao || null,
      empresa: input.empresa || null,
      observacoes: input.observacoes || null,
      periodicidade: input.periodicidade,
      ultima_execucao: input.ultimaExecucao,
      proxima_execucao: input.proximaExecucao,
      agendamento: input.agendamento,
      responsavel: input.responsavel || null,
      concluido: input.concluido,
      created_by: userRes.user?.id ?? null,
    } as never)
    .select("*")
    .single();
  if (error) throw error;
  return fromRow(data as unknown as Row);
}

export async function updateLegalItem(id: string, patch: Partial<LegalItem>): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (patch.titulo !== undefined) payload.titulo = patch.titulo;
  if (patch.descricao !== undefined) payload.descricao = patch.descricao || null;
  if (patch.empresa !== undefined) payload.empresa = patch.empresa || null;
  if (patch.observacoes !== undefined) payload.observacoes = patch.observacoes || null;
  if (patch.periodicidade !== undefined) payload.periodicidade = patch.periodicidade;
  if (patch.ultimaExecucao !== undefined) payload.ultima_execucao = patch.ultimaExecucao;
  if (patch.proximaExecucao !== undefined) payload.proxima_execucao = patch.proximaExecucao;
  if (patch.agendamento !== undefined) payload.agendamento = patch.agendamento;
  if (patch.responsavel !== undefined) payload.responsavel = patch.responsavel || null;
  if (patch.concluido !== undefined) payload.concluido = patch.concluido;
  const { error } = await supabase
    .from("legal_items" as never)
    .update(payload as never)
    .eq("id", id);
  if (error) throw error;
}

export async function deleteLegalItem(id: string): Promise<void> {
  const { error } = await supabase.from("legal_items" as never).delete().eq("id", id);
  if (error) throw error;
}

/** Marca como concluído: grava execução, atualiza última e recalcula próxima. */
export async function completeLegalItem(item: LegalItem, date = todayISO()): Promise<void> {
  const { data: userRes } = await supabase.auth.getUser();
  const { error: execErr } = await supabase
    .from("legal_item_executions" as never)
    .insert({
      item_id: item.id,
      data_execucao: date,
      executado_por: userRes.user?.id ?? null,
    } as never);
  if (execErr) throw execErr;

  const next = addMonths(date, monthsFor(item.periodicidade));
  await updateLegalItem(item.id, {
    ultimaExecucao: date,
    proximaExecucao: next,
    concluido: false,
    agendamento: null,
  });
}

// ---------- Executions (para preencher mapa mensal) ----------
export async function listExecutions(): Promise<LegalExecution[]> {
  const { data, error } = await supabase
    .from("legal_item_executions" as never)
    .select("id, item_id, data_execucao, observacao");
  if (error) throw error;
  return (data as unknown as Array<{
    id: string;
    item_id: string;
    data_execucao: string;
    observacao: string | null;
  }>).map((r) => ({
    id: r.id,
    itemId: r.item_id,
    data: r.data_execucao,
    observacao: r.observacao,
  }));
}

// ---------- Attachments ----------
export async function listAttachments(itemId: string): Promise<LegalAttachment[]> {
  const { data, error } = await supabase
    .from("legal_item_attachments" as never)
    .select("*")
    .eq("item_id", itemId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as unknown as Array<{
    id: string;
    item_id: string;
    storage_path: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
  }>).map((r) => ({
    id: r.id,
    itemId: r.item_id,
    storagePath: r.storage_path,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  }));
}

export async function countAttachments(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("legal_item_attachments" as never)
    .select("item_id");
  if (error) throw error;
  const map: Record<string, number> = {};
  for (const row of (data as unknown as Array<{ item_id: string }>) ?? []) {
    map[row.item_id] = (map[row.item_id] ?? 0) + 1;
  }
  return map;
}

function safeSegment(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "sem-nome";
}

export async function uploadAttachment(item: LegalItem, file: File): Promise<LegalAttachment> {
  const { data: userRes } = await supabase.auth.getUser();
  const empresa = safeSegment(item.empresa || "sem-empresa");
  const tarefa = safeSegment(item.titulo);
  const stamp = Date.now();
  const filename = `${stamp}-${safeSegment(file.name)}`;
  const path = `${empresa}/${tarefa}/${filename}`;

  const { error: upErr } = await supabase.storage
    .from("legal-certificates")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (upErr) throw upErr;

  const { data, error } = await supabase
    .from("legal_item_attachments" as never)
    .insert({
      item_id: item.id,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: userRes.user?.id ?? null,
    } as never)
    .select("*")
    .single();
  if (error) throw error;
  const r = data as unknown as {
    id: string;
    item_id: string;
    storage_path: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    created_at: string;
  };
  return {
    id: r.id,
    itemId: r.item_id,
    storagePath: r.storage_path,
    fileName: r.file_name,
    mimeType: r.mime_type,
    sizeBytes: r.size_bytes,
    createdAt: r.created_at,
  };
}

export async function signedUrl(path: string, expiresInSec = 3600): Promise<string> {
  const { data, error } = await supabase.storage
    .from("legal-certificates")
    .createSignedUrl(path, expiresInSec);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteAttachment(att: LegalAttachment): Promise<void> {
  await supabase.storage.from("legal-certificates").remove([att.storagePath]);
  const { error } = await supabase
    .from("legal_item_attachments" as never)
    .delete()
    .eq("id", att.id);
  if (error) throw error;
}

// ---------- Helpers de mapa mensal (Jan..Dez) ----------
/**
 * Retorna, para cada mês do ano informado, o "estado" da tarefa naquele mês:
 *  - "done" = houve execução naquele mês
 *  - "scheduled" = mês corresponde à próxima execução ou agendamento
 *  - "overdue" = próxima execução caiu num mês anterior sem execução
 *  - "none" = nada previsto
 */
export type MonthCell = "done" | "scheduled" | "overdue" | "none";

export function buildMonthMap(
  item: LegalItem,
  execs: LegalExecution[],
  year: number,
): MonthCell[] {
  const cells: MonthCell[] = Array(12).fill("none");
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  for (const e of execs) {
    if (e.itemId !== item.id) continue;
    const d = new Date(e.data + "T00:00:00");
    if (d.getFullYear() === year) cells[d.getMonth()] = "done";
  }

  const next = item.proximaExecucao ? new Date(item.proximaExecucao + "T00:00:00") : null;
  if (next && next.getFullYear() === year) {
    const m = next.getMonth();
    if (cells[m] !== "done") {
      const isPast =
        year < currentYear || (year === currentYear && m < currentMonth);
      cells[m] = isPast ? "overdue" : "scheduled";
    }
  }
  const ag = item.agendamento ? new Date(item.agendamento + "T00:00:00") : null;
  if (ag && ag.getFullYear() === year) {
    const m = ag.getMonth();
    if (cells[m] === "none") cells[m] = "scheduled";
  }
  return cells;
}

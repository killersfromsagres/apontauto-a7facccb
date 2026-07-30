import { supabase } from "@/integrations/supabase/client";
import type { StatusTone } from "@/components/pcm";

export type NotificationCategory =
  | "informacao"
  | "sucesso"
  | "atencao"
  | "critico"
  | "manutencao"
  | "clima"
  | "pt"
  | "seguranca";

export type NotificationStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "paused"
  | "cancelled";

export type TargetMode = "all" | "users" | "roles" | "modules" | "teams";



export const CATEGORIES: {
  key: NotificationCategory;
  label: string;
  tone: StatusTone;
}[] = [
  { key: "informacao", label: "Informação", tone: "primary" },
  { key: "sucesso", label: "Sucesso", tone: "success" },
  { key: "atencao", label: "Atenção", tone: "warning" },
  { key: "critico", label: "Crítico", tone: "danger" },
  { key: "manutencao", label: "Manutenção", tone: "neutral" },
  { key: "clima", label: "Clima", tone: "primary" },
  { key: "pt", label: "PT (Permissão de Trabalho)", tone: "warning" },
  { key: "seguranca", label: "Segurança", tone: "danger" },
];

export const categoryMeta = (key: string) =>
  CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[0];

export const TARGET_MODES: { key: TargetMode; label: string }[] = [
  { key: "all", label: "Todos os colaboradores" },
  { key: "users", label: "Usuários selecionados" },
  { key: "roles", label: "Papéis selecionados" },
  { key: "modules", label: "Módulos selecionados" },
  { key: "teams", label: "Equipes selecionadas" },
];

export const STATUS_LABEL: Record<NotificationStatus, string> = {
  draft: "Rascunho",
  scheduled: "Agendado",
  published: "Publicado",
  paused: "Pausado",
  cancelled: "Cancelado",
};

export const STATUS_TONE: Record<NotificationStatus, StatusTone> = {
  draft: "neutral",
  scheduled: "primary",
  published: "success",
  paused: "warning",
  cancelled: "danger",
};

/** Severidade derivada da categoria — mantém compatibilidade com a coluna legada. */
export function severityForCategory(cat: NotificationCategory): string {
  if (cat === "critico" || cat === "seguranca") return "critical";
  if (cat === "atencao" || cat === "pt" || cat === "clima") return "warn";
  return "info";
}

export type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  severity: string;
  category: string;
  target_mode: string;
  module_key: string | null;
  deep_link: string | null;
  link_url: string | null;
  starts_at: string;
  expires_at: string | null;
  requires_ack: boolean;
  status: string;
  created_at: string;
  created_by: string | null;
};

export type ReceiptRow = {
  notification_id: string;
  user_id: string;
  delivered_at: string;
  read_at: string | null;
  acknowledged_at: string | null;
  archived_at: string | null;
};

/** Preferências por canal (item 17). */
export type NotificationPrefs = {
  user_id: string;
  inapp: boolean;
  toast: boolean;
  som: boolean;
  email: boolean;
  whatsapp: boolean;
  categorias_silenciadas: string[];
  prioridade_minima: string;
};

export const DEFAULT_PREFS: Omit<NotificationPrefs, "user_id"> = {
  inapp: true,
  toast: true,
  som: false,
  email: false,
  whatsapp: false,
  categorias_silenciadas: [],
  prioridade_minima: "info",
};

export const PRIORIDADES: { key: string; label: string }[] = [
  { key: "info", label: "Todas" },
  { key: "warn", label: "Atenção ou maior" },
  { key: "critical", label: "Somente críticas" },
];

const PESO: Record<string, number> = { info: 0, warn: 1, critical: 2 };

/** Aplica as preferências do usuário sobre a lista de avisos. */
export function filtrarPorPreferencias<T extends { category: string; severity: string }>(
  itens: T[],
  prefs: Omit<NotificationPrefs, "user_id"> | null,
): T[] {
  if (!prefs) return itens;
  if (!prefs.inapp) return [];
  const minimo = PESO[prefs.prioridade_minima] ?? 0;
  return itens.filter(
    (n) =>
      !prefs.categorias_silenciadas.includes(n.category) &&
      (PESO[n.severity] ?? 0) >= minimo,
  );
}


export type TargetRow = {
  id: string;
  notification_id: string;
  user_id: string | null;
  role_key: string | null;
  module_key: string | null;
  team_key: string | null;
};

const SELECT_COLS =
  "id, title, body, severity, category, target_mode, module_key, deep_link, link_url, starts_at, expires_at, requires_ack, status, created_at, created_by";

/** Avisos visíveis ao usuário atual (RLS decide o público de verdade). */
export async function fetchInbox(): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(SELECT_COLS)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const now = Date.now();
  return ((data ?? []) as NotificationRow[]).filter(
    (n) =>
      new Date(n.starts_at).getTime() <= now &&
      (!n.expires_at || new Date(n.expires_at).getTime() > now),
  );
}

/** Todos os avisos (visão administrativa). */
export async function fetchAllNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select(SELECT_COLS)
    .order("created_at", { ascending: false })
    .limit(300);
  if (error) throw error;
  return (data ?? []) as NotificationRow[];
}

export async function fetchMyReceipts(): Promise<ReceiptRow[]> {
  const { data, error } = await supabase
    .from("notification_receipts")
    .select("notification_id, user_id, delivered_at, read_at, acknowledged_at, archived_at");
  if (error) throw error;
  return (data ?? []) as ReceiptRow[];
}

/** Arquiva (ou desarquiva) avisos para o usuário atual. */
export async function setArchived(userId: string, ids: string[], archived: boolean) {
  if (!userId || ids.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("notification_receipts").upsert(
    ids.map((notification_id) => ({
      notification_id,
      user_id: userId,
      archived_at: archived ? now : null,
      ...(archived ? { read_at: now } : {}),
    })),
    { onConflict: "notification_id,user_id" },
  );
  if (error) throw error;
}

export async function fetchPrefs(userId: string): Promise<NotificationPrefs> {
  const { data, error } = await supabase
    .from("notification_preferences")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return { user_id: userId, ...DEFAULT_PREFS, ...(data ?? {}) } as NotificationPrefs;
}

export async function savePrefs(userId: string, patch: Partial<NotificationPrefs>) {
  const { error } = await supabase
    .from("notification_preferences")
    .upsert({ user_id: userId, ...DEFAULT_PREFS, ...patch }, { onConflict: "user_id" });
  if (error) throw error;
}


/** Cria o recibo de entrega (idempotente por (notification_id, user_id)). */
export async function ensureDelivered(userId: string, ids: string[]) {
  if (!userId || ids.length === 0) return;
  const { error } = await supabase.from("notification_receipts").upsert(
    ids.map((notification_id) => ({ notification_id, user_id: userId })),
    { onConflict: "notification_id,user_id", ignoreDuplicates: true },
  );
  if (error) throw error;
}

export async function markRead(userId: string, ids: string[]) {
  if (!userId || ids.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await supabase.from("notification_receipts").upsert(
    ids.map((notification_id) => ({
      notification_id,
      user_id: userId,
      read_at: now,
    })),
    { onConflict: "notification_id,user_id" },
  );
  if (error) throw error;
}

export async function acknowledge(userId: string, id: string) {
  const now = new Date().toISOString();
  const { error } = await supabase.from("notification_receipts").upsert(
    { notification_id: id, user_id: userId, read_at: now, acknowledged_at: now },
    { onConflict: "notification_id,user_id" },
  );
  if (error) throw error;
}

export const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
    : "—";

/** Converte um valor de <input type="datetime-local"> em ISO. */
export const localToIso = (v: string) => (v ? new Date(v).toISOString() : null);

/** Converte ISO em valor aceito por <input type="datetime-local">. */
export const isoToLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

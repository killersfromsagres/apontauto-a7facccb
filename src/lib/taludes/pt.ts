import { supabase } from "@/integrations/supabase/client";

export type PTStatus =
  | "solicitada"
  | "em_analise"
  | "liberada"
  | "suspensa_chuva"
  | "revogada"
  | "encerrada";

export const PT_STATUS_LABEL: Record<PTStatus, string> = {
  solicitada: "Solicitação de PT",
  em_analise: "Em análise",
  liberada: "Liberada",
  suspensa_chuva: "Suspensa por chuva",
  revogada: "Revogada",
  encerrada: "Encerrada",
};

export const PT_STATUS_TONE: Record<PTStatus, "neutral" | "primary" | "success" | "warning" | "danger"> = {
  solicitada: "neutral",
  em_analise: "primary",
  liberada: "success",
  suspensa_chuva: "warning",
  revogada: "danger",
  encerrada: "neutral",
};

/** Transições permitidas do fluxo de PT. */
export const PT_TRANSITIONS: Record<PTStatus, PTStatus[]> = {
  solicitada: ["em_analise", "liberada", "revogada"],
  em_analise: ["liberada", "revogada"],
  liberada: ["suspensa_chuva", "encerrada", "revogada"],
  suspensa_chuva: ["liberada", "revogada", "encerrada"],
  revogada: [],
  encerrada: [],
};

export interface PTRelease {
  id: string;
  numero_pt: string;
  map_id: string | null;
  marcacao_ids: string[];
  taludes_label: string | null;
  data_trabalho: string;
  servico: string;
  riscos: string | null;
  equipe: string | null;
  solicitante: string;
  liberador_nome: string | null;
  status: PTStatus;
  solicitada_em: string;
  analise_em: string | null;
  liberada_em: string | null;
  suspensa_em: string | null;
  retomada_em: string | null;
  encerrada_em: string | null;
  revogada_em: string | null;
  weather_snapshot: Record<string, unknown>;
  weather_event_id: string | null;
  observacoes: string | null;
  anexos: { url: string; nome: string }[];
  assinatura_url: string | null;
  assinatura_nome: string | null;
  assinatura_em: string | null;
  created_at: string;
  updated_at: string;
}

export interface PTEvent {
  id: string;
  pt_id: string;
  from_status: string | null;
  to_status: string;
  motivo: string | null;
  weather_snapshot: Record<string, unknown>;
  actor_nome: string | null;
  origem: string;
  created_at: string;
}

export async function listPTs(filters?: { status?: PTStatus | "todas"; from?: string; to?: string }) {
  let q = supabase.from("talude_pt_releases").select("*").order("data_trabalho", { ascending: false });
  if (filters?.status && filters.status !== "todas") q = q.eq("status", filters.status);
  if (filters?.from) q = q.gte("data_trabalho", filters.from);
  if (filters?.to) q = q.lte("data_trabalho", filters.to);
  const { data, error } = await q.limit(500);
  if (error) throw error;
  return (data ?? []) as unknown as PTRelease[];
}

export async function listPTEvents(ptId: string) {
  const { data, error } = await supabase
    .from("talude_pt_events")
    .select("*")
    .eq("pt_id", ptId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as PTEvent[];
}

async function currentActor() {
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  return {
    id: user?.id ?? null,
    nome:
      (user?.user_metadata?.full_name as string | undefined) ??
      user?.email ??
      "Usuário",
  };
}

export async function criarPT(input: {
  numero_pt: string;
  map_id: string | null;
  marcacao_ids: string[];
  taludes_label: string;
  data_trabalho: string;
  servico: string;
  riscos?: string;
  equipe?: string;
  solicitante: string;
  observacoes?: string;
  weather_snapshot?: Record<string, unknown>;
}) {
  const actor = await currentActor();
  const { data, error } = await supabase
    .from("talude_pt_releases")
    .insert({
      numero_pt: input.numero_pt,
      map_id: input.map_id,
      marcacao_ids: input.marcacao_ids,
      taludes_label: input.taludes_label,
      data_trabalho: input.data_trabalho,
      servico: input.servico,
      riscos: input.riscos ?? null,
      equipe: input.equipe ?? null,
      solicitante: input.solicitante,
      solicitante_id: actor.id,
      observacoes: input.observacoes ?? null,
      weather_snapshot: (input.weather_snapshot ?? {}) as never,
      status: "solicitada",
      created_by: actor.id,
    })
    .select("*")
    .single();
  if (error) throw error;

  await supabase.from("talude_pt_events").insert({
    pt_id: data.id,
    from_status: null,
    to_status: "solicitada",
    motivo: "Solicitação registrada",
    weather_snapshot: (input.weather_snapshot ?? {}) as never,
    actor_id: actor.id,
    actor_nome: actor.nome,
  });

  return data as unknown as PTRelease;
}

const STAMP: Partial<Record<PTStatus, string>> = {
  em_analise: "analise_em",
  liberada: "liberada_em",
  suspensa_chuva: "suspensa_em",
  revogada: "revogada_em",
  encerrada: "encerrada_em",
};

export async function transicionarPT(input: {
  pt: PTRelease;
  to: PTStatus;
  motivo?: string;
  liberador_nome?: string;
  assinatura_url?: string;
  assinatura_nome?: string;
  weather_snapshot?: Record<string, unknown>;
}) {
  const { pt, to } = input;
  if (!PT_TRANSITIONS[pt.status]?.includes(to)) {
    throw new Error(`Transição inválida: ${PT_STATUS_LABEL[pt.status]} → ${PT_STATUS_LABEL[to]}`);
  }
  const actor = await currentActor();
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { status: to };
  const stamp = STAMP[to];
  if (stamp) patch[stamp] = now;
  // Retomada após suspensão por chuva exige nova liberação registrada.
  if (to === "liberada" && pt.status === "suspensa_chuva") patch.retomada_em = now;
  if (to === "liberada") {
    patch.liberador_nome = input.liberador_nome ?? actor.nome;
    patch.liberador_id = actor.id;
    if (input.assinatura_url) {
      patch.assinatura_url = input.assinatura_url;
      patch.assinatura_nome = input.assinatura_nome ?? actor.nome;
      patch.assinatura_em = now;
    }
  }
  if (input.weather_snapshot) patch.weather_snapshot = input.weather_snapshot;

  const { error } = await supabase
    .from("talude_pt_releases")
    .update(patch as never)
    .eq("id", pt.id);
  if (error) throw error;

  const { error: evErr } = await supabase.from("talude_pt_events").insert({
    pt_id: pt.id,
    from_status: pt.status,
    to_status: to,
    motivo: input.motivo ?? null,
    weather_snapshot: (input.weather_snapshot ?? {}) as never,
    actor_id: actor.id,
    actor_nome: actor.nome,
  });
  if (evErr) throw evErr;
}

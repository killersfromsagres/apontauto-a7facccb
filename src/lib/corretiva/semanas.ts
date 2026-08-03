import { supabase } from "@/integrations/supabase/client";

/** Semana a partir da qual a programação passa a ser controlada. */
export const SEMANA_INICIAL = 32;

export type SemanaLiberacao = {
  ano: number;
  semana: number;
  liberada: boolean;
  liberada_em: string | null;
};

/** Número da semana ISO-8601 (1-53) e o ano ISO correspondente. */
export function isoWeek(date: Date): { ano: number; semana: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { ano: d.getUTCFullYear(), semana };
}

/** Semana ISO de uma OS, usando programação → SLA → criação. */
export function semanaDaOs(os: {
  data_programada?: string | null;
  data_sla?: string | null;
  data_criacao?: string | null;
  updated_at?: string | null;
}): { ano: number; semana: number } | null {
  const raw = os.data_programada || os.data_sla || os.data_criacao || os.updated_at;
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return isoWeek(d);
}

export const semanaKey = (ano: number, semana: number) =>
  `${ano}-${String(semana).padStart(2, "0")}`;

/** Intervalo (segunda a domingo) de uma semana ISO, formatado em pt-BR. */
export function intervaloSemana(ano: number, semana: number): string {
  const simple = new Date(Date.UTC(ano, 0, 1 + (semana - 1) * 7));
  const dow = simple.getUTCDay() || 7;
  const monday = new Date(simple);
  monday.setUTCDate(simple.getUTCDate() - dow + 1);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) =>
    `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${fmt(monday)} – ${fmt(sunday)}`;
}

export async function fetchLiberacoes(): Promise<SemanaLiberacao[]> {
  const { data, error } = await supabase
    .from("programacao_semanas")
    .select("ano, semana, liberada, liberada_em");
  if (error) throw error;
  return (data ?? []) as SemanaLiberacao[];
}

/** Liga/desliga a liberação de uma semana (somente admin, garantido por RLS). */
export async function setLiberacao(ano: number, semana: number, liberada: boolean) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("programacao_semanas").upsert(
    {
      ano,
      semana,
      liberada,
      liberada_por: liberada ? (userData.user?.id ?? null) : null,
      liberada_em: liberada ? new Date().toISOString() : null,
    },
    { onConflict: "ano,semana" },
  );
  if (error) throw error;
}

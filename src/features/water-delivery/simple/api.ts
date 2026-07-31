// Programação simples de entrega de água — leitura e gravação diretas.
// Modelo enxuto: ponto (prédio/andar/espaço + dias da semana) → entrega do dia → fotos.

import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "@/lib/refrigeracao/image";
import { uploadPhotoWithFallback } from "@/lib/photo-upload";

const db = supabase as unknown as { from: (t: string) => any };

export const MODULO = "abastecimento-agua";
export const BUCKET_FOTOS = "agua-fotos";

/** Colaboradores que executam a entrega de água. */
export const COLABORADORES = ["Kaique França de Araújo", "Kaique Cosme Luiz Frederico"] as const;

export const DIAS = [
  { n: 1, curto: "SEG", label: "Segunda-feira" },
  { n: 2, curto: "TER", label: "Terça-feira" },
  { n: 3, curto: "QUA", label: "Quarta-feira" },
  { n: 4, curto: "QUI", label: "Quinta-feira" },
  { n: 5, curto: "SEX", label: "Sexta-feira" },
] as const;

export type EntregaStatus = "concluida" | "nao_necessario" | "bloqueado";

export const STATUS_LABEL: Record<EntregaStatus, string> = {
  concluida: "Entregue",
  nao_necessario: "Não foi necessário",
  bloqueado: "Sem acesso",
};

export interface PontoProg {
  id: string;
  predio: string;
  andar: string | null;
  espaco: string | null;
  periodo: string | null;
  dias: number[];
  bags: number;
  ordem: number;
  ativo: boolean;
}

export interface EntregaFoto {
  id: string;
  entrega_id: string;
  url: string;
  criado_em: string;
}

export interface Entrega {
  id: string;
  ponto_id: string;
  data: string;
  colaboradores: string[];
  veiculo: string | null;
  bags: number;
  observacao: string | null;
  status: EntregaStatus;
  bebedouro_ok: boolean | null;
  bebedouro_obs: string | null;
  criado_em: string;
  fotos?: EntregaFoto[];
}

const PONTO_FIELDS = "id, predio, andar, espaco, periodo, dias, bags, ordem, ativo";
const ENTREGA_FIELDS =
  "id, ponto_id, data, colaboradores, veiculo, bags, observacao, status, bebedouro_ok, bebedouro_obs, criado_em";

/** Data de hoje no fuso operacional (YYYY-MM-DD). */
export function hojeISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

/** 1 = segunda … 5 = sexta (sábado/domingo caem em 1). */
export function diaDaSemana(dataISO: string): number {
  const [y, m, d] = dataISO.split("-").map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd >= 1 && wd <= 5 ? wd : 1;
}

export function formatarData(dataISO: string): string {
  const [y, m, d] = dataISO.split("-");
  return `${d}/${m}/${y}`;
}

export function localDoPonto(p: PontoProg): string {
  return [p.predio, p.andar, p.espaco].filter(Boolean).join(" · ");
}

export async function listPontos(): Promise<PontoProg[]> {
  const { data, error } = await db
    .from("agua_prog_pontos")
    .select(PONTO_FIELDS)
    .eq("ativo", true)
    .order("ordem");
  if (error) throw error;
  const pontos = (data ?? []) as PontoProg[];
  // Ordem alfabética por prédio → andar → espaço (números lidos como números).
  const collator = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
  return pontos.sort(
    (a, b) =>
      collator.compare(a.predio ?? "", b.predio ?? "") ||
      collator.compare(a.andar ?? "", b.andar ?? "") ||
      collator.compare(a.espaco ?? "", b.espaco ?? ""),
  );
}

export async function listEntregasDoDia(dataISO: string): Promise<Entrega[]> {
  const { data, error } = await db
    .from("agua_prog_entregas")
    .select(`${ENTREGA_FIELDS}, fotos:agua_prog_fotos(id, entrega_id, url, criado_em)`)
    .eq("data", dataISO);
  if (error) throw error;
  return (data ?? []) as Entrega[];
}

export async function listEntregasPeriodo(inicio: string, fim: string): Promise<Entrega[]> {
  const { data, error } = await db
    .from("agua_prog_entregas")
    .select(`${ENTREGA_FIELDS}, fotos:agua_prog_fotos(id, entrega_id, url, criado_em)`)
    .gte("data", inicio)
    .lte("data", fim)
    .order("data", { ascending: false })
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Entrega[];
}

export interface RegistroEntrega {
  pontoId: string;
  data: string;
  colaboradores: string[];
  veiculo: string | null;
  bags: number;
  observacao: string | null;
  status: EntregaStatus;
  bebedouroOk: boolean | null;
  bebedouroObs: string | null;
  fotos: Blob[];
}

/** Grava (ou atualiza) a entrega do ponto no dia e sobe as fotos novas. */
export async function registrarEntrega(input: RegistroEntrega): Promise<Entrega> {
  const { data: u } = await supabase.auth.getUser();
  const { data, error } = await db
    .from("agua_prog_entregas")
    .upsert(
      {
        ponto_id: input.pontoId,
        data: input.data,
        colaboradores: input.colaboradores,
        veiculo: input.veiculo,
        bags: input.bags,
        observacao: input.observacao,
        status: input.status,
        bebedouro_ok: input.bebedouroOk,
        bebedouro_obs: input.bebedouroObs,
        registrado_por: u.user?.id ?? null,
        atualizado_em: new Date().toISOString(),
      },
      { onConflict: "ponto_id,data" },
    )
    .select(ENTREGA_FIELDS)
    .single();
  if (error) throw error;
  const entrega = data as Entrega;

  for (const foto of input.fotos) {
    const comprimida = await compressImage(foto, { maxDim: 1600, quality: 0.75 });
    const up = await uploadPhotoWithFallback(
      comprimida,
      `agua-${entrega.id}-${Date.now()}.jpg`,
      BUCKET_FOTOS,
      { module: MODULO, entityType: "agua_prog_fotos", entityId: entrega.id },
    );
    const { error: fErr } = await db.from("agua_prog_fotos").insert({
      entrega_id: entrega.id,
      url: up.url,
      storage_path: up.storagePath,
    });
    if (fErr) throw fErr;
  }

  return entrega;
}

export async function removerEntrega(id: string): Promise<void> {
  const { error } = await db.from("agua_prog_entregas").delete().eq("id", id);
  if (error) throw error;
}

export async function removerFoto(id: string): Promise<void> {
  const { error } = await db.from("agua_prog_fotos").delete().eq("id", id);
  if (error) throw error;
}

/* --------------------------------------------------------------- */
/* Preferências locais da dupla do dia (colaboradores + carro)      */
/* --------------------------------------------------------------- */

const KEY = "agua:equipe-do-dia";

export interface EquipeDoDia {
  colaboradores: string[];
  veiculo: string | null;
}

export function carregarEquipe(): EquipeDoDia {
  if (typeof localStorage === "undefined") return { colaboradores: [], veiculo: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { colaboradores: [], veiculo: null };
    const parsed = JSON.parse(raw) as EquipeDoDia;
    return {
      colaboradores: Array.isArray(parsed.colaboradores) ? parsed.colaboradores : [],
      veiculo: parsed.veiculo ?? null,
    };
  } catch {
    return { colaboradores: [], veiculo: null };
  }
}

export function salvarEquipe(v: EquipeDoDia): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* armazenamento indisponível — segue sem persistir */
  }
}

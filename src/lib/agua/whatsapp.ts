// Compartilhamento de evidências no WhatsApp (modo padrão: Web Share API nativa,
// fallback por links). O histórico das evidências NUNCA depende do WhatsApp —
// o registro fica em `agua_fotos`/`agua_visitas` e o disparo em
// `agua_whatsapp_envios` apenas como trilha de auditoria.

import { supabase } from "@/integrations/supabase/client";

const db = supabase as unknown as { from: (t: string) => any };

export interface EvidenciaItem {
  /** Prédio (agrupador da mensagem). */
  predio: string;
  /** Nome completo da parada. */
  parada: string;
  url: string;
}

export interface ResumoRota {
  data: string;
  colaboradorPrincipal?: string | null;
  acompanhante?: string | null;
  veiculoPrefixo?: string | null;
  veiculoPlaca?: string | null;
  /** Quando falso, a placa é mascarada na mensagem. */
  podeVerPlaca?: boolean;
  concluidas: number;
  previstas: number;
  bagsEntregues: number;
  ocorrencias: number;
}

export const MENSAGEM_VERSAO = "v1";

export function mascararPlaca(placa?: string | null): string {
  if (!placa) return "—";
  const limpa = placa.replace(/\s+/g, "").toUpperCase();
  if (limpa.length <= 3) return limpa;
  return `${limpa.slice(0, 3)}${"•".repeat(Math.max(0, limpa.length - 3))}`;
}

export function mascararTelefone(numero: string): string {
  const digitos = numero.replace(/\D/g, "");
  if (digitos.length < 6) return "•".repeat(digitos.length);
  return `${digitos.slice(0, 2)}•••••${digitos.slice(-2)}`;
}

/** Hash não reversível para auditar destinatário sem guardar o número. */
export async function hashTelefone(numero: string): Promise<string> {
  const digitos = numero.replace(/\D/g, "");
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(digitos));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const MAX_LINKS = 40;

/** Mensagem profissional configurável — nunca inclui CPF nem segredos. */
export function montarMensagem(
  resumo: ResumoRota,
  itens: EvidenciaItem[],
  template?: string,
): string {
  const equipe = [resumo.colaboradorPrincipal, resumo.acompanhante].filter(Boolean).join(" + ");
  const placa = resumo.podeVerPlaca
    ? (resumo.veiculoPlaca ?? "—")
    : mascararPlaca(resumo.veiculoPlaca);
  const veiculo = [resumo.veiculoPrefixo, placa].filter(Boolean).join(" — ") || "—";

  const porPredio = new Map<string, EvidenciaItem[]>();
  for (const i of itens) {
    const lista = porPredio.get(i.predio) ?? [];
    lista.push(i);
    porPredio.set(i.predio, lista);
  }

  let restantes = MAX_LINKS;
  const blocos: string[] = [];
  for (const [predio, lista] of porPredio) {
    if (restantes <= 0) break;
    const visiveis = lista.slice(0, restantes);
    restantes -= visiveis.length;
    blocos.push(
      [`*${predio}*`, ...visiveis.map((i) => `• ${i.parada}: ${i.url}`)].join("\n"),
    );
  }
  const ocultas = itens.length - (MAX_LINKS - Math.max(0, restantes));
  if (ocultas > 0) blocos.push(`_+${ocultas} evidência(s) disponíveis no histórico do sistema._`);

  const corpo = template ?? DEFAULT_TEMPLATE;
  return corpo
    .replace("{data}", formatarData(resumo.data))
    .replace("{equipe}", equipe || "—")
    .replace("{veiculo}", veiculo)
    .replace("{progresso}", `${resumo.concluidas}/${resumo.previstas}`)
    .replace("{bags}", String(resumo.bagsEntregues))
    .replace("{ocorrencias}", String(resumo.ocorrencias))
    .replace("{lista}", blocos.join("\n\n") || "_Sem evidências no filtro selecionado._")
    .trim();
}

export const DEFAULT_TEMPLATE = `*Abastecimento de Água — Evidências da Rota*
Data: {data}
Equipe: {equipe}
Veículo: {veiculo}
Progresso: {progresso}
Bags entregues: {bags}
Ocorrências: {ocorrencias}

{lista}

_Registro gerado automaticamente pelo Apont Auto._`;

function formatarData(iso: string): string {
  const [a, m, d] = iso.split("-");
  return d ? `${d}/${m}/${a}` : iso;
}

export type ShareResultado =
  | { modo: "nativo_arquivos"; status: "compartilhamento_iniciado" }
  | { modo: "nativo_texto"; status: "compartilhamento_iniciado" }
  | { modo: "link"; status: "compartilhamento_iniciado"; url: string }
  | { modo: "copiado"; status: "compartilhamento_iniciado" }
  | { modo: "cancelado"; status: "cancelado" };

/** Baixa as fotos para compartilhar como arquivos (quando suportado). */
async function baixarArquivos(itens: EvidenciaItem[], limite = 10): Promise<File[]> {
  const alvos = itens.slice(0, limite);
  const arquivos: File[] = [];
  for (const [i, item] of alvos.entries()) {
    try {
      const res = await fetch(item.url);
      if (!res.ok) continue;
      const blob = await res.blob();
      if (!blob.type.startsWith("image/")) continue;
      arquivos.push(new File([blob], `evidencia-${i + 1}.jpg`, { type: blob.type }));
    } catch {
      /* segue para a próxima — links continuam no texto */
    }
  }
  return arquivos;
}

/**
 * Executa o compartilhamento. Retorna o modo efetivamente usado — o chamador
 * NUNCA deve tratar isso como "entregue", apenas como compartilhamento iniciado.
 */
export async function compartilharEvidencias(params: {
  resumo: ResumoRota;
  itens: EvidenciaItem[];
  template?: string;
  /** Número administrativo opcional (apenas dígitos com DDI). */
  numero?: string | null;
  preferirArquivos?: boolean;
}): Promise<ShareResultado> {
  const texto = montarMensagem(params.resumo, params.itens, params.template);
  const nav = typeof navigator !== "undefined" ? (navigator as any) : null;

  if (params.preferirArquivos !== false && nav?.canShare && nav.share) {
    const arquivos = await baixarArquivos(params.itens);
    if (arquivos.length && nav.canShare({ files: arquivos })) {
      try {
        await nav.share({ files: arquivos, text: texto, title: "Evidências da Rota" });
        return { modo: "nativo_arquivos", status: "compartilhamento_iniciado" };
      } catch (e: any) {
        if (e?.name === "AbortError") return { modo: "cancelado", status: "cancelado" };
      }
    }
  }

  if (nav?.share) {
    try {
      await nav.share({ text: texto, title: "Evidências da Rota" });
      return { modo: "nativo_texto", status: "compartilhamento_iniciado" };
    } catch (e: any) {
      if (e?.name === "AbortError") return { modo: "cancelado", status: "cancelado" };
    }
  }

  const numero = params.numero?.replace(/\D/g, "");
  const url = numero
    ? `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
    : `https://wa.me/?text=${encodeURIComponent(texto)}`;
  if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
  return { modo: "link", status: "compartilhamento_iniciado", url };
}

export async function copiarMensagem(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

/** Trilha de auditoria do compartilhamento (sem número completo nem token). */
export async function registrarDisparo(params: {
  escopoTipo: "rota" | "predio" | "parada" | "selecao";
  escopoId?: string | null;
  modo: "nativo" | "link" | "cloud_api";
  numero?: string | null;
  status: "compartilhamento_iniciado" | "confirmado_pelo_usuario" | "cancelado" | "falha";
  qtdFotos: number;
  erro?: string | null;
}): Promise<string | null> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) return null;

  const { data, error } = await db
    .from("agua_whatsapp_envios")
    .insert({
      escopo_tipo: params.escopoTipo,
      escopo_id: params.escopoId ?? null,
      modo: params.modo,
      destinatario_mascarado: params.numero ? mascararTelefone(params.numero) : null,
      destinatario_hash: params.numero ? await hashTelefone(params.numero) : null,
      mensagem_versao: MENSAGEM_VERSAO,
      status: params.status,
      qtd_fotos: params.qtdFotos,
      ultimo_erro: params.erro ?? null,
      iniciado_por: uid,
    })
    .select("id")
    .single();
  if (error) return null;
  return (data as { id: string }).id;
}

export async function confirmarDisparo(id: string): Promise<void> {
  await db
    .from("agua_whatsapp_envios")
    .update({ status: "confirmado_pelo_usuario" })
    .eq("id", id);
}

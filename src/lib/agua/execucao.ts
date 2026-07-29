// Execução em campo da Rota do Dia (item 8).
// Regras de negócio, eventos imutáveis, retificação e balanço de bags.

import { supabase } from "@/integrations/supabase/client";
import { limparTexto } from "@/lib/agua/normalize";
import type { Visita, VisitaStatus } from "@/lib/agua/api";
import { VISITA_FIELDS } from "@/lib/agua/api";
import type { Rota } from "@/lib/agua/programacao";

const db = supabase as unknown as { from: (t: string) => any };

async function uid(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/* ------------------------------------------------------------------ */
/* Status                                                              */
/* ------------------------------------------------------------------ */

/** Status que representam "não entregue" e exigem motivo. */
export const STATUS_NAO_REALIZADO: VisitaStatus[] = [
  "nao_realizada",
  "sem_necessidade",
  "acesso_bloqueado",
  "local_fechado",
  "falta_bags",
  "endereco_divergente",
  "reprogramada",
  "cancelada",
];

export const STATUS_FINALIZADO: VisitaStatus[] = ["concluida", "parcial", ...STATUS_NAO_REALIZADO];

export const MOTIVOS_PARCIAL = [
  "Falta de bags no veículo",
  "Espaço sem capacidade de armazenagem",
  "Recebedor solicitou quantidade menor",
  "Ponto parcialmente inacessível",
  "Outro",
];

export const CONDICOES_PONTO = [
  "Normal",
  "Bebedouro sujo",
  "Bebedouro com vazamento",
  "Bebedouro desligado",
  "Filtro vencido",
  "Espaço em obra",
  "Outro",
];

/* ------------------------------------------------------------------ */
/* Validação (8.4)                                                     */
/* ------------------------------------------------------------------ */

export interface EntregaInput {
  status: VisitaStatus;
  bags_entregues: number;
  bags_recolhidas: number;
  estoque_antes: number | null;
  estoque_depois: number | null;
  condicao: string | null;
  recebido_por: string | null;
  observacao: string | null;
  motivo: string | null;
  fotos: string[];
  assinatura_url: string | null;
  local_confirmado: boolean;
  latitude: number | null;
  longitude: number | null;
}

/** Aplica as regras do item 8.4 e devolve a lista de impedimentos. */
export function validarEntrega(
  input: EntregaInput,
  ctx: { saldoDisponivel: number | null; ajusteAutorizado?: boolean },
): string[] {
  const erros: string[] = [];
  const negativos = [input.bags_entregues, input.bags_recolhidas, input.estoque_antes, input.estoque_depois];
  if (negativos.some((n) => typeof n === "number" && n < 0)) {
    erros.push("Quantidades não podem ser negativas.");
  }
  if (!input.local_confirmado) {
    erros.push("Confirme que prédio, andar e espaço estão corretos.");
  }
  if (input.status === "concluida") {
    if (input.fotos.length === 0) erros.push("A conclusão exige ao menos uma foto do ponto abastecido.");
    if (input.bags_entregues <= 0) erros.push("Informe a quantidade entregue.");
  }
  if (input.status === "parcial") {
    if (input.fotos.length === 0) erros.push("A entrega parcial exige ao menos uma foto.");
    if (!limparTexto(input.motivo ?? "")) erros.push("A entrega parcial exige motivo.");
  }
  if (STATUS_NAO_REALIZADO.includes(input.status) && !limparTexto(input.motivo ?? "")) {
    erros.push("Registrar como não realizada exige motivo.");
  }
  if (
    ctx.saldoDisponivel != null &&
    input.bags_entregues > ctx.saldoDisponivel &&
    !ctx.ajusteAutorizado
  ) {
    erros.push(
      `Quantidade maior que o saldo carregado (${ctx.saldoDisponivel} bag(s)). Autorize um ajuste para prosseguir.`,
    );
  }
  return erros;
}

/* ------------------------------------------------------------------ */
/* Eventos e registros                                                 */
/* ------------------------------------------------------------------ */

async function registrarEvento(visitaId: string, tipo: string, dados: unknown) {
  const { error } = await db.from("agua_visita_eventos").insert({
    visita_id: visitaId,
    tipo,
    dados: dados ?? {},
    usuario_id: await uid(),
  });
  if (error) throw error;
}

/** Marca deslocamento/atendimento sem finalizar a parada. */
export async function marcarAndamento(
  visitaId: string,
  status: Extract<VisitaStatus, "em_deslocamento" | "em_atendimento">,
): Promise<void> {
  const campo = status === "em_deslocamento" ? "deslocamento_em" : "atendimento_em";
  const { error } = await db
    .from("agua_visitas")
    .update({ status, [campo]: new Date().toISOString() })
    .eq("id", visitaId);
  if (error) throw error;
  await registrarEvento(visitaId, `status:${status}`, { status });
}

/** Grava a entrega da parada e o evento imutável correspondente. */
export async function registrarEntrega(visitaId: string, input: EntregaInput): Promise<void> {
  const usuario = await uid();
  const patch = {
    status: input.status,
    bags_entregues: input.bags_entregues,
    bags_recolhidas: input.bags_recolhidas,
    estoque_antes: input.estoque_antes,
    estoque_depois: input.estoque_depois,
    condicao: limparTexto(input.condicao ?? "") || null,
    recebido_por: limparTexto(input.recebido_por ?? "") || null,
    observacao: limparTexto(input.observacao ?? "") || null,
    motivo: limparTexto(input.motivo ?? "") || null,
    fotos: input.fotos,
    foto_url: input.fotos[0] ?? null,
    assinatura_url: input.assinatura_url,
    local_confirmado: input.local_confirmado,
    latitude: input.latitude,
    longitude: input.longitude,
    executado_por: usuario,
    executado_em: new Date().toISOString(),
  };
  const { error } = await db.from("agua_visitas").update(patch).eq("id", visitaId);
  if (error) throw error;
  await registrarEvento(visitaId, `status:${input.status}`, patch);
}

/* ------------------------------------------------------------------ */
/* Retificação (8.4)                                                   */
/* ------------------------------------------------------------------ */

export interface Retificacao {
  id: string;
  visita_id: string;
  campo: string;
  valor_anterior: unknown;
  valor_novo: unknown;
  motivo: string;
  criado_em: string;
}

export async function listRetificacoes(visitaId: string): Promise<Retificacao[]> {
  const { data, error } = await db
    .from("agua_retificacoes")
    .select("id, visita_id, campo, valor_anterior, valor_novo, motivo, criado_em")
    .eq("visita_id", visitaId)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Retificacao[];
}

/**
 * Corrige um registro já finalizado preservando o valor anterior.
 * Não existe edição direta: toda correção passa por aqui.
 */
export async function retificarVisita(args: {
  visita: Visita;
  campos: Record<string, unknown>;
  motivo: string;
}): Promise<void> {
  const motivo = limparTexto(args.motivo);
  if (!motivo) throw new Error("Informe o motivo da retificação.");
  const usuario = await uid();
  const registro = Object.entries(args.campos).filter(
    ([campo, novo]) => (args.visita as unknown as Record<string, unknown>)[campo] !== novo,
  );
  if (!registro.length) return;

  const { error: retErr } = await db.from("agua_retificacoes").insert(
    registro.map(([campo, novo]) => ({
      visita_id: args.visita.id,
      campo,
      valor_anterior: (args.visita as unknown as Record<string, unknown>)[campo] ?? null,
      valor_novo: novo ?? null,
      motivo,
      usuario_id: usuario,
    })),
  );
  if (retErr) throw retErr;

  const patch = Object.fromEntries(registro);
  const { error } = await db.from("agua_visitas").update(patch).eq("id", args.visita.id);
  if (error) throw error;
  await registrarEvento(args.visita.id, "retificacao", { patch, motivo });
}

/* ------------------------------------------------------------------ */
/* Rota: início e finalização (8.1 / 8.5)                              */
/* ------------------------------------------------------------------ */

export interface RotaExecucao extends Rota {
  hodometro_inicial: number | null;
  hodometro_final: number | null;
  foto_carga_url: string | null;
  foto_carga_final_url: string | null;
  checklist_confirmado: boolean;
  saida_real: string | null;
  observacao_inicial: string | null;
  observacao_final: string | null;
  bags_restantes: number | null;
  bags_recolhidas: number | null;
  bags_danificadas: number | null;
  bags_ajustes: number | null;
  divergencia_bags: number | null;
  divergencia_justificativa: string | null;
  confirmado_principal: boolean;
  confirmado_secundario: boolean;
}

export const ROTA_EXEC_FIELDS =
  "id, data, turno, equipe, template_key, colaborador_principal, colaborador_secundario, veiculo, supervisor, horario_previsto, bags_carregadas, observacao, status, motivo_cancelamento, versao, iniciada_em, finalizada_em, hodometro_inicial, hodometro_final, foto_carga_url, foto_carga_final_url, checklist_confirmado, saida_real, observacao_inicial, observacao_final, bags_restantes, bags_recolhidas, bags_danificadas, bags_ajustes, divergencia_bags, divergencia_justificativa, confirmado_principal, confirmado_secundario";

/** Rota da data (a primeira do dia) — a geração automática cria uma por turno/equipe. */
export async function rotaDoDia(dataISO: string): Promise<RotaExecucao | null> {
  const { data, error } = await db
    .from("agua_rotas")
    .select(ROTA_EXEC_FIELDS)
    .eq("data", dataISO)
    .order("turno")
    .limit(1);
  if (error) throw error;
  return ((data ?? [])[0] ?? null) as RotaExecucao | null;
}

export interface InicioRotaInput {
  veiculo: string | null;
  hodometro_inicial: number | null;
  colaborador_principal: string | null;
  colaborador_secundario: string | null;
  bags_carregadas: number | null;
  foto_carga_url: string | null;
  checklist_confirmado: boolean;
  observacao_inicial: string | null;
}

export async function iniciarRota(rotaId: string, input: InicioRotaInput): Promise<void> {
  if ((input.hodometro_inicial ?? 0) < 0 || (input.bags_carregadas ?? 0) < 0) {
    throw new Error("Quantidades não podem ser negativas.");
  }
  if (!input.checklist_confirmado) throw new Error("Confirme o checklist veicular antes de sair.");
  const agora = new Date().toISOString();
  const { error } = await db
    .from("agua_rotas")
    .update({
      ...input,
      colaborador_principal: limparTexto(input.colaborador_principal ?? "") || null,
      colaborador_secundario: limparTexto(input.colaborador_secundario ?? "") || null,
      observacao_inicial: limparTexto(input.observacao_inicial ?? "") || null,
      status: "em_andamento",
      iniciada_em: agora,
      saida_real: agora,
      atualizado_por: await uid(),
    })
    .eq("id", rotaId);
  if (error) throw error;
}

export interface FimRotaInput {
  hodometro_final: number | null;
  bags_restantes: number;
  bags_recolhidas: number;
  bags_danificadas: number;
  bags_ajustes: number;
  observacao_final: string | null;
  foto_carga_final_url: string | null;
  confirmado_principal: boolean;
  confirmado_secundario: boolean;
  divergencia_justificativa: string | null;
}

/** bags carregadas + ajustes = entregues + restantes + danificadas + outras saídas */
export function calcularBalanco(args: {
  carregadas: number;
  ajustes: number;
  entregues: number;
  restantes: number;
  danificadas: number;
}): { esperado: number; contabilizado: number; divergencia: number } {
  const esperado = args.carregadas + args.ajustes;
  const contabilizado = args.entregues + args.restantes + args.danificadas;
  return { esperado, contabilizado, divergencia: contabilizado - esperado };
}

export async function finalizarRota(
  rota: RotaExecucao,
  input: FimRotaInput,
  totalEntregue: number,
): Promise<{ divergencia: number }> {
  const valores = [input.bags_restantes, input.bags_recolhidas, input.bags_danificadas];
  if (valores.some((n) => n < 0)) throw new Error("Quantidades não podem ser negativas.");
  if (
    rota.hodometro_inicial != null &&
    input.hodometro_final != null &&
    input.hodometro_final < rota.hodometro_inicial
  ) {
    throw new Error("O hodômetro final não pode ser menor que o inicial.");
  }
  if (!input.confirmado_principal) throw new Error("O colaborador principal precisa confirmar.");
  if (rota.colaborador_secundario && !input.confirmado_secundario) {
    throw new Error("O segundo colaborador precisa confirmar.");
  }

  const { divergencia } = calcularBalanco({
    carregadas: rota.bags_carregadas ?? 0,
    ajustes: input.bags_ajustes ?? 0,
    entregues: totalEntregue,
    restantes: input.bags_restantes,
    danificadas: input.bags_danificadas,
  });

  const justificativa = limparTexto(input.divergencia_justificativa ?? "");
  if (divergencia !== 0 && !justificativa) {
    throw new Error("Há divergência no balanço de bags — informe a justificativa.");
  }

  const usuario = await uid();
  const { error } = await db
    .from("agua_rotas")
    .update({
      ...input,
      observacao_final: limparTexto(input.observacao_final ?? "") || null,
      divergencia_bags: divergencia,
      divergencia_justificativa: justificativa || null,
      status: "concluida",
      finalizada_em: new Date().toISOString(),
      atualizado_por: usuario,
    })
    .eq("id", rota.id);
  if (error) throw error;

  if (divergencia !== 0) {
    const { error: ocErr } = await db.from("agua_rota_ocorrencias").insert({
      rota_id: rota.id,
      tipo: "divergencia_bags",
      descricao: justificativa,
      divergencia,
      usuario_id: usuario,
    });
    if (ocErr) throw ocErr;
    await notificarGestor(rota, divergencia, justificativa);
  }

  return { divergencia };
}

async function notificarGestor(rota: RotaExecucao, divergencia: number, justificativa: string) {
  try {
    await db.from("notifications").insert({
      title: "Divergência de bags na rota de água",
      body: `Rota de ${rota.data} (${rota.turno}) fechou com divergência de ${divergencia} bag(s). Justificativa: ${justificativa}`,
      category: "atencao",
      severity: "warning",
      module_key: "abastecimento-agua",
      target_mode: "modules",
      deep_link: "/abastecimento/agua/rotas",
    });
  } catch {
    /* a ocorrência já foi registrada; a notificação é best-effort */
  }
}

export interface RotaOcorrencia {
  id: string;
  rota_id: string;
  tipo: string;
  descricao: string | null;
  divergencia: number | null;
  situacao: string;
  tratativa: string | null;
  criado_em: string;
}

export async function listOcorrencias(inicio: string, fim: string): Promise<RotaOcorrencia[]> {
  const { data, error } = await db
    .from("agua_rota_ocorrencias")
    .select("id, rota_id, tipo, descricao, divergencia, situacao, tratativa, criado_em, agua_rotas!inner(data)")
    .gte("agua_rotas.data", inicio)
    .lte("agua_rotas.data", fim)
    .order("criado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as RotaOcorrencia[];
}

/** Ordena as paradas agrupando por prédio, mas mantendo a individualidade de cada espaço. */
export function agruparPorPredio<T extends { predio: string }>(itens: T[]): Map<string, T[]> {
  const mapa = new Map<string, T[]>();
  for (const item of itens) {
    const chave = item.predio || "Sem prédio";
    const lista = mapa.get(chave) ?? [];
    lista.push(item);
    mapa.set(chave, lista);
  }
  return mapa;
}

export { VISITA_FIELDS };

/**
 * Item 18 — Relatórios e indicadores do módulo Abastecimento de Água.
 *
 * Funções puras: recebem as listas já carregadas (visitas, rotas, pontos,
 * ocorrências, solicitações e ativos de filtro) e devolvem os indicadores.
 * Sem acesso a rede — assim tudo é testável e reaproveitável nas exportações.
 */

import type { FiltroSolicitacao, Ponto, Visita, VisitaStatus } from "@/features/water-delivery/queries/api";
import type { FiltroAtivo } from "@/features/water-delivery/filters/filtros";
import type { RotaOcorrencia } from "@/features/water-delivery/mutations/execucao";
import type { Rota } from "@/features/water-delivery/queries/programacao";

/* ------------------------------------------------------------------ */
/* Utilidades                                                          */
/* ------------------------------------------------------------------ */

const FINALIZADAS_OK: VisitaStatus[] = ["concluida", "parcial"];

export const pct = (parte: number, total: number) =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;

export const media = (valores: number[]) =>
  valores.length ? Math.round((valores.reduce((a, b) => a + b, 0) / valores.length) * 100) / 100 : 0;

/** Diferença em minutos entre dois instantes ISO (null quando faltar dado). */
export function minutosEntre(inicio?: string | null, fim?: string | null): number | null {
  if (!inicio || !fim) return null;
  const a = new Date(inicio).getTime();
  const b = new Date(fim).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

export const horasEntre = (inicio?: string | null, fim?: string | null) => {
  const min = minutosEntre(inicio, fim);
  return min === null ? null : Math.round((min / 60) * 10) / 10;
};

const DIAS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const nomeColaborador = (v: Visita) => (v.responsavel ?? "").trim() || "Não informado";

/* ------------------------------------------------------------------ */
/* 18.1 — Entrega de água                                              */
/* ------------------------------------------------------------------ */

export interface LinhaGrupo {
  chave: string;
  total: number;
  concluidas: number;
  naoRealizadas: number;
  bags: number;
  taxa: number;
}

export interface LinhaColaborador extends LinhaGrupo {
  tempoMedioParadaMin: number;
  produtividadeBagsHora: number;
}

export interface LinhaRota {
  id: string;
  data: string;
  turno: string;
  equipe: string;
  veiculo: string;
  paradas: number;
  concluidas: number;
  duracaoMin: number | null;
  tempoMedioParadaMin: number;
  km: number | null;
  bagsCarregadas: number;
  bagsEntregues: number;
  divergencia: number;
}

export interface EntregaIndicadores {
  totalParadas: number;
  concluidas: number;
  parciais: number;
  naoRealizadas: number;
  taxaConclusao: number;
  bagsPrevistas: number;
  bagsEntregues: number;
  bagsRecolhidas: number;
  mediaPorPonto: number;
  evidenciasFaltantes: number;
  divergenciasBags: number;
  tempoMedioParadaMin: number;
  duracaoMediaRotaMin: number;
  kmTotal: number;
  aderenciaPrevistoRealizado: number;
  porDia: LinhaGrupo[];
  porPredio: LinhaGrupo[];
  porColaborador: LinhaColaborador[];
  porVeiculo: Array<{ veiculo: string; rotas: number; km: number; paradas: number; bags: number }>;
  rotas: LinhaRota[];
  motivos: Array<{ motivo: string; qtd: number }>;
  reincidenciaAcesso: Array<{ pontoId: string; ponto: string; qtd: number }>;
  consumoPorLocal: Array<{ predio: string; pontos: number; bags: number; mediaPorPonto: number }>;
  evidenciasPendentes: Array<{ visitaId: string; data: string; ponto: string; status: VisitaStatus }>;
}

export function calcularEntrega(params: {
  visitas: Visita[];
  rotas?: Rota[];
  pontos?: Ponto[];
}): EntregaIndicadores {
  const { visitas } = params;
  const rotas = params.rotas ?? [];
  const pontos = params.pontos ?? [];
  const porId = new Map(pontos.map((p) => [p.id, p]));
  const labelPonto = (id: string) => {
    const p = porId.get(id);
    return p ? `${p.predio}${p.andar ? ` · ${p.andar}` : ""}${p.espaco ? ` · ${p.espaco}` : ""}` : "Ponto removido";
  };
  const predioDe = (v: Visita) => porId.get(v.ponto_id)?.predio || "Sem prédio";

  const total = visitas.length;
  const concluidas = visitas.filter((v) => v.status === "concluida").length;
  const parciais = visitas.filter((v) => v.status === "parcial").length;
  const naoRealizadas = visitas.filter((v) =>
    ["nao_realizada", "acesso_bloqueado", "local_fechado", "falta_bags", "endereco_divergente"].includes(v.status),
  ).length;

  const bagsPrevistas = visitas.reduce((a, v) => a + (v.bags_previstas ?? 0), 0);
  const bagsEntregues = visitas.reduce((a, v) => a + (v.bags_entregues ?? 0), 0);
  const bagsRecolhidas = visitas.reduce((a, v) => a + (v.bags_recolhidas ?? 0), 0);

  const pontosAtendidos = new Set(
    visitas.filter((v) => FINALIZADAS_OK.includes(v.status)).map((v) => v.ponto_id),
  );

  const finalizadas = visitas.filter((v) => FINALIZADAS_OK.includes(v.status));
  const evidenciasPendentes = finalizadas
    .filter((v) => (v.fotos?.length ?? 0) === 0 && !v.foto_url)
    .map((v) => ({ visitaId: v.id, data: v.data, ponto: labelPonto(v.ponto_id), status: v.status }));

  const divergenciasBags = visitas.filter(
    (v) => FINALIZADAS_OK.includes(v.status) && (v.bags_entregues ?? 0) !== (v.bags_previstas ?? 0),
  ).length;

  const temposParada = visitas
    .map((v) => minutosEntre(v.atendimento_em ?? v.deslocamento_em, v.executado_em))
    .filter((n): n is number => n !== null);

  /* Agrupamentos ------------------------------------------------------ */
  const agrupar = (chaveDe: (v: Visita) => string): LinhaGrupo[] => {
    const mapa = new Map<string, LinhaGrupo>();
    for (const v of visitas) {
      const chave = chaveDe(v);
      const linha = mapa.get(chave) ?? { chave, total: 0, concluidas: 0, naoRealizadas: 0, bags: 0, taxa: 0 };
      linha.total += 1;
      if (FINALIZADAS_OK.includes(v.status)) linha.concluidas += 1;
      if (v.status === "nao_realizada") linha.naoRealizadas += 1;
      linha.bags += v.bags_entregues ?? 0;
      mapa.set(chave, linha);
    }
    return [...mapa.values()]
      .map((l) => ({ ...l, taxa: pct(l.concluidas, l.total) }))
      .sort((a, b) => b.total - a.total);
  };

  const porDia = agrupar((v) => DIAS[(v.dia_semana || 1) - 1] ?? String(v.dia_semana)).sort(
    (a, b) => DIAS.indexOf(a.chave) - DIAS.indexOf(b.chave),
  );
  const porPredio = agrupar(predioDe);

  const porColaborador: LinhaColaborador[] = agrupar(nomeColaborador).map((l) => {
    const doColaborador = visitas.filter((v) => nomeColaborador(v) === l.chave);
    const tempos = doColaborador
      .map((v) => minutosEntre(v.atendimento_em ?? v.deslocamento_em, v.executado_em))
      .filter((n): n is number => n !== null);
    const tempoMedio = media(tempos);
    return {
      ...l,
      tempoMedioParadaMin: tempoMedio,
      produtividadeBagsHora: tempoMedio > 0 ? Math.round((l.bags / (tempoMedio * l.total)) * 60 * 100) / 100 : 0,
    };
  });

  /* Motivos e reincidência ------------------------------------------- */
  const motivosMapa = new Map<string, number>();
  for (const v of visitas) {
    if (FINALIZADAS_OK.includes(v.status)) continue;
    const motivo = (v.motivo ?? "").trim();
    if (!motivo) continue;
    motivosMapa.set(motivo, (motivosMapa.get(motivo) ?? 0) + 1);
  }
  const motivos = [...motivosMapa.entries()]
    .map(([motivo, qtd]) => ({ motivo, qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  const acessoMapa = new Map<string, number>();
  for (const v of visitas) {
    if (v.status !== "acesso_bloqueado") continue;
    acessoMapa.set(v.ponto_id, (acessoMapa.get(v.ponto_id) ?? 0) + 1);
  }
  const reincidenciaAcesso = [...acessoMapa.entries()]
    .filter(([, qtd]) => qtd > 1)
    .map(([pontoId, qtd]) => ({ pontoId, ponto: labelPonto(pontoId), qtd }))
    .sort((a, b) => b.qtd - a.qtd);

  /* Rotas e veículos --------------------------------------------------- */
  const visitasDaRota = (id: string) => visitas.filter((v) => v.rota_id === id);
  const linhasRota: LinhaRota[] = rotas.map((r) => {
    const paradas = visitasDaRota(r.id);
    const tempos = paradas
      .map((v) => minutosEntre(v.atendimento_em ?? v.deslocamento_em, v.executado_em))
      .filter((n): n is number => n !== null);
    const km =
      r.hodometro_inicial != null && r.hodometro_final != null
        ? Math.max(0, Number(r.hodometro_final) - Number(r.hodometro_inicial))
        : null;
    return {
      id: r.id,
      data: r.data,
      turno: r.turno,
      equipe: r.equipe,
      veiculo: r.veiculo ?? "Sem veículo",
      paradas: paradas.length,
      concluidas: paradas.filter((v) => FINALIZADAS_OK.includes(v.status)).length,
      duracaoMin: minutosEntre(r.iniciada_em, r.finalizada_em),
      tempoMedioParadaMin: media(tempos),
      km,
      bagsCarregadas: r.bags_carregadas ?? 0,
      bagsEntregues: paradas.reduce((a, v) => a + (v.bags_entregues ?? 0), 0),
      divergencia: Number(r.divergencia_bags ?? 0),
    };
  });

  const veiculoMapa = new Map<string, { veiculo: string; rotas: number; km: number; paradas: number; bags: number }>();
  for (const l of linhasRota) {
    const atual = veiculoMapa.get(l.veiculo) ?? { veiculo: l.veiculo, rotas: 0, km: 0, paradas: 0, bags: 0 };
    atual.rotas += 1;
    atual.km += l.km ?? 0;
    atual.paradas += l.paradas;
    atual.bags += l.bagsEntregues;
    veiculoMapa.set(l.veiculo, atual);
  }

  const consumoPorLocal = porPredio.map((l) => {
    const pontosDoPredio = new Set(
      visitas.filter((v) => predioDe(v) === l.chave).map((v) => v.ponto_id),
    );
    return {
      predio: l.chave,
      pontos: pontosDoPredio.size,
      bags: l.bags,
      mediaPorPonto: pontosDoPredio.size ? Math.round((l.bags / pontosDoPredio.size) * 100) / 100 : 0,
    };
  });

  const duracoes = linhasRota.map((l) => l.duracaoMin).filter((n): n is number => n !== null);

  return {
    totalParadas: total,
    concluidas,
    parciais,
    naoRealizadas,
    taxaConclusao: pct(concluidas + parciais, total),
    bagsPrevistas,
    bagsEntregues,
    bagsRecolhidas,
    mediaPorPonto: pontosAtendidos.size ? Math.round((bagsEntregues / pontosAtendidos.size) * 100) / 100 : 0,
    evidenciasFaltantes: evidenciasPendentes.length,
    divergenciasBags,
    tempoMedioParadaMin: media(temposParada),
    duracaoMediaRotaMin: media(duracoes),
    kmTotal: Math.round(linhasRota.reduce((a, l) => a + (l.km ?? 0), 0) * 10) / 10,
    aderenciaPrevistoRealizado: pct(bagsEntregues, bagsPrevistas),
    porDia,
    porPredio,
    porColaborador,
    porVeiculo: [...veiculoMapa.values()].sort((a, b) => b.km - a.km),
    rotas: linhasRota.sort((a, b) => b.data.localeCompare(a.data)),
    motivos,
    reincidenciaAcesso,
    consumoPorLocal,
    evidenciasPendentes,
  };
}

/* ------------------------------------------------------------------ */
/* 18.2 — Filtros                                                      */
/* ------------------------------------------------------------------ */

const ABERTAS = [
  "solicitada",
  "aberta",
  "em_triagem",
  "aprovada",
  "aguardando_material",
  "programada",
  "em_deslocamento",
  "em_execucao",
  "em_atendimento",
  "reaberta",
];

export interface FiltroIndicadores {
  total: number;
  abertas: number;
  vencidas: number;
  concluidas: number;
  porPrioridade: Array<{ prioridade: string; qtd: number }>;
  tempoTriagemMedioH: number;
  tempoConclusaoMedioH: number;
  slaCumprimentoPct: number;
  reincidencia: number;
  preventivas: number;
  corretivas: number;
  vencendo: Array<{ id: string; ponto: string; proximaTroca: string; diasRestantes: number }>;
  custoTotal: number | null;
  porPredio: Array<{ predio: string; qtd: number; concluidas: number }>;
  avaliacaoMedia: number | null;
  avaliacoes: number;
}

export function calcularFiltros(params: {
  solicitacoes: FiltroSolicitacao[];
  ativos?: FiltroAtivo[];
  hoje?: string;
}): FiltroIndicadores {
  const { solicitacoes } = params;
  const ativos = params.ativos ?? [];
  const hoje = params.hoje ? new Date(params.hoje) : new Date();

  const abertas = solicitacoes.filter((s) => ABERTAS.includes(s.situacao));
  const concluidas = solicitacoes.filter((s) => s.situacao === "concluida" || s.situacao === "validada");
  const vencidas = abertas.filter((s) => s.vence_em && new Date(s.vence_em) < hoje);

  const prioridadeMapa = new Map<string, number>();
  for (const s of solicitacoes) {
    prioridadeMapa.set(s.prioridade, (prioridadeMapa.get(s.prioridade) ?? 0) + 1);
  }

  const temposTriagem = solicitacoes
    .map((s) => horasEntre(s.criado_em, s.programada_em))
    .filter((n): n is number => n !== null);
  const temposConclusao = concluidas
    .map((s) => horasEntre(s.criado_em, s.concluida_em))
    .filter((n): n is number => n !== null);

  const dentroDoSla = concluidas.filter(
    (s) => !s.vence_em || !s.concluida_em || new Date(s.concluida_em) <= new Date(s.vence_em),
  ).length;

  const predioMapa = new Map<string, { predio: string; qtd: number; concluidas: number }>();
  for (const s of solicitacoes) {
    const chave = (s.predio ?? "").trim() || "Sem prédio";
    const linha = predioMapa.get(chave) ?? { predio: chave, qtd: 0, concluidas: 0 };
    linha.qtd += 1;
    if (s.situacao === "concluida" || s.situacao === "validada") linha.concluidas += 1;
    predioMapa.set(chave, linha);
  }

  const notas = solicitacoes
    .map((s) => s.avaliacao_nota)
    .filter((n): n is number => typeof n === "number");

  const vencendo = ativos
    .filter((a) => a.situacao === "ativo" && a.proxima_troca)
    .map((a) => ({
      id: a.id,
      ponto: [a.predio, a.andar_setor, a.espaco].filter(Boolean).join(" · ") || a.codigo || "Filtro",
      proximaTroca: a.proxima_troca as string,
      diasRestantes: Math.ceil((new Date(a.proxima_troca as string).getTime() - hoje.getTime()) / 86_400_000),
    }))
    .filter((a) => a.diasRestantes <= 30)
    .sort((a, b) => a.diasRestantes - b.diasRestantes);

  const custos = solicitacoes
    .map((s) => (s.material_quantidade != null ? Number(s.material_quantidade) : null))
    .filter((n): n is number => n !== null);

  return {
    total: solicitacoes.length,
    abertas: abertas.length,
    vencidas: vencidas.length,
    concluidas: concluidas.length,
    porPrioridade: [...prioridadeMapa.entries()]
      .map(([prioridade, qtd]) => ({ prioridade, qtd }))
      .sort((a, b) => b.qtd - a.qtd),
    tempoTriagemMedioH: media(temposTriagem),
    tempoConclusaoMedioH: media(temposConclusao),
    slaCumprimentoPct: pct(dentroDoSla, concluidas.length),
    reincidencia: solicitacoes.filter((s) => (s.reaberturas ?? 0) > 0).length,
    preventivas: solicitacoes.filter((s) => s.origem === "preventiva").length,
    corretivas: solicitacoes.filter((s) => s.origem !== "preventiva").length,
    vencendo,
    custoTotal: custos.length ? Math.round(custos.reduce((a, b) => a + b, 0) * 100) / 100 : null,
    porPredio: [...predioMapa.values()].sort((a, b) => b.qtd - a.qtd),
    avaliacaoMedia: notas.length ? media(notas) : null,
    avaliacoes: notas.length,
  };
}

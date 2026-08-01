// Dashboard de Chamados v2 — todos os agregados vêm prontos do servidor
// (RPC backorder_dashboard_v2), com os 11 status da coluna G.

import { supabase } from "@/integrations/supabase/client";
import type { StatusCat } from "@/lib/backorder/status";

export interface V2Kpis {
  total: number;
  abertos: number;
  backorder: number;
  concluidos: number;
  cancelados: number;
  aguardandoAprovacao: number;
  vencidos: number;
  vencendo48h: number;
  criticos: number;
  tempoMedioDias: number;
  primeiroAno: number | null;
  ultimoAno: number | null;
}

export interface V2Row {
  os: string;
  nome: string | null;
  equipe: string | null;
  atividade: string | null;
  predio: string | null;
  andar: string | null;
  espaco: string | null;
  criticidade: string | null;
  solicitante: string | null;
  statusCat: StatusCat;
  statusOrigem: string | null;
  dataSolicitacao: string | null;
  terminoSla: string | null;
  dataConclusao: string | null;
}

export interface V2Cancelado {
  os: string;
  nome: string | null;
  equipe: string | null;
  predio: string | null;
  solicitante: string | null;
  statusOrigem: string | null;
  statusCat: StatusCat;
  dataSolicitacao: string | null;
  dataConclusao: string | null;
}

export interface V2Avaliacao {
  nome: string;
  total: number;
  concluidos: number;
  aguardando: number;
  oss: string[];
}

export interface V2Serie {
  ano?: string;
  mes?: string;
  total: number;
  concluidos: number;
  cancelados: number;
  aguardando: number;
  abertos: number;
}

export interface V2Stats {
  kpis: V2Kpis;
  porStatus: Partial<Record<StatusCat, number>>;
  porAno: V2Serie[];
  porMes: V2Serie[];
  porEquipe: Array<{
    name: string;
    total: number;
    concluidos: number;
    cancelados: number;
    abertos: number;
  }>;
  porCategoria: Array<{ name: string; value: number }>;
  porCriticidade: Array<{ name: string; value: number }>;
  porPredio: Array<{ name: string; value: number }>;
  avaliacaoPendente: V2Avaliacao[];
  cancelados: V2Cancelado[];
  rows: V2Row[];
}

export const EMPTY_V2: V2Stats = {
  kpis: {
    total: 0,
    abertos: 0,
    backorder: 0,
    concluidos: 0,
    cancelados: 0,
    aguardandoAprovacao: 0,
    vencidos: 0,
    vencendo48h: 0,
    criticos: 0,
    tempoMedioDias: 0,
    primeiroAno: null,
    ultimoAno: null,
  },
  porStatus: {},
  porAno: [],
  porMes: [],
  porEquipe: [],
  porCategoria: [],
  porCriticidade: [],
  porPredio: [],
  avaliacaoPendente: [],
  cancelados: [],
  rows: [],
};

export interface V2Query {
  ano?: number | null;
  equipe?: string | null;
  statusCat?: StatusCat | null;
  predio?: string | null;
  solicitante?: string | null;
  criticidade?: string | null;
  rowLimit?: number;
}

export async function fetchDashboardV2(q: V2Query = {}): Promise<V2Stats> {
  const { data, error } = await supabase.rpc("backorder_dashboard_v2", {
    p_ano: q.ano ?? null,
    p_equipe: q.equipe ?? null,
    p_status_cat: q.statusCat ?? null,
    p_predio: q.predio ?? null,
    p_solicitante: q.solicitante ?? null,
    p_criticidade: q.criticidade ?? null,
    p_row_limit: q.rowLimit ?? 300,
  } as never);
  if (error) throw error;
  const d = (data ?? {}) as Partial<V2Stats>;
  return { ...EMPTY_V2, ...d, kpis: { ...EMPTY_V2.kpis, ...(d.kpis ?? {}) } };
}

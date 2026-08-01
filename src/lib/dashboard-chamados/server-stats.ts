// Estatísticas do Backorder calculadas no servidor (RPC), não no navegador.
// Com 200 mil+ OS, baixar tudo para o cliente é inviável — aqui só trafegam
// agregados prontos + as últimas OS para a tabela.

import { supabase } from "@/integrations/supabase/client";
import type { Insight } from "./insights";

export type OsStatus = "aberto" | "concluido" | "cancelado";

export interface ServerRow {
  os: string;
  nome: string | null;
  equipe: string | null;
  atividade: string | null;
  predio: string | null;
  andar: string | null;
  espaco: string | null;
  criticidade: string | null;
  solicitante: string | null;
  status: OsStatus;
  statusOrigem: string | null;
  dataSolicitacao: string | null;
  terminoSla: string | null;
  dataConclusao: string | null;
}

export interface DashKpis {
  total: number;
  concluidos: number;
  cancelados: number;
  abertos: number;
  vencidos: number;
  vencendo48h: number;
  criticos: number;
  tempoMedioDias: number;
  primeiroAno: number | null;
  ultimoAno: number | null;
}

export interface AnoBucket {
  ano: string;
  total: number;
  concluidos: number;
  cancelados: number;
  abertos: number;
}

export interface DashStats {
  kpis: DashKpis;
  porAno: AnoBucket[];
  porMes: Array<{ mes: string; total: number; concluidos: number; cancelados: number }>;
  porEquipe: Array<{
    name: string;
    total: number;
    concluidos: number;
    cancelados: number;
    abertos: number;
  }>;
  porCategoria: Array<{ name: string; value: number }>;
  porCriticidade: Array<{ name: string; value: number }>;
  porSolicitante: Array<{ name: string; total: number; abertos: number }>;
  porPredio: Array<{ name: string; value: number }>;
  rows: ServerRow[];
}

export interface DashFiltros {
  equipes: string[];
  categorias: string[];
  criticidades: string[];
  predios: string[];
  solicitantes: string[];
  anos: number[];
}

export interface StatsQuery {
  equipe?: string | null;
  categoria?: string | null;
  criticidade?: string | null;
  status?: OsStatus | null;
  solicitante?: string | null;
  predio?: string | null;
  ano?: number | null;
  dias?: number | null;
  rowLimit?: number;
}

export const EMPTY_STATS: DashStats = {
  kpis: {
    total: 0,
    concluidos: 0,
    cancelados: 0,
    abertos: 0,
    vencidos: 0,
    vencendo48h: 0,
    criticos: 0,
    tempoMedioDias: 0,
    primeiroAno: null,
    ultimoAno: null,
  },
  porAno: [],
  porMes: [],
  porEquipe: [],
  porCategoria: [],
  porCriticidade: [],
  porSolicitante: [],
  porPredio: [],
  rows: [],
};

export async function fetchDashboardStats(q: StatsQuery = {}): Promise<DashStats> {
  const { data, error } = await supabase.rpc("backorder_dashboard_stats", {
    p_equipe: q.equipe ?? null,
    p_categoria: q.categoria ?? null,
    p_criticidade: q.criticidade ?? null,
    p_status: q.status ?? null,
    p_solicitante: q.solicitante ?? null,
    p_predio: q.predio ?? null,
    p_ano: q.ano ?? null,
    p_dias: q.dias ?? null,
    p_row_limit: q.rowLimit ?? 300,
  } as never);
  if (error) throw error;
  return { ...EMPTY_STATS, ...((data ?? {}) as Partial<DashStats>) } as DashStats;
}

export async function fetchDashboardFiltros(): Promise<DashFiltros> {
  const { data, error } = await supabase.rpc("backorder_dashboard_filtros" as never);
  if (error) throw error;
  const d = (data ?? {}) as Partial<DashFiltros>;
  const sortStr = (a: string, b: string) => a.localeCompare(b, "pt-BR");
  return {
    equipes: (d.equipes ?? []).slice().sort(sortStr),
    categorias: (d.categorias ?? []).slice().sort(sortStr),
    criticidades: (d.criticidades ?? []).slice().sort(sortStr),
    predios: (d.predios ?? []).slice().sort(sortStr),
    solicitantes: (d.solicitantes ?? []).slice().sort(sortStr),
    anos: (d.anos ?? []).slice().sort((a, b) => b - a),
  };
}

/** Conclui / reabre uma OS diretamente na tabela backorder_os. */
export async function setOsFinalizado(os: string, next: boolean): Promise<void> {
  const nowIso = new Date().toISOString();
  const { error } = await supabase
    .from("backorder_os")
    .update(
      next
        ? { finalizado: true, cancelado: false, data_finalizacao: nowIso, data_conclusao: nowIso }
        : { finalizado: false, cancelado: false, data_finalizacao: null, data_conclusao: null },
    )
    .eq("os", os);
  if (error) throw error;
}

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

/** Insights derivados dos agregados do servidor. */
export function buildInsights(s: DashStats): Insight[] {
  const k = s.kpis;
  const out: Insight[] = [];
  if (k.total === 0) {
    out.push({
      tipo: "info",
      titulo: "Nenhuma OS na seleção",
      descricao: "Importe a planilha de Backorder ou ajuste os filtros.",
    });
    return out;
  }

  const taxa = pct(k.concluidos, k.total);
  out.push({
    tipo: "info",
    titulo: `${k.total.toLocaleString("pt-BR")} OS na seleção`,
    descricao: `${k.concluidos.toLocaleString("pt-BR")} concluídas (${taxa}%), ${k.cancelados.toLocaleString("pt-BR")} canceladas e ${k.abertos.toLocaleString("pt-BR")} em aberto.`,
    metrica: k.total,
  });

  if (k.vencidos > 0) {
    out.push({
      tipo: "critico",
      titulo: `${k.vencidos.toLocaleString("pt-BR")} OS com SLA vencido`,
      descricao: "A data-limite já passou e a OS continua aberta.",
      metrica: k.vencidos,
    });
  }
  if (k.vencendo48h > 0) {
    out.push({
      tipo: "atencao",
      titulo: `${k.vencendo48h} SLA vencendo em até 48h`,
      descricao: "Antecipe a alocação dessas ordens.",
      metrica: k.vencendo48h,
    });
  }
  if (k.tempoMedioDias > 0) {
    out.push({
      tipo: k.tempoMedioDias > 30 ? "atencao" : "sucesso",
      titulo: `Tempo médio de atendimento: ${k.tempoMedioDias} dias`,
      descricao: "Média entre abertura e conclusão das OS concluídas na seleção.",
      metrica: k.tempoMedioDias,
    });
  }

  const cancelShare = pct(k.cancelados, k.total);
  if (cancelShare >= 15) {
    out.push({
      tipo: "atencao",
      titulo: `${cancelShare}% das OS foram canceladas`,
      descricao: "Volume alto de cancelamentos — revise a qualidade da abertura dos chamados.",
      metrica: k.cancelados,
    });
  }

  const anos = s.porAno.filter((a) => a.total > 0);
  if (anos.length >= 2) {
    const ult = anos[anos.length - 1];
    const ant = anos[anos.length - 2];
    const delta = ant.total === 0 ? 0 : Math.round(((ult.total - ant.total) / ant.total) * 100);
    out.push({
      tipo: delta > 20 ? "atencao" : "info",
      titulo: `${ult.ano} vs ${ant.ano}: ${delta >= 0 ? "+" : ""}${delta}% em volume`,
      descricao: `${ult.total.toLocaleString("pt-BR")} OS em ${ult.ano} contra ${ant.total.toLocaleString("pt-BR")} em ${ant.ano}.`,
      metrica: `${delta}%`,
    });
  }

  const topEquipe = s.porEquipe[0];
  if (topEquipe && pct(topEquipe.total, k.total) >= 35) {
    out.push({
      tipo: "atencao",
      titulo: `Equipe "${topEquipe.name}" concentra ${pct(topEquipe.total, k.total)}% das OS`,
      descricao: `${topEquipe.total.toLocaleString("pt-BR")} OS (${topEquipe.abertos} em aberto).`,
      metrica: topEquipe.total,
    });
  }

  const topPredio = s.porPredio[0];
  if (topPredio && topPredio.name !== "—" && pct(topPredio.value, k.total) >= 20) {
    out.push({
      tipo: "info",
      titulo: `Prédio "${topPredio.name}" lidera as ocorrências`,
      descricao: `${topPredio.value.toLocaleString("pt-BR")} OS registradas no local.`,
      metrica: topPredio.value,
    });
  }

  return out;
}

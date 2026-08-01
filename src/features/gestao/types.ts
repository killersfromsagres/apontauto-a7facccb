/** Tipos do Centro de Gestão (consolidação somente leitura dos módulos). */

export type GestaoOverview = {
  periodo_dias: number;
  gerado_em: string;
  backorder: { total: number; por_status: Record<string, number> };
  backorder_envelhecido: number;
  backorder_mensal: Array<{ mes: string; total: number; concluidas: number; canceladas: number }>;
  backorder_equipes: Array<{ equipe: string; abertas: number }>;
  corretiva: { abertas: number; periodo: number };
  refrigeracao: { abertas: number; periodo: number };
  agua: { entregas_periodo: number; bags_periodo: number; bebedouros_nok: number };
  frota: {
    checklists_periodo: number;
    checklists_reprovados: number;
    custo_periodo: number;
    litros_periodo: number;
  };
  materiais: { pendentes: number; periodo: number };
  legal: { total: number; vencidos: number; proximos_30: number };
  sst: { aso_vencidos: number; aso_proximos_30: number };
  taludes: { pt_ativas: number; pt_suspensas: number };
  notas_abertas: number;
};

export type GestaoNota = {
  id: string;
  titulo: string;
  detalhe: string;
  modulo: string;
  prioridade: "alta" | "media" | "baixa" | string;
  situacao: "aberta" | "andamento" | "concluida" | string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const PRIORIDADES = ["alta", "media", "baixa"] as const;
export const SITUACOES = ["aberta", "andamento", "concluida"] as const;

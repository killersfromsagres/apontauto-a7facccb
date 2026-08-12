/** Tipos do Centro de Gestão (consolidação somente leitura dos módulos). */

export type Delta = { atual: number; anterior: number };

export type GestaoOverviewV2 = {
  periodo_dias: number;
  gerado_em: string;
  os: {
    abertas: number;
    concluidas: number;
    concluidas_ant: number;
    criadas: number;
    criadas_ant: number;
    vencidas: number;
    vence_24h: number;
    vence_48h: number;
    backlog: number;
    backlog_30: number;
    sem_responsavel: number;
    sla_ok: number;
    tma_horas: number;
    mttr_horas: number;
    criticas: number;
  };
  os_status: Record<string, number>;
  os_aging: Record<string, number>;
  os_equipes: Array<{
    equipe: string;
    abertas: number;
    concluidas: number;
    atrasadas: number;
    tma_horas: number;
  }>;
  os_predios: Array<{ predio: string; abertas: number }>;
  os_reincidentes: Array<{ ativo: string; ocorrencias: number }>;
  os_mensal: Array<{ mes: string; criadas: number; concluidas: number; canceladas: number }>;
  frota: {
    total: number;
    disponiveis: number;
    bloqueados: number;
    manutencao: number;
    checklists: number;
    checklists_ant: number;
    reprovados: number;
    custo: number;
    custo_ant: number;
    litros: number;
    ocorrencias: number;
  };
  agua: {
    entregas: number;
    entregas_ant: number;
    bags: number;
    bags_ant: number;
    pendentes: number;
    bebedouros_nok: number;
    sem_evidencia: number;
  };
  filtros: { vencidos: number; proximos_30: number };
  materiais: { pendentes: number; periodo: number; periodo_ant: number };
  pecas: { aguardando: number; problemas: number };
  legal: { total: number; vencidos: number; proximos_30: number };
  sst: { aso_vencidos: number; aso_proximos_30: number };
  taludes: { pt_ativas: number; pt_aguardando: number; pt_suspensas: number };
  notas_abertas: number;
  corretiva_novo?: {
    criadas: number;
    criadas_ant: number;
    concluidas: number;
    concluidas_ant: number;
  };
};

export type OsConsolidada = {
  origem: string;
  id: string;
  numero_os: string | null;
  descricao: string | null;
  ativo: string | null;
  patrimonio: string | null;
  predio: string | null;
  andar: string | null;
  local: string | null;
  equipe: string | null;
  tecnico: string | null;
  prioridade: string | null;
  criticidade: string | null;
  status_canonico: string;
  status_origem: string | null;
  criado_em: string | null;
  inicio: string | null;
  conclusao: string | null;
  prazo_sla: string | null;
  atrasada: boolean | null;
  dias_atraso: number | null;
  horas_atendimento: number | null;
  horas_reparo: number | null;
  pecas_pendentes: number | null;
  problemas: number | null;
  reincidencia: number | null;
};

export type GestaoNota = {
  id: string;
  titulo: string;
  detalhe: string;
  modulo: string;
  prioridade: string;
  situacao: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type GestaoFiltros = {
  dias: number;
  modulo: string | null;
  equipe: string | null;
  predio: string | null;
  status: string | null;
  criticidade: string | null;
};

export type DashboardPrefs = {
  layout_json: { ocultos?: string[]; ordem?: string[] };
  filters_json: Partial<GestaoFiltros>;
  favorites_json: string[];
};

export const PERIODOS: Array<{ label: string; dias: number }> = [
  { label: "Hoje", dias: 1 },
  { label: "7 dias", dias: 7 },
  { label: "30 dias", dias: 30 },
  { label: "Mês atual", dias: new Date().getDate() },
  { label: "Trimestre", dias: 90 },
];

export const STATUS_CANONICOS = [
  "aberta",
  "andamento",
  "pendente",
  "concluida",
  "cancelada",
] as const;

export const MODULOS = ["backorder", "corretiva", "refrigeracao"] as const;
export const CRITICIDADES = ["critica", "alta", "media", "baixa"] as const;
export const PRIORIDADES = ["alta", "media", "baixa"] as const;

export const WIDGETS: Array<{ key: string; label: string }> = [
  { key: "resumo", label: "Resumo executivo" },
  { key: "atencao", label: "Requer sua atenção" },
  { key: "os", label: "Ordens de serviço consolidadas" },
  { key: "equipes", label: "Desempenho das equipes" },
  { key: "frota", label: "Gestão de frota" },
  { key: "agua", label: "Abastecimento de água" },
  { key: "materiais", label: "Materiais e suprimentos" },
  { key: "conformidade", label: "Segurança e conformidade" },
  { key: "sistema", label: "Saúde do sistema" },
  { key: "insights", label: "Insights do Apont Auto" },
];

import type { GestaoOverviewV2 } from "../types";

export type Severidade = "critica" | "alta" | "media";

export type ItemAtencao = {
  key: string;
  titulo: string;
  detalhe: string;
  quantidade: number;
  severidade: Severidade;
  modulo: string;
  /** Destino de drill-down dentro do próprio Centro de Gestão. */
  filtro?: { status?: string; criticidade?: string; modulo?: string };
  rota?: string;
  acao: string;
};

const n = (v: number | undefined | null) => Number(v ?? 0);

/** Deriva a central "Requer sua atenção" apenas de métricas verificáveis. */
export function derivarAtencao(d: GestaoOverviewV2 | undefined): ItemAtencao[] {
  if (!d) return [];
  const itens: ItemAtencao[] = [
    {
      key: "os-vencidas",
      titulo: "OS vencidas",
      detalhe: "Ordens abertas com prazo de SLA ultrapassado.",
      quantidade: n(d.os.vencidas),
      severidade: "critica",
      modulo: "Ordens de serviço",
      filtro: { status: "aberta" },
      acao: "Priorizar e atribuir responsável",
    },
    {
      key: "os-sem-responsavel",
      titulo: "OS sem responsável",
      detalhe: "Ordens abertas sem equipe atribuída.",
      quantidade: n(d.os.sem_responsavel),
      severidade: "alta",
      modulo: "Ordens de serviço",
      acao: "Atribuir equipe",
    },
    {
      key: "os-24h",
      titulo: "Vencendo em 24 horas",
      detalhe: "Ordens abertas com prazo nas próximas 24 horas.",
      quantidade: n(d.os.vence_24h),
      severidade: "alta",
      modulo: "Ordens de serviço",
      acao: "Confirmar programação do dia",
    },
    {
      key: "backlog-30",
      titulo: "Backlog acima de 30 dias",
      detalhe: "Ordens abertas há mais de 30 dias.",
      quantidade: n(d.os.backlog_30),
      severidade: "alta",
      modulo: "Ordens de serviço",
      acao: "Revisar plano de ataque ao backlog",
    },
    {
      key: "pecas",
      titulo: "Peças aguardando aprovação",
      detalhe: "Pedidos de peça de corretiva e refrigeração pendentes de decisão.",
      quantidade: n(d.pecas.aguardando),
      severidade: "alta",
      modulo: "Materiais",
      rota: "/refrigeracao",
      acao: "Aprovar ou recusar com motivo",
    },
    {
      key: "problemas",
      titulo: "Problemas aguardando decisão",
      detalhe: "Problemas reportados em campo sem tratativa do gestor.",
      quantidade: n(d.pecas.problemas),
      severidade: "media",
      modulo: "Campo",
      rota: "/refrigeracao",
      acao: "Analisar e encaminhar",
    },
    {
      key: "veiculos-bloqueados",
      titulo: "Veículos bloqueados",
      detalhe: "Veículos indisponíveis para operação.",
      quantidade: n(d.frota.bloqueados),
      severidade: "critica",
      modulo: "Frota",
      rota: "/frota",
      acao: "Liberar ou programar manutenção",
    },
    {
      key: "checklist-reprovado",
      titulo: "Checklists reprovados",
      detalhe: "Checklists veiculares com itens reprovados no período.",
      quantidade: n(d.frota.reprovados),
      severidade: "alta",
      modulo: "Frota",
      rota: "/frota",
      acao: "Abrir ocorrência de manutenção",
    },
    {
      key: "ocorrencias-frota",
      titulo: "Ocorrências de frota abertas",
      detalhe: "Ocorrências registradas ainda sem resolução.",
      quantidade: n(d.frota.ocorrencias),
      severidade: "media",
      modulo: "Frota",
      rota: "/frota",
      acao: "Definir responsável e prazo",
    },
    {
      key: "agua-sem-foto",
      titulo: "Entregas de água sem evidência",
      detalhe: "Entregas registradas no período sem foto anexada.",
      quantidade: n(d.agua.sem_evidencia),
      severidade: "alta",
      modulo: "Água",
      rota: "/entrega-agua",
      acao: "Solicitar evidência ao operador",
    },
    {
      key: "agua-pendentes",
      titulo: "Entregas pendentes",
      detalhe: "Pontos programados ainda não concluídos.",
      quantidade: n(d.agua.pendentes),
      severidade: "media",
      modulo: "Água",
      rota: "/entrega-agua",
      acao: "Reatribuir rota",
    },
    {
      key: "bebedouros",
      titulo: "Bebedouros com falha",
      detalhe: "Apontamentos de bebedouro fora de operação.",
      quantidade: n(d.agua.bebedouros_nok),
      severidade: "alta",
      modulo: "Água",
      rota: "/entrega-agua",
      acao: "Abrir OS de manutenção",
    },
    {
      key: "filtros-vencidos",
      titulo: "Filtros vencidos",
      detalhe: "Filtros com data de troca ultrapassada.",
      quantidade: n(d.filtros.vencidos),
      severidade: "critica",
      modulo: "Água",
      rota: "/entrega-agua",
      acao: "Programar troca imediata",
    },
    {
      key: "materiais",
      titulo: "Solicitações de material paradas",
      detalhe: "Solicitações aguardando tratativa de suprimentos.",
      quantidade: n(d.materiais.pendentes),
      severidade: "media",
      modulo: "Materiais",
      rota: "/solicitacao-materiais",
      acao: "Cobrar suprimentos",
    },
    {
      key: "legal-vencidos",
      titulo: "Itens legais vencidos",
      detalhe: "Obrigações legais fora do prazo.",
      quantidade: n(d.legal.vencidos),
      severidade: "critica",
      modulo: "Conformidade",
      rota: "/itens-legais",
      acao: "Regularizar com urgência",
    },
    {
      key: "legal-30",
      titulo: "Itens legais a vencer em 30 dias",
      detalhe: "Obrigações legais próximas do vencimento.",
      quantidade: n(d.legal.proximos_30),
      severidade: "media",
      modulo: "Conformidade",
      rota: "/itens-legais",
      acao: "Agendar execução",
    },
    {
      key: "aso",
      titulo: "ASO vencidos",
      detalhe: "Colaboradores ativos com exame ocupacional vencido.",
      quantidade: n(d.sst.aso_vencidos),
      severidade: "critica",
      modulo: "SST",
      rota: "/sst",
      acao: "Agendar exame",
    },
    {
      key: "pt-aguardando",
      titulo: "PT aguardando liberação",
      detalhe: "Permissões de trabalho de taludes pendentes de análise.",
      quantidade: n(d.taludes.pt_aguardando),
      severidade: "alta",
      modulo: "Taludes",
      rota: "/taludes",
      acao: "Analisar e liberar",
    },
    {
      key: "pt-suspensa",
      titulo: "PT suspensas",
      detalhe: "Trabalhos suspensos, normalmente por condição climática.",
      quantidade: n(d.taludes.pt_suspensas),
      severidade: "media",
      modulo: "Taludes",
      rota: "/taludes",
      acao: "Reprogramar atividade",
    },
  ];

  const peso: Record<Severidade, number> = { critica: 0, alta: 1, media: 2 };
  return itens
    .filter((i) => i.quantidade > 0)
    .sort((a, b) => peso[a.severidade] - peso[b.severidade] || b.quantidade - a.quantidade);
}

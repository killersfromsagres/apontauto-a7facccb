export type PermissionModule = {
  key: string;
  label: string;
  description?: string;
  requiresAdmin?: boolean;
};

export type PermissionGroup = {
  key: string;
  label: string;
  description: string;
  modules: readonly PermissionModule[];
};

export const PERMISSION_GROUPS = [
  {
    key: "visao-geral",
    label: "Visão Geral",
    description: "Painéis iniciais, indicadores e comunicação.",
    modules: [
      { key: "dashboard", label: "Menu Inicial (BI)" },
      { key: "dashboard-chamados", label: "Menu Inicial (Monitoramento Cliente)" },
      { key: "notificacoes", label: "Central de Notificações" },
    ],
  },
  {
    key: "institucional",
    label: "Institucional",
    description: "Estrutura e informações da operação.",
    modules: [{ key: "organograma", label: "Organograma Demarchi" }],
  },
  {
    key: "backorders",
    label: "Gestão de Backorders",
    description: "Históricos, acompanhamento e controle mensal.",
    modules: [
      { key: "backorder", label: "Backorders (Histórico)" },
      { key: "backorder-mensal", label: "Backorder Mensal" },
    ],
  },
  {
    key: "planejamento-pcm",
    label: "Planejamento PCM",
    description: "Programação, capacidade, apontamentos e refrigeração.",
    modules: [
      { key: "programacao-gps", label: "Programação GPS" },
      { key: "backlog-inteligente", label: "Backlog Inteligente" },
      { key: "capacidade", label: "Capacidade das Equipes" },
      { key: "apontamentos", label: "Apontamentos de OS" },
      { key: "refrigeracao", label: "Refrigeração — Campo" },
      { key: "refrigeracao-pecas-status", label: "Refrigeração — Status de Peças" },
      { key: "refrigeracao-historico", label: "Refrigeração — Histórico" },
      { key: "refrigeracao-historico-permanente", label: "Refrigeração — Histórico Permanente" },
    ],
  },
  {
    key: "corretivas",
    label: "Programação de Corretivas",
    description: "Execução, avaliação, materiais e histórico de chamados.",
    modules: [
      { key: "corretiva-novo", label: "Execução de Campo (IA)" },
      { key: "corretiva", label: "Programação — Campo (Legado)" },
      { key: "avaliacao-chamados", label: "Avaliação de Chamados" },
      { key: "corretiva-pecas-status", label: "Corretiva — Status de Peças" },
      { key: "corretiva-historico", label: "Corretiva — Histórico" },
    ],
  },
  {
    key: "preventivas",
    label: "Preventivas e Inspeções",
    description: "Programação semanal, automação e rondas.",
    modules: [
      { key: "programacao", label: "Programação Semanal (Legado)" },
      { key: "programacao-preventivas", label: "Programação Semanal" },
      { key: "preventiva-automacao", label: "Automação de Preventivas" },
      { key: "rondas-calhas", label: "Rondas de Calhas" },
      { key: "rondas-calhas-historico", label: "Histórico de Rondas" },
    ],
  },
  {
    key: "ativos",
    label: "Ativos e Confiabilidade",
    description: "Cadastros, localização, pendências e causa raiz.",
    modules: [
      { key: "assets-fill", label: "Preencher Localização de Ativos" },
      { key: "assets-catalog", label: "Base de Ativos" },
      { key: "assets-unmatched", label: "Ativos não Encontrados" },
      { key: "assets-history", label: "Histórico de Ativos" },
      { key: "confiabilidade", label: "Confiabilidade / Causa Raiz" },
    ],
  },
  {
    key: "operacao",
    label: "Operação e Serviços",
    description: "Taludes, frota, água, materiais e serviços internos.",
    modules: [
      { key: "taludes", label: "Demarcação de Taludes" },
      { key: "abastecimento", label: "Frota e Abastecimento" },
      { key: "agua-execucao", label: "Entrega de Água" },
      { key: "solicitacao-materiais", label: "Solicitação de Materiais" },
      { key: "controle-materiais", label: "Controle de Materiais" },
      { key: "central-materiais-unificada", label: "Central de Materiais Solicitados" },
      { key: "lavanderia", label: "Controle de Lavanderia" },
      { key: "mensageria", label: "Mensageria e Malotes" },
    ],
  },
  {
    key: "conformidade",
    label: "Segurança e Conformidade",
    description: "Segurança do trabalho e obrigações legais.",
    modules: [
      { key: "seguranca-trabalho", label: "Segurança do Trabalho" },
      { key: "painel-legal", label: "Painel de Itens Legais" },
    ],
  },
  {
    key: "inteligencia",
    label: "Inteligência e BI",
    description: "Assistentes de IA, documentos e painéis analíticos.",
    modules: [
      { key: "copiloto", label: "Copiloto Admin (IA)" },
      { key: "agente-ia", label: "Agente de Documentos (IA)" },
      { key: "bi-studio", label: "BI Studio" },
    ],
  },
  {
    key: "administracao",
    label: "Administração",
    description: "Auditoria, avisos, qualidade, armazenamento e configurações.",
    modules: [
      { key: "auditoria", label: "Trilha de Auditoria" },
      { key: "observabilidade", label: "Painel Técnico" },
      { key: "notificacoes-admin", label: "Administração de Avisos" },
      { key: "qualidade-dados", label: "Qualidade de Dados" },
      { key: "imagens", label: "Imagens e Armazenamento" },
      {
        key: "usuarios",
        label: "Gerenciamento de Usuários",
        description: "Disponível somente para contas administradoras.",
        requiresAdmin: true,
      },
      { key: "configuracoes", label: "Configurações" },
    ],
  },
  {
    key: "acoes-especiais",
    label: "Ações Especiais",
    description: "Permissões operacionais específicas, sem liberar outros módulos.",
    modules: [
      { key: "corretiva-finalizar-sem-foto", label: "Admin: Finalizar OS sem Foto" },
      {
        key: "corretiva-concluir-sem-foto-especial",
        label: "Encarregados: Finalizar OS sem Foto",
      },
      { key: "reclassificar-equipe", label: "Reclassificar Equipe Manualmente" },
      { key: "imagens-migrar", label: "Migrar Imagens (Storage → ImgBB)" },
    ],
  },
] as const satisfies readonly PermissionGroup[];

export type MenuKey = (typeof PERMISSION_GROUPS)[number]["modules"][number]["key"];

export const MENU_KEYS = PERMISSION_GROUPS.flatMap((group) =>
  group.modules.map((module) => module.key),
) as MenuKey[];

export const ASSIGNABLE_MENU_KEYS = PERMISSION_GROUPS.flatMap((group) =>
  group.modules.filter((module) => !("requiresAdmin" in module && module.requiresAdmin)).map((module) => module.key),
) as MenuKey[];

export const MENU_LABELS = Object.fromEntries(
  PERMISSION_GROUPS.flatMap((group) => group.modules.map((module) => [module.key, module.label])),
) as Record<MenuKey, string>;

export function isMenuKey(value: string): value is MenuKey {
  return (MENU_KEYS as readonly string[]).includes(value);
}

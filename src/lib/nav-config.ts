import { useMemo } from "react";
import {
  Activity,
  BrainCircuit,
  Gauge,
  LayoutDashboard,
  CalendarRange,
  CalendarDays,
  CalendarClock,
  Map as MapIcon,
  PenLine,
  ShieldCheck,
  HardHat,
  WashingMachine,
  ChartColumn,
  ChartPie,
  PackageOpen,
  PackageX,
  CloudSun,
  Scale,
  Thermometer,
  ScrollText,
  Users,
  AirVent,
  Wrench,
  ClipboardList,
  ListChecks,
  Cog,
  Database,
  Boxes,
  ClipboardCheck,
  FileSpreadsheet,
  Droplets,
  Fuel,
  FileClock,
  SearchX,
  BellRing,
  Megaphone,
  MessageSquareCheck,
  type LucideIcon,
  ImageIcon,
  Crown,
  Bell,
  Search,
  Star,
  PlusCircle,
  Sparkles,
} from "lucide-react";

import { useIsAdmin } from "@/hooks/use-is-admin";
import { useAllowedMenus } from "@/hooks/use-allowed-menus";

export type MenuItem = {
  key: string;
  title: string;
  /** Rótulo curto usado na barra inferior mobile. */
  short?: string;
  url: string;
  icon: LucideIcon;
  /** Chaves antigas de `allowed_menus` que também liberam este item. */
  aliases?: string[];
  /** Termos extras para a pesquisa global. */
  keywords?: string[];
};

export type MenuSection =
  | { kind: "item"; item: MenuItem }
  | { kind: "group"; key: string; title: string; icon: LucideIcon; items: MenuItem[] };

export const sections: MenuSection[] = [
  {
    kind: "group",
    key: "acoes-rapidas-grp",
    title: "Ações e Atalhos",
    icon: PlusCircle,
    items: [
      {
        key: "notificacoes",
        title: "Notificações",
        short: "Avisos",
        url: "/notificacoes",
        icon: Bell,
        keywords: ["alertas", "avisos", "comunicados"],
      },
      {
        key: "favoritos",
        title: "Meus Favoritos",
        short: "Favoritos",
        url: "#",
        icon: Star,
      },
      {
        key: "pesquisa",
        title: "Busca Global",
        short: "Busca",
        url: "#",
        icon: Search,
      },
    ],
  },
  {
    kind: "group",
    key: "visao-geral-grp",
    title: "Visão Geral",
    icon: LayoutDashboard,
    items: [
      {
        key: "dashboard",
        title: "Menu Inicial",
        short: "Início",
        url: "/",
        icon: BrainCircuit,
        keywords: [
          "home",
          "início",
          "kpi",
          "dashboard",
          "gestão",
          "indicadores",
          "pcm",
          "inteligência",
          "automação",
          "preventiva",
        ],
      },
    ],
  },
  {
    kind: "group",
    key: "institucional-grp",
    title: "Institucional",
    icon: Users,
    items: [
      {
        key: "organograma",
        title: "Organograma",
        short: "Time",
        url: "/organograma",
        icon: Users,
        keywords: ["equipe", "colaboradores", "hierarquia", "contato", "time"],
      },
    ],
  },
  {
    kind: "group",
    key: "backorder-v2-grp",
    title: "Gestão de Backorders e OS",
    icon: ListChecks,
    items: [
      {
        key: "backorder",
        title: "Backorders (Histórico)",
        short: "Backorder",
        url: "/backorder",
        icon: PackageX,
        keywords: ["backorder", "os", "histórico", "chamados", "pendência"],
      },
    ],
  },
  {
    kind: "group",
    key: "planejamento-grp",
    title: "Planejamento PCM",
    icon: CalendarRange,
    items: [
      {
        key: "programacao-gps",
        title: "Programação GPS",
        short: "GPS",
        url: "/programacao-gps",
        icon: FileSpreadsheet,
        keywords: ["gps", "corretiva", "backorder", "gerar", "planilha"],
      },
      {
        key: "backlog-inteligente",
        title: "Backlog Inteligente",
        short: "Backlog",
        url: "/backlog-inteligente",
        icon: ListChecks,
        keywords: ["prioridade", "score", "sla", "reincidência", "fila"],
      },
      {
        key: "capacidade",
        title: "Capacidade das Equipes",
        short: "Capacidade",
        url: "/programacao-capacidade",
        icon: CalendarRange,
        keywords: ["jornada", "ausência", "carga", "gargalo", "hh"],
      },
      {
        key: "apontamentos",
        title: "Apontamentos de OS",
        short: "Apont.",
        url: "/apontamentos",
        icon: PenLine,
        keywords: ["gerar", "distribuir", "apontamento"],
      },
      {
        key: "refrigeracao",
        title: "Refrigeração — Campo",
        short: "Refrig.",
        url: "/refrigeracao",
        icon: Thermometer,
      },
      {
        key: "refrigeracao-pecas-status",
        title: "Central de Materiais",
        short: "Materiais",
        url: "/corretiva-pecas-status",
        icon: PackageOpen,
        keywords: ["materiais", "unificada", "peças", "solicitações", "central"],
      },
      {
        key: "refrigeracao-historico",
        title: "Refrigeração — Histórico",
        short: "Histórico",
        url: "/refrigeracao-historico",
        icon: ScrollText,
      },
      {
        key: "refrigeracao-historico-permanente",
        title: "Histórico Permanente",
        short: "Permanente",
        url: "/refrigeracao-historico-permanente",
        icon: Database,
      },
    ],
  },
  {
    kind: "group",
    key: "corretiva-novo-grp",
    title: "Programação de Corretivas",
    icon: Wrench,
    items: [
      {
        key: "corretiva-novo",
        title: "Execução de Campo",
        short: "Campo",
        url: "/corretiva-novo",
        icon: Wrench,
        keywords: ["campo", "executar", "os", "corretiva", "equipe", "ia"],
      },
      {
        key: "avaliacao-chamados",
        title: "Avaliação de Chamados",
        short: "Avaliação",
        url: "/avaliacao-chamados",
        icon: MessageSquareCheck,
        keywords: ["avaliação", "satisfação", "feedback", "email", "solicitante", "encarregado"],
      },
      {
        key: "corretiva-pecas-status",
        title: "Central de Materiais",
        short: "Materiais",
        url: "/corretiva-pecas-status",
        icon: PackageOpen,
        keywords: ["materiais", "unificada", "peças", "solicitações", "central"],
      },
      {
        key: "corretiva-historico",
        title: "Histórico de Execuções",
        short: "Histórico",
        url: "/corretiva-historico",
        icon: ScrollText,
        keywords: ["concluídas", "finalizadas", "relatórios"],
      },
    ],
  },
  {
    kind: "group",
    key: "backorder-mensal-grp",
    title: "Backorder Mensal",
    icon: CalendarDays,
    items: [
      {
        key: "backorder-mensal",
        title: "Backorder Mensal",
        short: "Backorder",
        url: "/backorder-mensal",
        icon: PackageX,
        keywords: ["backorder", "mensal", "execução", "campo", "os"],
      },
    ],
  },
  {
    kind: "group",
    key: "os-grp",
    title: "Ordens de Serviço (Preventiva)",
    icon: CalendarDays,
    items: [
      {
        key: "programacao",
        title: "Programação Semanal (Legado)",
        short: "Legado",
        url: "/programacao",
        icon: FileClock,
        keywords: ["semanal", "preventiva", "backorder", "agendamento", "legado"],
      },
      {
        key: "programacao-preventivas",
        title: "Programação Semanal",
        short: "Prog.",
        url: "/programacao-preventivas",
        icon: CalendarDays,
        keywords: ["semanal", "preventiva", "backorder", "agendamento", "equipes"],
      },
      {
        key: "preventiva-automacao",
        title: "Automação de Preventivas",
        short: "Auto",
        url: "/preventiva-automacao",
        icon: BrainCircuit,
        keywords: ["automática", "preventiva", "geração", "ativos", "pcm"],
      },
    ],
  },
  {
    kind: "group",
    key: "rondas-calhas-grp",
    title: "Rondas e Inspeções",
    icon: ShieldCheck,
    items: [
      {
        key: "rondas-calhas",
        title: "Rondas de Calhas",
        short: "Rondas",
        url: "/rondas-calhas",
        icon: ClipboardCheck,
        keywords: ["ronda", "inspeção", "calha", "prédio", "preventiva"],
      },
      {
        key: "rondas-calhas-historico",
        title: "Histórico de Rondas",
        short: "Histórico",
        url: "/rondas-calhas/historico",
        icon: ScrollText,
        keywords: ["histórico", "ronda", "concluída", "relatório", "certificado"],
      },
    ],
  },
  {
    kind: "group",
    key: "ativos-grp",
    title: "Ativos e Confiabilidade",
    icon: Boxes,
    items: [
      {
        key: "assets-fill",
        aliases: ["inteligencia-ativos"],
        title: "Preencher localização de ativos",
        short: "Preencher",
        url: "/inteligencia-ativos/preencher",
        icon: FileSpreadsheet,
        keywords: ["planilha", "prédio", "andar", "ambiente", "vlookup"],
      },
      {
        key: "assets-catalog",
        aliases: ["base-ativos"],
        title: "Base de Ativos",
        short: "Base",
        url: "/base-ativos",
        icon: Database,
        keywords: ["catálogo", "versão", "importar"],
      },
      {
        key: "assets-unmatched",
        aliases: ["inteligencia-ativos"],
        title: "Ativos não encontrados",
        short: "Pendências",
        url: "/inteligencia-ativos/nao-encontrados",
        icon: SearchX,
      },
      {
        key: "assets-history",
        aliases: ["inteligencia-ativos"],
        title: "Histórico de processamentos",
        short: "Histórico",
        url: "/inteligencia-ativos/historico",
        icon: ScrollText,
      },
      {
        key: "confiabilidade",
        title: "Confiabilidade e Causa Raiz",
        short: "Confiab.",
        url: "/confiabilidade",
        icon: Activity,
        keywords: ["mtbf", "mttr", "pareto", "5 porquês", "ishikawa", "saúde"],
      },
    ],
  },
  {
    kind: "group",
    key: "taludes-grp",
    title: "Taludes e Clima",
    icon: MapIcon,
    items: [
      {
        key: "taludes",
        title: "Demarcação de Taludes",
        short: "Taludes",
        url: "/taludes",
        icon: MapIcon,
        keywords: ["mapa", "polígono", "demarcação", "pt"],
      },
    ],
  },
  {
    kind: "group",
    key: "frota-grp",
    title: "Frota e Abastecimento",
    icon: Fuel,
    items: [
      {
        key: "abastecimento",
        title: "Frota e Abastecimento",
        short: "Frota",
        url: "/frota",
        icon: Fuel,
        keywords: [
          "combustível",
          "diesel",
          "litros",
          "frota",
          "veículo",
          "hodômetro",
          "checklist",
          "ocorrência",
          "consumo",
        ],
      },
      {
        key: "agua-execucao",
        aliases: ["abastecimento", "abastecimento-agua"],
        title: "Entrega de Água",
        short: "Água",
        url: "/abastecimento/agua",
        icon: Droplets,
        keywords: ["água", "bags", "galão", "programação", "gps", "prédio", "andar"],
      },
    ],
  },
  {
    kind: "group",
    key: "materiais-grp",
    title: "Materiais e Serviços",
    icon: ClipboardList,
    items: [
      {
        key: "solicitacao-materiais",
        title: "Solicitação de Materiais",
        short: "Solicitar",
        url: "/solicitacao-materiais",
        icon: Boxes,
        keywords: ["pedido", "material", "catálogo", "planilha", "colaborador", "suprimentos"],
      },
      {
        key: "controle-materiais",
        title: "Controle de Materiais",
        short: "Materiais",
        url: "/controle-materiais",
        icon: ClipboardList,
        keywords: ["peças", "compras", "centro de custo", "facilities"],
      },
      {
        key: "central-materiais-unificada",
        title: "Central de Materiais Solicitados",
        short: "Central",
        url: "/corretiva-pecas-status",
        icon: PackageOpen,
        keywords: ["central", "unificada", "materiais", "peças", "solicitações", "compras"],
      },
      {
        key: "lavanderia",
        title: "Controle de Lavanderia",
        short: "Lavanderia",
        url: "/lavanderia",
        icon: WashingMachine,
      },
      {
        key: "mensageria",
        title: "Mensageria e Malotes",
        short: "Malotes",
        url: "/mensageria",
        icon: PackageOpen,
        keywords: ["mensageria", "malote", "correspondência", "portaria", "protocolo", "recebimento", "entrega", "assinatura", "destinatário"],
      },
    ],
  },
  {
    kind: "group",
    key: "conformidade-grp",
    title: "Segurança e Conformidade",
    icon: ShieldCheck,
    items: [
      {
        key: "seguranca-trabalho",
        title: "Segurança do Trabalho",
        short: "SST",
        url: "/seguranca-trabalho",
        icon: HardHat,
      },
      {
        key: "painel-legal",
        title: "Painel de Itens Legais",
        short: "Legal",
        url: "/painel-legal",
        icon: Scale,
      },
      {
        key: "auditoria",
        title: "Trilha de Auditoria",
        short: "Auditoria",
        url: "/auditoria",
        icon: FileClock,
        keywords: ["log", "histórico", "rastreabilidade", "compliance"],
      },
      {
        key: "observabilidade",
        title: "Painel Técnico",
        short: "Técnico",
        url: "/observabilidade",
        icon: Activity,
        keywords: ["erros", "logs", "integrações", "saúde", "monitoramento", "offline"],
      },
    ],
  },
  {
    kind: "group",
    key: "bi-grp",
    title: "Inteligência e BI",
    icon: ChartColumn,
    items: [
      {
        key: "copiloto",
        title: "Copiloto Admin (IA)",
        short: "Copiloto",
        url: "/copiloto",
        icon: Sparkles,
        keywords: ["ia", "chat", "admin", "copiloto", "assistente", "consulta", "sql"],
      },
      {
        key: "agente-ia",
        title: "Agente de Documentos (IA)",
        short: "Agente IA",
        url: "/agente-ia",
        icon: BrainCircuit,
        keywords: [
          "ia",
          "agente",
          "excel",
          "powerpoint",
          "power bi",
          "relatório",
          "planilha",
          "apresentação",
        ],
      },
      {
        key: "bi-studio",
        title: "BI Studio",
        short: "BI",
        url: "/bi-studio",
        icon: ChartPie,
        keywords: ["power bi", "painel", "dashboard", "gráfico", "kpi", "exportar", "conector"],
      },
    ],
  },
  {
    kind: "group",
    key: "admin-grp",
    title: "Administração",
    icon: Cog,
    items: [
      {
        key: "notificacoes",
        title: "Central de Notificações",
        short: "Avisos",
        url: "/notificacoes",
        icon: BellRing,
        keywords: ["aviso", "alerta", "comunicado", "notificação"],
      },
      {
        key: "notificacoes-admin",
        title: "Administração de Avisos",
        short: "Avisos (adm)",
        url: "/notificacoes-admin",
        icon: Megaphone,
        keywords: ["aviso", "comunicado", "publicar", "agendar", "notificação"],
      },
      {
        key: "qualidade-dados",
        title: "Qualidade de Dados",
        short: "Qualidade",
        url: "/qualidade-dados",
        icon: ClipboardList,
        keywords: ["inconsistência", "cadastro", "correção", "cpf", "hodômetro"],
      },
      {
        key: "imagens",
        title: "Imagens e Armazenamento",
        short: "Imagens",
        url: "/imagens",
        icon: ImageIcon,
        keywords: ["fotos", "imgbb", "storage", "espaço", "migrar", "limpeza"],
      },
      {
        key: "usuarios",
        title: "Gerenciamento de Usuários",
        short: "Usuários",
        url: "/usuarios",
        icon: Users,
        keywords: ["permissões", "acesso", "senha", "login", "admin", "contas"],
      },
      {
        key: "configuracoes",
        title: "Configurações",
        short: "Config.",
        url: "/configuracoes",
        icon: ClipboardCheck,
      },
    ],
  },
];

/** Lista achatada de todos os itens de menu conhecidos. */
export const allMenuItems: MenuItem[] = sections.flatMap((s) =>
  s.kind === "item" ? [s.item] : s.items,
);

/** Todas as chaves aceitas por um item (chave nova + aliases legados). */
export const itemKeys = (item: MenuItem) => [item.key, ...(item.aliases ?? [])];

/** Encontra o item de menu que corresponde a um pathname (prefixo mais longo). */
function itemMatchesPath(item: MenuItem, pathname: string) {
  if (item.url === "/") {
    return pathname === "/" || pathname === "" || pathname === "/_authenticated/";
  }
  return (
    pathname === item.url ||
    pathname === `/_authenticated${item.url}` ||
    pathname === `/_authenticated${item.url}/` ||
    pathname.startsWith(`${item.url}/`)
  );
}

export function menuItemForPath(pathname: string): MenuItem | null {
  let best: MenuItem | null = null;
  for (const item of allMenuItems) {
    if (!itemMatchesPath(item, pathname)) continue;
    if (!best || item.url.length > best.url.length) best = item;
  }
  return best;
}

/** Todas as chaves que podem liberar o pathname, incluindo menus com URL compartilhada. */
export function menuKeysForPath(pathname: string): string[] | null {
  const matching = allMenuItems.filter((item) => itemMatchesPath(item, pathname));
  if (matching.length > 0) {
    return Array.from(new Set(matching.flatMap(itemKeys)));
  }
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg ? [seg] : null;
}

/** Módulos sensíveis: exigem liberação explícita (igual ao banco). */
const RESTRICTED_KEYS = [
  "dashboard-chamados",
  "abastecimento",
  "avaliacao-chamados",
  "abastecimento-agua",
  "agua-execucao",
  "frota-checklist",
  "frota-historico",
  "frota-gestao",
  "bi-studio",
  "notificacoes-admin",
  "auditoria",
  "observabilidade",
  "confiabilidade",
  "gestao-executiva",
  "planejamento-grp",
  "refrigeracao",
  "refrigeracao-pecas-status",
  "refrigeracao-historico",
  "preventiva-automacao",
  "rondas-calhas",
  "rondas-calhas-historico",
  "mensageria",
];

/** Ordem de preferência dos atalhos da barra inferior no mobile. */
const QUICK_KEYS = [
  "corretiva-novo",
  "corretiva",
  "refrigeracao",
  "programacao",
  "gestao-executiva",
  "backorder",
  "assets-fill",
  "seguranca-trabalho",
  "lavanderia",
  "preventiva-ac",
  "dashboard-chamados",
  "dashboard-chamados",
  "painel-legal",
  "capacidade",
  "confiabilidade",
  "qualidade-dados",
  "materiais-os",
];

/** Módulo sensível (negação por padrão, espelha `can_access_module`). */
export function isRestrictedModule(key: string): boolean {
  return RESTRICTED_KEYS.includes(key);
}

/** Regra pura de visibilidade de um item de menu. */
export function canSeeMenuItem(
  item: MenuItem,
  ctx: { isAdmin: boolean; allowed: string[] | null | undefined },
): boolean {
  const { isAdmin, allowed } = ctx;
  if (isAdmin) return true;

  // Atalhos locais não abrem módulos e permanecem disponíveis para todos.
  if (item.key === "pesquisa" || item.key === "favoritos") return true;

  // O gerenciamento de contas exige papel administrativo no backend.
  if (item.key === "usuarios") return false;

  // Para usuários comuns, toda seção real é explícita e falha fechada.
  if (!allowed) return false;
  return itemKeys(item).some((key) => allowed.includes(key));
}

export function useVisibleSections() {
  const { isAdmin, loading: loadingAdmin } = useIsAdmin();
  const { allowed, loading: loadingAllowed } = useAllowedMenus();
  const loading = loadingAdmin || loadingAllowed;

  const visibleSections = useMemo<MenuSection[]>(() => {
    if (loading) return [];
    const canSee = (item: MenuItem) => canSeeMenuItem(item, { isAdmin, allowed });

    const out: MenuSection[] = [];
    for (const s of sections) {
      if (s.kind === "item") {
        if (canSee(s.item)) out.push(s);
      } else {
        const isManutencao = allowed?.includes("manutencao");
        if (isManutencao && s.key === "planejamento-grp") continue;

        const items = s.items.filter(canSee);
        if (items.length > 0) out.push({ ...s, items });
      }
    }
    return out;
  }, [loading, isAdmin, allowed]);

  const visibleItems = useMemo<MenuItem[]>(
    () => visibleSections.flatMap((s) => (s.kind === "item" ? [s.item] : s.items)),
    [visibleSections],
  );

  const canAccess = useMemo(
    () => (key: string) => visibleItems.some((i) => itemKeys(i).includes(key)),
    [visibleItems],
  );

  const quickItems = useMemo<MenuItem[]>(() => {
    const byKey = new Map(visibleItems.map((i) => [i.key, i]));
    const picked: MenuItem[] = [];
    for (const key of QUICK_KEYS) {
      const item = byKey.get(key);
      if (item) picked.push(item);
      if (picked.length === 3) break;
    }
    if (picked.length < 3) {
      for (const item of visibleItems) {
        if (item.key === "dashboard") continue;
        if (picked.some((p) => p.key === item.key)) continue;
        picked.push(item);
        if (picked.length === 3) break;
      }
    }
    return picked;
  }, [visibleItems]);

  const hasDashboard = visibleItems.some((i) => i.key === "dashboard");

  return { visibleSections, visibleItems, quickItems, hasDashboard, canAccess, loading };
}

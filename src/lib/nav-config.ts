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
  type LucideIcon,
  Image as ImageIcon,
  Crown,
  Bell,
  Search,
  Star,
  PlusCircle,
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
        title: "Home Operacional",
        short: "Início",
        url: "/",
        icon: Gauge,
        keywords: ["home", "início", "kpi"],
      },
      {
        key: "gestao-executiva",
        title: "Centro de Gestão",
        short: "Gestão",
        url: "/gestao",
        icon: Crown,
        keywords: ["executivo", "gestor", "indicadores", "riscos", "plano de ação", "consolidado"],
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
        key: "programacao",
        title: "Programação Semanal",
        short: "Programação",
        url: "/programacao",
        icon: CalendarDays,
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
        key: "preventiva",
        title: "Preventiva (legado)",
        short: "Preventiva",
        url: "/preventiva",
        icon: CalendarClock,
      },
      {
        key: "apontamentos",
        title: "Apontamentos de OS",
        short: "Apont.",
        url: "/apontamentos",
        icon: PenLine,
        keywords: ["gerar", "distribuir", "apontamento"],
      },
    ],
  },
  {
    kind: "group",
    key: "os-grp",
    title: "Ordens de Serviço",
    icon: Wrench,
    items: [
      {
        key: "backorder",
        title: "Backorder de Corretivas",
        short: "Backorder",
        url: "/backorder",
        icon: PackageOpen,
      },
      {
        key: "corretiva",
        title: "Corretiva — Campo",
        short: "Corretiva",
        url: "/corretiva",
        icon: Wrench,
      },
      {
        key: "corretiva-pecas-status",
        title: "Corretiva — Status de Peças",
        short: "Peças",
        url: "/corretiva-pecas-status",
        icon: PackageOpen,
      },
      {
        key: "corretiva-historico",
        title: "Corretiva — Histórico",
        short: "Histórico",
        url: "/corretiva-historico",
        icon: ScrollText,
      },
      {
        key: "corretiva-gestor",
        title: "Corretiva — Gestão",
        short: "Gestão",
        url: "/corretiva-gestor",
        icon: Users,
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
        title: "Refrigeração — Status de Peças",
        short: "Peças",
        url: "/refrigeracao-pecas-status",
        icon: PackageOpen,
      },
      {
        key: "refrigeracao-historico",
        title: "Refrigeração — Histórico",
        short: "Histórico",
        url: "/refrigeracao-historico",
        icon: ScrollText,
      },
      {
        key: "refrigeracao-gestor",
        title: "Refrigeração — Gestão",
        short: "Gestão",
        url: "/refrigeracao-gestor",
        icon: Users,
      },
      {
        key: "preventiva-ac",
        title: "Preventiva AC (PMOC)",
        short: "PMOC",
        url: "/preventiva-ac",
        icon: AirVent,
      },
      {
        key: "materiais-os",
        title: "Materiais por OS",
        short: "Materiais",
        url: "/materiais-os",
        icon: PackageOpen,
        keywords: ["reserva", "estoque", "lead time", "crítico", "sla"],
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
      {
        key: "taludes-pt",
        title: "PT — Permissão de Trabalho",
        short: "PT Taludes",
        url: "/taludes-pt",
        icon: ShieldCheck,
        keywords: ["pt", "permissão", "bombeiros", "liberação", "chuva", "suspensão"],
      },
      {
        key: "clima-tempo",
        title: "Clima e Tempo",
        short: "Clima",
        url: "/clima-tempo",
        icon: CloudSun,
        keywords: ["chuva", "previsão", "evidência", "sbc"],
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
        key: "lavanderia",
        title: "Controle de Lavanderia",
        short: "Lavanderia",
        url: "/lavanderia",
        icon: WashingMachine,
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
        key: "dashboard-chamados",
        title: "Dashboard de Chamados",
        short: "Chamados",
        url: "/dashboard-chamados",
        icon: ChartColumn,
        keywords: ["indicadores", "equipes", "bi", "gráficos", "análise"],
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
export function menuItemForPath(pathname: string): MenuItem | null {
  if (pathname === "/" || pathname === "") {
    return allMenuItems.find((i) => i.url === "/") ?? null;
  }
  let best: MenuItem | null = null;
  for (const item of allMenuItems) {
    if (item.url === "/") continue;
    if (pathname === item.url || pathname.startsWith(`${item.url}/`)) {
      if (!best || item.url.length > best.url.length) best = item;
    }
  }
  return best;
}

/** Chaves aceitas para liberar um pathname (`null` = rota sem restrição). */
export function menuKeysForPath(pathname: string): string[] | null {
  const item = menuItemForPath(pathname);
  if (item) return itemKeys(item);
  const seg = pathname.split("/").filter(Boolean)[0];
  return seg ? [seg] : null;
}

/** Módulos sensíveis: exigem liberação explícita (igual ao banco). */
const RESTRICTED_KEYS = [
  "abastecimento",
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
];

/** Ordem de preferência dos atalhos da barra inferior no mobile. */
const QUICK_KEYS = [
  "corretiva",
  "refrigeracao",
  "assets-fill",
  "programacao",
  "backorder",
  "seguranca-trabalho",
  "lavanderia",
  "preventiva-ac",
  "taludes",
  "dashboard-chamados",
  "painel-legal",
  "capacidade",
  "confiabilidade",
  "qualidade-dados",
  "materiais-os",
];

/**
 * Seções de menu já filtradas pelas permissões do usuário.
 * Compartilhado entre a sidebar (desktop), a barra inferior (mobile),
 * a pesquisa global e os atalhos da home.
 */
/** Módulo sensível (negação por padrão, espelha `can_access_module`). */
export function isRestrictedModule(key: string): boolean {
  return RESTRICTED_KEYS.includes(key);
}

/**
 * Regra pura de visibilidade de um item de menu.
 * `allowed = null` significa "sem lista explícita" → nega tudo, exceto admin.
 */
export function canSeeMenuItem(
  item: MenuItem,
  ctx: { isAdmin: boolean; allowed: string[] | null | undefined },
): boolean {
  const { isAdmin, allowed } = ctx;
  const key = item.key;
  // Módulos restritos: negação por padrão (nunca liberados por
  // `allowed_menus = null` do sistema legado). Espelha a lista de
  // `can_access_module` no banco.
  if (isRestrictedModule(key)) {
    return isAdmin || (allowed?.includes(key) ?? false);
  }
  if (key === "pesquisa") return true;
  if (key === "favoritos") return true;
  if (key === "notificacoes") return true;
  if (key === "imagens") return isAdmin;
  if (key === "configuracoes") return isAdmin;
  if (key === "refrigeracao-gestor") return isAdmin;
  if (key === "corretiva-gestor") return isAdmin;
  if (key === "assets-catalog") return isAdmin;
  if (key.startsWith("assets-")) return isAdmin;
  if (isAdmin) return true;
  // Negação por padrão: sem lista explícita, nada é liberado (espelha o banco).
  if (!allowed) return false;
  return itemKeys(item).some((k) => allowed.includes(k));
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

  /** Até 3 atalhos rápidos (fora o Dashboard) para a barra inferior. */
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

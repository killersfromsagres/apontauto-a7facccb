import { useMemo } from "react";
import {
  Activity,
  LayoutDashboard,
  CalendarRange,
  CalendarDays,
  Map as MapIcon,
  PenLine,
  ShieldCheck,
  HardHat,
  WashingMachine,
  PackageOpen,
  Scale,
  Thermometer,
  ScrollText,
  Users,
  Wrench,
  ClipboardList,
  Cog,
  Database,
  Boxes,
  ClipboardCheck,
  FileSpreadsheet,
  Droplets,
  Fuel,
  SearchX,
  BellRing,
  Megaphone,
  MessageSquareCheck,
  type LucideIcon,
  ImageIcon,
  Bell,
  Search,
  Star,
  PlusCircle,
} from "lucide-react";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useAllowedMenus } from "@/hooks/use-allowed-menus";

export type MenuItem = { key: string; title: string; short?: string; url: string; icon: LucideIcon; aliases?: string[]; keywords?: string[] };
export type MenuSection = { kind: "item"; item: MenuItem } | { kind: "group"; key: string; title: string; icon: LucideIcon; items: MenuItem[] };

export const sections: MenuSection[] = [
  { kind: "group", key: "acoes-rapidas-grp", title: "Ações e Atalhos", icon: PlusCircle, items: [
    { key: "notificacoes", title: "Notificações", short: "Avisos", url: "/notificacoes", icon: Bell, keywords: ["alertas", "avisos", "comunicados"] },
    { key: "favoritos", title: "Meus Favoritos", short: "Favoritos", url: "#", icon: Star },
    { key: "pesquisa", title: "Busca Global", short: "Busca", url: "#", icon: Search },
  ]},
  { kind: "group", key: "visao-geral-grp", title: "Visão Geral", icon: LayoutDashboard, items: [
    { key: "dashboard", title: "Menu Inicial", short: "Início", url: "/", icon: LayoutDashboard, keywords: ["home", "início", "kpi", "dashboard", "gestão", "indicadores", "pcm"] },
  ]},
  { kind: "group", key: "institucional-grp", title: "Institucional", icon: Users, items: [
    { key: "organograma", title: "Organograma", short: "Time", url: "/organograma", icon: Users, keywords: ["equipe", "colaboradores", "hierarquia", "contato", "time"] },
  ]},
  { kind: "group", key: "planejamento-grp", title: "Planejamento PCM", icon: CalendarRange, items: [
    { key: "apontamentos", title: "Apontamentos de OS", short: "Apont.", url: "/apontamentos", icon: PenLine, keywords: ["gerar", "distribuir", "apontamento"] },
    { key: "refrigeracao", title: "Refrigeração — Campo", short: "Refrig.", url: "/refrigeracao", icon: Thermometer },
    { key: "refrigeracao-historico", title: "Refrigeração — Histórico", short: "Histórico", url: "/refrigeracao-historico", icon: ScrollText },
    { key: "refrigeracao-historico-permanente", title: "Histórico Permanente", short: "Permanente", url: "/refrigeracao-historico-permanente", icon: Database },
  ]},
  { kind: "group", key: "corretiva-novo-grp", title: "Programação de Corretivas", icon: Wrench, items: [
    { key: "corretiva-novo", title: "Execução de Campo", short: "Campo", url: "/corretiva-novo", icon: Wrench, keywords: ["campo", "executar", "os", "corretiva", "equipe"] },
    { key: "avaliacao-chamados", title: "Avaliação de Chamados", short: "Avaliação", url: "/avaliacao-chamados", icon: MessageSquareCheck, keywords: ["avaliação", "satisfação", "feedback", "email", "solicitante"] },
    { key: "corretiva-historico", title: "Histórico de Execuções", short: "Histórico", url: "/corretiva-historico", icon: ScrollText, keywords: ["concluídas", "finalizadas", "relatórios"] },
  ]},
  { kind: "group", key: "os-grp", title: "Ordens de Serviço (Preventiva)", icon: CalendarDays, items: [
    { key: "programacao", title: "Programação Semanal", short: "Programação", url: "/programacao", icon: CalendarDays, keywords: ["semanal", "preventiva", "corretiva", "agendamento", "equipes"] },
  ]},
  { kind: "group", key: "rondas-calhas-grp", title: "Rondas e Inspeções", icon: ShieldCheck, items: [
    { key: "rondas-calhas", title: "Rondas de Calhas", short: "Rondas", url: "/rondas-calhas", icon: ClipboardCheck, keywords: ["ronda", "inspeção", "calha", "prédio", "preventiva"] },
    { key: "rondas-calhas-historico", title: "Histórico de Rondas", short: "Histórico", url: "/rondas-calhas/historico", icon: ScrollText, keywords: ["histórico", "ronda", "concluída", "relatório", "certificado"] },
  ]},
  { kind: "group", key: "ativos-grp", title: "Ativos e Confiabilidade", icon: Boxes, items: [
    { key: "assets-fill", aliases: ["inteligencia-ativos"], title: "Preencher localização de ativos", short: "Preencher", url: "/inteligencia-ativos/preencher", icon: FileSpreadsheet, keywords: ["planilha", "prédio", "andar", "ambiente", "vlookup"] },
    { key: "assets-catalog", aliases: ["base-ativos"], title: "Base de Ativos", short: "Base", url: "/base-ativos", icon: Database, keywords: ["catálogo", "versão", "importar"] },
    { key: "assets-unmatched", aliases: ["inteligencia-ativos"], title: "Ativos não encontrados", short: "Pendências", url: "/inteligencia-ativos/nao-encontrados", icon: SearchX },
    { key: "assets-history", aliases: ["inteligencia-ativos"], title: "Histórico de processamentos", short: "Histórico", url: "/inteligencia-ativos/historico", icon: ScrollText },
    { key: "confiabilidade", title: "Confiabilidade e Causa Raiz", short: "Confiab.", url: "/confiabilidade", icon: Activity, keywords: ["mtbf", "mttr", "pareto", "causa raiz", "saúde"] },
  ]},
  { kind: "group", key: "taludes-grp", title: "Taludes e Clima", icon: MapIcon, items: [
    { key: "taludes", title: "Demarcação de Taludes", short: "Taludes", url: "/taludes", icon: MapIcon, keywords: ["mapa", "polígono", "demarcação", "clima"] },
  ]},
  { kind: "group", key: "frota-grp", title: "Frota e Abastecimento", icon: Fuel, items: [
    { key: "abastecimento", title: "Frota e Abastecimento", short: "Frota", url: "/frota", icon: Fuel, keywords: ["combustível", "diesel", "litros", "frota", "veículo", "hodômetro", "checklist"] },
    { key: "agua-execucao", aliases: ["abastecimento", "abastecimento-agua"], title: "Entrega de Água", short: "Água", url: "/abastecimento/agua", icon: Droplets, keywords: ["água", "bags", "galão", "programação", "prédio", "andar"] },
  ]},
  { kind: "group", key: "materiais-grp", title: "Materiais e Serviços", icon: ClipboardList, items: [
    { key: "solicitacao-materiais", title: "Solicitação de Materiais", short: "Solicitar", url: "/solicitacao-materiais", icon: Boxes, keywords: ["pedido", "material", "catálogo", "suprimentos"] },
    { key: "corretiva-pecas-status", aliases: ["central-materiais-unificada", "controle-materiais"], title: "Central de Materiais", short: "Central", url: "/corretiva-pecas-status", icon: PackageOpen, keywords: ["central", "materiais", "peças", "solicitações", "compras", "centro de custo", "facilities"] },
    { key: "lavanderia", title: "Controle de Lavanderia", short: "Lavanderia", url: "/lavanderia", icon: WashingMachine },
    { key: "mensageria", title: "Mensageria e Malotes", short: "Malotes", url: "/mensageria", icon: PackageOpen, keywords: ["mensageria", "malote", "correspondência", "protocolo", "recebimento", "entrega"] },
  ]},
  { kind: "group", key: "conformidade-grp", title: "Segurança e Conformidade", icon: ShieldCheck, items: [
    { key: "seguranca-trabalho", title: "Segurança do Trabalho", short: "SST", url: "/seguranca-trabalho", icon: HardHat },
    { key: "painel-legal", title: "Painel de Itens Legais", short: "Legal", url: "/painel-legal", icon: Scale },
  ]},
  { kind: "group", key: "admin-grp", title: "Administração", icon: Cog, items: [
    { key: "notificacoes", title: "Central de Notificações", short: "Avisos", url: "/notificacoes", icon: BellRing },
    { key: "notificacoes-admin", title: "Administração de Avisos", short: "Avisos (adm)", url: "/notificacoes-admin", icon: Megaphone },
    { key: "qualidade-dados", title: "Qualidade de Dados", short: "Qualidade", url: "/qualidade-dados", icon: ClipboardList },
    { key: "imagens", title: "Imagens e Armazenamento", short: "Imagens", url: "/imagens", icon: ImageIcon },
    { key: "usuarios", title: "Gerenciamento de Usuários", short: "Usuários", url: "/usuarios", icon: Users },
    { key: "configuracoes", title: "Configurações", short: "Config.", url: "/configuracoes", icon: ClipboardCheck },
  ]},
];

export const allMenuItems: MenuItem[] = sections.flatMap((section) => section.kind === "item" ? [section.item] : section.items);
export const itemKeys = (item: MenuItem) => [item.key, ...(item.aliases ?? [])];

function itemMatchesPath(item: MenuItem, pathname: string) {
  if (item.url === "/") return pathname === "/" || pathname === "" || pathname === "/_authenticated/";
  return pathname === item.url || pathname === `/_authenticated${item.url}` || pathname === `/_authenticated${item.url}/` || pathname.startsWith(`${item.url}/`);
}

export function menuItemForPath(pathname: string): MenuItem | null {
  if (pathname === "/controle-materiais" || pathname === "/_authenticated/controle-materiais") {
    return allMenuItems.find((item) => item.key === "corretiva-pecas-status") ?? null;
  }
  let best: MenuItem | null = null;
  for (const item of allMenuItems) {
    if (!itemMatchesPath(item, pathname)) continue;
    if (!best || item.url.length > best.url.length) best = item;
  }
  return best;
}

export function menuKeysForPath(pathname: string): string[] | null {
  if (pathname === "/controle-materiais" || pathname === "/_authenticated/controle-materiais" || pathname === "/_authenticated/controle-materiais/") {
    return ["corretiva-pecas-status", "central-materiais-unificada", "controle-materiais"];
  }
  const matching = allMenuItems.filter((item) => itemMatchesPath(item, pathname));
  if (matching.length > 0) return Array.from(new Set(matching.flatMap(itemKeys)));
  const segment = pathname.split("/").filter(Boolean)[0];
  return segment ? [segment] : null;
}

const RESTRICTED_KEYS = ["dashboard-chamados", "abastecimento", "avaliacao-chamados", "abastecimento-agua", "agua-execucao", "frota-checklist", "frota-historico", "frota-gestao", "notificacoes-admin", "confiabilidade", "gestao-executiva", "planejamento-grp", "refrigeracao", "refrigeracao-historico", "rondas-calhas", "rondas-calhas-historico", "mensageria"];
const ADMIN_ONLY_KEYS = new Set(["usuarios", "configuracoes", "corretiva-gestor", "refrigeracao-gestor"]);
const QUICK_KEYS = ["corretiva-novo", "refrigeracao", "programacao", "assets-fill", "seguranca-trabalho", "lavanderia", "painel-legal", "qualidade-dados"];

export function isRestrictedModule(key: string): boolean { return RESTRICTED_KEYS.includes(key); }
export function canSeeMenuItem(item: MenuItem, ctx: { isAdmin: boolean; allowed: string[] | null | undefined }): boolean {
  const { isAdmin, allowed } = ctx;
  if (isAdmin) return true;
  if (item.key === "pesquisa" || item.key === "favoritos") return true;
  if (ADMIN_ONLY_KEYS.has(item.key)) return false;
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
    for (const section of sections) {
      if (section.kind === "item") { if (canSee(section.item)) out.push(section); continue; }
      const isManutencao = allowed?.includes("manutencao");
      if (isManutencao && section.key === "planejamento-grp") continue;
      const items = section.items.filter(canSee);
      if (items.length > 0) out.push({ ...section, items });
    }
    return out;
  }, [loading, isAdmin, allowed]);
  const visibleItems = useMemo<MenuItem[]>(() => visibleSections.flatMap((section) => section.kind === "item" ? [section.item] : section.items), [visibleSections]);
  const canAccess = useMemo(() => (key: string) => visibleItems.some((item) => itemKeys(item).includes(key)), [visibleItems]);
  const quickItems = useMemo<MenuItem[]>(() => {
    const byKey = new Map(visibleItems.map((item) => [item.key, item]));
    const picked: MenuItem[] = [];
    for (const key of QUICK_KEYS) { const item = byKey.get(key); if (item) picked.push(item); if (picked.length === 3) break; }
    if (picked.length < 3) for (const item of visibleItems) { if (item.key === "dashboard" || item.url === "#") continue; if (picked.some((pickedItem) => pickedItem.key === item.key)) continue; picked.push(item); if (picked.length === 3) break; }
    return picked;
  }, [visibleItems]);
  const hasDashboard = visibleItems.some((item) => item.key === "dashboard");
  return { visibleSections, visibleItems, quickItems, hasDashboard, canAccess, loading };
}

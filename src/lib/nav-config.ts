import { useEffect, useMemo, useState } from "react";
import {
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
  SearchX,
  type LucideIcon,
} from "lucide-react";

import { useIsAdmin } from "@/hooks/use-is-admin";
import { useAllowedMenus } from "@/hooks/use-allowed-menus";
import { supabase } from "@/integrations/supabase/client";

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
    key: "visao-geral-grp",
    title: "Visão Geral",
    icon: LayoutDashboard,
    items: [
      { key: "dashboard", title: "Home Operacional", short: "Início", url: "/", icon: Gauge, keywords: ["home", "início", "kpi"] },
      {
        key: "dashboard-chamados",
        title: "Dashboard de Chamados",
        short: "Chamados",
        url: "/dashboard-chamados",
        icon: ChartColumn,
        keywords: ["indicadores", "equipes"],
      },
    ],
  },
  {
    kind: "group",
    key: "planejamento-grp",
    title: "Planejamento PCM",
    icon: CalendarRange,
    items: [
      { key: "programacao", title: "Programação Semanal", short: "Programação", url: "/programacao", icon: CalendarDays },
      {
        key: "backlog-inteligente",
        title: "Backlog Inteligente",
        short: "Backlog",
        url: "/backlog-inteligente",
        icon: ListChecks,
        keywords: ["prioridade", "score", "sla", "reincidência", "fila"],
      },
      { key: "preventiva", title: "Preventiva (legado)", short: "Preventiva", url: "/preventiva", icon: CalendarClock },
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
      { key: "backorder", title: "Backorder de Corretivas", short: "Backorder", url: "/backorder", icon: PackageOpen },
      { key: "corretiva", title: "Corretiva — Campo", short: "Corretiva", url: "/corretiva", icon: Wrench },
      { key: "corretiva-pecas-status", title: "Corretiva — Status de Peças", short: "Peças", url: "/corretiva-pecas-status", icon: PackageOpen },
      { key: "corretiva-historico", title: "Corretiva — Histórico", short: "Histórico", url: "/corretiva-historico", icon: ScrollText },
      { key: "corretiva-gestor", title: "Corretiva — Gestão", short: "Gestão", url: "/corretiva-gestor", icon: Users },
      { key: "refrigeracao", title: "Refrigeração — Campo", short: "Refrig.", url: "/refrigeracao", icon: Thermometer },
      { key: "refrigeracao-pecas-status", title: "Refrigeração — Status de Peças", short: "Peças", url: "/refrigeracao-pecas-status", icon: PackageOpen },
      { key: "refrigeracao-historico", title: "Refrigeração — Histórico", short: "Histórico", url: "/refrigeracao-historico", icon: ScrollText },
      { key: "refrigeracao-gestor", title: "Refrigeração — Gestão", short: "Gestão", url: "/refrigeracao-gestor", icon: Users },
      { key: "preventiva-ac", title: "Preventiva AC (PMOC)", short: "PMOC", url: "/preventiva-ac", icon: AirVent },
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
        title: "Abastecimento",
        short: "Combustível",
        url: "/abastecimento",
        icon: Fuel,
        keywords: ["combustível", "diesel", "litros", "frota", "veículo", "hodômetro"],
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
        key: "controle-materiais",
        title: "Controle de Materiais",
        short: "Materiais",
        url: "/controle-materiais",
        icon: ClipboardList,
        keywords: ["peças", "compras", "centro de custo", "facilities"],
      },
      { key: "lavanderia", title: "Controle de Lavanderia", short: "Lavanderia", url: "/lavanderia", icon: WashingMachine },
    ],
  },
  {
    kind: "group",
    key: "conformidade-grp",
    title: "Segurança e Conformidade",
    icon: ShieldCheck,
    items: [
      { key: "seguranca-trabalho", title: "Segurança do Trabalho", short: "SST", url: "/seguranca-trabalho", icon: HardHat },
      { key: "painel-legal", title: "Painel de Itens Legais", short: "Legal", url: "/painel-legal", icon: Scale },
    ],
  },
  {
    kind: "group",
    key: "admin-grp",
    title: "Administração",
    icon: Cog,
    items: [
      { key: "configuracoes", title: "Configurações", short: "Config.", url: "/configuracoes", icon: ClipboardCheck },
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
];

/**
 * Seções de menu já filtradas pelas permissões do usuário.
 * Compartilhado entre a sidebar (desktop), a barra inferior (mobile),
 * a pesquisa global e os atalhos da home.
 */
export function useVisibleSections() {
  const { isAdmin, loading: loadingAdmin } = useIsAdmin();
  const { allowed, loading: loadingAllowed } = useAllowedMenus();
  const loading = loadingAdmin || loadingAllowed;

  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setOwnerEmail(data.session?.user?.email ?? null);
    });
    return () => {
      active = false;
    };
  }, []);
  const isOwner = (ownerEmail ?? "").trim().toLowerCase() === "admin@apontauto.local";

  const visibleSections = useMemo<MenuSection[]>(() => {
    if (loading) return [];
    const canSee = (item: MenuItem) => {
      const key = item.key;
      if (key === "configuracoes") return isOwner;
      if (key === "refrigeracao-gestor") return isOwner || isAdmin;
      if (key === "corretiva-gestor") return isOwner || isAdmin;
      if (key === "assets-catalog") return isOwner || isAdmin;
      if (key.startsWith("assets-")) return isOwner || isAdmin;
      if (isAdmin) return true;
      if (!allowed) return true;
      return itemKeys(item).some((k) => allowed.includes(k));
    };
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
  }, [loading, isAdmin, allowed, isOwner]);

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

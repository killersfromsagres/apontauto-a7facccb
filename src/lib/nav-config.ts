import { useEffect, useMemo, useState } from "react";
import {
  Gauge,
  CalendarRange,
  CalendarDays,
  CalendarClock,
  Map as MapIcon,
  PenLine,
  ShieldAlert,
  HardHat,
  WashingMachine,
  Shirt,
  Factory,
  ChartColumn,
  PackageOpen,
  CloudSun,
  Scale,
  Snowflake,
  Thermometer,
  ScrollText,
  Users,
  Fan,
  AirVent,
  Wrench,
  ClipboardList,
  Cog,

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
};

export type MenuSection =
  | { kind: "item"; item: MenuItem }
  | { kind: "group"; key: string; title: string; icon: LucideIcon; items: MenuItem[] };

export const sections: MenuSection[] = [
  {
    kind: "item",
    item: { key: "dashboard", title: "Dashboard", short: "Início", url: "/", icon: Gauge },
  },
  {
    kind: "group",
    key: "programacao-grp",
    title: "Programação",
    icon: CalendarRange,
    items: [
      { key: "programacao", title: "Programação Semanal", short: "Programação", url: "/programacao", icon: CalendarDays },
      { key: "preventiva", title: "Preventiva (legado)", short: "Preventiva", url: "/preventiva", icon: CalendarClock },
      { key: "taludes", title: "Demarcação de Taludes", short: "Taludes", url: "/taludes", icon: MapIcon },
      { key: "apontamentos", title: "Apontamentos", short: "Apont.", url: "/apontamentos", icon: PenLine },
    ],
  },
  {
    kind: "group",
    key: "seguranca-grp",
    title: "Segurança do Trabalho",
    icon: ShieldAlert,
    items: [
      { key: "seguranca-trabalho", title: "Segurança do Trabalho", short: "SST", url: "/seguranca-trabalho", icon: HardHat },
    ],
  },
  {
    kind: "group",
    key: "rouparia-grp",
    title: "Rouparia",
    icon: Shirt,
    items: [
      { key: "lavanderia", title: "Controle de Lavanderia", short: "Lavanderia", url: "/lavanderia", icon: WashingMachine },
    ],
  },
  {
    kind: "group",
    key: "operacao-grp",
    title: "Operação",
    icon: Factory,
    items: [
      { key: "dashboard-chamados", title: "Dashboard de Chamados", short: "Chamados", url: "/dashboard-chamados", icon: ChartColumn },
      { key: "backorder", title: "Backorders", short: "Backorder", url: "/backorder", icon: PackageOpen },
      { key: "clima-tempo", title: "Clima e Tempo", short: "Clima", url: "/clima-tempo", icon: CloudSun },
      { key: "painel-legal", title: "Painel de Itens Legais", short: "Legal", url: "/painel-legal", icon: Scale },
    ],
  },
  {
    kind: "group",
    key: "refrigeracao-grp",
    title: "Refrigeração",
    icon: Snowflake,
    items: [
      { key: "refrigeracao", title: "Campo (Colaborador)", short: "Refrig.", url: "/refrigeracao", icon: Thermometer },
      { key: "refrigeracao-pecas-status", title: "Status de Peças", short: "Peças", url: "/refrigeracao-pecas-status", icon: PackageOpen },
      { key: "refrigeracao-historico", title: "Histórico de OS", short: "Histórico", url: "/refrigeracao-historico", icon: ScrollText },
      { key: "refrigeracao-gestor", title: "Gestão", short: "Gestão", url: "/refrigeracao-gestor", icon: Users },
    ],
  },
  {
    kind: "group",
    key: "preventiva-ac-grp",
    title: "Preventiva AC",
    icon: Fan,
    items: [
      { key: "preventiva-ac", title: "Cadastro PMOC", short: "PMOC", url: "/preventiva-ac", icon: AirVent },
    ],
  },
  {
    kind: "group",
    key: "corretiva-grp",
    title: "Corretiva",
    icon: Wrench,
    items: [
      { key: "corretiva", title: "Campo (Colaborador)", short: "Corretiva", url: "/corretiva", icon: Wrench },
      { key: "corretiva-pecas-status", title: "Status de Peças", short: "Peças", url: "/corretiva-pecas-status", icon: PackageOpen },
      { key: "corretiva-historico", title: "Histórico de OS", short: "Histórico", url: "/corretiva-historico", icon: ScrollText },
      { key: "corretiva-gestor", title: "Gestão", short: "Gestão", url: "/corretiva-gestor", icon: Users },
    ],
  },
  {
    kind: "group",
    key: "suprimentos-grp",
    title: "Suprimentos",
    icon: PackageOpen,
    items: [
      {
        key: "controle-materiais",
        title: "Controle de Materiais",
        short: "Materiais",
        url: "/controle-materiais",
        icon: ClipboardList,
      },
    ],
  },
  {
    kind: "item",
    item: { key: "configuracoes", title: "Configurações", short: "Config.", url: "/configuracoes", icon: Cog },
  },
];


/** Ordem de preferência dos atalhos da barra inferior no mobile. */
const QUICK_KEYS = [
  "corretiva",
  "refrigeracao",
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
 * Compartilhado entre a sidebar (desktop) e a barra inferior (mobile).
 */
export function useVisibleSections() {
  const { isAdmin, loading: loadingAdmin } = useIsAdmin();
  const { allowed, loading: loadingAllowed } = useAllowedMenus();
  const loading = loadingAdmin || loadingAllowed;

  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setOwnerEmail(data.session?.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) =>
      setOwnerEmail(s?.user?.email ?? null),
    );
    return () => sub.subscription.unsubscribe();
  }, []);
  const isOwner = (ownerEmail ?? "").trim().toLowerCase() === "gabrielvlp33@gmail.com";

  const visibleSections = useMemo<MenuSection[]>(() => {
    if (loading) return [];
    const canSee = (key: string) => {
      if (key === "configuracoes") return isOwner;
      if (key === "refrigeracao-gestor") return isOwner || isAdmin;
      if (key === "corretiva-gestor") return isOwner || isAdmin;
      return isAdmin ? true : !allowed || allowed.includes(key);
    };
    const out: MenuSection[] = [];
    for (const s of sections) {
      if (s.kind === "item") {
        if (canSee(s.item.key)) out.push(s);
      } else {
        const items = s.items.filter((i) => canSee(i.key));
        if (items.length > 0) out.push({ ...s, items });
      }
    }
    return out;
  }, [loading, isAdmin, allowed, isOwner]);

  /** Até 3 atalhos rápidos (fora o Dashboard) para a barra inferior. */
  const quickItems = useMemo<MenuItem[]>(() => {
    const flat: MenuItem[] = [];
    for (const s of visibleSections) {
      if (s.kind === "item") flat.push(s.item);
      else flat.push(...s.items);
    }
    const byKey = new Map(flat.map((i) => [i.key, i]));
    const picked: MenuItem[] = [];
    for (const key of QUICK_KEYS) {
      const item = byKey.get(key);
      if (item) picked.push(item);
      if (picked.length === 3) break;
    }
    if (picked.length < 3) {
      for (const item of flat) {
        if (item.key === "dashboard") continue;
        if (picked.some((p) => p.key === item.key)) continue;
        picked.push(item);
        if (picked.length === 3) break;
      }
    }
    return picked;
  }, [visibleSections]);

  const hasDashboard = visibleSections.some((s) => s.kind === "item" && s.item.key === "dashboard");

  return { visibleSections, quickItems, hasDashboard, loading };
}

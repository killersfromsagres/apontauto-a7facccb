import { memo, useMemo, useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Gauge,
  CalendarRange,
  CalendarDays,
  CalendarClock,
  Hammer,
  Map,
  PenLine,
  ShieldAlert,
  HardHat,
  WashingMachine,
  Shirt,
  Factory,
  ChartColumn,
  PackageOpen,
  CloudSun,
  CloudRainWind,
  Scale,
  Snowflake,
  Thermometer,
  ScrollText,
  Users,
  Fan,
  AirVent,
  Wrench,
  Cog,
  Zap,
  Clock,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const logoAsset = { url: "/apontauto-logo.png" };

import { useIsAdmin } from "@/hooks/use-is-admin";
import { useAllowedMenus } from "@/hooks/use-allowed-menus";
import { supabase } from "@/integrations/supabase/client";

type MenuItem = {
  key: string;
  title: string;
  url: string;
  icon: LucideIcon;
};

type MenuSection =
  | { kind: "item"; item: MenuItem }
  | { kind: "group"; key: string; title: string; icon: LucideIcon; items: MenuItem[] };

const sections: MenuSection[] = [
  {
    kind: "item",
    item: { key: "dashboard", title: "Dashboard", url: "/", icon: Gauge },
  },
  {
    kind: "group",
    key: "programacao-grp",
    title: "Programação",
    icon: CalendarRange,
    items: [
      { key: "programacao", title: "Programação Semanal", url: "/programacao", icon: CalendarDays },
      { key: "preventiva", title: "Preventiva (legado)", url: "/preventiva", icon: CalendarClock },
      
      { key: "taludes", title: "Programação de Taludes", url: "/taludes", icon: Map },
      { key: "apontamentos", title: "Apontamentos", url: "/apontamentos", icon: PenLine },
      { key: "prisma", title: "Painel Prisma", url: "/prisma", icon: Zap },
    ],
  },
  {
    kind: "group",
    key: "seguranca-grp",
    title: "Segurança do Trabalho",
    icon: ShieldAlert,
    items: [
      { key: "seguranca-trabalho", title: "Segurança do Trabalho", url: "/seguranca-trabalho", icon: HardHat },
    ],
  },
  {
    kind: "group",
    key: "rouparia-grp",
    title: "Rouparia",
    icon: Shirt,
    items: [
      { key: "lavanderia", title: "Controle de Lavanderia", url: "/lavanderia", icon: WashingMachine },
    ],
  },
  {
    kind: "group",
    key: "operacao-grp",
    title: "Operação",
    icon: Factory,
    items: [
      { key: "dashboard-chamados", title: "Dashboard de Chamados", url: "/dashboard-chamados", icon: ChartColumn },
      { key: "backorder", title: "Backorders", url: "/backorder", icon: PackageOpen },
      { key: "clima-tempo", title: "Clima e Tempo", url: "/clima-tempo", icon: CloudSun },
      { key: "programacao-taludes", title: "Taludes (Clima)", url: "/programacao-taludes", icon: CloudRainWind },
      { key: "painel-legal", title: "Painel de Itens Legais", url: "/painel-legal", icon: Scale },
    ],
  },
  {
    kind: "group",
    key: "refrigeracao-grp",
    title: "Refrigeração",
    icon: Snowflake,
    items: [
      { key: "refrigeracao", title: "Campo (Colaborador)", url: "/refrigeracao", icon: Thermometer },
      { key: "refrigeracao-historico", title: "Histórico de OS", url: "/refrigeracao-historico", icon: ScrollText },
      { key: "refrigeracao-gestor", title: "Gestão", url: "/refrigeracao-gestor", icon: Users },
    ],
  },
  {
    kind: "group",
    key: "preventiva-ac-grp",
    title: "Preventiva AC",
    icon: Fan,
    items: [
      { key: "preventiva-ac", title: "Cadastro PMOC", url: "/preventiva-ac", icon: AirVent },
    ],
  },
  {
    kind: "group",
    key: "corretiva-grp",
    title: "Corretiva",
    icon: Wrench,
    items: [
      { key: "corretiva", title: "Campo (Colaborador)", url: "/corretiva", icon: Wrench },
      { key: "corretiva-historico", title: "Histórico de OS", url: "/corretiva-historico", icon: ScrollText },
      { key: "corretiva-gestor", title: "Gestão", url: "/corretiva-gestor", icon: Users },
    ],
  },
  {
    kind: "item",
    item: { key: "configuracoes", title: "Configurações", url: "/configuracoes", icon: Cog },
  },
];


export const AppSidebar = memo(function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { isAdmin, loading: loadingAdmin } = useIsAdmin();
  const { allowed, loading: loadingAllowed } = useAllowedMenus();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const loadingAccess = loadingAdmin || loadingAllowed;

  const [ownerEmail, setOwnerEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setOwnerEmail(data.session?.user?.email ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setOwnerEmail(s?.user?.email ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);
  const isOwner = (ownerEmail ?? "").trim().toLowerCase() === "gabrielvlp33@gmail.com";

  const visibleSections = useMemo<MenuSection[]>(() => {
    if (loadingAccess) return [];
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
  }, [loadingAccess, isAdmin, allowed, isOwner]);

  const isItemActive = (url: string) =>
    url === "/" ? currentPath === "/" : currentPath.startsWith(url);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60">
      <SidebarHeader className="border-b border-sidebar-border/50">
        <div className="flex items-center gap-2.5 px-2 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:gap-0 transition-[padding,gap] duration-200 ease-out">
          <div className="relative shrink-0 transition-all duration-200 ease-out h-10 w-10 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
            <img
              src={logoAsset.url}
              alt="Apont Auto — Sistema Automático de Apontamento"
              className="relative h-full w-full object-contain"
              width={40}
              height={40}
              decoding="async"
              loading="eager"
              fetchPriority="high"
            />
          </div>
          <div className="flex flex-col leading-tight overflow-hidden transition-all duration-200 ease-out group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
            <span className="shine-text font-display text-sm font-bold uppercase tracking-[0.18em] whitespace-nowrap">
              Apont Auto
            </span>
            <span className="shine-text font-mono text-[9px] uppercase tracking-[0.22em] whitespace-nowrap">
              In Haus Industrial
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/80">
            Módulos
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {visibleSections.map((section) =>
                section.kind === "item" ? (
                  <SimpleItem
                    key={section.item.url}
                    item={section.item}
                    active={isItemActive(section.item.url)}
                  />
                ) : (
                  <GroupItem
                    key={section.key}
                    section={section}
                    collapsed={collapsed}
                    isItemActive={isItemActive}
                  />
                ),
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
});

const SimpleItem = memo(function SimpleItem({ item, active }: { item: MenuItem; active: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={active}
        tooltip={item.title}
        className="group/item relative h-10 rounded-lg transition-all data-[active=true]:bg-gradient-to-r data-[active=true]:from-primary/20 data-[active=true]:to-primary/5 data-[active=true]:text-foreground data-[active=true]:shadow-inner"
      >
        <Link to={item.url} preload="intent" onClick={closeOnMobile} className="flex items-center gap-3">
          {active && (
            <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
          )}
          <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="truncate">{item.title}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
});


const GroupItem = memo(function GroupItem({
  section,
  collapsed,
  isItemActive,
}: {
  section: Extract<MenuSection, { kind: "group" }>;
  collapsed: boolean;
  isItemActive: (url: string) => boolean;
}) {
  const hasActive = section.items.some((i) => isItemActive(i.url));
  const [open, setOpen] = useState(hasActive);
  const { isMobile, setOpenMobile } = useSidebar();
  const closeOnMobile = () => {
    if (isMobile) setOpenMobile(false);
  };

  useEffect(() => {
    if (hasActive) setOpen(true);
  }, [hasActive]);

  if (collapsed) {
    const first = section.items[0];
    return (
      <SidebarMenuItem>
        <SidebarMenuButton
          asChild
          isActive={hasActive}
          tooltip={section.title}
          className="h-10 rounded-lg data-[active=true]:bg-gradient-to-r data-[active=true]:from-primary/20 data-[active=true]:to-primary/5"
        >
          <Link to={first.url} preload="intent" onClick={closeOnMobile} className="flex items-center gap-3">
            <section.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{section.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            tooltip={section.title}
            isActive={hasActive && !open}
            className="group/trigger h-10 rounded-lg transition-all data-[active=true]:bg-gradient-to-r data-[active=true]:from-primary/20 data-[active=true]:to-primary/5"
          >
            <section.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            <span className="truncate">{section.title}</span>
            <ChevronRight
              className="ml-auto h-4 w-4 shrink-0 transition-transform duration-200 data-[state=open]:rotate-90"
              data-state={open ? "open" : "closed"}
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden">
          <SidebarMenuSub className="mt-1 border-l border-sidebar-border/50">
            {section.items.map((item) => {
              const active = isItemActive(item.url);
              return (
                <SidebarMenuSubItem key={item.url}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={active}
                    className="group/subitem relative h-9 rounded-md transition-all data-[active=true]:bg-primary/15 data-[active=true]:text-foreground"
                  >
                    <Link to={item.url} preload="intent" onClick={closeOnMobile} className="flex items-center gap-2.5">
                      {active && (
                        <span className="absolute -left-[1px] top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
                      )}
                      <item.icon className="h-3.5 w-3.5 shrink-0 opacity-80" strokeWidth={1.75} />
                      <span className="truncate text-[13px]">{item.title}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
});


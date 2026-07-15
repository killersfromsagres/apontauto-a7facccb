import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarClock,
  Wrench,
  ShieldCheck,
  ClipboardCheck,
  Settings,
  LayoutDashboard,
  UserPlus,
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
} from "@/components/ui/sidebar";
import logoAsset from "@/assets/apontauto-logo.png.asset.json";

import { useIsAdmin } from "@/hooks/use-is-admin";

const baseItems = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Programação Preventiva", url: "/preventiva", icon: CalendarClock },
  { title: "Programação Corretiva", url: "/corretiva", icon: Wrench },
  { title: "Apontamentos", url: "/apontamentos", icon: ClipboardCheck },
  { title: "Painel de Itens Legais", url: "/painel-legal", icon: ShieldCheck },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

const adminItem = { title: "Usuários", url: "/usuarios", icon: UserPlus };

export function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string) => (url === "/" ? currentPath === "/" : currentPath.startsWith(url));
  const { isAdmin } = useIsAdmin();
  const items = isAdmin ? [...baseItems, adminItem] : baseItems;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60">
      <SidebarHeader className="border-b border-sidebar-border/50">
        <div className="flex items-center gap-2.5 px-2 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:gap-0 transition-[padding,gap] duration-200 ease-out">
          <div className="relative shrink-0 transition-all duration-200 ease-out h-10 w-10 group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
            <img
              src={logoAsset.url}
              alt="Apont Auto — Sistema Automático de Apontamento"
              className="relative h-full w-full object-contain"
              loading="eager"
            />
          </div>
          <div className="flex flex-col leading-tight overflow-hidden transition-all duration-200 ease-out group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
            <span className="shine-text font-display text-sm font-bold uppercase tracking-[0.18em] whitespace-nowrap">
              Apont Auto
            </span>
            <span className="shine-text font-mono text-[9px] uppercase tracking-[0.22em] whitespace-nowrap">
              Gabriel Vitor
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
              {items.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className="group/item relative h-10 rounded-lg transition-all data-[active=true]:bg-gradient-to-r data-[active=true]:from-primary/20 data-[active=true]:to-primary/5 data-[active=true]:text-foreground data-[active=true]:shadow-inner"
                    >
                      <Link to={item.url} preload="intent" className="flex items-center gap-3">
                        {active && (
                          <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 rounded-r-full bg-primary" />
                        )}
                        <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                        <span className="truncate">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

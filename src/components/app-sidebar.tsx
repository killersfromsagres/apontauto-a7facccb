import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarClock,
  Wrench,
  Droplets,
  SprayCan,
  Trees,
  ClipboardList,
  Settings,
  LayoutDashboard,
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
import logoAsset from "@/assets/gps-logo.png.asset.json";

const items = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Programação Preventiva", url: "/preventiva", icon: CalendarClock },
  { title: "Programação Corretiva", url: "/corretiva", icon: Wrench },
  { title: "Abastecimento", url: "/abastecimento", icon: Droplets },
  { title: "Limpeza", url: "/limpeza", icon: SprayCan },
  { title: "Jardinagem", url: "/jardinagem", icon: Trees },
  { title: "Outros Serviços", url: "/outros", icon: ClipboardList },
  { title: "Configurações", url: "/configuracoes", icon: Settings },
];

export function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (url: string) => (url === "/" ? currentPath === "/" : currentPath.startsWith(url));

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border/60">
      <SidebarHeader className="border-b border-sidebar-border/50">
        <div className="flex items-center gap-2.5 px-2 py-3">
          <div className="relative shrink-0">
            <div className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary to-primary-glow blur-md opacity-80" />
            <img
              src={logoAsset.url}
              alt="Grupo GPS · Planejador de Manutenção"
              className="relative h-9 w-9 rounded-lg object-contain bg-background/40 ring-1 ring-primary/30"
              loading="eager"
              width={36}
              height={36}
            />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="font-display text-sm font-bold tracking-wider">Grupo GPS</span>
            <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-primary/80">
              Planejador · Manutenção
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
                      <Link to={item.url} className="flex items-center gap-3">
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

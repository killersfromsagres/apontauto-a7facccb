import { memo, useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const logoAsset = { url: "/apontauto-logo.png" };

import { useVisibleSections, type MenuItem, type MenuSection } from "@/lib/nav-config";

export const AppSidebar = memo(function AppSidebar() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { visibleSections } = useVisibleSections();

  const isItemActive = (url: string) =>
    url === "/" ? currentPath === "/" : currentPath.startsWith(url);

  return (
    <Sidebar collapsible="icon" variant="floating" className="premium-app-sidebar border-sidebar-border/60">
      <SidebarHeader className="premium-sidebar-header border-b border-sidebar-border/50">
        <div className="flex items-center gap-2.5 px-2 py-3 transition-[padding,gap] duration-200 ease-out group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:px-0">
          <div className="premium-logo-tile relative h-10 w-10 shrink-0 p-1 transition-all duration-200 ease-out group-data-[collapsible=icon]:h-8 group-data-[collapsible=icon]:w-8">
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
          <div className="flex flex-col overflow-hidden leading-tight transition-all duration-200 ease-out group-data-[collapsible=icon]:w-0 group-data-[collapsible=icon]:opacity-0">
            <span className="whitespace-nowrap font-display text-sm font-semibold tracking-[-0.01em] text-foreground">
              Apont Auto
            </span>
            <span className="mt-0.5 whitespace-nowrap text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              In Haus Industrial
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            Navegação
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
        className="premium-nav-item group/item relative h-10 rounded-xl transition-[background-color,border-color,box-shadow,color] duration-200 data-[active=true]:text-foreground"
      >
        <Link
          to={item.url}
          preload="intent"
          onClick={closeOnMobile}
          className="flex items-center gap-3"
        >
          {active && (
            <span className="absolute left-1 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary" />
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
          className="premium-nav-item h-10 rounded-xl transition-[background-color,border-color,box-shadow,color] duration-200"
        >
          <Link
            to={first.url}
            preload="intent"
            onClick={closeOnMobile}
            className="flex items-center gap-3"
          >
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
            className="premium-nav-item group/trigger h-10 rounded-xl transition-[background-color,border-color,box-shadow,color] duration-200"
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
                    className="premium-nav-item group/subitem relative h-9 rounded-lg transition-[background-color,border-color,box-shadow,color] duration-200 data-[active=true]:text-foreground"
                  >
                    <Link
                      to={item.url}
                      preload="intent"
                      onClick={closeOnMobile}
                      className="flex items-center gap-2.5"
                    >
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

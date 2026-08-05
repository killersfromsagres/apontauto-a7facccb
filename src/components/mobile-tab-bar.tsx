import { memo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Home, Crown, Bell, PlusCircle, Wrench, Thermometer, CalendarDays } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { useVisibleSections } from "@/lib/nav-config";
import { cn } from "@/lib/utils";

/**
 * Barra de navegação inferior — só no mobile.
 * Coloca as ações principais na zona de alcance do polegar (uso com uma mão)
 * e evita depender do menu lateral para trocar de módulo.
 */
export const MobileTabBar = memo(function MobileTabBar() {
  const { isMobile, openMobile, toggleSidebar } = useSidebar();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { canAccess, quickItems, loading } = useVisibleSections();

  if (!isMobile || loading) return null;

  const isActive = (url: string) =>
    url === "/" ? currentPath === "/" : currentPath.startsWith(url);

  const hasGestao = canAccess("gestao-executiva");

  return (
    <nav
      aria-label="Navegação principal"
      data-mobile-tabbar=""
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background/80 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1.5">
        <TabLink
          to="/"
          label="Início"
          active={isActive("/")}
          icon={<Home className="h-5 w-5" strokeWidth={1.8} />}
        />

        {quickItems.map((item) => (
          <TabLink
            key={item.key}
            to={item.url}
            label={item.short || item.title}
            active={isActive(item.url)}
            icon={<item.icon className="h-5 w-5" strokeWidth={1.8} />}
          />
        ))}

        <li className="flex-1">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label="Abrir menu de módulos"
            aria-expanded={openMobile}
            className={cn("imenu__item", openMobile && "is-active")}
          >
            <span className="imenu__icon">
              <LayoutGrid className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <span className="imenu__label">Menu</span>
            <span aria-hidden className="imenu__line" />
          </button>
        </li>
      </ul>
    </nav>
  );
});


function TabLink({
  to,
  label,
  icon,
  active,
  onClick,
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick?: () => void;
}) {
  const content = (
    <div className={cn("imenu__item", active && "is-active")}>
      <span className="imenu__icon">{icon}</span>
      <span className="imenu__label">{label}</span>
      <span aria-hidden className="imenu__line" />
    </div>
  );

  return (
    <li className="flex-1">
      {onClick ? (
        <button type="button" onClick={onClick} className="w-full focus-visible:outline-none">
          {content}
        </button>
      ) : (
        <Link to={to} preload="intent" aria-current={active ? "page" : undefined}>
          {content}
        </Link>
      )}
    </li>
  );
}


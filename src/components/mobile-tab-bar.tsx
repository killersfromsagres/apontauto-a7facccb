import { memo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid } from "lucide-react";
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
  const { quickItems, hasDashboard, loading } = useVisibleSections();

  if (!isMobile || loading) return null;

  const isActive = (url: string) =>
    url === "/" ? currentPath === "/" : currentPath.startsWith(url);

  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 pb-[max(env(safe-area-inset-bottom),0.25rem)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1">
        {hasDashboard && (
          <TabLink
            to="/"
            label="Início"
            active={isActive("/")}
            icon={
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 10.5 12 3l9 7.5" />
                <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
              </svg>
            }
          />
        )}
        {quickItems.map((item) => (
          <TabLink
            key={item.key}
            to={item.url}
            label={item.short ?? item.title}
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
            className={cn(
              "flex min-h-[3.25rem] w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors",
              openMobile ? "text-primary" : "text-muted-foreground",
            )}
          >
            <LayoutGrid className="h-5 w-5" strokeWidth={1.8} />
            <span className="max-w-full truncate">Menu</span>
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
}: {
  to: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
}) {
  return (
    <li className="flex-1">
      <Link
        to={to}
        preload="intent"
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex min-h-[3.25rem] w-full flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors",
          active ? "text-primary" : "text-muted-foreground",
        )}
      >
        {active && (
          <span
            aria-hidden
            className="absolute top-0 h-0.5 w-8 rounded-full bg-primary"
          />
        )}
        {icon}
        <span className="max-w-full truncate">{label}</span>
      </Link>
    </li>
  );
}

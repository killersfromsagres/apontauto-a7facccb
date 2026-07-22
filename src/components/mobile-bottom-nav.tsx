import { memo, useMemo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Gauge,
  CalendarDays,
  PenLine,
  ChartColumn,
  PackageOpen,
  Thermometer,
  Wrench,
  WashingMachine,
  HardHat,
  Menu,
  type LucideIcon,
} from "lucide-react";

import { useSidebar } from "@/components/ui/sidebar";
import { useMyAccess } from "@/hooks/use-my-access";
import { cn } from "@/lib/utils";

type Tab = { key: string; label: string; url: string; icon: LucideIcon };

// Ordem por relevância operacional. Filtramos por permissão e cortamos em 4
// para deixar espaço ao botão "Menu" — 5 slots totais é o ideal em mobile.
const ALL_TABS: Tab[] = [
  { key: "dashboard", label: "Início", url: "/", icon: Gauge },
  { key: "programacao", label: "Programação", url: "/programacao", icon: CalendarDays },
  { key: "apontamentos", label: "Apontar", url: "/apontamentos", icon: PenLine },
  { key: "dashboard-chamados", label: "Chamados", url: "/dashboard-chamados", icon: ChartColumn },
  { key: "backorder", label: "Backorder", url: "/backorder", icon: PackageOpen },
  { key: "refrigeracao", label: "Refrigeração", url: "/refrigeracao", icon: Thermometer },
  { key: "corretiva", label: "Corretiva", url: "/corretiva", icon: Wrench },
  { key: "lavanderia", label: "Rouparia", url: "/lavanderia", icon: WashingMachine },
  { key: "seguranca-trabalho", label: "SST", url: "/seguranca-trabalho", icon: HardHat },
];

export const MobileBottomNav = memo(function MobileBottomNav() {
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { access, loading } = useMyAccess();
  const { setOpenMobile } = useSidebar();

  const tabs = useMemo<Tab[]>(() => {
    if (loading) return [];
    const canSee = (key: string) => {
      if (access.isAdmin) return true;
      if (!access.allowed) return true;
      return access.allowed.includes(key);
    };
    return ALL_TABS.filter((t) => canSee(t.key)).slice(0, 4);
  }, [access, loading]);

  const isActive = (url: string) =>
    url === "/" ? currentPath === "/" : currentPath.startsWith(url);

  return (
    <nav
      aria-label="Navegação principal"
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 md:hidden",
        "border-t border-border/60 bg-background/85 backdrop-blur-xl",
        "supports-[backdrop-filter]:bg-background/65",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <ul className="mx-auto grid max-w-md grid-cols-5 px-1">
        {tabs.map((t) => {
          const active = isActive(t.url);
          const Icon = t.icon;
          return (
            <li key={t.key} className="flex">
              <Link
                to={t.url}
                preload="intent"
                className={cn(
                  "relative flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5",
                  "text-[10px] font-medium leading-none tracking-wide",
                  "transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-x-4 top-0 h-0.5 rounded-b-full bg-primary"
                  />
                )}
                <Icon
                  className={cn("h-5 w-5 shrink-0", active && "drop-shadow-[0_0_6px_hsl(var(--primary)/0.55)]")}
                  strokeWidth={active ? 2.1 : 1.75}
                />
                <span className="truncate">{t.label}</span>
              </Link>
            </li>
          );
        })}

        <li className="flex">
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            aria-label="Abrir menu completo"
            className={cn(
              "relative flex min-h-[56px] w-full flex-col items-center justify-center gap-0.5 px-1 py-1.5",
              "text-[10px] font-medium leading-none tracking-wide",
              "text-muted-foreground transition-colors hover:text-foreground",
              "active:scale-95",
            )}
          >
            <Menu className="h-5 w-5 shrink-0" strokeWidth={1.75} />
            <span className="truncate">Menu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
});

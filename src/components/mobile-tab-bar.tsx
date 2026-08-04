import { memo, useMemo } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutGrid, Home, Crown, Bell, PlusCircle, Droplets, Fuel } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { sections } from "@/lib/nav-config";
import { useMyAccess } from "@/hooks/use-my-access";
import { cn } from "@/lib/utils";

/**
 * Barra de navegação inferior — só no mobile.
 * Coloca as ações principais na zona de alcance do polegar (uso com uma mão)
 * e evita depender do menu lateral para trocar de módulo.
 */
export const MobileTabBar = memo(function MobileTabBar() {
  const { isMobile, openMobile, toggleSidebar } = useSidebar();
  const currentPath = useRouterState({ select: (r) => r.location.pathname });
  const { access, loading } = useMyAccess();

  if (!isMobile || loading) return null;

  const isActive = (url: string) =>
    url === "/" ? currentPath === "/" : currentPath.startsWith(url);

  const canAccess = (key: string) => {
    if (access.isAdmin) return true;
    return access.allowed?.includes(key);
  };

  // Ícones dinâmicos com base nas permissões
  const dynamicTabs = useMemo(() => {
    const tabs = [];

    // Prioridade 1: Água (para quem tem acesso a abastecimento)
    if (canAccess("agua-execucao") || canAccess("abastecimento")) {
      tabs.push({
        to: "/abastecimento/agua",
        label: "Água",
        icon: <Droplets className="h-5 w-5" strokeWidth={1.8} />,
        active: isActive("/abastecimento/agua"),
      });
    }

    // Prioridade 2: Frota (para quem tem acesso a frota)
    if (canAccess("abastecimento") || canAccess("frota")) {
      tabs.push({
        to: "/frota",
        label: "Frota",
        icon: <Fuel className="h-5 w-5" strokeWidth={1.8} />,
        active: isActive("/frota"),
      });
    }

    // Se o usuário não tiver nem água nem frota, mantém o Início padrão
    if (tabs.length === 0) {
      tabs.push({
        to: "/",
        label: "Início",
        icon: <Home className="h-5 w-5" strokeWidth={1.8} />,
        active: isActive("/"),
      });
    }


    return tabs;
  }, [access, currentPath]);

  return (
    <nav
      aria-label="Navegação principal"
      data-mobile-tabbar=""
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/40 bg-background/80 pb-[max(env(safe-area-inset-bottom),0.5rem)] backdrop-blur-xl md:hidden"
    >
      <ul className="mx-auto flex max-w-lg items-stretch justify-around px-1 pt-1.5">
        {dynamicTabs.map((tab) => (
          <TabLink
            key={tab.to}
            to={tab.to}
            label={tab.label}
            active={tab.active}
            icon={tab.icon}
          />
        ))}

        <TabLink
          to="#"
          label="Ações"
          active={false}
          onClick={() => {
            /* Drawer de Ações Rápidas */
          }}
          icon={<PlusCircle className="h-5 w-5" strokeWidth={1.8} />}
        />

        <TabLink
          to="/notificacoes"
          label="Avisos"
          active={isActive("/notificacoes")}
          icon={<Bell className="h-5 w-5" strokeWidth={1.8} />}
        />

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


import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Calendar,
  Camera,
  Droplets,
  Filter,
  History,
  LayoutDashboard,
  MapPin,
  Route as RouteIcon,

  PackageCheck,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { cn } from "@/lib/utils";
import { useAguaSync } from "@/features/water-delivery/offline/offline";

export const Route = createFileRoute("/_authenticated/abastecimento/agua")({
  head: () => ({
    meta: [
      { title: "Abastecimento de Água | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Programação, rota do dia, controle de bags, evidências, solicitações de filtro e indicadores da entrega de água por prédio, andar e espaço.",
      },
      { property: "og:title", content: "Abastecimento de Água | Apont Auto PCM" },
      {
        property: "og:description",
        content:
          "Execução mobile-first das entregas de bags com evidências fotográficas, histórico auditável e indicadores operacionais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AguaLayout,
});

const TABS: { to: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { to: "/abastecimento/agua", label: "Visão Geral", icon: LayoutDashboard, exact: true },
  { to: "/abastecimento/agua/pontos", label: "Pontos de Entrega", icon: MapPin },
  { to: "/abastecimento/agua/programacao", label: "Programação", icon: Calendar },
  { to: "/abastecimento/agua/rotas", label: "Rotas", icon: RouteIcon },



  { to: "/abastecimento/agua/rota", label: "Rota do Dia", icon: Droplets },
  { to: "/abastecimento/agua/bags", label: "Controle de Bags", icon: PackageCheck },
  { to: "/abastecimento/agua/evidencias", label: "Evidências", icon: Camera },
  { to: "/abastecimento/agua/filtros", label: "Solicitações de Filtro", icon: Filter },
  { to: "/abastecimento/agua/historico", label: "Histórico", icon: History },
  { to: "/abastecimento/agua/indicadores", label: "Indicadores", icon: BarChart3 },
  { to: "/abastecimento/agua/configuracoes", label: "Configurações", icon: Settings },
];

function AguaLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { pendentes, online, sincronizando } = useAguaSync();

  return (
    <PageShell
      title="Abastecimento de Água"
      description="Programação semanal, execução em campo e histórico auditável das entregas de bags."
    >
      {(!online || pendentes > 0) && (
        <div
          className={cn(
            "mb-3 flex items-center gap-2 rounded-2xl border px-3 py-2 text-xs",
            online
              ? "border-sky-400/40 bg-sky-500/10 text-sky-200"
              : "border-amber-400/40 bg-amber-500/10 text-amber-200",
          )}
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
          </span>
          {online
            ? `${pendentes} registro(s) aguardando envio${sincronizando ? " — sincronizando…" : ""}`
            : `Sem conexão — ${pendentes} registro(s) salvo(s) no aparelho`}
        </div>
      )}

      <nav className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors",
                active
                  ? "border-primary/60 bg-primary/15 text-primary"
                  : "border-border/60 bg-card/40 text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="h-4 w-4" />
              {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </PageShell>
  );
}

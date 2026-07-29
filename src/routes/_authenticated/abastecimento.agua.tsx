import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Droplets, Filter, History } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/abastecimento/agua")({
  head: () => ({
    meta: [
      { title: "Entrega de Água | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Programação semanal de entrega de água por prédio, andar e espaço, com execução em campo, evidências e histórico auditável.",
      },
      { property: "og:title", content: "Entrega de Água | Apont Auto PCM" },
      {
        property: "og:description",
        content:
          "Rota diária de bags de água com status, bags entregues, foto de evidência e histórico de execução.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AguaLayout,
});

const TABS: { to: string; label: string; icon: typeof Droplets; exact?: boolean }[] = [
  { to: "/abastecimento/agua", label: "Rota do dia", icon: Droplets, exact: true },
  { to: "/abastecimento/agua/filtros", label: "Pontos e filtros", icon: Filter },
  { to: "/abastecimento/agua/historico", label: "Histórico", icon: History },
];

function AguaLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <PageShell
      title="Entrega de Água"
      description="Programação semanal, execução em campo e histórico auditável das entregas de bags."
    >
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

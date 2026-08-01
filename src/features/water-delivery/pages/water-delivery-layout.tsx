import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { ClipboardList, History, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { cn } from "@/lib/utils";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useAguaSync } from "@/features/water-delivery/offline/offline";

type Tab = { to: string; label: string; icon: LucideIcon; exact?: boolean; adminOnly?: boolean };

const TABS: Tab[] = [
  { to: "/abastecimento/agua", label: "Programação do Dia", icon: ClipboardList, exact: true },
  { to: "/abastecimento/agua/historico", label: "Histórico", icon: History },
  { to: "/abastecimento/agua/gestao", label: "Gestão (Admin)", icon: ShieldCheck, adminOnly: true },
];

export function WaterDeliveryLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { pendentes, online, sincronizando } = useAguaSync();
  const { isAdmin } = useIsAdmin();
  const tabs = TABS.filter((t) => !t.adminOnly || isAdmin);

  return (
    <PageShell
      title="Abastecimento de Água"
      description="Programação diária das entregas de bags, com equipe, carro e foto como comprovação."
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
        {tabs.map((t) => {
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

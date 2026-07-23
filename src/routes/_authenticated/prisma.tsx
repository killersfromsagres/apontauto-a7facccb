import { createFileRoute, Outlet, Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Plus, Users2, History, Settings2, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/prisma")({
  component: PrismaLayout,
});

const tabs = [
  { to: "/prisma", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/prisma/novo", label: "Novo Lote", icon: Plus },
  { to: "/prisma/tecnicos", label: "Técnicos & Equipes", icon: Users2 },
  { to: "/prisma/execucoes", label: "Execuções", icon: History },
  { to: "/prisma/configuracoes", label: "Configurações", icon: Settings2 },
] as const;

function PrismaLayout() {
  const path = useRouterState({ select: (r) => r.location.pathname });
  return (
    <div className="min-h-full bg-[#0A0A0C] text-white">
      {/* Glow de fundo */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/3 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/15 to-pink-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[400px] w-[400px] rounded-full bg-gradient-to-tr from-purple-600/15 to-blue-500/10 blur-3xl" />
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
        <header className="mb-6 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/[0.06] backdrop-blur-2xl ring-1 ring-white/10">
            <Zap className="h-5 w-5 text-blue-300" strokeWidth={1.75} />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Painel Prisma
              </span>
            </h1>
            <p className="text-xs text-white/60 sm:text-sm">
              Cadastro de lotes e monitoramento em tempo real — execução acontece na extensão.
            </p>
          </div>
        </header>

        <nav className="mb-6 flex flex-wrap gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 backdrop-blur-2xl">
          {tabs.map((t) => {
            const active = t.exact ? path === t.to : path.startsWith(t.to);
            return (
              <Link
                key={t.to}
                to={t.to}
                preload="intent"
                className={cn(
                  "group relative flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition active:scale-95",
                  active
                    ? "bg-white/10 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]"
                    : "text-white/60 hover:bg-white/[0.06] hover:text-white",
                )}
              >
                <t.icon className="h-4 w-4" strokeWidth={1.75} />
                <span>{t.label}</span>
              </Link>
            );
          })}
        </nav>

        <Outlet />
      </div>
    </div>
  );
}

// Auto-injected by the Supabase integration when this file does not exist.
import {
  createFileRoute,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router";
import { Loader2, LockKeyhole } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useMyAccess } from "@/hooks/use-my-access";
import { supabase } from "@/integrations/supabase/client";
import {
  allMenuItems,
  itemKeys,
  menuItemForPath,
  menuKeysForPath,
} from "@/lib/nav-config";

const SIGN_IN_ROUTE = "/auth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession reads the persisted local session and does not introduce a
    // blocking network round-trip on every navigation. Supabase/RLS remains
    // the source of truth for all protected data calls.
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) {
      throw redirect({ to: SIGN_IN_ROUTE });
    }
    return { user: data.session.user };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const { access, loading } = useMyAccess();
  const knownSection = menuItemForPath(pathname);
  const pathKeys = menuKeysForPath(pathname) ?? [];
  const canView =
    access.isAdmin ||
    !knownSection ||
    pathKeys.some((key) => access.allowed?.includes(key));

  if (loading) {
    return (
      <div className="flex min-h-[55vh] items-center justify-center gap-2 px-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Verificando permissões…
      </div>
    );
  }

  if (!canView) {
    const firstAllowed = allMenuItems.find(
      (item) =>
        item.url !== "#" &&
        item.key !== "usuarios" &&
        itemKeys(item).some((key) => access.allowed?.includes(key)),
    );

    return (
      <div className="flex min-h-[55vh] items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border border-border/60 bg-card/60 p-6 text-center backdrop-blur-xl">
          <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500">
            <LockKeyhole className="h-5 w-5" />
          </div>
          <h1 className="text-lg font-semibold tracking-tight">Seção não liberada</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Este login não possui permissão de visualização para esta seção. Um administrador
            pode ajustar o acesso no Controle de Usuários.
          </p>
          {firstAllowed && (
            <Button asChild className="mt-5">
              <a href={firstAllowed.url}>Abrir primeira seção permitida</a>
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <>
      {pathname === "/corretiva-novo" && (
        <style>{`
          /* Corretiva Novo — hierarquia compacta dos identificadores do card. */
          .mb-3.flex.flex-wrap.items-center.justify-between > .font-mono {
            height: 28px !important;
            padding: 0 10px !important;
            font-size: 11px !important;
            font-weight: 700 !important;
            letter-spacing: 0.025em !important;
            border-radius: 9999px !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18) !important;
          }

          .mb-3.flex.flex-wrap.items-center.justify-between > div:has(> [title^="Score "]) {
            gap: 5px !important;
          }

          [title^="Equipe responsável:"] {
            order: 1 !important;
            height: 28px !important;
            max-width: min(100%, 180px) !important;
            padding: 0 10px !important;
            font-size: 10px !important;
            font-weight: 700 !important;
            letter-spacing: 0.025em !important;
            border-radius: 9999px !important;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18) !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
          }

          [title^="Score "] {
            order: 2 !important;
            height: 21px !important;
            padding: 0 7px !important;
            font-size: 9px !important;
            font-weight: 700 !important;
            line-height: 1 !important;
            letter-spacing: 0.025em !important;
            border-radius: 9999px !important;
            box-shadow: none !important;
          }

          [title^="Backorder"] {
            order: 3 !important;
            height: 20px !important;
            padding: 0 7px !important;
            font-size: 8px !important;
            font-weight: 700 !important;
            line-height: 1 !important;
            letter-spacing: 0.04em !important;
            border-color: rgba(248, 113, 113, 0.42) !important;
            background: rgba(220, 38, 38, 0.88) !important;
            box-shadow: none !important;
          }

          [class*="border-emerald-500/35"] {
            order: 4 !important;
            height: 20px !important;
            padding-left: 7px !important;
            padding-right: 7px !important;
            font-size: 8px !important;
            box-shadow: none !important;
          }
        `}</style>
      )}
      <Outlet />
    </>
  );
}

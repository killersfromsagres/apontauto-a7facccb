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
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: SIGN_IN_ROUTE });
    }
    return { user: data.user };
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

  return <Outlet />;
}

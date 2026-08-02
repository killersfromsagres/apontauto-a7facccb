import { createFileRoute } from "@tanstack/react-router";

import { WaterAdminPanel } from "@/features/water-delivery/pages/water-admin-panel";
import { useIsAdmin } from "@/hooks/use-is-admin";

function GestaoAgua() {
  const { isAdmin, loading } = useIsAdmin();

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Verificando permissões…
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-4 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold tracking-tight">Área restrita</h1>
          <p className="text-sm text-muted-foreground">
            A gestão do abastecimento de água é exclusiva de administradores.
          </p>
        </div>
      </div>
    );
  }

  return <WaterAdminPanel />;
}

export const Route = createFileRoute("/_authenticated/abastecimento/agua/gestao")({
  component: GestaoAgua,
});

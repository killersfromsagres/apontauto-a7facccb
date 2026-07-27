import { createFileRoute, Navigate } from "@tanstack/react-router";
import { DashboardChamadosView } from "@/components/dashboard-chamados/dashboard-chamados-view";
import { useVisibleSections } from "@/lib/nav-config";

function HomeRoute() {
  const { visibleSections, hasDashboard, loading } = useVisibleSections();

  if (loading) return null;
  if (hasDashboard) return <DashboardChamadosView />;

  // Usuário sem acesso ao dashboard: leva para o primeiro módulo permitido.
  const first = visibleSections.flatMap((s) => (s.kind === "item" ? [s.item] : s.items))[0];
  if (!first) return null;
  return <Navigate to={first.url} replace />;
}

export const Route = createFileRoute("/_authenticated/")({
  component: HomeRoute,
});

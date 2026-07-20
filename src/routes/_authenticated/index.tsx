import { createFileRoute } from "@tanstack/react-router";
import { DashboardChamadosView } from "@/components/dashboard-chamados/dashboard-chamados-view";

export const Route = createFileRoute("/_authenticated/")({
  component: DashboardChamadosView,
});

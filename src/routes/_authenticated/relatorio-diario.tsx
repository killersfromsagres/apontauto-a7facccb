import { createFileRoute } from "@tanstack/react-router";

import { WeeklyPlanningReport } from "@/features/relatorio-diario/weekly-planning-report";

export const Route = createFileRoute("/_authenticated/relatorio-diario")({
  component: WeeklyPlanningReport,
});

import { createFileRoute } from "@tanstack/react-router";

import { DailyExecutionReport } from "@/features/relatorio-diario/daily-execution-report";

export const Route = createFileRoute("/_authenticated/relatorio-diario")({
  component: DailyExecutionReport,
});

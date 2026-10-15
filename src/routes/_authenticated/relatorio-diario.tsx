import { createFileRoute } from "@tanstack/react-router";

import { WeeklyProgrammingBoard } from "@/features/relatorio-diario/weekly-programming-board";

export const Route = createFileRoute("/_authenticated/relatorio-diario")({
  component: WeeklyProgrammingBoard,
});

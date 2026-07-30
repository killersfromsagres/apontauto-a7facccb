import { createFileRoute } from "@tanstack/react-router";

import { WeeklyWaterPlanner } from "@/features/water-delivery/pages/weekly-water-planner";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/programacao")({
  component: WeeklyWaterPlanner,
});

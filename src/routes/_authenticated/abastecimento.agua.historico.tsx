import { createFileRoute } from "@tanstack/react-router";

import { WaterScheduleHistory } from "@/features/water-delivery/pages/water-schedule-history";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/historico")({
  component: WaterScheduleHistory,
});

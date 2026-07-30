import { createFileRoute } from "@tanstack/react-router";

import { WaterScheduleSimple } from "@/features/water-delivery/pages/water-schedule-simple";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/")({
  component: WaterScheduleSimple,
});

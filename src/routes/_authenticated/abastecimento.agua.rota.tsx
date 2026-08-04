import { createFileRoute } from "@tanstack/react-router";

import { RouteDayView } from "@/features/water-delivery/pages/route-day-view";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/rota")({
  component: RouteDayView,
});

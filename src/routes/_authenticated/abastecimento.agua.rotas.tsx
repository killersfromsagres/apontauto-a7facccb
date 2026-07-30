import { createFileRoute } from "@tanstack/react-router";

import { RoutePlannerView } from "@/features/water-delivery/pages/route-planner-view";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/rotas")({
  component: RoutePlannerView,
});

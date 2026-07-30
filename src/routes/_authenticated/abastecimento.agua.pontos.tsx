import { createFileRoute } from "@tanstack/react-router";

import { WaterLocationsView } from "@/features/water-delivery/pages/water-locations-view";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/pontos")({
  component: WaterLocationsView,
});

import { createFileRoute } from "@tanstack/react-router";

import { WaterDeliveryDashboard } from "@/features/water-delivery/pages/water-delivery-dashboard";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/")({
  component: WaterDeliveryDashboard,
});

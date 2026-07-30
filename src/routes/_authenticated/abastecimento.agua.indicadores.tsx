import { createFileRoute } from "@tanstack/react-router";

import { WaterDeliveryReports } from "@/features/water-delivery/pages/water-delivery-reports";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/indicadores")({
  component: WaterDeliveryReports,
});

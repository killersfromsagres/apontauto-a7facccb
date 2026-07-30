import { createFileRoute } from "@tanstack/react-router";

import { WaterAdminPanel } from "@/features/water-delivery/pages/water-admin-panel";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/gestao")({
  component: WaterAdminPanel,
});

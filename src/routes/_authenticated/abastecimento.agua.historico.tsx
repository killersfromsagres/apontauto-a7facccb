import { createFileRoute } from "@tanstack/react-router";

import { WaterHistoryView } from "@/features/water-delivery/pages/water-history-view";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/historico")({
  component: WaterHistoryView,
});

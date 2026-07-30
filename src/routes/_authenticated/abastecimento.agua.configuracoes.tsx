import { createFileRoute } from "@tanstack/react-router";

import { WaterSettingsView } from "@/features/water-delivery/pages/water-settings-view";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/configuracoes")({
  component: WaterSettingsView,
});

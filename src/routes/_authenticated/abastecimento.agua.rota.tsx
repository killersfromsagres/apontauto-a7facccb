import { createFileRoute } from "@tanstack/react-router";

import { RouteDayView } from "@/features/water-delivery/pages/route-day-view";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/rota")({
  head: () => ({
    title: "Rota do Dia | Abastecimento de Água",
    meta: [
      { name: "description", content: "Execução da rota de entrega de água com agrupamento por prédio e loop semanal." },
    ],
  }),
  component: RouteDayView,
});

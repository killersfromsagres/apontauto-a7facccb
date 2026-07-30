import { createFileRoute } from "@tanstack/react-router";

import { WaterDeliveryLayout } from "@/features/water-delivery/pages/water-delivery-layout";

export const Route = createFileRoute("/_authenticated/abastecimento/agua")({
  head: () => ({
    meta: [
      { title: "Abastecimento de Água | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Programação, rota do dia, controle de bags, evidências, solicitações de filtro e indicadores da entrega de água por prédio, andar e espaço.",
      },
      { property: "og:title", content: "Abastecimento de Água | Apont Auto PCM" },
      {
        property: "og:description",
        content:
          "Execução mobile-first das entregas de bags com evidências fotográficas, histórico auditável e indicadores operacionais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WaterDeliveryLayout,
});

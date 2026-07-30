import { createFileRoute } from "@tanstack/react-router";

import { FleetView } from "@/features/fleet/pages/fleet-view";

export const Route = createFileRoute("/_authenticated/frota")({
  head: () => ({
    meta: [
      { title: "Frota e Abastecimento | Apont Auto PCM" },
      {
        name: "description",
        content:
          "Checklist veicular com fotos, histórico de vistorias, controle financeiro de abastecimentos e cadastro de veículos da frota.",
      },
      { property: "og:title", content: "Frota e Abastecimento | Apont Auto PCM" },
      {
        property: "og:description",
        content:
          "Vistorias veiculares com evidências fotográficas, custos de combustível e cadastro completo dos veículos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: FleetView,
});

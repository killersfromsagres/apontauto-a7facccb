import { createFileRoute } from "@tanstack/react-router";
import { MaterialsOsView } from "@/components/materials/materials-os-view";

export const Route = createFileRoute("/_authenticated/materiais-os")({
  head: () => ({
    meta: [
      { title: "Materiais por OS — Apont Auto" },
      {
        name: "description",
        content:
          "Reserva de materiais vinculada às ordens de serviço com estoque mínimo, material crítico, lead time e impacto no SLA.",
      },
      { property: "og:title", content: "Materiais por OS — Apont Auto" },
      {
        property: "og:description",
        content:
          "Acompanhe quantidades solicitadas, separadas, entregues e consumidas por ordem de serviço e centro de custo.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MaterialsOsView,
});

import { createFileRoute } from "@tanstack/react-router";
import { CapacityView } from "@/components/capacity/capacity-view";

export const Route = createFileRoute("/_authenticated/programacao-capacidade")({
  head: () => ({
    meta: [
      { title: "Planejamento de Capacidade — Apont Auto" },
      {
        name: "description",
        content:
          "Visão semanal de capacidade das equipes com jornada, ausências, carga planejada versus executada e sugestão automática de programação.",
      },
      { property: "og:title", content: "Planejamento de Capacidade — Apont Auto" },
      {
        property: "og:description",
        content:
          "Compare horas disponíveis e horas programadas por equipe, identifique gargalos e redistribua ordens de serviço na semana.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CapacityView,
});

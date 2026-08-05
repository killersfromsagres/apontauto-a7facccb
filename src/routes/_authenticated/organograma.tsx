import { createFileRoute } from "@tanstack/react-router";
import { OrganogramaView } from "@/features/organograma/components/organograma-view";

export const Route = createFileRoute("/_authenticated/organograma")({
  head: () => ({
    meta: [
      { title: "Organograma — Apont Auto" },
      {
        name: "description",
        content: "Visualize e gerencie a hierarquia organizacional da equipe.",
      },
    ],
  }),
  component: OrganogramaView,
});

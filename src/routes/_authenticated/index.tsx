import { createFileRoute } from "@tanstack/react-router";
import { CentralInteligenciaView } from "@/features/inteligencia-pcm/components/central-inteligencia-view";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Menu Inicial — Apont Auto" },
      {
        name: "description",
        content: "Painel operacional e executivo unificado com monitoramento em tempo real.",
      },
    ],
  }),
  component: CentralInteligenciaView,
});

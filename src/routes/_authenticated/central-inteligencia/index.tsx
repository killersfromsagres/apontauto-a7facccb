import { createFileRoute } from "@tanstack/react-router";
import { CentralInteligenciaView } from "@/features/inteligencia-pcm/components/central-inteligencia-view";

export const Route = createFileRoute("/_authenticated/central-inteligencia")({
  head: () => ({
    meta: [
      { title: "Central de Inteligência PCM — Apont Auto" },
      {
        name: "description",
        content: "Dashboards inteligentes e monitoramento em tempo real da operação de manutenção.",
      },
    ],
  }),
  component: CentralInteligenciaView,
});

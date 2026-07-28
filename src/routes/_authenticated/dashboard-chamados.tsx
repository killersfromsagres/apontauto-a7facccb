import { createFileRoute } from "@tanstack/react-router";
import { DashboardChamadosView } from "@/components/dashboard-chamados/dashboard-chamados-view";

export const Route = createFileRoute("/_authenticated/dashboard-chamados")({
  head: () => ({
    meta: [
      { title: "Dashboard de Chamados — Apont Auto" },
      {
        name: "description",
        content:
          "Indicadores em tempo real dos chamados do Backorder: SLA, conclusão por equipe, solicitantes e prédios recorrentes.",
      },
      { property: "og:title", content: "Dashboard de Chamados — Apont Auto" },
      {
        property: "og:description",
        content:
          "Análise operacional dos chamados: SLA vencido, conclusão por equipe e insights automáticos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardChamadosView,
});

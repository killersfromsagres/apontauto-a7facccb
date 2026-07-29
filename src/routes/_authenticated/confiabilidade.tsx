import { createFileRoute } from "@tanstack/react-router";
import { ReliabilityView } from "@/components/reliability/reliability-view";

export const Route = createFileRoute("/_authenticated/confiabilidade")({
  head: () => ({
    meta: [
      { title: "Confiabilidade e Causa Raiz — Apont Auto" },
      {
        name: "description",
        content:
          "MTBF, MTTR, disponibilidade, Pareto de falhas, saúde dos ativos e análises de causa raiz com 5 Porquês e Ishikawa.",
      },
      { property: "og:title", content: "Confiabilidade e Causa Raiz — Apont Auto" },
      {
        property: "og:description",
        content:
          "Indicadores de confiabilidade por ativo e planos de ação derivados das análises de causa raiz.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ReliabilityView,
});

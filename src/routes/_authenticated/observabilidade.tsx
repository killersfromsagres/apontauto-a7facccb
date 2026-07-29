import { createFileRoute } from "@tanstack/react-router";
import { ObservabilityView } from "@/features/observability/components/observability-view";

export const Route = createFileRoute("/_authenticated/observabilidade")({
  head: () => ({
    meta: [
      { title: "Painel Técnico — Apont Auto" },
      {
        name: "description",
        content:
          "Observabilidade do sistema: erros de frontend, falhas de rotinas automáticas, saúde das integrações, uploads com erro, fila offline e tempo de resposta.",
      },
      { property: "og:title", content: "Painel Técnico — Apont Auto" },
      {
        property: "og:description",
        content:
          "Monitoramento técnico administrativo do Apont Auto, com detalhes visíveis apenas para a administração.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ObservabilityView,
});

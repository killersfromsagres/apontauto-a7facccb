import { createFileRoute } from "@tanstack/react-router";
import { GestaoView } from "@/features/gestao/components/gestao-view";

export const Route = createFileRoute("/_authenticated/gestao")({
  head: () => ({
    meta: [
      { title: "Centro de Gestão — Apont Auto" },
      {
        name: "description",
        content:
          "Visão executiva consolidada da operação: backorder, corretiva, refrigeração, água, frota, materiais, itens legais, saúde ocupacional e taludes.",
      },
      { property: "og:title", content: "Centro de Gestão — Apont Auto" },
      {
        property: "og:description",
        content:
          "Indicadores consolidados, riscos críticos e plano de ação da gestão do Apont Auto.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GestaoView,
});

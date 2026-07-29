import { createFileRoute } from "@tanstack/react-router";
import { QualityView } from "@/components/quality/quality-view";

export const Route = createFileRoute("/_authenticated/qualidade-dados")({
  head: () => ({
    meta: [
      { title: "Qualidade de Dados — Apont Auto" },
      {
        name: "description",
        content:
          "Central de qualidade de dados do PCM: pendências de cadastro, ordens sem ativo, CPF inválido, hodômetro regressivo e correção assistida rastreada.",
      },
      { property: "og:title", content: "Qualidade de Dados — Apont Auto" },
      {
        property: "og:description",
        content:
          "Detecte e corrija inconsistências que distorcem os indicadores de manutenção, com registro de autor e valores antes e depois.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: QualityView,
});

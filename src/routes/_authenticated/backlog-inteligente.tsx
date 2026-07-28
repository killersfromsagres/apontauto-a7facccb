import { createFileRoute } from "@tanstack/react-router";
import { BacklogInteligenteView } from "@/components/planning/backlog-inteligente-view";

export const Route = createFileRoute("/_authenticated/backlog-inteligente")({
  head: () => ({
    meta: [
      { title: "Backlog Inteligente — Apont Auto" },
      {
        name: "description",
        content:
          "Priorização automática do backlog de manutenção por criticidade, risco de segurança, SLA, idade e reincidência.",
      },
      { property: "og:title", content: "Backlog Inteligente — Apont Auto" },
      {
        property: "og:description",
        content:
          "Score auditável de priorização das ordens em aberto, com justificativa de cada fator e recomendação de programação.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BacklogInteligenteView,
});

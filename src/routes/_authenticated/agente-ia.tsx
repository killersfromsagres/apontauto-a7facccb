import { createFileRoute } from "@tanstack/react-router";
import { AiAgentView } from "@/features/ai-agent/pages/ai-agent-view";

export const Route = createFileRoute("/_authenticated/agente-ia")({
  head: () => ({
    meta: [
      { title: "Agente de Documentos (IA) — Apont Auto" },
      {
        name: "description",
        content:
          "Agente de IA especialista em Excel, PowerPoint e Power BI: envie a planilha de chamados e receba relatórios profissionais com equipes, prédios e andares resolvidos automaticamente.",
      },
      { property: "og:title", content: "Agente de Documentos (IA) — Apont Auto" },
      {
        property: "og:description",
        content:
          "Transforme planilhas de chamados em relatórios executivos, apresentações e bases para Power BI em poucos segundos.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AiAgentView,
});

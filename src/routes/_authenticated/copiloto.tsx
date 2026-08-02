import { createFileRoute } from "@tanstack/react-router";
import { CopilotView } from "@/features/copilot/pages/copilot-view";

export const Route = createFileRoute("/_authenticated/copiloto")({
  head: () => ({
    meta: [
      { title: "Copiloto Admin (IA) — Apont Auto" },
      {
        name: "description",
        content:
          "Console de IA exclusivo do administrador: consulte os dados reais do sistema em português e execute alterações de usuários, permissões e ordens de serviço com confirmação.",
      },
      { property: "og:title", content: "Copiloto Admin (IA) — Apont Auto" },
      {
        property: "og:description",
        content:
          "Converse com a IA do Apont Auto para consultar indicadores e aplicar mudanças administrativas com segurança.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CopilotView,
});

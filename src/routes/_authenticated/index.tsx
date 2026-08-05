import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Menu Inicial — Apont Auto" },
      {
        name: "description",
        content: "Painel operacional e executivo unificado com monitoramento em tempo real.",
      },
    ],
  }),
});

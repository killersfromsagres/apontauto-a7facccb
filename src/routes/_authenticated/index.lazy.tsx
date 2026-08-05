import { createLazyFileRoute } from "@tanstack/react-router";
import { MenuInicialView } from "@/features/menu-inicial/components/menu-inicial-view";

export const Route = createLazyFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Menu Inicial — Apont Auto" },
      {
        name: "description",
        content: "Painel operacional e executivo unificado com monitoramento em tempo real.",
      },
    ],
  }),
  component: MenuInicialView,
});

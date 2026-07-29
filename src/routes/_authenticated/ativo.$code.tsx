import { createFileRoute } from "@tanstack/react-router";
import { AssetSheetView } from "@/components/assets/asset-sheet-view";

export const Route = createFileRoute("/_authenticated/ativo/$code")({
  head: () => ({
    meta: [
      { title: "Ficha do Ativo — Apont Auto" },
      {
        name: "description",
        content:
          "Ficha mobile do ativo acessada por QR Code: localização, ordens abertas, histórico de manutenção e fotos.",
      },
      { property: "og:title", content: "Ficha do Ativo — Apont Auto" },
      {
        property: "og:description",
        content:
          "Consulta rápida em campo do histórico do ativo e abertura de ordem de serviço já preenchida.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssetSheetView,
});

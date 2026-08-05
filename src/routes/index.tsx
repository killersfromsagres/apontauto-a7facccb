import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { MenuInicialView } from "@/features/menu-inicial/components/menu-inicial-view";

/**
 * Rota raiz: decide o destino conforme a sessão do usuário.
 */
export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      throw redirect({ to: "/auth", replace: true });
    }
  },
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

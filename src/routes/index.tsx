import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

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

    // Com a unificação, todos os usuários autenticados caem no Menu Inicial (rota raiz do layout autenticado)
    // O layout autenticado (_authenticated) cuidará de renderizar o index.tsx dele.
  },
  component: () => null,
});

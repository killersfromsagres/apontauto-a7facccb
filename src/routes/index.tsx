import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { allMenuItems } from "@/lib/nav-config";

/**
 * Rota raiz: decide o destino conforme a sessão e as permissões do usuário.
 *
 * Logins restritos (ex.: `corretivas`, `abastecimento`) não têm acesso ao
 * Centro de Gestão; enviá-los para `/gestao` resultaria em tela de acesso
 * negado. Por isso resolvemos o primeiro módulo liberado.
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

    let allowed: string[] | null = null;
    try {
      const { data, error } = await supabase.rpc("get_my_allowed_menus");
      if (!error) allowed = (data as string[] | null) ?? null;
    } catch {
      // Falha de rede/RPC: mantemos o destino padrão abaixo.
      allowed = null;
    }

    // Redireciona para o novo Menu Inicial (rota raiz)
    throw redirect({ to: "/", replace: true });
  },
  component: () => null,
});
  },
  component: () => null,
});

import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth" });
    }
    // O sistema usa / como dashboard dentro do layout _authenticated
    // A rota _authenticated.index.tsx processa a renderização do dashboard.
    return;
  },
  loader: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth" });
    }
    return;
  },
  component: () => null,
});

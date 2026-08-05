import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useLayoutEffect } from "react";

/**
 * Rota raiz: redireciona para a home autenticada ou para o login.
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
  component: RedirectToHome,
});

function RedirectToHome() {
  const navigate = useNavigate();
  
  useLayoutEffect(() => {
    navigate({ to: "/_authenticated/dashboard", replace: true });
  }, [navigate]);

  return null;
}

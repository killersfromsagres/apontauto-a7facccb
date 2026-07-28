import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { PcmHome } from "@/components/home/pcm-home";
import { useVisibleSections } from "@/lib/nav-config";
import { supabase } from "@/integrations/supabase/client";

function HomeRoute() {
  const { visibleItems, hasDashboard, loading } = useVisibleSections();
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      const u = data.session?.user;
      const full = (u?.user_metadata?.full_name as string | undefined) ?? null;
      setName(full ?? (u?.email ? u.email.split("@")[0] : null));
    });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return null;
  if (hasDashboard) return <PcmHome userName={name} />;

  // Usuário sem acesso à home: leva para o primeiro módulo permitido.
  const first = visibleItems[0];
  if (!first) return null;
  return <Navigate to={first.url} replace />;
}

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "Central Operacional PCM — Apont Auto" },
      {
        name: "description",
        content:
          "Central operacional PCM: preenchimento de localização de ativos, indicadores de processamento e atalhos para os módulos liberados.",
      },
      { property: "og:title", content: "Central Operacional PCM — Apont Auto" },
      {
        property: "og:description",
        content:
          "Indicadores de processamento de planilhas, base de ativos ativa e atalhos operacionais.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomeRoute,
});

import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useVisibleSections } from "@/lib/nav-config";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PcmHome } from "@/components/home/pcm-home";

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
  
  // If user has access to dashboard, show it
  if (hasDashboard) return <PcmHome userName={name} />;

  // User without dashboard access: redirect to the first allowed module.
  const first = visibleItems[0];
  if (!first) return null;
  return <Navigate to={first.url} replace />;
}

export const Route = createFileRoute("/")({
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

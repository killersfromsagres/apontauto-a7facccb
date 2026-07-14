import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Settings } from "lucide-react";

export const Route = createFileRoute("/configuracoes")({ component: Page });

function Page() {
  return (
    <PageShell
      title="Configurações"
      description="Equipes, horários e regras de distribuição — Fase 6."
    >
      <GlassCard>
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Settings className="h-10 w-10 text-muted-foreground" />
          <h3 className="text-lg font-semibold">Em breve</h3>
        </div>
      </GlassCard>
    </PageShell>
  );
}

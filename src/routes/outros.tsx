import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { ClipboardList } from "lucide-react";

export const Route = createFileRoute("/outros")({ component: Page });

function Page() {
  return (
    <PageShell
      title="Outros Serviços"
      description="Registro de atividades especiais — Fase 5."
    >
      <GlassCard>
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <ClipboardList className="h-10 w-10 text-purple-500" />
          <h3 className="text-lg font-semibold">Em breve</h3>
        </div>
      </GlassCard>
    </PageShell>
  );
}

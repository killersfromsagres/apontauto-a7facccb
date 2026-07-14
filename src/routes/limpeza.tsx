import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Sparkles } from "lucide-react";

export const Route = createFileRoute("/limpeza")({ component: Page });

function Page() {
  return (
    <PageShell title="Limpeza" description="Apontamentos de limpeza — Fase 4.">
      <GlassCard>
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Sparkles className="h-10 w-10 text-emerald-500" />
          <h3 className="text-lg font-semibold">Em breve</h3>
        </div>
      </GlassCard>
    </PageShell>
  );
}

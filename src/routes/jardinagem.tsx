import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Trees } from "lucide-react";

export const Route = createFileRoute("/jardinagem")({ component: Page });

function Page() {
  return (
    <PageShell title="Jardinagem" description="Apontamentos de jardinagem — Fase 4.">
      <GlassCard>
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Trees className="h-10 w-10 text-green-600" />
          <h3 className="text-lg font-semibold">Em breve</h3>
        </div>
      </GlassCard>
    </PageShell>
  );
}

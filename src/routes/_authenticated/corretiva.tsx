import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Wrench } from "lucide-react";

export const Route = createFileRoute("/_authenticated/corretiva")({ component: Page });

function Page() {
  return (
    <PageShell title="Programação Corretiva" description="Gestão das OS corretivas por equipe.">
      <GlassCard>
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <Wrench className="h-10 w-10 text-red-500" />
          <h3 className="text-lg font-semibold">Em breve</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            Este módulo será implementado nas próximas fases.
          </p>
        </div>
      </GlassCard>
    </PageShell>
  );
}

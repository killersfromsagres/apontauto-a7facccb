import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { CalendarClock } from "lucide-react";

export const Route = createFileRoute("/preventiva")({ component: Page });

function Page() {
  return (
    <PageShell
      title="Programação Preventiva"
      description="Upload da planilha bruta, filtragem por site DEMARCHI e distribuição automática entre equipes."
    >
      <GlassCard>
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <CalendarClock className="h-10 w-10 text-blue-500" />
          <h3 className="text-lg font-semibold">Módulo em preparação (Fase 2)</h3>
          <p className="max-w-md text-sm text-muted-foreground">
            O upload de planilha e o motor de distribuição serão habilitados após a validação da
            base visual e de navegação.
          </p>
        </div>
      </GlassCard>
    </PageShell>
  );
}

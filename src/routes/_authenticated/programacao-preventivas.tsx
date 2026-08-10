import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/programacao-preventivas")({
  component: ProgramacaoPreventivasPage,
});

function ProgramacaoPreventivasPage() {
  return (
    <PageShell
      title="Programação Preventivas"
      description="Reformulado: anexe planilhas por equipe e gere a programação semanal."
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {["Chaveiro", "Civil", "Hidráulica", "Elétrica", "Refrigeração"].map((equipe) => (
          <GlassCard key={equipe} className="p-6 flex flex-col items-center gap-4">
            <h3 className="font-semibold text-lg">{equipe}</h3>
            <Button variant="outline" className="w-full gap-2">
              <Upload className="h-4 w-4" /> Anexar {equipe}
            </Button>
          </GlassCard>
        ))}
      </div>
      <div className="mt-8">
        <Button size="lg" className="w-full">Gerar Programação Semanal</Button>
      </div>
    </PageShell>
  );
}

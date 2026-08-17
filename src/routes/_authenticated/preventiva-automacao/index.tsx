import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/page-shell";
import { AutomacaoPreventivaMain } from "@/components/preventiva-automacao/automacao-preventiva-main";
import { CalendarRange, Sparkles } from "lucide-react";

export const Route = createFileRoute("/_authenticated/preventiva-automacao")({
  component: PreventivaAutomacaoPage,
});

function PreventivaAutomacaoPage() {
  return (
    <PageShell
      title="Automação de Preventivas"
      description="Geração automática de programação semanal baseada na árvore de ativos."
      actions={
        <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full border border-primary/20 text-primary animate-pulse">
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-bold uppercase tracking-tighter">Motor IA Ativo</span>
        </div>
      }
    >
      <div className="space-y-6">
        <AutomacaoPreventivaMain />
      </div>
    </PageShell>
  );
}

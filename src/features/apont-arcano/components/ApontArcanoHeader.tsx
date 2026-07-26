import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { AgentPresenceCard } from "./AgentPresenceCard";
import type { AgentDevice } from "../types/pointing";
import type { AgentPresence } from "../utils/statusLabels";

export const ApontArcanoHeader = memo(function ApontArcanoHeader({
  agent,
  onRefresh,
  refreshing,
}: {
  agent: (AgentDevice & { presence: AgentPresence }) | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="arcano-hero relative overflow-hidden rounded-3xl border border-primary/20 p-4 sm:p-6">
      <div className="relative z-10 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" strokeWidth={1.75} />
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-primary">
              Apont Arcano Desktop
            </span>
            <Badge variant="outline" className="border-primary/40 font-mono text-[10px] text-primary">
              v2.0.4 ou superior
            </Badge>
          </div>
          <h2 className="mt-2 font-display text-2xl font-bold tracking-tight sm:text-4xl">
            <span className="text-gradient">Apont Arcano</span>
          </h2>
          <p className="mt-1.5 max-w-xl text-sm text-muted-foreground">
            Automação local de apontamentos do Prisma4. O painel monta a fila; o programa Windows executa
            no seu computador.
          </p>
        </div>
        <AgentPresenceCard agent={agent} onRefresh={onRefresh} refreshing={refreshing} />
      </div>
    </div>
  );
});

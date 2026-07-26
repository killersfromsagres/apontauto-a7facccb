import { memo } from "react";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MonitorSmartphone, RefreshCw, Download, ShieldCheck } from "lucide-react";
import {
  AGENT_PRESENCE_CLASSES,
  AGENT_PRESENCE_LABELS,
  isVersionAtLeast,
  relativeSeen,
  type AgentPresence,
} from "../utils/statusLabels";
import { MIN_AGENT_VERSION, type AgentDevice } from "../types/pointing";

export const AgentDevicesPanel = memo(function AgentDevicesPanel({
  agents,
  loading,
  onRefresh,
  refreshing,
}: {
  agents: (AgentDevice & { presence: AgentPresence })[];
  loading: boolean;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  return (
    <div className="space-y-4">
      <GlassCard className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-base font-semibold">Agente Windows</h3>
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
        <ol className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="font-mono text-primary">1.</span>
            Instale o <strong className="text-foreground">Apont Arcano Desktop v{MIN_AGENT_VERSION}</strong> ou superior no computador que acessa o Prisma4.
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-primary">2.</span>
            Entre no programa com o mesmo e-mail usado aqui — ele registra o dispositivo automaticamente.
          </li>
          <li className="flex gap-2">
            <span className="font-mono text-primary">3.</span>
            Deixe o programa aberto. Ele reserva as OS da fila, executa no Prisma4 e devolve o status em tempo real.
          </li>
        </ol>
        <p className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3 text-[11px] text-muted-foreground">
          <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
          As credenciais do Prisma4 ficam somente no programa local. Este painel nunca recebe nem armazena login ou senha do Prisma4.
        </p>
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Download className="h-3.5 w-3.5" />
          O instalador é distribuído pela equipe de manutenção — solicite ao administrador o pacote v{MIN_AGENT_VERSION}.
        </p>
      </GlassCard>

      {loading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-32 rounded-2xl" />
          <Skeleton className="h-32 rounded-2xl" />
        </div>
      ) : agents.length === 0 ? (
        <GlassCard className="space-y-2 text-center">
          <MonitorSmartphone className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Nenhum dispositivo registrado ainda. Abra o programa no Windows e faça login para aparecer aqui.
          </p>
        </GlassCard>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent, index) => {
            const outdated = !isVersionAtLeast(agent.app_version, MIN_AGENT_VERSION);
            return (
              <GlassCard key={agent.id} delay={index * 0.02} className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate font-semibold">{agent.device_name}</h4>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {agent.platform ?? "Windows"} ·{" "}
                      {agent.app_version ? `v${agent.app_version.replace(/^v/i, "")}` : "versão desconhecida"}
                    </p>
                  </div>
                  <Badge variant="outline" className={AGENT_PRESENCE_CLASSES[agent.presence]}>
                    {AGENT_PRESENCE_LABELS[agent.presence]}
                  </Badge>
                </div>
                <p className="font-mono text-[11px] text-muted-foreground">{relativeSeen(agent.last_seen_at)}</p>
                {outdated && (
                  <p className="text-[11px] text-amber-300">
                    Versão abaixo da mínima exigida (v{MIN_AGENT_VERSION}). Atualize o programa.
                  </p>
                )}
              </GlassCard>
            );
          })}
        </div>
      )}
    </div>
  );
});

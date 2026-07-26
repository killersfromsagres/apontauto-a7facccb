import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MonitorSmartphone, RefreshCw, AlertTriangle } from "lucide-react";
import {
  AGENT_PRESENCE_CLASSES,
  AGENT_PRESENCE_LABELS,
  isVersionAtLeast,
  relativeSeen,
  type AgentPresence,
} from "../utils/statusLabels";
import { MIN_AGENT_VERSION, type AgentDevice } from "../types/pointing";

export const AgentPresenceCard = memo(function AgentPresenceCard({
  agent,
  onRefresh,
  refreshing,
}: {
  agent: (AgentDevice & { presence: AgentPresence }) | null;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const presence: AgentPresence = agent?.presence ?? "offline";
  const outdated = agent ? !isVersionAtLeast(agent.app_version, MIN_AGENT_VERSION) : false;

  return (
    <div className="arcano-panel w-full min-w-0 rounded-2xl p-3 sm:min-w-[280px] sm:p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
            <MonitorSmartphone className="h-4 w-4 text-primary" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{agent?.device_name ?? "Nenhum agente registrado"}</div>
            <div className="truncate font-mono text-[11px] text-muted-foreground">
              {agent?.app_version ? `v${agent.app_version.replace(/^v/i, "")}` : "versão desconhecida"} ·{" "}
              {relativeSeen(agent?.last_seen_at)}
            </div>
          </div>
        </div>
        <Button size="icon" variant="ghost" onClick={onRefresh} aria-label="Atualizar conexão" className="h-8 w-8 shrink-0">
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={AGENT_PRESENCE_CLASSES[presence]}>
          <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
          {AGENT_PRESENCE_LABELS[presence]}
        </Badge>
        <Badge variant="outline" className="border-primary/30 text-[10px] text-primary">
          esperado v{MIN_AGENT_VERSION}+
        </Badge>
      </div>

      {outdated && (
        <p className="mt-3 flex items-start gap-1.5 text-[11px] text-amber-300">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          Atualize o Apont Arcano Desktop para garantir compatibilidade.
        </p>
      )}
    </div>
  );
});

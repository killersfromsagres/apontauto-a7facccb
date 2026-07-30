import { Bot, CircleDot, Loader2, PauseCircle, PowerOff } from "lucide-react";
import { cn } from "@/lib/utils";

export type AgentStatus = "online" | "busy" | "paused" | "offline";

const CONFIG: Record<AgentStatus, { label: string; className: string; icon: React.ReactNode }> = {
  online: {
    label: "Agente online",
    className: "border-success/40 bg-success/10 text-success",
    icon: <CircleDot className="size-3.5" aria-hidden />,
  },
  busy: {
    label: "Executando",
    className: "border-primary/45 bg-primary/10 text-primary",
    icon: <Loader2 className="size-3.5 animate-spin" aria-hidden />,
  },
  paused: {
    label: "Pausado",
    className: "border-warning/45 bg-warning/10 text-warning",
    icon: <PauseCircle className="size-3.5" aria-hidden />,
  },
  offline: {
    label: "Agente offline",
    className: "border-border/60 bg-muted/30 text-muted-foreground",
    icon: <PowerOff className="size-3.5" aria-hidden />,
  },
};

export function AgentStatusIndicator({
  status,
  name,
  lastSeenAt,
  currentJob,
  className,
}: {
  status: AgentStatus;
  name?: string;
  lastSeenAt?: Date | string | null;
  currentJob?: string | null;
  className?: string;
}) {
  const config = CONFIG[status];
  const seen = lastSeenAt ? new Date(lastSeenAt) : null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium",
        config.className,
        className,
      )}
      title={
        seen && !Number.isNaN(seen.getTime())
          ? `Última comunicação: ${seen.toLocaleString("pt-BR")}`
          : undefined
      }
    >
      <Bot className="size-3.5 opacity-70" aria-hidden />
      {config.icon}
      <span className="truncate">{name ? `${name} · ${config.label}` : config.label}</span>
      {currentJob ? (
        <span className="hidden truncate opacity-80 sm:inline">OS {currentJob}</span>
      ) : null}
    </span>
  );
}

import { CheckCircle2, CloudOff, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type SyncStatus = "online" | "offline" | "syncing" | "error";

const CONFIG: Record<
  SyncStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  online: {
    label: "Sincronizado",
    className: "border-success/40 bg-success/10 text-success",
    icon: <CheckCircle2 className="size-3.5" aria-hidden />,
  },
  offline: {
    label: "Offline",
    className: "border-warning/45 bg-warning/10 text-warning",
    icon: <CloudOff className="size-3.5" aria-hidden />,
  },
  syncing: {
    label: "Sincronizando…",
    className: "border-primary/45 bg-primary/10 text-primary",
    icon: <Loader2 className="size-3.5 animate-spin" aria-hidden />,
  },
  error: {
    label: "Falha na sincronização",
    className: "border-destructive/45 bg-destructive/10 text-destructive",
    icon: <TriangleAlert className="size-3.5" aria-hidden />,
  },
};

export function SyncIndicator({
  status,
  pending = 0,
  lastSyncAt,
  onRetry,
  className,
}: {
  status: SyncStatus;
  /** Itens ainda na fila local (outbox). */
  pending?: number;
  lastSyncAt?: Date | string | null;
  onRetry?: () => void;
  className?: string;
}) {
  const cfg = CONFIG[status];
  const last = lastSyncAt ? new Date(lastSyncAt) : null;

  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11px] font-semibold",
        cfg.className,
        className,
      )}
      role="status"
      aria-live="polite"
    >
      {cfg.icon}
      <span className="truncate">
        {cfg.label}
        {pending > 0 ? ` · ${pending} pendente${pending > 1 ? "s" : ""}` : ""}
        {last && status === "online"
          ? ` · ${last.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
          : ""}
      </span>
      {onRetry && (status === "error" || pending > 0) && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[11px]"
          onClick={onRetry}
        >
          <RefreshCw className="size-3" aria-hidden />
          Repetir
        </Button>
      )}
    </div>
  );
}

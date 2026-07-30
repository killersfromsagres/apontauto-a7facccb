import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/pcm/states";
import type { StatusTone } from "@/components/pcm/status-badge";

export type TimelineItem = {
  id: string;
  title: string;
  description?: ReactNode;
  actor?: string | null;
  at: Date | string;
  tone?: StatusTone;
  icon?: ReactNode;
};

const DOT_TONE: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/50",
  info: "bg-sky-400",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  primary: "bg-primary",
};

function formatWhen(value: Date | string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Timeline({
  items,
  emptyLabel = "Nenhum evento registrado",
  className,
}: {
  items: TimelineItem[];
  emptyLabel?: string;
  className?: string;
}) {
  if (items.length === 0) {
    return <EmptyState title={emptyLabel} />;
  }

  return (
    <ol className={cn("relative space-y-4 pl-6", className)}>
      <span aria-hidden className="absolute bottom-2 left-[7px] top-2 w-px bg-border/60" />
      {items.map((item) => (
        <li key={item.id} className="relative min-w-0">
          <span
            aria-hidden
            className={cn(
              "absolute -left-[22px] top-1.5 size-3.5 rounded-full ring-4 ring-background",
              DOT_TONE[item.tone ?? "neutral"],
            )}
          />
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className="min-w-0 break-words text-sm font-semibold">{item.title}</p>
            <span className="text-[11px] text-muted-foreground">
              {formatWhen(item.at)}
              {item.actor ? ` · ${item.actor}` : ""}
            </span>
          </div>
          {item.description && (
            <div className="mt-1 text-sm text-muted-foreground">{item.description}</div>
          )}
        </li>
      ))}
    </ol>
  );
}

export type AuditEvent = {
  id: string;
  action: string | null;
  entity_type?: string | null;
  module_key?: string | null;
  created_at: string;
  user_id?: string | null;
};

const ACTION_TONE: Record<string, StatusTone> = {
  create: "success",
  insert: "success",
  update: "primary",
  delete: "danger",
};

/** Renderiza registros da tabela `audit_events` na timeline padrão. */
export function AuditTimeline({ events, className }: { events: AuditEvent[]; className?: string }) {
  return (
    <Timeline
      className={className}
      emptyLabel="Sem eventos de auditoria"
      items={events.map((event) => ({
        id: event.id,
        title: `${event.action ?? "evento"} · ${event.entity_type ?? event.module_key ?? "registro"}`,
        at: event.created_at,
        actor: event.user_id ? `usuário ${event.user_id.slice(0, 8)}` : null,
        tone: ACTION_TONE[(event.action ?? "").toLowerCase()] ?? "neutral",
      }))}
    />
  );
}

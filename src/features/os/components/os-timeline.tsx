import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CheckCircle2,
  Circle,
  Clock,
  PauseCircle,
  PlayCircle,
  FileText,
  Camera,
  Signature,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type OSTimelineEvent = {
  id: string;
  type: "status_change" | "action" | "note";
  title: string;
  description?: string;
  timestamp: string;
  user: string;
  icon?: React.ReactNode;
};

interface OSTimelineProps {
  events: OSTimelineEvent[];
  className?: string;
}

export function OSTimeline({ events, className }: OSTimelineProps) {
  return (
    <div
      className={cn(
        "relative space-y-6 before:absolute before:inset-0 before:ml-5 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-white/10 before:via-white/5 before:to-transparent",
        className,
      )}
    >
      {events.map((event, idx) => (
        <div
          key={event.id}
          className="relative flex items-start gap-4 animate-in fade-in slide-in-from-left-4 duration-300"
          style={{ animationDelay: `${idx * 100}ms` }}
        >
          <div className="absolute left-0 mt-0.5 flex h-10 w-10 items-center justify-center rounded-full bg-background border border-white/10 shadow-xl ring-4 ring-background">
            {event.icon || (
              <div className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
            )}
          </div>

          <div className="ml-12 pt-0.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-semibold">{event.title}</span>
              <span className="text-[10px] text-muted-foreground">•</span>
              <span className="text-[10px] text-muted-foreground uppercase font-medium">
                {format(new Date(event.timestamp), "HH:mm '·' dd MMM", { locale: ptBR })}
              </span>
            </div>
            {event.description && (
              <p className="text-xs text-muted-foreground leading-relaxed bg-white/5 p-2 rounded-md border border-white/5">
                {event.description}
              </p>
            )}
            <div className="mt-1 text-[9px] text-muted-foreground/60 italic">Por: {event.user}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

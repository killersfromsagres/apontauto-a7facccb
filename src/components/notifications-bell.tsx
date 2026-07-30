import { Archive, Bell, BellRing, CheckCheck, ShieldAlert } from "lucide-react";
import { Link } from "@tanstack/react-router";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/pcm";
import { useNotifications } from "@/hooks/use-notifications";
import { categoryMeta, fmtDateTime } from "@/lib/notifications";
import { cn } from "@/lib/utils";

export function NotificationsBell() {
  const { items, unreadCount, pendingAck, markRead, acknowledge, archiveItems } =
    useNotifications();
  const criticos = pendingAck.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={`Avisos${unreadCount ? ` (${unreadCount} não lidos)` : ""}`}
        >
          {criticos > 0 ? (
            <BellRing className="h-5 w-5 animate-pulse text-destructive" />
          ) : (
            <Bell className="h-5 w-5" />
          )}
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold",
                criticos > 0
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(22rem,calc(100vw-1rem))] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Avisos</p>
          {unreadCount > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => markRead(items.filter((i) => !i.isRead).map((i) => i.id))}
            >
              <CheckCheck className="mr-1.5 size-3.5" />
              Marcar tudo
            </Button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nenhum aviso ativo.
          </p>
        ) : (
          <ul className="max-h-80 space-y-2 overflow-auto pr-1">
            {items.slice(0, 12).map((n) => {
              const meta = categoryMeta(n.category);
              return (
                <li
                  key={n.id}
                  className={cn(
                    "rounded-xl border border-border/60 bg-background/60 p-2.5",
                    !n.isRead && "border-primary/40 bg-primary/[0.07]",
                    n.requires_ack && !n.isAcked && "border-destructive/50",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge tone={meta.tone} status={meta.label} />
                    {n.requires_ack && !n.isAcked ? (
                      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-destructive">
                        <ShieldAlert className="size-3" /> ciência
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1.5 text-sm font-medium leading-snug">{n.title}</p>
                  {n.body ? (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    {fmtDateTime(n.created_at)}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {!n.isRead ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        onClick={() => markRead([n.id])}
                      >
                        Marcar lida
                      </Button>
                    ) : null}
                    {n.requires_ack && !n.isAcked ? (
                      <Button
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => acknowledge(n.id)}
                      >
                        Confirmar ciência
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => archiveItems([n.id])}
                    >
                      <Archive className="mr-1.5 size-3.5" />
                      Arquivar
                    </Button>
                    {n.deep_link ?? n.link_url ? (
                      <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                        <a href={(n.deep_link ?? n.link_url) as string}>Abrir</a>
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        <Button asChild variant="outline" size="sm" className="mt-3 w-full">
          <Link to="/notificacoes">Ver todas</Link>
        </Button>
      </PopoverContent>
    </Popover>
  );
}

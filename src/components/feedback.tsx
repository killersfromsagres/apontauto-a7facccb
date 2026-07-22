import type { ReactNode } from "react";
import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Primitivos reutilizáveis de estado — padroniza loading / empty / error
 * em todo o app. Todos usam tokens semânticos (nada hardcoded).
 */

type BaseProps = {
  title?: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
};

function StateShell({
  icon,
  title,
  description,
  action,
  className,
  tone = "default",
}: BaseProps & { tone?: "default" | "danger" | "muted" }) {
  const tones = {
    default:
      "border-border/60 bg-card/40 [&_[data-state-icon]]:bg-primary/10 [&_[data-state-icon]]:text-primary",
    danger:
      "border-destructive/30 bg-destructive/5 [&_[data-state-icon]]:bg-destructive/15 [&_[data-state-icon]]:text-destructive",
    muted:
      "border-border/50 bg-muted/20 [&_[data-state-icon]]:bg-muted [&_[data-state-icon]]:text-muted-foreground",
  }[tone];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border p-6 text-center backdrop-blur-sm sm:p-10",
        "animate-fade-in",
        tones,
        className,
      )}
    >
      {icon && (
        <div
          data-state-icon
          className="grid h-12 w-12 place-items-center rounded-full ring-1 ring-inset ring-white/5"
        >
          {icon}
        </div>
      )}
      {title && (
        <h3 className="font-display text-base font-semibold tracking-tight sm:text-lg">
          {title}
        </h3>
      )}
      {description && (
        <p className="max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

export function EmptyState({
  title = "Nada por aqui ainda",
  description,
  icon,
  action,
  className,
}: BaseProps) {
  return (
    <StateShell
      tone="muted"
      title={title}
      description={description}
      icon={icon ?? <Inbox className="h-5 w-5" aria-hidden />}
      action={action}
      className={className}
    />
  );
}

export function ErrorState({
  title = "Não foi possível carregar",
  description = "Ocorreu um erro inesperado. Tente novamente em instantes.",
  icon,
  action,
  onRetry,
  className,
}: BaseProps & { onRetry?: () => void }) {
  return (
    <StateShell
      tone="danger"
      title={title}
      description={description}
      icon={icon ?? <AlertCircle className="h-5 w-5" aria-hidden />}
      action={
        action ??
        (onRetry ? (
          <Button size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        ) : undefined)
      }
      className={className}
    />
  );
}

export function LoadingState({
  label = "Carregando…",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-border/50 bg-card/30 p-8 text-center text-muted-foreground animate-fade-in",
        className,
      )}
    >
      <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden />
      <span className="text-xs sm:text-sm">{label}</span>
    </div>
  );
}

/** Skeleton pronto para linhas de tabela / cards */
export function SkeletonRows({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-border/40 bg-card/30 p-3"
        >
          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
          <Skeleton className="h-6 w-16 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Skeleton pronto para grid de cards */
export function SkeletonCards({
  cards = 4,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
        className,
      )}
      aria-hidden
    >
      {Array.from({ length: cards }).map((_, i) => (
        <div
          key={i}
          className="space-y-3 rounded-2xl border border-border/40 bg-card/30 p-4"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

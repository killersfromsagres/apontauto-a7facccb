import { memo, type ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export type KpiTrend = {
  /** Variação percentual (positiva ou negativa). */
  value: number;
  label?: string;
  /** Quando true, queda é considerada positiva (ex.: backlog, atrasos). */
  invert?: boolean;
};

function KpiCardImpl({
  label,
  value,
  hint,
  icon,
  trend,
  loading,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  trend?: KpiTrend;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const good = trend ? (trend.invert ? trend.value <= 0 : trend.value >= 0) : true;
  const Wrapper = onClick ? "button" : "div";

  return (
    <GlassCard variant="block" className={cn("hover-raise p-4 sm:p-6", className)}>
      <Wrapper
        type={onClick ? "button" : undefined}
        onClick={onClick}
        className={cn("flex w-full min-w-0 flex-col gap-2 text-left", onClick && "cursor-pointer")}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-eyebrow truncate">{label}</span>
          {icon && (
            <span className="shrink-0 rounded-xl border border-primary/30 bg-primary/10 p-1.5 text-primary">
              {icon}
            </span>
          )}
        </div>

        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className="font-display text-2xl font-bold leading-none tracking-tight sm:text-3xl">
            {value}
          </div>
        )}

        <div className="flex min-w-0 items-center gap-2">
          {trend && !loading && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-semibold",
                good ? "bg-success/12 text-success" : "bg-destructive/12 text-destructive",
              )}
            >
              {trend.value >= 0 ? (
                <TrendingUp className="size-3" aria-hidden />
              ) : (
                <TrendingDown className="size-3" aria-hidden />
              )}
              {Math.abs(trend.value).toLocaleString("pt-BR", {
                maximumFractionDigits: 1,
              })}
              %
            </span>
          )}
          {(hint || trend?.label) && (
            <span className="truncate text-[11px] text-muted-foreground">
              {hint ?? trend?.label}
            </span>
          )}
        </div>
      </Wrapper>
    </GlassCard>
  );
}

export const KpiCard = memo(KpiCardImpl);

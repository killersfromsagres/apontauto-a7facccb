import type { ReactNode, CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Liquid Glass panel — CSS-only entrance animation (sem framer-motion)
 * para evitar overhead de JS quando o componente é usado em grande
 * quantidade nas dashboards.
 */
export function GlassCard({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const style: CSSProperties | undefined =
    delay > 0 ? { animationDelay: `${delay}s` } : undefined;

  return (
    <div
      style={style}
      className={cn(
        "glass-surface animate-fade-in relative overflow-hidden rounded-2xl p-4 sm:rounded-3xl sm:p-6",
        "before:pointer-events-none before:absolute before:inset-x-4 before:top-0 before:h-px",
        "before:bg-gradient-to-r before:from-transparent before:via-white/40 before:to-transparent",
        "transition-shadow duration-300 hover:shadow-elegant",
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}

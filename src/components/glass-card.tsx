import { memo, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Liquid Glass panel — animação CSS-only sem framer-motion.
 * `delay` é limitado a 120ms para não atrasar o first paint em dashboards
 * com muitos cards; valores maiores viram nada (apenas o fade curto).
 */
function GlassCardImpl({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const clamped = Math.min(delay, 0.12);
  const style: CSSProperties | undefined =
    clamped > 0 ? { animationDelay: `${clamped}s` } : undefined;

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

export const GlassCard = memo(GlassCardImpl);

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
  variant = "surface",
  style: styleProp,
  onClick,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** `block` usa o vidro turquesa com aresta luminosa (destaques/KPIs). */
  variant?: "surface" | "block";
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const clamped = Math.min(delay, 0.12);
  const style: CSSProperties | undefined =
    clamped > 0 ? { animationDelay: `${clamped}s`, ...styleProp } : styleProp;

  return (
    <div
      style={style}
      onClick={onClick}
      className={cn(
        variant === "block" ? "glass-block" : "glass-surface",
        "animate-card-rise relative overflow-hidden rounded-xl p-4 sm:p-6",
        "transition-all duration-200 ease-in-out",
        "hover:border-primary/20",
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export const GlassCard = memo(GlassCardImpl);

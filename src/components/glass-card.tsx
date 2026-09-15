import { memo, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared operational panel with restrained depth and optional interaction.
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
  /** `block` identifies metric panels without changing their behavior. */
  variant?: "surface" | "block";
  style?: CSSProperties;
  onClick?: () => void;
}) {
  const clamped = Math.max(0, Math.min(delay, 0.12));
  const style: CSSProperties | undefined =
    clamped > 0 ? { animationDelay: `${clamped}s`, ...styleProp } : styleProp;

  return (
    <div
      style={style}
      onClick={onClick}
      data-slot="glass-card"
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={cn(
        variant === "block" ? "glass-block" : "glass-surface",
        "relative overflow-hidden rounded-xl p-4 sm:p-6",
        "transition-[border-color,box-shadow,background-color,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
        onClick &&
          "hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-primary",
        onClick && "cursor-pointer",
        className,
      )}
    >
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export const GlassCard = memo(GlassCardImpl);

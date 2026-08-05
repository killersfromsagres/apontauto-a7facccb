import { memo, type ReactNode, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * Liquid Glass panel — aprimorado com efeitos premium e animações dinâmicas.
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
  const clamped = Math.min(delay, 0.5); // Aumentado para suportar delays maiores se necessário
  const style: CSSProperties | undefined =
    clamped > 0 ? { animationDelay: `${clamped}s`, ...styleProp } : styleProp;

  return (
    <div
      style={style}
      onClick={onClick}
      className={cn(
        variant === "block" ? "glass-block" : "glass-surface",
        "animate-card-rise relative overflow-hidden rounded-2xl p-4 sm:p-6",
        "transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)]",
        "hover:border-primary/30 hover:shadow-lift hover:-translate-y-1",
        "active:scale-[0.98] active:duration-150",
        "card-sheen", // Adiciona o brilho especular ao passar o mouse
        onClick && "cursor-pointer active:scale-95",
        className,
      )}
    >
      {/* Overlay de gradiente interno sutil para profundidade */}
      <div className="absolute inset-0 pointer-events-none bg-gradient-to-br from-white/5 to-transparent opacity-50" />
      
      <div className="relative z-10">{children}</div>
    </div>
  );
}

export const GlassCard = memo(GlassCardImpl);

import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Modern, state-aware sidebar toggle.
 * - Fechado: três linhas empilhadas com uma seta sutil apontando para a direita (indica "abrir").
 * - Aberto:  as linhas se transformam em um "X" enxuto sem seta.
 * Vetorial (SVG), acessível, com foco visível e hover em partícula.
 */
export function SidebarToggle({ className }: { className?: string }) {
  const { state, isMobile, openMobile, toggleSidebar } = useSidebar();
  const isOpen = isMobile ? openMobile : state === "expanded";

  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label={isOpen ? "Fechar menu" : "Abrir menu"}
      aria-expanded={isOpen}
      aria-controls="app-sidebar"
      className={cn(
        "group relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl z-[9999] sm:z-50",
        "border border-border/60 bg-background/40 backdrop-blur-md",
        "text-foreground/80 transition-all duration-300 ease-out",
        "hover:-translate-y-[1px] hover:border-primary/60 hover:text-foreground hover:shadow-[0_4px_18px_-6px_hsl(var(--primary)/0.45)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "active:scale-95",
        className,
      )}

    >
      {/* halo suave no hover */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-xl bg-gradient-to-br from-primary/15 via-transparent to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100"
      />

      <svg
        viewBox="0 0 24 24"
        width="18"
        height="18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.85"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative"
        aria-hidden
      >
        {/* Linha superior — vira braço superior do X quando aberto */}
        <line
          x1="4"
          y1="7"
          x2="20"
          y2="7"
          className={cn(
            "origin-center transition-all duration-300 ease-out",
            isOpen && "translate-y-[5px] rotate-45",
          )}
          style={{ transformBox: "fill-box" as const }}
        />
        {/* Linha do meio — encolhe/desaparece quando aberto */}
        <line
          x1="4"
          y1="12"
          x2="14"
          y2="12"
          className={cn(
            "origin-left transition-all duration-300 ease-out",
            isOpen ? "scale-x-0 opacity-0" : "scale-x-100 opacity-100",
          )}
          style={{ transformBox: "fill-box" as const }}
        />
        {/* Seta indicando "abrir" — some quando aberto */}
        <polyline
          points="16,9 19,12 16,15"
          className={cn(
            "origin-center transition-all duration-300 ease-out",
            isOpen ? "scale-0 opacity-0" : "scale-100 opacity-90",
          )}
          style={{ transformBox: "fill-box" as const }}
        />
        {/* Linha inferior — vira braço inferior do X quando aberto */}
        <line
          x1="4"
          y1="17"
          x2="20"
          y2="17"
          className={cn(
            "origin-center transition-all duration-300 ease-out",
            isOpen && "-translate-y-[5px] -rotate-45",
          )}
          style={{ transformBox: "fill-box" as const }}
        />
      </svg>

      <span className="sr-only">{isOpen ? "Fechar menu" : "Abrir menu"}</span>
    </button>
  );
}

import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Loading screen com mascote de manutenção em CSS puro.
 * - Sem framer-motion (mantém o bundle inicial leve).
 * - Só aparece em transições > 250ms (sem flicker).
 * - GPU-friendly: transform/opacity/filter apenas.
 */
export function LoadingScreen() {
  const routerLoading = useRouterState({
    select: (s) => s.isLoading || s.isTransitioning,
  });

  // `mounted` controla presença no DOM; `visible` controla a classe de opacidade.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (showTimer.current) {
      clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (routerLoading) {
      // Threshold alto (600ms): mascote só aparece em rotas realmente pesadas
      // e nunca em navegações cacheadas / instantâneas — elimina piscada.
      showTimer.current = setTimeout(() => {
        setMounted(true);
        // Próximo frame para permitir transição de 0 → 1.
        requestAnimationFrame(() => setVisible(true));
      }, 600);
    } else if (mounted) {
      setVisible(false);
      hideTimer.current = setTimeout(() => setMounted(false), 260);
    }

    return () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [routerLoading, mounted]);

  if (!mounted) return null;

  return (
    <div
      key="loading-screen"
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background px-4"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 250ms cubic-bezier(0.4, 0, 0.2, 1)",
        backgroundImage:
          "radial-gradient(ellipse at 50% 30%, hsl(var(--primary) / 0.14), transparent 60%), radial-gradient(ellipse at 50% 90%, hsl(var(--accent) / 0.08), transparent 55%)",
      }}
      aria-live="polite"
      aria-busy="true"
    >
      <div className="relative flex flex-col items-center gap-8">
        {/* Mascote de Manutenção — CSS puro */}
        <div className="mascot" aria-hidden>
          <div className="mascot-shadow" />
          <div className="mascot-body">
            <span className="mascot-gear">
              <span className="mascot-gear-tooth" style={{ transform: "rotate(0deg)" }} />
              <span className="mascot-gear-tooth" style={{ transform: "rotate(45deg)" }} />
              <span className="mascot-gear-tooth" style={{ transform: "rotate(90deg)" }} />
              <span className="mascot-gear-tooth" style={{ transform: "rotate(135deg)" }} />
              <span className="mascot-gear-tooth" style={{ transform: "rotate(180deg)" }} />
              <span className="mascot-gear-tooth" style={{ transform: "rotate(225deg)" }} />
              <span className="mascot-gear-tooth" style={{ transform: "rotate(270deg)" }} />
              <span className="mascot-gear-tooth" style={{ transform: "rotate(315deg)" }} />
              <span className="mascot-gear-hole" />
            </span>

            <div className="mascot-helmet">
              <span className="mascot-helmet-crest" />
              <span className="mascot-helmet-brim" />
            </div>

            <div className="mascot-head">
              <div className="mascot-face">
                <span className="mascot-eye mascot-eye-l" />
                <span className="mascot-eye mascot-eye-r" />
                <span className="mascot-mouth" />
              </div>
            </div>

            <div className="mascot-torso">
              <span className="mascot-strap mascot-strap-l" />
              <span className="mascot-strap mascot-strap-r" />
              <span className="mascot-badge" />
            </div>

            <div className="mascot-arm-wrench">
              <span className="mascot-arm-limb" />
              <span className="mascot-wrench">
                <span className="mascot-wrench-head" />
              </span>
              <span className="mascot-spark mascot-spark-1" />
              <span className="mascot-spark mascot-spark-2" />
              <span className="mascot-spark mascot-spark-3" />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <p className="text-sm font-semibold tracking-widest text-foreground/90">PCM</p>
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
            Manutenção em andamento
          </p>
        </div>

        <div className="loading-track relative h-1.5 w-64 max-w-[80vw] overflow-hidden rounded-full">
          <span className="loading-bar-fluid" />
          <span className="loading-bar-shine" />
        </div>
      </div>
    </div>
  );
}

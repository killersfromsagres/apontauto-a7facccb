import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Loading screen com mascote animado em CSS puro.
 * - Sem imagens: mascote-robô construído com divs + CSS.
 * - Só aparece em transições > 250ms (sem flicker).
 * - GPU-friendly: transform/opacity/filter apenas.
 */
export function LoadingScreen() {
  const routerLoading = useRouterState({
    select: (s) => s.isLoading || s.isTransitioning,
  });
  const [active, setActive] = useState(false);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (routerLoading) {
      timerRef.current = setTimeout(() => setActive(true), 250);
    } else {
      setActive(false);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [routerLoading]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="loading-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background px-4"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 50% 30%, hsl(var(--primary) / 0.14), transparent 60%), radial-gradient(ellipse at 50% 90%, hsl(var(--accent) / 0.08), transparent 55%)",
          }}
          aria-live="polite"
          aria-busy="true"
        >
          <div className="relative flex flex-col items-center gap-8">
            {/* Mascote CSS */}
            <div className="mascot" aria-hidden>
              <div className="mascot-shadow" />
              <div className="mascot-body">
                <div className="mascot-antenna">
                  <span className="mascot-antenna-tip" />
                </div>
                <div className="mascot-head">
                  <div className="mascot-face">
                    <span className="mascot-eye mascot-eye-l" />
                    <span className="mascot-eye mascot-eye-r" />
                    <span className="mascot-mouth" />
                  </div>
                  <span className="mascot-ear mascot-ear-l" />
                  <span className="mascot-ear mascot-ear-r" />
                </div>
                <div className="mascot-torso">
                  <span className="mascot-chest" />
                  <span className="mascot-arm mascot-arm-l" />
                  <span className="mascot-arm mascot-arm-r" />
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-semibold tracking-widest text-foreground/90">PCM</p>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                Carregando
              </p>
            </div>

            {/* Barra de progresso animada */}
            <div className="loading-track relative h-1.5 w-64 max-w-[80vw] overflow-hidden rounded-full">
              <span className="loading-bar-fluid" />
              <span className="loading-bar-shine" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

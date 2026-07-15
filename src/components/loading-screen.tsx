import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import pmRank from "@/assets/apontauto-logo.png.asset.json";

/**
 * Loading screen elegante e minimalista.
 * - Sem boot delay artificial: se a rota inicial já hidratou, nada aparece.
 * - Só mostra em transições de rota que ultrapassem 250ms (evita flicker).
 * - Ignora refetches em background (realtime/focus) para não piscar.
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
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 50% 30%, hsl(var(--primary) / 0.12), transparent 60%), radial-gradient(ellipse at 50% 90%, hsl(var(--accent) / 0.08), transparent 55%)",
          }}
          aria-live="polite"
          aria-busy="true"
        >
          <div className="relative flex flex-col items-center gap-6">
            <div className="relative flex h-28 w-28 items-center justify-center">
              <span className="absolute inset-0 rounded-full bg-primary/25 blur-2xl animate-pulse" />
              <img
                src={pmRank.url}
                alt=""
                className="relative h-24 w-24 select-none object-contain drop-shadow-[0_0_18px_hsl(var(--primary)/0.45)]"
                draggable={false}
                width={96}
                height={96}
              />
            </div>

            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-semibold tracking-widest text-foreground/90">PCM</p>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Carregando</p>
            </div>

            {/* Barra de progresso indeterminada (CSS puro, sem setInterval) */}
            <div className="relative h-1 w-56 overflow-hidden rounded-full bg-muted/50">
              <span className="loading-bar absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-primary via-primary to-accent" />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

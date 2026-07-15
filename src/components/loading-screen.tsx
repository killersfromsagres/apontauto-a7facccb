import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import pmRank from "@/assets/apontauto-logo.png.asset.json";

/**
 * Loading screen elegante e minimalista.
 * - Boot inicial (~400ms) para evitar flash de conteúdo não-hidratado.
 * - Transições de rota apenas quando durarem >250ms (evita flicker em navegações rápidas).
 * - Ignora refetches em background (realtime/focus) para não piscar durante uso normal.
 */
export function LoadingScreen() {
  const routerLoading = useRouterState({
    select: (s) => s.isLoading || s.isTransitioning,
  });
  const [booted, setBooted] = useState(false);
  const [showRouteLoader, setShowRouteLoader] = useState(false);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const t = setTimeout(() => setBooted(true), 400);
    return () => clearTimeout(t);
  }, []);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (routerLoading) {
      timerRef.current = setTimeout(() => setShowRouteLoader(true), 250);
    } else {
      setShowRouteLoader(false);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [routerLoading]);

  const active = !booted || showRouteLoader;

  useEffect(() => {
    if (!active) {
      setProgress(100);
      const t = setTimeout(() => setProgress(8), 400);
      return () => clearTimeout(t);
    }
    const id = setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + (90 - p) * 0.15));
    }, 180);
    return () => clearInterval(id);
  }, [active]);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="loading-screen"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-background"
          style={{
            backgroundImage:
              "radial-gradient(ellipse at 50% 30%, hsl(var(--primary) / 0.12), transparent 60%), radial-gradient(ellipse at 50% 90%, hsl(var(--accent) / 0.08), transparent 55%)",
          }}
          aria-live="polite"
          aria-busy="true"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="relative flex flex-col items-center gap-6"
          >
            {/* Halo pulsante */}
            <div className="relative flex h-28 w-28 items-center justify-center">
              <motion.span
                className="absolute inset-0 rounded-full bg-primary/25 blur-2xl"
                animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.85, 0.5] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.img
                src={pmRank.url}
                alt=""
                className="relative h-24 w-24 select-none object-contain drop-shadow-[0_0_18px_hsl(var(--primary)/0.45)]"
                draggable={false}
                animate={{ scale: [1, 1.06, 1] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>

            <div className="flex flex-col items-center gap-2">
              <p className="text-sm font-semibold tracking-widest text-foreground/90">
                PCM
              </p>
              <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">
                Carregando
              </p>
            </div>

            {/* Barra de progresso real */}
            <div className="relative h-1 w-56 overflow-hidden rounded-full bg-muted/50">
              <motion.div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-primary to-accent"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

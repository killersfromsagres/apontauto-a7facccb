import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Loading global minimalista do Apont Auto.
 * Exibe somente a marca oficial com animação leve e não bloqueia
 * navegações rápidas: aparece apenas quando a transição ultrapassa 120 ms.
 */
export function LoadingScreen() {
  const routerLoading = useRouterState({
    select: (state) => state.isLoading || state.status === "pending",
  });

  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hardTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearTimers = () => {
      if (showTimer.current) clearTimeout(showTimer.current);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (hardTimeout.current) clearTimeout(hardTimeout.current);
      showTimer.current = null;
      hideTimer.current = null;
      hardTimeout.current = null;
    };

    clearTimers();

    if (routerLoading) {
      showTimer.current = setTimeout(() => {
        setMounted(true);
        requestAnimationFrame(() => setVisible(true));
      }, 120);

      hardTimeout.current = setTimeout(() => {
        setVisible(false);
        hideTimer.current = setTimeout(() => setMounted(false), 220);
      }, 7000);
    } else {
      setVisible(false);
      hideTimer.current = setTimeout(() => setMounted(false), 220);
    }

    return clearTimers;
  }, [routerLoading]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#02060a] px-6"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        pointerEvents: visible ? "auto" : "none",
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Carregando Apont Auto"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(0,174,239,.075), transparent 24rem), linear-gradient(180deg, #03080d 0%, #02060a 100%)",
        }}
      />

      <div className="relative grid h-[300px] w-[300px] place-items-center sm:h-[340px] sm:w-[340px]">
        <span
          aria-hidden
          className="aa-brand-loader-halo absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/[0.08] blur-[54px] sm:h-60 sm:w-60"
        />
        <span
          aria-hidden
          className="aa-brand-loader-ring absolute left-1/2 top-1/2 h-[270px] w-[270px] -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-[310px] sm:w-[310px]"
        />
        <img
          src="/apontauto-logo.png"
          alt=""
          width={1000}
          height={1000}
          decoding="async"
          fetchPriority="high"
          className="aa-brand-loader-logo relative z-10 h-auto w-[250px] object-contain sm:w-[285px]"
        />
      </div>
    </div>
  );
}

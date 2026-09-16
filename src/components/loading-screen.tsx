import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Loading screen corporativo e não-bloqueante.
 * - Só aparece quando uma transição ultrapassa 140 ms.
 * - Some imediatamente quando o roteador fica pronto (fade de 180 ms).
 * - Possui hard timeout de 6 s para nunca cobrir a aplicação indefinidamente.
 * - CSS puro, sem dependências de animação no bundle inicial.
 */
export function LoadingScreen() {
  const routerLoading = useRouterState({
    select: (state) => state.isLoading || state.isTransitioning,
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
      }, 140);

      hardTimeout.current = setTimeout(() => {
        setVisible(false);
        hideTimer.current = setTimeout(() => setMounted(false), 180);
      }, 6000);
    } else {
      setVisible(false);
      hideTimer.current = setTimeout(() => setMounted(false), 180);
    }

    return clearTimers;
  }, [routerLoading]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#05080d] px-5"
      style={{
        opacity: visible ? 1 : 0,
        transition: "opacity 180ms cubic-bezier(0.4, 0, 0.2, 1)",
        pointerEvents: visible ? "auto" : "none",
      }}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Preparando ambiente"
    >
      <style>{`
        @keyframes pcm-ring-spin { to { transform: rotate(360deg); } }
        @keyframes pcm-ring-spin-reverse { to { transform: rotate(-360deg); } }
        @keyframes pcm-core-pulse {
          0%, 100% { opacity: .55; transform: scale(.94); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes pcm-scan {
          0% { transform: translateX(-115%); opacity: 0; }
          20% { opacity: .7; }
          75% { opacity: .7; }
          100% { transform: translateX(215%); opacity: 0; }
        }
        @keyframes pcm-dot {
          0%, 80%, 100% { opacity: .28; transform: translateY(0); }
          40% { opacity: 1; transform: translateY(-2px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .pcm-loader-motion { animation: none !important; }
        }
      `}</style>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 43%, rgba(71,170,255,.12), transparent 22rem), linear-gradient(180deg, rgba(5,12,20,.3), rgba(2,5,9,.86))",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.055]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.22) 1px, transparent 1px)",
          backgroundSize: "46px 46px",
          maskImage: "radial-gradient(circle at center, black, transparent 68%)",
          WebkitMaskImage: "radial-gradient(circle at center, black, transparent 68%)",
        }}
      />

      <div className="relative flex w-full max-w-sm flex-col items-center text-center">
        <div className="relative grid h-24 w-24 place-items-center">
          <div className="absolute inset-0 rounded-full border border-white/[0.07]" />
          <div
            className="pcm-loader-motion absolute inset-[5px] rounded-full"
            style={{
              border: "1px solid transparent",
              borderTopColor: "rgba(82,229,255,.9)",
              borderRightColor: "rgba(79,140,255,.24)",
              animation: "pcm-ring-spin 1.15s linear infinite",
              boxShadow: "0 0 24px rgba(82,229,255,.08)",
            }}
          />
          <div
            className="pcm-loader-motion absolute inset-[14px] rounded-full"
            style={{
              border: "1px solid transparent",
              borderBottomColor: "rgba(79,140,255,.72)",
              borderLeftColor: "rgba(82,229,255,.16)",
              animation: "pcm-ring-spin-reverse 1.8s linear infinite",
            }}
          />
          <div className="absolute inset-[24px] rounded-2xl border border-white/[0.08] bg-white/[0.035] shadow-[inset_0_0_22px_rgba(82,229,255,0.035)] backdrop-blur-sm" />
          <div
            className="pcm-loader-motion relative grid h-8 w-8 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/[0.06] text-[11px] font-bold tracking-[0.18em] text-cyan-100/90"
            style={{ animation: "pcm-core-pulse 1.8s ease-in-out infinite" }}
          >
            AA
          </div>
          <span className="absolute left-1/2 top-0 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-cyan-200/80 shadow-[0_0_12px_rgba(82,229,255,.7)]" />
        </div>

        <div className="mt-7">
          <p className="text-[11px] font-semibold uppercase tracking-[0.34em] text-white/88">
            APONT AUTO
          </p>
          <p className="mt-2 text-[12px] font-medium tracking-[0.12em] text-slate-400">
            Preparando ambiente
          </p>
        </div>

        <div className="relative mt-6 h-px w-52 overflow-hidden bg-white/[0.07]">
          <span
            className="pcm-loader-motion absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent"
            style={{ animation: "pcm-scan 1.55s ease-in-out infinite" }}
          />
        </div>

        <div className="mt-4 flex items-center gap-1.5" aria-hidden>
          {[0, 1, 2].map((index) => (
            <span
              key={index}
              className="pcm-loader-motion h-1 w-1 rounded-full bg-cyan-200/80"
              style={{ animation: `pcm-dot 1.25s ${index * 0.14}s ease-in-out infinite` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

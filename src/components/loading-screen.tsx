import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Loading global premium, leve e não bloqueante.
 * - só aparece quando a navegação ultrapassa 120 ms;
 * - desaparece assim que o roteador conclui a transição;
 * - possui timeout de segurança para nunca ficar preso sobre a aplicação;
 * - usa apenas CSS para não aumentar o bundle inicial.
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
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#05070a] px-5"
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
      <style>{`
        @keyframes aa-loader-orbit {
          to { transform: rotate(360deg); }
        }
        @keyframes aa-loader-orbit-reverse {
          to { transform: rotate(-360deg); }
        }
        @keyframes aa-loader-breathe {
          0%, 100% { opacity: .72; transform: scale(.985); }
          50% { opacity: 1; transform: scale(1); }
        }
        @keyframes aa-loader-scan {
          0% { transform: translateX(-135%); opacity: 0; }
          18% { opacity: 1; }
          82% { opacity: 1; }
          100% { transform: translateX(320%); opacity: 0; }
        }
        @keyframes aa-loader-status {
          0%, 100% { opacity: .35; }
          50% { opacity: 1; }
        }
        @keyframes aa-loader-grid {
          0% { background-position: 0 0, 0 0; }
          100% { background-position: 0 44px, 44px 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .aa-loader-motion { animation: none !important; }
        }
      `}</style>

      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 46%, rgba(37,177,255,.105), transparent 26rem), radial-gradient(circle at 50% 42%, rgba(255,255,255,.035), transparent 14rem), linear-gradient(180deg, #070a0e 0%, #040609 58%, #030507 100%)",
        }}
      />

      <div
        aria-hidden
        className="aa-loader-motion pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.22) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.22) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
          maskImage: "radial-gradient(circle at center, black 0%, transparent 70%)",
          WebkitMaskImage: "radial-gradient(circle at center, black 0%, transparent 70%)",
          animation: "aa-loader-grid 8s linear infinite",
        }}
      />

      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[34rem] w-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.025]"
      />

      <section className="relative w-full max-w-[390px] overflow-hidden rounded-[30px] border border-white/[0.075] bg-white/[0.028] px-7 py-8 text-center shadow-[0_32px_100px_rgba(0,0,0,.46),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl sm:px-9 sm:py-9">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-cyan-200/40 to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-28 h-52 w-52 rounded-full bg-cyan-300/[0.035] blur-3xl"
        />

        <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/[0.07] bg-black/20 px-3 py-1.5">
          <span className="aa-loader-motion h-1.5 w-1.5 rounded-full bg-cyan-200 shadow-[0_0_12px_rgba(103,232,249,.8)]" style={{ animation: "aa-loader-status 1.6s ease-in-out infinite" }} />
          <span className="text-[9px] font-semibold uppercase tracking-[0.28em] text-white/45">
            PCM ONLINE
          </span>
        </div>

        <div className="relative mx-auto mt-7 grid h-[112px] w-[112px] place-items-center">
          <div className="absolute inset-0 rounded-full border border-white/[0.055]" />
          <div
            className="aa-loader-motion absolute inset-[5px] rounded-full"
            style={{
              border: "1px solid transparent",
              borderTopColor: "rgba(124,226,255,.82)",
              borderRightColor: "rgba(124,226,255,.14)",
              animation: "aa-loader-orbit 1.65s linear infinite",
              filter: "drop-shadow(0 0 8px rgba(82,206,255,.18))",
            }}
          />
          <div
            className="aa-loader-motion absolute inset-[15px] rounded-full"
            style={{
              border: "1px solid transparent",
              borderBottomColor: "rgba(120,157,255,.62)",
              borderLeftColor: "rgba(120,157,255,.12)",
              animation: "aa-loader-orbit-reverse 2.5s linear infinite",
            }}
          />
          <div className="absolute inset-[28px] rounded-[22px] border border-white/[0.08] bg-gradient-to-b from-white/[0.06] to-white/[0.018] shadow-[inset_0_1px_0_rgba(255,255,255,.05),0_12px_28px_rgba(0,0,0,.28)]" />
          <div
            className="aa-loader-motion relative flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-200/[0.16] bg-[#091018]/90 shadow-[0_0_30px_rgba(55,190,255,.08)]"
            style={{ animation: "aa-loader-breathe 2.1s ease-in-out infinite" }}
          >
            <span className="translate-x-[1px] text-[12px] font-bold tracking-[0.2em] text-white/90">
              AA
            </span>
          </div>
          <span className="absolute right-[13px] top-[22px] h-1.5 w-1.5 rounded-full bg-cyan-200/80 shadow-[0_0_14px_rgba(103,232,249,.65)]" />
        </div>

        <div className="mt-6">
          <p className="text-[12px] font-semibold uppercase tracking-[0.34em] text-white/92">
            APONT AUTO
          </p>
          <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-white/35">
            Gestão de manutenção
          </p>
        </div>

        <div className="mx-auto mt-7 max-w-[250px]">
          <div className="mb-2.5 flex items-center justify-between text-[9px] uppercase tracking-[0.18em] text-white/28">
            <span>Sincronizando módulos</span>
            <span className="text-cyan-100/55">Seguro</span>
          </div>
          <div className="relative h-[3px] overflow-hidden rounded-full bg-white/[0.065]">
            <span
              className="aa-loader-motion absolute inset-y-0 left-0 w-[34%] rounded-full bg-gradient-to-r from-transparent via-cyan-200/80 to-transparent shadow-[0_0_10px_rgba(103,232,249,.3)]"
              style={{ animation: "aa-loader-scan 1.7s cubic-bezier(.4,0,.2,1) infinite" }}
            />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-[9px] uppercase tracking-[0.18em] text-white/28">
          <span>Dados</span>
          <span className="h-0.5 w-0.5 rounded-full bg-white/20" />
          <span>Operação</span>
          <span className="h-0.5 w-0.5 rounded-full bg-white/20" />
          <span>PCM</span>
        </div>
      </section>

      <p className="absolute bottom-7 left-1/2 -translate-x-1/2 whitespace-nowrap text-[8px] font-medium uppercase tracking-[0.26em] text-white/20">
        Ambiente operacional protegido
      </p>
    </div>
  );
}

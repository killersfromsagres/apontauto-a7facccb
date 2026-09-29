import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Loading global da aplicação.
 * Mantém a navegação rápida sem flash: só aparece após 120 ms e possui
 * timeout de segurança para nunca bloquear a interface indefinidamente.
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
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden bg-[#03070b]/[0.985] px-5"
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
            "radial-gradient(circle at 50% 42%, rgba(14,165,233,.095), transparent 29rem), radial-gradient(circle at 50% 48%, rgba(255,255,255,.026), transparent 18rem), linear-gradient(180deg, #050a0f 0%, #03070b 62%, #020508 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.025]"
      />

      <section className="relative w-full max-w-[360px] overflow-hidden rounded-[28px] border border-white/[0.075] bg-white/[0.025] px-7 py-9 text-center shadow-[0_30px_90px_rgba(0,0,0,.42),inset_0_1px_0_rgba(255,255,255,.035)] backdrop-blur-2xl sm:px-9">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-sky-200/35 to-transparent"
        />

        <div className="mx-auto flex w-fit items-center gap-2 rounded-full border border-white/[0.07] bg-black/20 px-3 py-1.5">
          <span className="aa-brand-loader-dot h-1.5 w-1.5 rounded-full bg-sky-300/80" />
          <span className="text-[8px] font-semibold uppercase tracking-[0.26em] text-white/42">
            SISTEMA ONLINE
          </span>
        </div>

        <div className="relative mx-auto mt-7 grid h-[138px] w-[250px] place-items-center">
          <span
            aria-hidden
            className="aa-brand-loader-halo absolute left-1/2 top-1/2 h-24 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-400/[0.08] blur-3xl"
          />
          <img
            src="/apontauto-logo.png"
            alt=""
            width={500}
            height={300}
            decoding="async"
            fetchPriority="high"
            className="aa-brand-loader-logo relative z-10 h-auto w-[230px] object-contain drop-shadow-[0_10px_34px_rgba(0,174,239,.14)]"
          />
        </div>

        <div className="mt-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/82">
            Gestão de manutenção
          </p>
          <p className="mt-2 text-[10px] text-white/34">
            Preparando dados e módulos operacionais
          </p>
        </div>

        <div className="mx-auto mt-7 max-w-[230px]">
          <div className="mb-2.5 flex items-center justify-between text-[8px] font-semibold uppercase tracking-[0.15em] text-white/28">
            <span>Sincronizando</span>
            <span className="text-sky-100/55">Seguro</span>
          </div>
          <div className="relative h-[2px] overflow-hidden rounded-full bg-white/[0.07]">
            <span className="aa-brand-loader-scan absolute inset-y-0 left-0 w-[38%] rounded-full bg-gradient-to-r from-transparent via-sky-300/85 to-transparent shadow-[0_0_10px_rgba(56,189,248,.28)]" />
          </div>
        </div>

        <div className="mt-5 flex items-center justify-center gap-2 text-[8px] font-medium uppercase tracking-[0.16em] text-white/24">
          <span>Dados</span>
          <span className="h-0.5 w-0.5 rounded-full bg-white/20" />
          <span>Operação</span>
          <span className="h-0.5 w-0.5 rounded-full bg-white/20" />
          <span>PCM</span>
        </div>
      </section>
    </div>
  );
}

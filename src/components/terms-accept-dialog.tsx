import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CheckCircle2, FileText, ShieldCheck, ScrollText, ArrowDown, Sparkles } from "lucide-react";

type Section = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "objeto",
    title: "1. Objeto",
    icon: FileText,
    body: (
      <p>
        O <strong>Apont Auto</strong> é um sistema corporativo de apontamento e planejamento de
        manutenção industrial, disponibilizado exclusivamente a usuários previamente autorizados.
      </p>
    ),
  },
  {
    id: "acesso",
    title: "2. Acesso e credenciais",
    icon: ShieldCheck,
    body: (
      <ul className="list-disc space-y-1 pl-5">
        <li>O acesso é restrito — não há cadastro aberto ao público.</li>
        <li>As credenciais são pessoais e intransferíveis.</li>
        <li>Você é responsável por manter a confidencialidade da sua senha.</li>
      </ul>
    ),
  },
  {
    id: "uso",
    title: "3. Uso permitido",
    icon: ScrollText,
    body: (
      <p>
        Utilize o sistema apenas para as finalidades operacionais autorizadas. É proibido tentar
        acessar áreas sem autorização, realizar engenharia reversa ou usar o sistema para
        atividades ilícitas.
      </p>
    ),
  },
  {
    id: "dados",
    title: "4. Privacidade e dados",
    icon: ShieldCheck,
    body: (
      <p>
        Tratamos dados pessoais conforme a <strong>LGPD (Lei nº 13.709/2018)</strong>. Não vendemos
        seus dados nem os compartilhamos com terceiros, exceto quando exigido por lei.
      </p>
    ),
  },
  {
    id: "responsabilidade",
    title: "5. Limitação de responsabilidade",
    icon: FileText,
    body: (
      <p>
        O sistema é fornecido "no estado em que se encontra". Não nos responsabilizamos por perdas
        indiretas decorrentes de indisponibilidade temporária ou uso indevido pelo usuário.
      </p>
    ),
  },
  {
    id: "aceite",
    title: "6. Aceite",
    icon: Sparkles,
    body: (
      <p>
        Ao clicar em <strong>Aceitar</strong> abaixo, você confirma que leu e concorda com os
        Termos de Uso e com a Política de Privacidade do Apont Auto. O aceite fica registrado com
        data, hora e versão para fins de auditoria.
      </p>
    ),
  },
];

export function TermsAcceptDialog({
  open,
  onOpenChange,
  onAccept,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAccept: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const [progress, setProgress] = useState(0);
  const [reachedBottom, setReachedBottom] = useState(false);
  const [activeId, setActiveId] = useState<string>(SECTIONS[0]!.id);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Reset when reopened
  useEffect(() => {
    if (!open) return;
    setProgress(0);
    setReachedBottom(false);
    setConfirming(false);
    setConfirmed(false);
    setActiveId(SECTIONS[0]!.id);
    // scroll back to top after mount
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
  }, [open]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / max) * 100));
    setProgress(pct);
    if (pct >= 95) setReachedBottom(true);

    // active section = last one whose top is above midline
    const mid = el.getBoundingClientRect().top + el.clientHeight * 0.35;
    let current = SECTIONS[0]!.id;
    for (const s of SECTIONS) {
      const node = sectionRefs.current[s.id];
      if (!node) continue;
      if (node.getBoundingClientRect().top <= mid) current = s.id;
    }
    setActiveId(current);
  };

  const scrollToEnd = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const handleAccept = () => {
    if (!reachedBottom || confirming || confirmed) return;
    setConfirming(true);
    // brief animated confirmation before closing
    window.setTimeout(() => {
      setConfirmed(true);
      window.setTimeout(() => {
        onAccept();
        onOpenChange(false);
      }, 900);
    }, 350);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-0 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] sm:rounded-2xl">
        {/* Local keyframes for effects */}
        <style>{`
          @keyframes terms-shimmer { 0%{background-position:-200% 0}100%{background-position:200% 0} }
          @keyframes terms-pop { 0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1} }
          @keyframes terms-ring { 0%{box-shadow:0 0 0 0 hsl(var(--primary)/.6)}100%{box-shadow:0 0 0 24px hsl(var(--primary)/0)} }
          @keyframes terms-check-draw { from{stroke-dashoffset:60} to{stroke-dashoffset:0} }
        `}</style>

        {/* Header with progress bar */}
        <div className="relative border-b border-white/10 bg-white/[0.02] px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            Termos de Uso — Apont Auto
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-white/60">
            Leia até o final para habilitar o botão de aceitação.
          </DialogDescription>

          {/* Progress bar */}
          <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-white/5">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 transition-[width] duration-200 ease-out"
              style={{
                width: `${progress}%`,
                boxShadow: "0 0 12px rgba(56,189,248,0.7)",
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr]">
          {/* Section rail (desktop) */}
          <nav className="hidden border-r border-white/10 bg-white/[0.02] p-3 md:block">
            <ul className="space-y-1">
              {SECTIONS.map((s) => {
                const active = activeId === s.id;
                const Icon = s.icon;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => {
                        sectionRefs.current[s.id]?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                      }}
                      className={`group flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-medium transition-all ${
                        active
                          ? "bg-cyan-400/10 text-cyan-200 shadow-[inset_2px_0_0_0_rgb(103,232,249)]"
                          : "text-white/50 hover:bg-white/5 hover:text-white/80"
                      }`}
                    >
                      <Icon className={`h-3.5 w-3.5 ${active ? "text-cyan-300" : ""}`} />
                      <span className="truncate">{s.title}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Scrollable terms body */}
          <div className="relative">
            {/* top/bottom fade masks */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-slate-950 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-slate-950 to-transparent" />

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="h-[52vh] overflow-y-auto overscroll-contain px-6 py-6 [scrollbar-width:thin]"
            >
              <div className="space-y-6">
                {SECTIONS.map((s, i) => {
                  const active = activeId === s.id;
                  const Icon = s.icon;
                  return (
                    <section
                      key={s.id}
                      ref={(node) => {
                        sectionRefs.current[s.id] = node;
                      }}
                      className={`rounded-xl border p-4 transition-all duration-500 ${
                        active
                          ? "border-cyan-400/40 bg-cyan-400/[0.04] shadow-[0_0_0_1px_rgba(103,232,249,0.15),0_10px_40px_-20px_rgba(56,189,248,0.5)]"
                          : "border-white/5 bg-white/[0.015]"
                      } animate-in fade-in slide-in-from-bottom-2`}
                      style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
                    >
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                        <span
                          className={`grid h-6 w-6 place-items-center rounded-md transition-colors ${
                            active ? "bg-cyan-400/20 text-cyan-200" : "bg-white/5 text-white/60"
                          }`}
                        >
                          <Icon className="h-3.5 w-3.5" />
                        </span>
                        {s.title}
                      </h3>
                      <div className="text-sm leading-relaxed text-white/70">{s.body}</div>
                    </section>
                  );
                })}
              </div>
            </div>

            {/* Scroll hint */}
            {!reachedBottom && (
              <button
                type="button"
                onClick={scrollToEnd}
                className="absolute inset-x-0 bottom-3 z-20 mx-auto flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-slate-900/80 px-3 py-1.5 text-[11px] font-medium text-white/80 shadow-lg backdrop-blur transition hover:border-cyan-400/40 hover:text-cyan-200"
              >
                <ArrowDown className="h-3 w-3 animate-bounce" />
                Role até o final para continuar
              </button>
            )}
          </div>
        </div>

        {/* Footer / accept */}
        <div className="relative border-t border-white/10 bg-white/[0.02] px-6 py-4">
          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-[11px] text-white/50">
              Progresso de leitura:{" "}
              <span className={reachedBottom ? "text-cyan-300" : "text-white/70"}>
                {progress}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-md px-3 py-2 text-xs font-medium text-white/60 transition hover:bg-white/5 hover:text-white/90"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={!reachedBottom || confirming || confirmed}
                aria-live="polite"
                className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-md px-5 py-2 text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
                  confirmed
                    ? "bg-emerald-500 text-white"
                    : reachedBottom
                      ? "bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 text-slate-950 hover:shadow-[0_10px_30px_-8px_rgba(56,189,248,0.7)] active:scale-[0.97]"
                      : "cursor-not-allowed bg-white/5 text-white/40"
                }`}
                style={
                  reachedBottom && !confirmed
                    ? { animation: "terms-ring 1.8s ease-out infinite" }
                    : undefined
                }
              >
                {/* Shimmer overlay when enabled */}
                {reachedBottom && !confirmed && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-60"
                    style={{
                      background:
                        "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)",
                      backgroundSize: "200% 100%",
                      animation: "terms-shimmer 2.2s linear infinite",
                    }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  {confirmed ? (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Aceito!
                    </>
                  ) : confirming ? (
                    <>
                      <span className="h-2 w-2 animate-ping rounded-full bg-slate-950" />
                      Confirmando…
                    </>
                  ) : (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      Aceitar Termos
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Success overlay */}
        {confirmed && (
          <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-300">
            <div
              className="flex flex-col items-center gap-3"
              style={{ animation: "terms-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
            >
              <div className="relative grid h-20 w-20 place-items-center rounded-full bg-emerald-500 shadow-[0_0_40px_rgba(16,185,129,0.6)]">
                <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path
                    d="M5 12l5 5L20 7"
                    style={{
                      strokeDasharray: 60,
                      strokeDashoffset: 60,
                      animation: "terms-check-draw 0.5s ease-out 0.15s forwards",
                    }}
                  />
                </svg>
              </div>
              <p className="text-sm font-semibold text-white">Termos aceitos com sucesso</p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

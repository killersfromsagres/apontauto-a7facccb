import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  CheckCircle2,
  ScrollText,
  KeyRound,
  Gavel,
  Lock,
  ShieldAlert,
  Handshake,
  ArrowDown,
  ShieldCheck,
  Check,
} from "lucide-react";

type Section = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind color classes when the section is "concluded" */
  accent: { text: string; bg: string; ring: string; glow: string };
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "objeto",
    title: "1. Objeto",
    icon: ScrollText,
    accent: {
      text: "text-cyan-300",
      bg: "bg-cyan-400/15",
      ring: "ring-cyan-400/50",
      glow: "shadow-[0_0_18px_-2px_rgba(103,232,249,0.55)]",
    },
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
    icon: KeyRound,
    accent: {
      text: "text-amber-300",
      bg: "bg-amber-400/15",
      ring: "ring-amber-400/50",
      glow: "shadow-[0_0_18px_-2px_rgba(252,211,77,0.55)]",
    },
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
    icon: Gavel,
    accent: {
      text: "text-violet-300",
      bg: "bg-violet-400/15",
      ring: "ring-violet-400/50",
      glow: "shadow-[0_0_18px_-2px_rgba(196,181,253,0.55)]",
    },
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
    icon: Lock,
    accent: {
      text: "text-emerald-300",
      bg: "bg-emerald-400/15",
      ring: "ring-emerald-400/50",
      glow: "shadow-[0_0_18px_-2px_rgba(110,231,183,0.55)]",
    },
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
    icon: ShieldAlert,
    accent: {
      text: "text-rose-300",
      bg: "bg-rose-400/15",
      ring: "ring-rose-400/50",
      glow: "shadow-[0_0_18px_-2px_rgba(253,164,175,0.55)]",
    },
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
    icon: Handshake,
    accent: {
      text: "text-sky-300",
      bg: "bg-sky-400/15",
      ring: "ring-sky-400/50",
      glow: "shadow-[0_0_18px_-2px_rgba(125,211,252,0.55)]",
    },
    body: (
      <p>
        Ao confirmar abaixo, você declara que <strong>leu, compreendeu e concorda</strong> com os
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
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set());
  const [checked, setChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  // Reset when reopened
  useEffect(() => {
    if (!open) return;
    setProgress(0);
    setReachedBottom(false);
    setConfirming(false);
    setConfirmed(false);
    setChecked(false);
    setReadIds(new Set());
    setActiveId(SECTIONS[0]!.id);
    requestAnimationFrame(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    });
  }, [open]);

  const totalRead = readIds.size;
  const allRead = totalRead === SECTIONS.length;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const max = el.scrollHeight - el.clientHeight;
    const pct = max <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / max) * 100));
    setProgress(pct);
    if (pct >= 95) setReachedBottom(true);

    const viewportTop = el.getBoundingClientRect().top;
    const viewportBottom = viewportTop + el.clientHeight;
    const mid = viewportTop + el.clientHeight * 0.35;

    let current = SECTIONS[0]!.id;
    const newlyRead: string[] = [];
    for (const s of SECTIONS) {
      const node = sectionRefs.current[s.id];
      if (!node) continue;
      const r = node.getBoundingClientRect();
      if (r.top <= mid) current = s.id;
      // section counts as "read" once its bottom scrolled past 70% of viewport
      if (r.bottom <= viewportTop + el.clientHeight * 0.7) {
        newlyRead.push(s.id);
      }
    }
    // last section becomes read when bottom is fully in view
    const last = SECTIONS[SECTIONS.length - 1]!;
    const lastNode = sectionRefs.current[last.id];
    if (lastNode) {
      const r = lastNode.getBoundingClientRect();
      if (r.bottom <= viewportBottom + 4) newlyRead.push(last.id);
    }

    if (newlyRead.length) {
      setReadIds((prev) => {
        let changed = false;
        const next = new Set(prev);
        for (const id of newlyRead) if (!next.has(id)) { next.add(id); changed = true; }
        return changed ? next : prev;
      });
    }
    setActiveId(current);
  };

  const scrollToSection = (id: string) => {
    sectionRefs.current[id]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToEnd = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  const canAccept = reachedBottom && allRead && checked && !confirming && !confirmed;

  const handleAccept = () => {
    if (!canAccept) return;
    setConfirming(true);
    window.setTimeout(() => {
      setConfirmed(true);
      window.setTimeout(() => {
        onAccept();
        onOpenChange(false);
      }, 900);
    }, 350);
  };

  const readCountLabel = useMemo(
    () => `${totalRead}/${SECTIONS.length} seções lidas`,
    [totalRead],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden border-white/10 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-0 text-white shadow-[0_30px_80px_-20px_rgba(0,0,0,0.8)] sm:rounded-2xl">
        <style>{`
          @keyframes terms-shimmer { 0%{background-position:-200% 0}100%{background-position:200% 0} }
          @keyframes terms-pop { 0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1} }
          @keyframes terms-ring { 0%{box-shadow:0 0 0 0 hsl(var(--primary)/.55)}100%{box-shadow:0 0 0 22px hsl(var(--primary)/0)} }
          @keyframes terms-check-draw { from{stroke-dashoffset:60} to{stroke-dashoffset:0} }
          @keyframes terms-icon-pop { 0%{transform:scale(.6);opacity:0} 60%{transform:scale(1.2)} 100%{transform:scale(1);opacity:1} }
          .terms-scroll::-webkit-scrollbar{width:8px}
          .terms-scroll::-webkit-scrollbar-thumb{background:linear-gradient(180deg,rgba(103,232,249,.4),rgba(59,130,246,.4));border-radius:8px}
          .terms-scroll{scroll-behavior:smooth}
        `}</style>

        {/* Header */}
        <div className="relative border-b border-white/10 bg-white/[0.02] px-6 py-5">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <ShieldCheck className="h-5 w-5 text-cyan-300" />
            Termos de Uso — Apont Auto
          </DialogTitle>
          <DialogDescription className="mt-1 text-xs text-white/60">
            Leia todas as seções — os ícones se acendem conforme você avança.
          </DialogDescription>

          <div className="absolute inset-x-0 bottom-0 h-[3px] overflow-hidden bg-white/5">
            <div
              className="h-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 transition-[width] duration-300 ease-out"
              style={{
                width: `${progress}%`,
                boxShadow: "0 0 12px rgba(56,189,248,0.7)",
              }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr]">
          {/* Section rail */}
          <nav className="hidden border-r border-white/10 bg-white/[0.02] p-3 md:block">
            <ul className="space-y-1">
              {SECTIONS.map((s, idx) => {
                const active = activeId === s.id;
                const read = readIds.has(s.id);
                const Icon = s.icon;
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      onClick={() => scrollToSection(s.id)}
                      className={`group flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-[11px] font-medium transition-all duration-300 ${
                        active
                          ? "bg-white/[0.06] text-white shadow-[inset_2px_0_0_0_rgb(103,232,249)]"
                          : "text-white/50 hover:bg-white/5 hover:text-white/80"
                      }`}
                    >
                      <span
                        className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-md transition-all duration-500 ${
                          read
                            ? `${s.accent.bg} ${s.accent.text} ${s.accent.glow} ring-1 ${s.accent.ring}`
                            : "bg-white/5 text-white/40 ring-1 ring-white/5"
                        }`}
                        style={read ? { animation: "terms-icon-pop .45s cubic-bezier(.34,1.56,.64,1) both" } : undefined}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {read && (
                          <span className="absolute -right-1 -top-1 grid h-3 w-3 place-items-center rounded-full bg-emerald-500 text-white ring-2 ring-slate-950">
                            <Check className="h-2 w-2" strokeWidth={4} />
                          </span>
                        )}
                      </span>
                      <span className="truncate">{s.title}</span>
                      <span className="ml-auto text-[9px] text-white/30 tabular-nums">
                        {String(idx + 1).padStart(2, "0")}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-3 border-t border-white/5 pt-3 text-[10px] text-white/40">
              {readCountLabel}
            </div>
          </nav>

          {/* Scrollable body */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b from-slate-950 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-10 bg-gradient-to-t from-slate-950 to-transparent" />

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="terms-scroll h-[52vh] overflow-y-auto overscroll-contain px-6 py-6"
            >
              <div className="space-y-5">
                {SECTIONS.map((s, i) => {
                  const active = activeId === s.id;
                  const read = readIds.has(s.id);
                  const Icon = s.icon;
                  return (
                    <section
                      key={s.id}
                      ref={(node) => {
                        sectionRefs.current[s.id] = node;
                      }}
                      className={`group rounded-xl border p-4 transition-all duration-500 ${
                        active
                          ? `border-white/20 bg-white/[0.04] ${s.accent.glow}`
                          : read
                            ? "border-white/10 bg-white/[0.02]"
                            : "border-white/5 bg-white/[0.015]"
                      } animate-in fade-in slide-in-from-bottom-2`}
                      style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
                    >
                      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-white">
                        <span
                          className={`relative grid h-7 w-7 place-items-center rounded-lg transition-all duration-500 ${
                            read
                              ? `${s.accent.bg} ${s.accent.text} ${s.accent.glow} ring-1 ${s.accent.ring}`
                              : active
                                ? "bg-white/10 text-white/80 ring-1 ring-white/10"
                                : "bg-white/5 text-white/50 ring-1 ring-white/5"
                          }`}
                          style={read ? { animation: "terms-icon-pop .5s cubic-bezier(.34,1.56,.64,1) both" } : undefined}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        {s.title}
                        {read && (
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300 ring-1 ring-emerald-400/30">
                            <Check className="h-2.5 w-2.5" strokeWidth={4} />
                            Lido
                          </span>
                        )}
                      </h3>
                      <div className="text-sm leading-relaxed text-white/75">{s.body}</div>
                    </section>
                  );
                })}
              </div>
            </div>

            {!reachedBottom && (
              <button
                type="button"
                onClick={scrollToEnd}
                className="absolute inset-x-0 bottom-3 z-20 mx-auto flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-slate-900/85 px-3 py-1.5 text-[11px] font-medium text-white/80 shadow-lg backdrop-blur transition hover:border-cyan-400/40 hover:text-cyan-200"
              >
                <ArrowDown className="h-3 w-3 animate-bounce" />
                Role até o final para continuar
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="relative border-t border-white/10 bg-white/[0.02] px-6 py-4">
          {/* Explicit acceptance checkbox */}
          <label
            className={`mb-3 flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all duration-300 ${
              !allRead
                ? "cursor-not-allowed border-white/5 bg-white/[0.02] opacity-50"
                : checked
                  ? "border-emerald-400/40 bg-emerald-400/[0.06]"
                  : "border-white/10 bg-white/[0.03] hover:border-cyan-400/30 hover:bg-cyan-400/[0.04]"
            }`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={checked}
              disabled={!allRead}
              onChange={(e) => setChecked(e.target.checked)}
            />
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-all duration-300 ${
                checked
                  ? "border-emerald-400 bg-emerald-500 shadow-[0_0_14px_-2px_rgba(52,211,153,0.7)]"
                  : "border-white/25 bg-transparent"
              }`}
            >
              {checked && <Check className="h-3 w-3 text-white" strokeWidth={4} />}
            </span>
            <span className="text-xs leading-relaxed text-white/80">
              Declaro que <strong className="text-white">li, compreendi e concordo</strong> com os
              Termos de Uso e com a Política de Privacidade do Apont Auto.
              {!allRead && (
                <span className="mt-1 block text-[10px] text-white/40">
                  Leia todas as seções para habilitar esta opção.
                </span>
              )}
            </span>
          </label>

          <div className="flex flex-col-reverse items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3 text-[11px] text-white/50">
              <span>
                Leitura:{" "}
                <span className={reachedBottom ? "text-cyan-300" : "text-white/70"}>{progress}%</span>
              </span>
              <span className="text-white/20">•</span>
              <span className={allRead ? "text-emerald-300" : "text-white/70"}>{readCountLabel}</span>
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
                disabled={!canAccept}
                aria-live="polite"
                className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-md px-5 py-2 text-sm font-semibold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
                  confirmed
                    ? "bg-emerald-500 text-white"
                    : canAccept
                      ? "bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 text-slate-950 hover:shadow-[0_10px_30px_-8px_rgba(56,189,248,0.7)] active:scale-[0.97]"
                      : "cursor-not-allowed bg-white/5 text-white/40"
                }`}
                style={canAccept ? { animation: "terms-ring 1.8s ease-out infinite" } : undefined}
              >
                {canAccept && (
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
                    <>Confirmar e Aceitar</>
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

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
        manutenção industrial, <strong>desenvolvido por @oferrolgarcia</strong> e disponibilizado
        exclusivamente aos colaboradores previamente cadastrados pelo administrador.
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
        <li>
          <strong>Não há cadastro público</strong> — o sistema não coleta dados de novos usuários.
        </li>
        <li>
          O acesso é feito por credenciais corporativas fornecidas internamente aos colaboradores
          autorizados.
        </li>
        <li>
          As credenciais são pessoais, intransferíveis e de uso restrito ao ambiente de trabalho.
        </li>
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
        acessar áreas sem autorização, realizar engenharia reversa ou usar o sistema para atividades
        ilícitas.
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
      <div className="space-y-2">
        <p>
          Como <strong>não existe cadastro público</strong>, o sistema{" "}
          <strong>não coleta dados pessoais de visitantes</strong>. Apenas as informações
          operacionais necessárias ao apontamento e planejamento de manutenção são armazenadas.
        </p>
        <p>
          O tratamento de dados segue a <strong>LGPD (Lei nº 13.709/2018)</strong>. Nenhum dado é
          vendido ou compartilhado com terceiros, exceto quando exigido por lei.
        </p>
      </div>
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
        O sistema é fornecido "no estado em que se encontra" pelo desenvolvedor{" "}
        <strong>@oferrolgarcia</strong>. Não nos responsabilizamos por perdas indiretas decorrentes
        de indisponibilidade temporária ou uso indevido pelo usuário.
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
        data, hora e versão para fins de auditoria interna.
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
        for (const id of newlyRead)
          if (!next.has(id)) {
            next.add(id);
            changed = true;
          }
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

  const readCountLabel = useMemo(() => `${totalRead}/${SECTIONS.length} seções lidas`, [totalRead]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-0 overflow-hidden border-white/15 p-0 text-white shadow-[0_40px_100px_-20px_rgba(0,0,0,0.7)] sm:rounded-[28px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 data-[state=open]:slide-in-from-bottom-4"
        style={{
          background:
            "linear-gradient(155deg, rgba(30,41,59,0.72) 0%, rgba(15,23,42,0.78) 50%, rgba(2,6,23,0.82) 100%)",
          backdropFilter: "blur(40px) saturate(180%)",
          WebkitBackdropFilter: "blur(40px) saturate(180%)",
        }}
      >
        {/* iOS-style ambient light blobs */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full bg-violet-500/20 blur-3xl"
        />

        <style>{`
          @keyframes terms-shimmer { 0%{background-position:-200% 0}100%{background-position:200% 0} }
          @keyframes terms-pop { 0%{transform:scale(.5);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1} }
          @keyframes terms-ring { 0%{box-shadow:0 0 0 0 rgba(56,189,248,.55)}100%{box-shadow:0 0 0 22px rgba(56,189,248,0)} }
          @keyframes terms-check-draw { from{stroke-dashoffset:60} to{stroke-dashoffset:0} }
          @keyframes terms-icon-pop { 0%{transform:scale(.6);opacity:0} 60%{transform:scale(1.2)} 100%{transform:scale(1);opacity:1} }
          .terms-scroll::-webkit-scrollbar{width:6px}
          .terms-scroll::-webkit-scrollbar-thumb{background:rgba(255,255,255,.18);border-radius:999px}
          .terms-scroll::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,.28)}
          .terms-scroll{scroll-behavior:smooth;scrollbar-width:thin;scrollbar-color:rgba(255,255,255,.18) transparent}
          .terms-glass-card{transition:transform .5s cubic-bezier(.34,1.56,.64,1),background .4s,border-color .4s,box-shadow .4s}
          .terms-nav-btn{transition:all .35s cubic-bezier(.34,1.56,.64,1)}
        `}</style>

        {/* Header — iOS 17 style */}
        <div
          className="relative border-b border-white/10 px-6 py-5"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <DialogTitle className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em]">
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-gradient-to-br from-cyan-400/25 to-blue-500/25 ring-1 ring-white/15 backdrop-blur-xl">
              <ShieldCheck className="h-4 w-4 text-cyan-200" />
            </span>
            Termos de Uso
            <span className="ml-1 text-[13px] font-normal text-white/50">· Apont Auto</span>
          </DialogTitle>
          <DialogDescription className="mt-1.5 text-[12px] leading-relaxed tracking-[-0.01em] text-white/55">
            Leia todas as seções — os ícones se acendem conforme você avança.
          </DialogDescription>

          {/* Progress pill */}
          <div className="absolute inset-x-0 bottom-0 h-[2px] overflow-hidden bg-white/[0.06]">
            <div
              className="h-full rounded-r-full bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 transition-[width] duration-500 ease-out"
              style={{
                width: `${progress}%`,
                boxShadow: "0 0 14px rgba(56,189,248,0.75)",
              }}
            />
          </div>
        </div>

        <div className="relative grid grid-cols-1 md:grid-cols-[210px_1fr]">
          {/* Section rail */}
          <nav
            className="hidden border-r border-white/10 p-3 md:block"
            style={{ background: "rgba(255,255,255,0.02)" }}
          >
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
                      className={`terms-nav-btn group flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-[11.5px] font-medium tracking-[-0.01em] ${
                        active
                          ? "bg-white/[0.09] text-white ring-1 ring-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                          : "text-white/55 hover:bg-white/[0.05] hover:text-white/90"
                      }`}
                    >
                      <span
                        className={`relative grid h-6 w-6 shrink-0 place-items-center rounded-lg transition-all duration-500 ${
                          read
                            ? `${s.accent.bg} ${s.accent.text} ${s.accent.glow} ring-1 ${s.accent.ring}`
                            : "bg-white/[0.06] text-white/40 ring-1 ring-white/10"
                        }`}
                        style={
                          read
                            ? { animation: "terms-icon-pop .45s cubic-bezier(.34,1.56,.64,1) both" }
                            : undefined
                        }
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

            <div className="mt-3 border-t border-white/[0.06] pt-3 text-[10px] font-medium tracking-[-0.01em] text-white/45">
              {readCountLabel}
            </div>
          </nav>

          {/* Scrollable body */}
          <div className="relative">
            <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-10 bg-gradient-to-b from-slate-950/80 to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-12 bg-gradient-to-t from-slate-950/80 to-transparent" />

            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="terms-scroll h-[52vh] overflow-y-auto overscroll-contain px-6 py-6"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              <div className="space-y-4">
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
                      className={`terms-glass-card group rounded-2xl border p-4 backdrop-blur-xl ${
                        active
                          ? `border-white/20 bg-white/[0.07] ${s.accent.glow} scale-[1.005]`
                          : read
                            ? "border-white/10 bg-white/[0.035]"
                            : "border-white/[0.06] bg-white/[0.02]"
                      } animate-in fade-in slide-in-from-bottom-2`}
                      style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
                    >
                      <h3 className="mb-2.5 flex items-center gap-2.5 text-[14px] font-semibold tracking-[-0.015em] text-white">
                        <span
                          className={`relative grid h-8 w-8 place-items-center rounded-xl transition-all duration-500 ${
                            read
                              ? `${s.accent.bg} ${s.accent.text} ${s.accent.glow} ring-1 ${s.accent.ring}`
                              : active
                                ? "bg-white/[0.09] text-white/85 ring-1 ring-white/15"
                                : "bg-white/[0.05] text-white/50 ring-1 ring-white/10"
                          }`}
                          style={
                            read
                              ? {
                                  animation: "terms-icon-pop .5s cubic-bezier(.34,1.56,.64,1) both",
                                }
                              : undefined
                          }
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        {s.title}
                        {read && (
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium tracking-[-0.01em] text-emerald-300 ring-1 ring-emerald-400/30 backdrop-blur">
                            <Check className="h-2.5 w-2.5" strokeWidth={4} />
                            Lido
                          </span>
                        )}
                      </h3>
                      <div className="text-[13.5px] leading-[1.65] tracking-[-0.005em] text-white/75">
                        {s.body}
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>

            {!reachedBottom && (
              <button
                type="button"
                onClick={scrollToEnd}
                className="absolute inset-x-0 bottom-3 z-20 mx-auto flex w-fit items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-1.5 text-[11px] font-medium tracking-[-0.01em] text-white/85 shadow-[0_8px_24px_-6px_rgba(0,0,0,0.5)] transition-all duration-300 hover:scale-105 hover:border-cyan-400/50 hover:text-cyan-200"
                style={{
                  background: "rgba(15,23,42,0.55)",
                  backdropFilter: "blur(20px) saturate(180%)",
                  WebkitBackdropFilter: "blur(20px) saturate(180%)",
                }}
              >
                <ArrowDown className="h-3 w-3 animate-bounce" />
                Role até o final para continuar
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="relative border-t border-white/10 px-6 py-4"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          {/* Explicit acceptance checkbox */}
          <label
            className={`mb-3 flex cursor-pointer items-start gap-3 rounded-2xl border p-3 backdrop-blur-xl transition-all duration-400 ${
              !allRead
                ? "cursor-not-allowed border-white/[0.06] bg-white/[0.02] opacity-50"
                : checked
                  ? "border-emerald-400/40 bg-emerald-400/[0.08] shadow-[0_0_28px_-10px_rgba(52,211,153,0.5)]"
                  : "border-white/10 bg-white/[0.04] hover:scale-[1.005] hover:border-cyan-400/30 hover:bg-cyan-400/[0.05]"
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
                  ? "border-emerald-400 bg-emerald-500 shadow-[0_0_16px_-2px_rgba(52,211,153,0.8)]"
                  : "border-white/25 bg-transparent"
              }`}
            >
              {checked && <Check className="h-3 w-3 text-white" strokeWidth={4} />}
            </span>
            <span className="text-[12.5px] leading-relaxed tracking-[-0.01em] text-white/80">
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
            <div className="flex items-center gap-3 text-[11px] tracking-[-0.01em] text-white/50">
              <span>
                Leitura:{" "}
                <span
                  className={`tabular-nums ${reachedBottom ? "text-cyan-300" : "text-white/70"}`}
                >
                  {progress}%
                </span>
              </span>
              <span className="text-white/20">•</span>
              <span className={allRead ? "text-emerald-300" : "text-white/70"}>
                {readCountLabel}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-xl px-4 py-2 text-[13px] font-medium tracking-[-0.01em] text-white/65 transition-all duration-200 hover:bg-white/[0.06] hover:text-white active:scale-[0.97]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={!canAccept}
                aria-live="polite"
                className={`group relative inline-flex items-center gap-2 overflow-hidden rounded-xl px-5 py-2 text-[13.5px] font-semibold tracking-[-0.01em] transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${
                  confirmed
                    ? "bg-emerald-500 text-white"
                    : canAccept
                      ? "bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500 text-slate-950 shadow-[0_8px_24px_-6px_rgba(56,189,248,0.6)] hover:scale-[1.03] hover:shadow-[0_12px_36px_-8px_rgba(56,189,248,0.8)] active:scale-[0.97]"
                      : "cursor-not-allowed bg-white/[0.06] text-white/40"
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
          <div
            className="pointer-events-none absolute inset-0 z-30 grid place-items-center animate-in fade-in duration-300"
            style={{
              background: "rgba(2,6,23,0.55)",
              backdropFilter: "blur(24px) saturate(180%)",
              WebkitBackdropFilter: "blur(24px) saturate(180%)",
            }}
          >
            <div
              className="flex flex-col items-center gap-3"
              style={{ animation: "terms-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}
            >
              <div className="relative grid h-20 w-20 place-items-center rounded-full bg-emerald-500 shadow-[0_0_48px_rgba(16,185,129,0.7)]">
                <svg
                  viewBox="0 0 24 24"
                  className="h-10 w-10"
                  fill="none"
                  stroke="white"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
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
              <p className="text-[14px] font-semibold tracking-[-0.015em] text-white">
                Termos aceitos com sucesso
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

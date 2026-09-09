import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight, Clock3, Globe, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { LegalLayout } from "@/components/legal-layout";

const whatsappUrl =
  "https://wa.me/5511963239378?text=Ol%C3%A1%2C%20preciso%20de%20suporte%20sobre%20o%20Apont%20Auto.";

export const Route = createFileRoute("/contato")({
  head: () => ({
    meta: [
      { title: "Contato — Apont Auto" },
      {
        name: "description",
        content:
          "Fale com o responsável pelo Apont Auto para suporte, acesso, dúvidas operacionais e assuntos de privacidade.",
      },
      { property: "og:title", content: "Contato — Apont Auto" },
      {
        property: "og:description",
        content: "Canais oficiais de contato e suporte do Apont Auto.",
      },
      { property: "og:url", content: "https://apontauto.online/contato" },
    ],
    links: [{ rel: "canonical", href: "https://apontauto.online/contato" }],
  }),
  component: ContatoPage,
});

function ContatoPage() {
  return (
    <LegalLayout title="Contato e suporte">
      <p className="text-base sm:text-[17px]">
        Precisa de ajuda com o <strong>Apont Auto</strong>? Utilize os canais oficiais abaixo para
        dúvidas operacionais, solicitações de acesso, correções de dados, suporte técnico ou assuntos
        relacionados à privacidade.
      </p>

      <div className="not-prose mt-8 overflow-hidden rounded-2xl border border-emerald-400/20 bg-[linear-gradient(135deg,rgba(16,185,129,0.13),rgba(11,17,28,0.88)_58%)] p-1">
        <div className="rounded-[14px] border border-white/[0.05] bg-[#0A1218]/80 p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-emerald-300 shadow-[0_0_32px_rgba(16,185,129,0.08)]">
                <MessageCircle className="h-6 w-6" aria-hidden />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-semibold text-white">WhatsApp</p>
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-300">
                    Canal direto
                  </span>
                </div>
                <p className="mt-1 text-lg font-semibold tracking-tight text-white">
                  (11) 96323-9378
                </p>
                <p className="mt-1 max-w-xl text-xs leading-5 text-slate-400">
                  Atendimento para suporte, dúvidas sobre o sistema e solicitações relacionadas ao
                  uso da plataforma.
                </p>
              </div>
            </div>

            <a
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Falar com o Apont Auto pelo WhatsApp"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-emerald-300/20 bg-emerald-400 px-4 py-3 text-sm font-bold text-emerald-950 shadow-[0_14px_34px_rgba(16,185,129,0.16)] transition-colors hover:bg-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A1218]"
            >
              Falar no WhatsApp
              <ArrowUpRight className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </div>

      <div className="not-prose mt-4 grid gap-3 sm:grid-cols-2">
        <a
          href="mailto:gabrielvlp33@gmail.com"
          className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition-colors hover:border-blue-400/20 hover:bg-blue-400/[0.04]"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-blue-300">
              <Mail className="h-5 w-5" aria-hidden />
            </div>
            <ArrowUpRight className="h-4 w-4 text-slate-600 transition-colors group-hover:text-blue-300" aria-hidden />
          </div>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-500">
            E-mail
          </p>
          <p className="mt-1 break-all text-sm font-semibold text-slate-100">
            gabrielvlp33@gmail.com
          </p>
        </a>

        <a
          href="https://apontauto.online"
          className="group rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 transition-colors hover:border-blue-400/20 hover:bg-blue-400/[0.04]"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.04] text-blue-300">
              <Globe className="h-5 w-5" aria-hidden />
            </div>
            <ArrowUpRight className="h-4 w-4 text-slate-600 transition-colors group-hover:text-blue-300" aria-hidden />
          </div>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-500">
            Plataforma
          </p>
          <p className="mt-1 text-sm font-semibold text-slate-100">apontauto.online</p>
        </a>
      </div>

      <div className="not-prose mt-8 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <Clock3 className="h-5 w-5 text-slate-400" aria-hidden />
          <h2 className="mt-4 text-sm font-semibold text-white">Como podemos ajudar</h2>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Acesso ao sistema, dúvidas de operação, comportamento inesperado, correção de dados e
            orientação sobre recursos da plataforma.
          </p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5">
          <ShieldCheck className="h-5 w-5 text-slate-400" aria-hidden />
          <h2 className="mt-4 text-sm font-semibold text-white">Privacidade e segurança</h2>
          <p className="mt-2 text-xs leading-5 text-slate-400">
            Solicitações relacionadas a dados pessoais, permissões, acesso indevido ou questões de
            privacidade também podem ser encaminhadas pelos canais oficiais.
          </p>
        </div>
      </div>

      <h2>Responsável</h2>
      <p>
        <strong>Gabriel Vitor</strong> — desenvolvedor e responsável técnico pelo Apont Auto.
      </p>
    </LegalLayout>
  );
}

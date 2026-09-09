import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { LegalLayout } from "@/components/legal-layout";
import { WhatsAppMark } from "@/components/whatsapp-mark";

const whatsappUrl =
  "https://wa.me/5511963239378?text=Ol%C3%A1%2C%20preciso%20de%20suporte%20sobre%20o%20Apont%20Auto.";

export const Route = createFileRoute("/contato")({
  head: () => ({
    meta: [
      { title: "Contato — Apont Auto" },
      {
        name: "description",
        content:
          "Canais oficiais do Apont Auto para suporte, acesso, dúvidas operacionais e assuntos de privacidade.",
      },
      { property: "og:title", content: "Contato — Apont Auto" },
      {
        property: "og:description",
        content: "Entre em contato com o suporte do Apont Auto.",
      },
      { property: "og:url", content: "https://apontauto.online/contato" },
    ],
    links: [{ rel: "canonical", href: "https://apontauto.online/contato" }],
  }),
  component: ContatoPage,
});

function ContatoPage() {
  return (
    <LegalLayout
      title="Contato"
      description="Canais oficiais para suporte técnico, acesso ao sistema, dúvidas operacionais, correções de dados e assuntos relacionados à privacidade."
    >
      <section className="not-prose">
        <div className="grid gap-7 border-b border-white/[0.08] pb-10 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="max-w-2xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-600">
              Atendimento direto
            </p>
            <h2 className="mt-3 font-display text-2xl font-semibold tracking-[-0.025em] text-white">
              Fale pelo WhatsApp
            </h2>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Canal recomendado para suporte sobre o Apont Auto, dúvidas sobre módulos, permissões,
              funcionamento da plataforma e solicitações que precisem de acompanhamento direto.
            </p>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Falar com o suporte do Apont Auto pelo WhatsApp"
            className="inline-flex min-h-12 items-center justify-center gap-3 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(0,0,0,0.22)] transition-colors hover:bg-[#20C45A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080B10]"
          >
            <WhatsAppMark className="h-5 w-5 text-white" />
            Abrir WhatsApp
            <ArrowUpRight className="h-4 w-4 text-white/80" aria-hidden />
          </a>
        </div>

        <div className="grid gap-0 border-b border-white/[0.08] py-2 sm:grid-cols-2 sm:divide-x sm:divide-white/[0.08]">
          <a
            href="mailto:gabrielvlp33@gmail.com"
            className="group py-7 sm:pr-8"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
              E-mail
            </p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <p className="break-all text-sm font-medium text-slate-200">
                gabrielvlp33@gmail.com
              </p>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-white" aria-hidden />
            </div>
          </a>

          <a
            href="https://apontauto.online"
            className="group border-t border-white/[0.08] py-7 sm:border-t-0 sm:pl-8"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
              Plataforma
            </p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <p className="text-sm font-medium text-slate-200">apontauto.online</p>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-white" aria-hidden />
            </div>
          </a>
        </div>
      </section>

      <h2>Quando entrar em contato</h2>
      <p>
        Os canais de suporte podem ser utilizados para solicitar orientação sobre acesso ao sistema,
        permissões, navegação, comportamento inesperado, registros incorretos, exportações,
        documentos, anexos e funcionamento dos módulos disponibilizados ao usuário.
      </p>
      <p>
        Para facilitar a análise, sempre que possível informe a área do sistema, o que estava sendo
        realizado e o comportamento observado. Evite enviar senhas, tokens ou outras credenciais em
        mensagens ou anexos.
      </p>

      <h2>Privacidade e dados</h2>
      <p>
        Solicitações relacionadas a dados pessoais, correção de informações, acesso indevido ou
        privacidade também podem ser encaminhadas pelos canais desta página. Consulte a{" "}
        <a href="/privacidade">Política de Privacidade</a> para entender como essas informações são
        tratadas.
      </p>

      <h2>Responsável pelo sistema</h2>
      <p>
        O Apont Auto é desenvolvido e mantido por <strong>Gabriel Vitor</strong>, responsável técnico
        pela evolução da plataforma e pelo suporte dos recursos disponibilizados.
      </p>
    </LegalLayout>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Sobre — ApontAuto" },
      {
        name: "description",
        content:
          "ApontAuto é um sistema corporativo de apontamento e planejamento de manutenção industrial (PCM) usado por equipes técnicas.",
      },
      { property: "og:title", content: "Sobre — ApontAuto" },
      { property: "og:description", content: "Sistema corporativo de apontamento de manutenção industrial." },
      { property: "og:url", content: "https://apontauto.online/sobre" },
    ],
    links: [{ rel: "canonical", href: "https://apontauto.online/sobre" }],
  }),
  component: SobrePage,
});

function SobrePage() {
  return (
    <LegalLayout title="Sobre o ApontAuto">
      <p>
        O <strong>ApontAuto</strong> é um sistema corporativo de <strong>Planejamento e Controle de
        Manutenção (PCM)</strong>, criado para apoiar equipes técnicas industriais no
        apontamento de ordens de serviço, no controle de manutenções preventivas, corretivas e legais
        e na consolidação de indicadores de produtividade.
      </p>
      <h2>Para quem é</h2>
      <p>
        A plataforma é destinada a <strong>planejadores, técnicos e gestores de manutenção</strong> de
        plantas industriais. O acesso é <strong>restrito por login</strong>: não há cadastro público
        e o conteúdo interno é visível apenas aos usuários autorizados pela organização.
      </p>
      <h2>O que oferece</h2>
      <ul>
        <li>Apontamento de horas e ordens de serviço.</li>
        <li>Consolidação de manutenções preventivas e corretivas.</li>
        <li>Painel legal com alertas de vencimento.</li>
        <li>Relatórios e exportações para acompanhamento gerencial.</li>
      </ul>
      <h2>Responsável</h2>
      <p>
        Desenvolvido e mantido por <strong>Gabriel Vitor</strong>. Para dúvidas, sugestões ou
        solicitações de acesso, utilize a <a href="/contato">página de contato</a>.
      </p>
    </LegalLayout>
  );
}

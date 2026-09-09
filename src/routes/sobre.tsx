import { createFileRoute } from "@tanstack/react-router";
import {
  BarChart3,
  BellRing,
  Boxes,
  ClipboardList,
  Fuel,
  ShieldCheck,
  Wrench,
} from "lucide-react";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Sobre — Apont Auto" },
      {
        name: "description",
        content:
          "Conheça o Apont Auto, plataforma corporativa para planejamento, execução e controle operacional de manutenção.",
      },
      { property: "og:title", content: "Sobre — Apont Auto" },
      {
        property: "og:description",
        content:
          "Gestão de manutenção, ordens de serviço, materiais, conformidade, frota e indicadores em uma única plataforma.",
      },
      { property: "og:url", content: "https://apontauto.online/sobre" },
    ],
    links: [{ rel: "canonical", href: "https://apontauto.online/sobre" }],
  }),
  component: SobrePage,
});

const capabilities = [
  {
    icon: ClipboardList,
    title: "Planejamento PCM",
    description:
      "Programação de atividades, acompanhamento de backlog, capacidade das equipes e apontamentos de ordens de serviço.",
  },
  {
    icon: Wrench,
    title: "Execução e manutenção",
    description:
      "Apoio às rotinas preventivas e corretivas, execução de campo, históricos e acompanhamento operacional.",
  },
  {
    icon: Boxes,
    title: "Materiais e evidências",
    description:
      "Centralização de solicitações de materiais, registros relacionados às atividades e informações necessárias para rastreabilidade.",
  },
  {
    icon: ShieldCheck,
    title: "Conformidade legal",
    description:
      "Painel de itens legais, vencimentos, agendamentos, responsáveis e acompanhamento das obrigações recorrentes.",
  },
  {
    icon: Fuel,
    title: "Frota e abastecimento",
    description:
      "Recursos de apoio ao controle operacional de frota, abastecimentos e registros associados à utilização dos veículos.",
  },
  {
    icon: BarChart3,
    title: "Indicadores e relatórios",
    description:
      "Consolidação de informações operacionais, painéis, históricos e exportações para acompanhamento gerencial.",
  },
  {
    icon: BellRing,
    title: "Comunicação operacional",
    description:
      "Notificações, avisos e recursos de acompanhamento para manter equipes e responsáveis informados sobre eventos relevantes.",
  },
];

function SobrePage() {
  return (
    <LegalLayout title="Sobre o Apont Auto">
      <p className="text-base sm:text-[17px]">
        O <strong>Apont Auto</strong> é uma plataforma corporativa criada para organizar o fluxo de
        manutenção e operação — do planejamento à execução em campo, passando por materiais,
        conformidade, frota, históricos e indicadores de gestão.
      </p>
      <p>
        A proposta é concentrar informações que normalmente ficam dispersas em planilhas, mensagens
        e controles paralelos, oferecendo uma visão única e rastreável para planejadores, técnicos,
        encarregados e gestores autorizados.
      </p>

      <div className="not-prose my-9 grid gap-3 sm:grid-cols-2">
        {capabilities.map(({ icon: Icon, title, description }, index) => (
          <div
            key={title}
            className={`rounded-2xl border border-white/[0.08] bg-white/[0.025] p-5 ${
              index === capabilities.length - 1 ? "sm:col-span-2" : ""
            }`}
          >
            <div className="grid h-10 w-10 place-items-center rounded-xl border border-blue-400/15 bg-blue-400/[0.06] text-blue-300">
              <Icon className="h-5 w-5" aria-hidden />
            </div>
            <h2 className="mt-4 text-sm font-semibold text-white">{title}</h2>
            <p className="mt-2 text-xs leading-5 text-slate-400">{description}</p>
          </div>
        ))}
      </div>

      <h2>Uma plataforma orientada à operação</h2>
      <p>
        O sistema foi estruturado para apoiar diferentes etapas do trabalho diário, incluindo
        programação, execução, acompanhamento de ordens de serviço, gestão de pendências, controle
        de materiais, registros de ativos, rotinas legais e consolidação de informações para tomada
        de decisão.
      </p>

      <h2>Acesso e governança</h2>
      <p>
        O acesso ao ambiente interno é realizado por autenticação e permissões. Cada usuário deve
        visualizar e utilizar somente os módulos liberados para sua função, preservando a
        organização das informações e a responsabilidade sobre os registros realizados.
      </p>

      <h2>Evolução contínua</h2>
      <p>
        O Apont Auto é atualizado de forma contínua conforme as necessidades operacionais da
        organização. Novos módulos, automações, relatórios e melhorias de experiência podem ser
        incorporados mantendo o foco em produtividade, rastreabilidade e clareza das informações.
      </p>

      <h2>Responsável</h2>
      <p>
        Desenvolvido e mantido por <strong>Gabriel Vitor</strong>. Para suporte, sugestões ou
        solicitações relacionadas ao sistema, utilize a <a href="/contato">página de contato</a>.
      </p>
    </LegalLayout>
  );
}

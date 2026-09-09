import { createFileRoute } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { LegalLayout } from "@/components/legal-layout";
import { WhatsAppMark } from "@/components/whatsapp-mark";

const whatsappUrl =
  "https://wa.me/5511963239378?text=Ol%C3%A1%2C%20gostaria%20de%20falar%20sobre%20o%20Apont%20Auto.";

export const Route = createFileRoute("/sobre")({
  head: () => ({
    meta: [
      { title: "Sobre — Apont Auto" },
      {
        name: "description",
        content:
          "Conheça o Apont Auto, plataforma corporativa para planejamento, execução, ativos, manutenção, conformidade, frota, materiais e serviços operacionais.",
      },
      { property: "og:title", content: "Sobre — Apont Auto" },
      {
        property: "og:description",
        content:
          "Uma plataforma corporativa para centralizar manutenção, ativos, serviços, conformidade e informações operacionais.",
      },
      { property: "og:url", content: "https://apontauto.online/sobre" },
    ],
    links: [{ rel: "canonical", href: "https://apontauto.online/sobre" }],
  }),
  component: SobrePage,
});

const areas = [
  {
    number: "01",
    title: "Planejamento e Controle de Manutenção",
    description:
      "Programação de atividades, backlog, capacidade das equipes, distribuição de trabalho, apontamentos e acompanhamento de ordens de serviço.",
  },
  {
    number: "02",
    title: "Execução de campo e históricos",
    description:
      "Registro das atividades executadas, acompanhamento de corretivas e preventivas, histórico operacional, reincidências e informações necessárias para continuidade do serviço.",
  },
  {
    number: "03",
    title: "Ativos e confiabilidade",
    description:
      "Base de ativos, preenchimento e padronização de localização, tratamento de pendências, histórico de processamentos e recursos de confiabilidade e causa raiz.",
  },
  {
    number: "04",
    title: "Materiais, serviços e logística interna",
    description:
      "Solicitação e controle de materiais, centralização de peças, lavanderia, mensageria, malotes e registros relacionados ao suporte das atividades operacionais.",
  },
  {
    number: "05",
    title: "Segurança e conformidade",
    description:
      "Painel de itens legais, vencimentos, agendamentos, segurança do trabalho, trilha de auditoria e recursos de acompanhamento para obrigações recorrentes.",
  },
  {
    number: "06",
    title: "Frota e abastecimento",
    description:
      "Controle de veículos, abastecimentos, comprovantes, hodômetro, consumo, registros de utilização e relatórios para acompanhamento da operação da frota.",
  },
  {
    number: "07",
    title: "Rondas, inspeções e serviços de apoio",
    description:
      "Rondas de calhas, históricos de inspeção, entrega de água, taludes, refrigeração e outras rotinas operacionais centralizadas conforme a necessidade da organização.",
  },
  {
    number: "08",
    title: "Comunicação, indicadores e administração",
    description:
      "Central de notificações, avisos administrativos, qualidade de dados, relatórios, indicadores, painéis gerenciais e controles de usuários e permissões.",
  },
];

function SobrePage() {
  return (
    <LegalLayout
      title="Sobre o Apont Auto"
      description="Uma plataforma corporativa desenvolvida para organizar informações operacionais, reduzir controles paralelos e dar mais rastreabilidade ao trabalho de manutenção e serviços."
    >
      <p className="text-base sm:text-[17px]">
        O <strong>Apont Auto</strong> reúne em um único ambiente processos que normalmente ficam
        distribuídos entre planilhas, mensagens, arquivos e controles independentes. A plataforma foi
        estruturada para apoiar o trabalho de planejadores, técnicos, encarregados, gestores e demais
        usuários autorizados, mantendo cada informação vinculada ao contexto operacional em que foi
        registrada.
      </p>
      <p>
        O foco do sistema é oferecer uma base de trabalho clara para planejamento, execução,
        acompanhamento e tomada de decisão. Os módulos podem ser disponibilizados conforme a função
        de cada usuário e a necessidade da organização, evitando exposição desnecessária de áreas ou
        informações que não façam parte de sua rotina.
      </p>

      <h2>O que a plataforma reúne</h2>
      <div className="not-prose mt-7 border-y border-white/[0.08]">
        {areas.map((area) => (
          <div
            key={area.number}
            className="grid gap-4 border-b border-white/[0.07] py-7 last:border-b-0 sm:grid-cols-[54px_220px_1fr] sm:gap-7"
          >
            <p className="text-[11px] font-semibold tracking-[0.18em] text-slate-700">{area.number}</p>
            <h3 className="font-display text-[15px] font-semibold leading-6 text-slate-100">
              {area.title}
            </h3>
            <p className="max-w-2xl text-sm leading-7 text-slate-400">{area.description}</p>
          </div>
        ))}
      </div>

      <h2>Informação organizada para a rotina real</h2>
      <p>
        O Apont Auto busca manter os registros próximos da execução real do trabalho. Isso significa
        associar informações como OS, local, ativo, responsável, materiais, datas, evidências,
        abastecimentos, inspeções e históricos ao processo correspondente, facilitando consultas e
        reduzindo a dependência de controles externos.
      </p>

      <h2>Permissões e responsabilidade</h2>
      <p>
        O ambiente interno utiliza autenticação e controle de acesso por módulos. Usuários devem
        acessar somente as áreas liberadas para sua função e são responsáveis pela qualidade das
        informações inseridas dentro de suas atribuições. Recursos administrativos permanecem
        restritos aos perfis autorizados.
      </p>

      <h2>Relatórios e rastreabilidade</h2>
      <p>
        Diversos módulos oferecem históricos, filtros, indicadores e exportações para apoiar o
        acompanhamento gerencial. A finalidade é permitir que informações operacionais sejam
        consultadas e apresentadas com mais consistência, sem perder o vínculo com o registro de
        origem.
      </p>

      <h2>Evolução da plataforma</h2>
      <p>
        O sistema é atualizado conforme novas necessidades de operação são identificadas. Fluxos,
        relatórios, controles e integrações podem evoluir, sempre procurando preservar segurança,
        compatibilidade dos dados e simplicidade de uso.
      </p>

      <section className="not-prose mt-14 border-t border-white/[0.08] pt-9">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-xl">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
              Responsável pelo sistema
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-400">
              Desenvolvido e mantido por <strong className="font-semibold text-slate-200">Gabriel Vitor</strong>.
              Para suporte, sugestões ou informações sobre a plataforma, utilize o canal direto.
            </p>
          </div>

          <a
            href={whatsappUrl}
            target="_blank"
            rel="noreferrer"
            aria-label="Falar sobre o Apont Auto pelo WhatsApp"
            className="inline-flex min-h-12 shrink-0 items-center justify-center gap-3 rounded-xl bg-[#25D366] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#20C45A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:ring-offset-2 focus-visible:ring-offset-[#080B10]"
          >
            <WhatsAppMark className="h-5 w-5 text-white" />
            Falar no WhatsApp
            <ArrowUpRight className="h-4 w-4 text-white/80" aria-hidden />
          </a>
        </div>
      </section>
    </LegalLayout>
  );
}

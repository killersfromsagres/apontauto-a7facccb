import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Apont Auto" },
      {
        name: "description",
        content:
          "Entenda como o Apont Auto trata dados de acesso, registros operacionais, anexos e informações necessárias ao funcionamento da plataforma.",
      },
      { property: "og:title", content: "Política de Privacidade — Apont Auto" },
      {
        property: "og:description",
        content: "Política de tratamento e proteção de dados do Apont Auto.",
      },
      { property: "og:url", content: "https://apontauto.online/privacidade" },
    ],
    links: [{ rel: "canonical", href: "https://apontauto.online/privacidade" }],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  return (
    <LegalLayout
      title="Política de Privacidade"
      description="Esta política apresenta, de forma objetiva, como dados pessoais e informações operacionais podem ser tratados durante o uso do Apont Auto."
      updatedAt="09/09/2026"
    >
      <p className="text-base sm:text-[17px]">
        O <strong>Apont Auto</strong> é uma plataforma de uso corporativo e restrito. O tratamento de
        informações ocorre para viabilizar autenticação, controle de acesso, operação dos módulos,
        segurança, suporte, rastreabilidade e geração de registros necessários às atividades
        realizadas na plataforma.
      </p>
      <p>
        Quando houver tratamento de dados pessoais, devem ser observadas as disposições da{" "}
        <strong>Lei Geral de Proteção de Dados Pessoais — LGPD (Lei nº 13.709/2018)</strong>, além de
        políticas internas e demais normas aplicáveis à organização que utiliza o sistema.
      </p>

      <div className="not-prose my-10 grid gap-6 border-y border-white/[0.08] py-8 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Finalidade
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Operação, segurança, histórico, suporte e gestão das informações registradas.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Acesso
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Restrito a usuários autenticados e conforme as permissões atribuídas.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Princípio
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Utilizar somente as informações necessárias para a finalidade operacional correspondente.
          </p>
        </div>
      </div>

      <h2>1. Informações que podem ser tratadas</h2>
      <p>
        A natureza dos dados depende dos módulos liberados ao usuário e das atividades executadas. A
        plataforma pode tratar, entre outras, as seguintes categorias:
      </p>
      <ul>
        <li>
          <strong>Identificação e acesso:</strong> nome, usuário, e-mail, identificadores de conta,
          perfil, função e permissões.
        </li>
        <li>
          <strong>Registros de manutenção e serviços:</strong> ordens de serviço, apontamentos,
          programações, corretivas, preventivas, backorders, rondas e históricos de execução.
        </li>
        <li>
          <strong>Ativos e localização:</strong> cadastros, identificação de equipamentos,
          localização, informações de confiabilidade e registros de processamento.
        </li>
        <li>
          <strong>Materiais e logística:</strong> solicitações, peças, materiais, malotes, registros de
          recebimento, entrega e outras informações ligadas aos serviços de apoio.
        </li>
        <li>
          <strong>Conformidade e segurança:</strong> itens legais, vencimentos, agendamentos,
          responsáveis, auditorias e registros relacionados às rotinas de segurança e conformidade.
        </li>
        <li>
          <strong>Frota e abastecimento:</strong> veículos, hodômetro, combustível, litros, valores,
          datas, horários, comprovantes e demais informações associadas ao registro do abastecimento.
        </li>
        <li>
          <strong>Anexos e evidências:</strong> imagens, documentos, comprovantes e arquivos enviados
          pelo usuário quando o módulo correspondente oferecer esse recurso.
        </li>
        <li>
          <strong>Dados técnicos:</strong> informações de sessão, eventos de autenticação, logs e dados
          necessários para segurança, diagnóstico e suporte técnico.
        </li>
      </ul>

      <h2>2. Finalidades do tratamento</h2>
      <p>As informações podem ser utilizadas para:</p>
      <ul>
        <li>Autenticar usuários e aplicar regras de acesso.</li>
        <li>Permitir a execução das funcionalidades disponíveis em cada módulo.</li>
        <li>Organizar históricos, pendências, evidências e registros operacionais.</li>
        <li>Gerar relatórios, exportações, indicadores e informações de acompanhamento.</li>
        <li>Apresentar notificações e avisos relacionados ao uso da plataforma.</li>
        <li>Investigar erros, prevenir acessos indevidos e manter rastreabilidade quando necessário.</li>
        <li>Atender obrigações legais, regulatórias, contratuais ou determinações de autoridade competente.</li>
      </ul>

      <h2>3. Controle de acesso</h2>
      <p>
        O acesso ao ambiente interno depende de autenticação. A visualização dos módulos pode variar
        conforme o perfil e as permissões atribuídas a cada usuário. Credenciais são pessoais e não
        devem ser compartilhadas. O usuário deve acessar somente informações compatíveis com suas
        atribuições e autorizações.
      </p>

      <h2>4. Arquivos, fotos e comprovantes</h2>
      <p>
        Alguns módulos podem permitir o envio de imagens, documentos ou comprovantes. Esses arquivos
        devem conter apenas informações necessárias à atividade correspondente. O usuário não deve
        inserir dados pessoais, sigilosos ou sensíveis que sejam desnecessários para a finalidade do
        registro.
      </p>

      <h2>5. Infraestrutura e fornecedores técnicos</h2>
      <p>
        O funcionamento da plataforma pode depender de serviços de autenticação, banco de dados,
        armazenamento, hospedagem e outros recursos de infraestrutura. Fornecedores técnicos podem
        processar informações na medida necessária para prestar esses serviços e conforme suas
        próprias obrigações de segurança e privacidade.
      </p>
      <p>
        Partes do Apont Auto utilizam infraestrutura Supabase para recursos como autenticação,
        persistência e armazenamento, de acordo com a arquitetura vigente de cada módulo.
      </p>

      <h2>6. Compartilhamento e acesso por terceiros</h2>
      <p>
        O Apont Auto não tem como finalidade comercializar dados pessoais para publicidade. As
        informações podem ser acessadas por usuários autorizados da organização, por fornecedores
        técnicos necessários ao funcionamento da plataforma ou quando houver obrigação legal,
        regulatória ou ordem de autoridade competente.
      </p>

      <h2>7. Segurança</h2>
      <p>
        A plataforma utiliza mecanismos compatíveis com sua arquitetura para reduzir riscos de acesso
        indevido e preservar a integridade das informações. Isso pode incluir autenticação, controle
        de permissões, comunicação segura, registros de eventos e recursos de proteção fornecidos pela
        infraestrutura utilizada.
      </p>
      <p>
        Nenhum ambiente conectado à internet é totalmente imune a incidentes. Por isso, senhas,
        sessões, códigos de acesso, chaves e outros dados de autenticação devem ser mantidos em sigilo.
      </p>

      <h2>8. Navegador, sessão e armazenamento local</h2>
      <p>
        O navegador pode armazenar informações essenciais para manter a sessão, recordar preferências
        e viabilizar o funcionamento da interface. Esses mecanismos devem ser utilizados somente para
        finalidades funcionais, de segurança ou de experiência do usuário relacionadas ao sistema.
      </p>

      <h2>9. Retenção</h2>
      <p>
        Informações podem ser mantidas pelo período necessário às finalidades operacionais, à
        rastreabilidade, ao histórico das atividades e ao cumprimento de obrigações aplicáveis. O
        prazo pode variar conforme a natureza do registro e as necessidades da organização.
      </p>

      <h2>10. Solicitações do titular</h2>
      <p>
        Quando aplicável, titulares podem solicitar confirmação de tratamento, acesso, correção,
        informações sobre compartilhamento e outros direitos previstos na LGPD. Cada solicitação será
        analisada conforme a natureza do dado, a base legal do tratamento e eventuais obrigações de
        preservação do registro.
      </p>

      <h2>11. Atualizações</h2>
      <p>
        Esta política pode ser revisada para acompanhar mudanças nos módulos, na infraestrutura, nos
        processos internos ou na legislação. A data da versão vigente será mantida no início desta
        página.
      </p>

      <h2>12. Contato</h2>
      <p>
        Para dúvidas, correções ou solicitações relacionadas à privacidade, utilize a{" "}
        <a href="/contato">página de contato</a>. Os canais oficiais estão concentrados nessa página
        para evitar divulgação desnecessária de informações pessoais em diferentes áreas do site.
      </p>
    </LegalLayout>
  );
}

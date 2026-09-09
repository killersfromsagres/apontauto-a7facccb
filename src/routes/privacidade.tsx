import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Apont Auto" },
      {
        name: "description",
        content:
          "Entenda como o Apont Auto trata dados de acesso, registros operacionais, arquivos e informações necessárias ao funcionamento da plataforma.",
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
    <LegalLayout title="Política de Privacidade" updatedAt="09/09/2026">
      <p className="text-base sm:text-[17px]">
        Esta Política de Privacidade explica, de forma objetiva, como o <strong>Apont Auto</strong>{" "}
        trata dados pessoais e informações operacionais necessárias para autenticação, controle de
        acesso, execução das funcionalidades da plataforma, segurança e rastreabilidade.
      </p>
      <p>
        O tratamento deve observar a <strong>Lei Geral de Proteção de Dados Pessoais — LGPD (Lei nº
        13.709/2018)</strong> e demais normas aplicáveis ao contexto da organização que utiliza o
        sistema.
      </p>

      <h2>1. Quais informações podem ser tratadas</h2>
      <p>De acordo com o módulo utilizado e com as permissões do usuário, a plataforma pode tratar:</p>
      <ul>
        <li>
          <strong>Dados de identificação e acesso:</strong> nome, usuário, e-mail, identificadores de
          conta, perfil e permissões.
        </li>
        <li>
          <strong>Dados operacionais:</strong> ordens de serviço, apontamentos, programações,
          históricos, materiais, ativos, registros de frota, abastecimentos, itens legais,
          agendamentos e demais informações inseridas durante a operação.
        </li>
        <li>
          <strong>Arquivos e evidências:</strong> documentos, imagens, anexos ou registros enviados
          para comprovação, acompanhamento ou histórico, quando o recurso estiver disponível.
        </li>
        <li>
          <strong>Dados técnicos e de segurança:</strong> informações de sessão, registros de acesso,
          eventos de autenticação e dados necessários para diagnóstico, prevenção de abuso e
          auditoria do sistema.
        </li>
      </ul>

      <h2>2. Para que os dados são utilizados</h2>
      <p>As informações podem ser utilizadas para:</p>
      <ul>
        <li>Autenticar usuários e aplicar permissões de acesso.</li>
        <li>Executar rotinas de planejamento, manutenção, campo e acompanhamento de OS.</li>
        <li>Organizar materiais, ativos, frota, abastecimentos e obrigações legais.</li>
        <li>Gerar históricos, indicadores, relatórios, exportações e registros de acompanhamento.</li>
        <li>Enviar ou apresentar notificações e avisos operacionais dentro dos recursos disponíveis.</li>
        <li>Investigar falhas, preservar segurança e manter rastreabilidade das ações relevantes.</li>
        <li>Cumprir obrigações legais, regulatórias ou determinações de autoridade competente.</li>
      </ul>

      <h2>3. Acesso às informações</h2>
      <p>
        O Apont Auto é um ambiente de uso restrito. O acesso aos módulos e dados depende de
        autenticação e das permissões atribuídas ao usuário. As informações devem ser acessadas
        somente por pessoas autorizadas e para finalidades compatíveis com suas atividades.
      </p>

      <h2>4. Infraestrutura e prestadores de serviço</h2>
      <p>
        Para disponibilizar autenticação, banco de dados, armazenamento, hospedagem e demais
        recursos técnicos, o Apont Auto pode utilizar provedores de infraestrutura e serviços de
        tecnologia. Esses fornecedores podem tratar dados na medida necessária para prestar os
        serviços contratados, observando suas respectivas obrigações de segurança e privacidade.
      </p>
      <p>
        A plataforma utiliza infraestrutura Supabase em partes do sistema, inclusive para recursos
        de autenticação e persistência de dados, conforme a arquitetura vigente de cada módulo.
      </p>

      <h2>5. Compartilhamento</h2>
      <p>
        O Apont Auto não comercializa dados pessoais para fins publicitários. Informações podem ser
        disponibilizadas a usuários autorizados da organização, a prestadores técnicos necessários
        ao funcionamento da plataforma ou quando houver obrigação legal, regulatória ou ordem de
        autoridade competente.
      </p>

      <h2>6. Segurança</h2>
      <p>
        São adotados controles compatíveis com a operação do sistema, incluindo autenticação,
        restrição por permissões, comunicação segura e mecanismos de proteção disponíveis na
        infraestrutura utilizada. Nenhum sistema conectado à internet é totalmente imune a riscos,
        por isso credenciais devem permanecer pessoais e não devem ser compartilhadas.
      </p>

      <h2>7. Cookies e armazenamento local</h2>
      <p>
        Recursos essenciais do navegador podem ser utilizados para autenticação, manutenção de
        sessão, preferências e funcionamento da interface. Esses mecanismos devem ser empregados
        para finalidades funcionais e de segurança da plataforma.
      </p>

      <h2>8. Retenção e exclusão</h2>
      <p>
        Os dados podem ser mantidos pelo período necessário à finalidade operacional, à preservação
        de históricos, à auditoria e ao cumprimento de obrigações legais ou contratuais. Solicitações
        de exclusão serão analisadas considerando a natureza do dado, as responsabilidades da
        organização e eventuais deveres de retenção.
      </p>

      <h2>9. Direitos do titular</h2>
      <p>
        Quando aplicável, o titular pode solicitar confirmação de tratamento, acesso, correção,
        informações sobre compartilhamento, anonimização, bloqueio, eliminação ou outros direitos
        previstos na LGPD. A viabilidade de cada solicitação depende da base legal e das obrigações
        aplicáveis ao tratamento.
      </p>

      <h2>10. Atualizações desta política</h2>
      <p>
        Esta política pode ser revisada para acompanhar mudanças no sistema, na infraestrutura ou na
        legislação. A versão vigente e sua data de atualização serão mantidas nesta página.
      </p>

      <h2>11. Contato</h2>
      <p>
        Para dúvidas ou solicitações relacionadas à privacidade, utilize a{" "}
        <a href="/contato">página de contato</a>, o e-mail <strong>gabrielvlp33@gmail.com</strong> ou
        o WhatsApp <strong>(11) 96323-9378</strong>.
      </p>
    </LegalLayout>
  );
}

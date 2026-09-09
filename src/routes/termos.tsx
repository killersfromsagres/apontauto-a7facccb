import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Apont Auto" },
      {
        name: "description",
        content:
          "Termos de uso do Apont Auto para acesso, operação, registros, responsabilidades e utilização dos módulos da plataforma.",
      },
      { property: "og:title", content: "Termos de Uso — Apont Auto" },
      {
        property: "og:description",
        content: "Condições de acesso e utilização da plataforma Apont Auto.",
      },
      { property: "og:url", content: "https://apontauto.online/termos" },
    ],
    links: [{ rel: "canonical", href: "https://apontauto.online/termos" }],
  }),
  component: TermosPage,
});

function TermosPage() {
  return (
    <LegalLayout title="Termos de Uso" updatedAt="09/09/2026">
      <p className="text-base sm:text-[17px]">
        Estes Termos de Uso estabelecem as condições para acesso e utilização do{" "}
        <strong>Apont Auto</strong>. Ao utilizar a plataforma, o usuário declara estar autorizado
        pela organização responsável e compromete-se a utilizar os recursos de forma adequada,
        segura e compatível com suas atribuições.
      </p>

      <h2>1. Finalidade da plataforma</h2>
      <p>
        O Apont Auto é uma plataforma corporativa de apoio à gestão operacional e de manutenção. O
        sistema pode reunir recursos de planejamento PCM, ordens de serviço, preventivas,
        corretivas, backorders, execução de campo, materiais, ativos, conformidade legal, frota,
        abastecimentos, notificações, históricos, indicadores, relatórios e exportações.
      </p>
      <p>
        Os módulos disponíveis podem variar conforme a evolução do sistema, a configuração da
        organização e as permissões atribuídas a cada usuário.
      </p>

      <h2>2. Acesso e credenciais</h2>
      <ul>
        <li>O acesso é restrito a usuários previamente autorizados.</li>
        <li>Credenciais, sessões e meios de autenticação são pessoais e não devem ser compartilhados.</li>
        <li>
          O usuário deve comunicar suspeitas de acesso indevido, perda de credenciais ou comportamento
          anormal do sistema pelos canais oficiais.
        </li>
        <li>
          O acesso a determinadas áreas pode depender de perfil, função ou permissão administrativa.
        </li>
      </ul>

      <h2>3. Responsabilidade sobre os registros</h2>
      <p>
        O usuário é responsável pela veracidade, atualização e adequação das informações que inserir
        ou alterar no sistema dentro de suas atribuições. Isso inclui, quando aplicável, dados de
        ordens de serviço, apontamentos, materiais, ativos, agenda, registros legais, frota,
        abastecimentos, documentos, evidências e demais informações operacionais.
      </p>
      <p>
        O Apont Auto é uma ferramenta de apoio à operação e à tomada de decisão. A validação técnica,
        legal ou gerencial de uma atividade continua sendo responsabilidade dos profissionais e da
        organização competentes.
      </p>

      <h2>4. Uso permitido</h2>
      <p>A plataforma deve ser utilizada somente para fins autorizados. É vedado:</p>
      <ul>
        <li>Acessar, tentar acessar ou alterar dados sem a autorização correspondente.</li>
        <li>Compartilhar credenciais ou utilizar conta pertencente a outro usuário.</li>
        <li>Inserir conteúdo ilícito, fraudulento, malicioso ou incompatível com a finalidade do sistema.</li>
        <li>Interferir deliberadamente na disponibilidade, segurança ou integridade da plataforma.</li>
        <li>
          Copiar, redistribuir, explorar ou realizar engenharia reversa de componentes protegidos do
          sistema fora das hipóteses permitidas por lei ou autorização expressa.
        </li>
      </ul>

      <h2>5. Arquivos, documentos e evidências</h2>
      <p>
        Quando a plataforma permitir anexos, imagens, documentos ou evidências, o usuário deve
        inserir somente conteúdo relacionado à atividade e para o qual possua autorização. Dados
        pessoais ou informações sensíveis desnecessárias não devem ser incluídos em campos livres ou
        anexos.
      </p>

      <h2>6. Disponibilidade e integrações</h2>
      <p>
        O funcionamento do Apont Auto pode depender de conexão com a internet, serviços de banco de
        dados, autenticação, armazenamento, hospedagem e outros provedores técnicos. Manutenções,
        falhas externas ou eventos fora do controle do sistema podem causar indisponibilidade
        temporária ou limitação de determinadas funcionalidades.
      </p>

      <h2>7. Segurança e auditoria</h2>
      <p>
        A plataforma pode registrar eventos necessários para autenticação, rastreabilidade,
        diagnóstico e segurança. O uso do sistema deve respeitar as permissões concedidas e as
        políticas internas da organização responsável pela operação.
      </p>

      <h2>8. Privacidade</h2>
      <p>
        O tratamento de dados pessoais relacionado ao uso da plataforma é descrito na{" "}
        <a href="/privacidade">Política de Privacidade</a>. O usuário também deve observar as regras
        e orientações internas da organização aplicáveis ao tratamento das informações registradas.
      </p>

      <h2>9. Propriedade intelectual</h2>
      <p>
        A identidade visual, os componentes, o código e os demais elementos próprios do Apont Auto
        são protegidos pela legislação aplicável de propriedade intelectual, ressalvados componentes
        de terceiros sujeitos às suas próprias licenças.
      </p>

      <h2>10. Evolução do sistema</h2>
      <p>
        Funcionalidades, fluxos, módulos, integrações e interfaces podem ser alterados para correção,
        segurança, melhoria de desempenho ou evolução operacional. Mudanças relevantes nestes Termos
        serão refletidas nesta página com atualização da data da versão vigente.
      </p>

      <h2>11. Limitação de responsabilidade</h2>
      <p>
        O sistema busca apoiar a operação com organização e rastreabilidade, mas não substitui
        procedimentos técnicos, inspeções obrigatórias, decisões de segurança, validações legais ou
        responsabilidades profissionais exigidas para cada atividade. O uso incorreto, o cadastro de
        informações imprecisas ou o descumprimento de procedimentos internos pode comprometer os
        resultados apresentados.
      </p>

      <h2>12. Legislação aplicável</h2>
      <p>
        Estes Termos são interpretados de acordo com a legislação brasileira aplicável. Eventuais
        controvérsias deverão observar as regras legais de competência e as relações existentes entre
        as partes envolvidas.
      </p>

      <h2>13. Contato</h2>
      <p>
        Em caso de dúvida, suporte ou comunicação relacionada a estes Termos, utilize a{" "}
        <a href="/contato">página de contato</a> ou o WhatsApp <strong>(11) 96323-9378</strong>.
      </p>
    </LegalLayout>
  );
}

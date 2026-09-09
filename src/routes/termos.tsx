import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Apont Auto" },
      {
        name: "description",
        content:
          "Termos de uso do Apont Auto para acesso, registros, responsabilidades, segurança e utilização dos módulos da plataforma.",
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
    <LegalLayout
      title="Termos de Uso"
      description="Condições para acesso e utilização do Apont Auto, incluindo responsabilidades sobre credenciais, registros operacionais, anexos, segurança e uso adequado da plataforma."
      updatedAt="09/09/2026"
    >
      <p className="text-base sm:text-[17px]">
        Estes Termos de Uso estabelecem as condições para acesso e utilização do{" "}
        <strong>Apont Auto</strong>. Ao utilizar a plataforma, o usuário declara estar autorizado
        pela organização responsável e compromete-se a utilizar os recursos de forma compatível com
        suas atribuições, permissões e procedimentos internos.
      </p>

      <div className="not-prose my-10 grid gap-6 border-y border-white/[0.08] py-8 sm:grid-cols-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Acesso
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Uso restrito a pessoas previamente autorizadas e conforme as permissões concedidas.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Registros
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Informações inseridas devem representar corretamente a atividade realizada ou acompanhada.
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-600">
            Segurança
          </p>
          <p className="mt-3 text-sm leading-7 text-slate-400">
            Credenciais, sessões, arquivos e informações internas devem ser utilizados de forma responsável.
          </p>
        </div>
      </div>

      <h2>1. Finalidade da plataforma</h2>
      <p>
        O Apont Auto é uma plataforma corporativa de apoio à gestão operacional, manutenção e
        serviços. Seus módulos podem abranger planejamento PCM, ordens de serviço, preventivas,
        corretivas, backlog, execução de campo, ativos, confiabilidade, materiais, logística interna,
        segurança, conformidade, rondas, frota, abastecimentos, comunicação, históricos, indicadores,
        relatórios e administração de acessos.
      </p>
      <p>
        A disponibilidade de cada recurso depende da configuração vigente do sistema e das permissões
        atribuídas ao usuário.
      </p>

      <h2>2. Acesso e credenciais</h2>
      <ul>
        <li>O acesso é restrito a usuários previamente autorizados.</li>
        <li>Credenciais, sessões e meios de autenticação são pessoais e não devem ser compartilhados.</li>
        <li>
          O usuário deve comunicar suspeitas de acesso indevido, perda de credenciais ou comportamento
          anormal pelos canais oficiais.
        </li>
        <li>
          Áreas administrativas, relatórios sensíveis e determinados módulos podem exigir permissões
          específicas.
        </li>
      </ul>

      <h2>3. Responsabilidade sobre as informações registradas</h2>
      <p>
        O usuário é responsável pela qualidade, veracidade e atualização das informações inseridas ou
        alteradas dentro de suas atribuições. Isso pode incluir dados de OS, apontamentos, materiais,
        ativos, agenda, registros legais, frota, abastecimentos, comprovantes, documentos, evidências,
        inspeções e demais registros operacionais.
      </p>
      <p>
        O sistema organiza e apresenta informações cadastradas na plataforma. A validação técnica,
        operacional, legal ou gerencial de cada atividade continua sendo responsabilidade dos
        profissionais e da organização competentes.
      </p>

      <h2>4. Uso permitido</h2>
      <p>O sistema deve ser utilizado exclusivamente para finalidades autorizadas. Não é permitido:</p>
      <ul>
        <li>Acessar, tentar acessar ou alterar informações sem a autorização correspondente.</li>
        <li>Compartilhar credenciais ou utilizar conta pertencente a outro usuário.</li>
        <li>Inserir conteúdo fraudulento, ilícito, malicioso ou incompatível com a finalidade do sistema.</li>
        <li>Interferir deliberadamente na disponibilidade, segurança ou integridade da plataforma.</li>
        <li>
          Copiar, redistribuir ou explorar componentes protegidos do sistema fora das hipóteses
          autorizadas ou permitidas pela legislação aplicável.
        </li>
      </ul>

      <h2>5. Arquivos, documentos, imagens e comprovantes</h2>
      <p>
        Quando um módulo permitir anexos, o usuário deve enviar apenas arquivos relacionados à
        atividade correspondente e para os quais possua autorização. Informações pessoais, sigilosas
        ou sensíveis que não sejam necessárias ao registro não devem ser incluídas em campos livres,
        imagens ou documentos.
      </p>
      <p>
        O envio de um arquivo não substitui procedimentos internos de guarda documental, validação ou
        aprovação quando esses procedimentos forem exigidos pela organização.
      </p>

      <h2>6. Relatórios, indicadores e exportações</h2>
      <p>
        Relatórios e indicadores são produzidos com base nas informações registradas no sistema. Sua
        qualidade depende da consistência dos dados de origem, dos filtros utilizados e do contexto da
        consulta. Antes de utilizar uma exportação em decisão formal, apresentação ou processo de
        auditoria, o responsável deve verificar se o período, o escopo e os registros estão corretos.
      </p>

      <h2>7. Disponibilidade e serviços técnicos</h2>
      <p>
        O funcionamento da plataforma pode depender de conexão com a internet, autenticação, banco de
        dados, armazenamento, hospedagem e outros provedores técnicos. Manutenções, indisponibilidades
        externas ou eventos fora do controle da aplicação podem limitar temporariamente determinadas
        funcionalidades.
      </p>

      <h2>8. Segurança, permissões e rastreabilidade</h2>
      <p>
        A plataforma pode manter informações necessárias para autenticação, controle de acesso,
        diagnóstico, segurança e rastreabilidade. O usuário deve respeitar as permissões atribuídas ao
        seu perfil e não tentar contornar restrições de acesso ou mecanismos de proteção.
      </p>

      <h2>9. Privacidade</h2>
      <p>
        O tratamento de dados pessoais relacionado ao uso da plataforma é descrito na{" "}
        <a href="/privacidade">Política de Privacidade</a>. O usuário também deve observar políticas,
        normas e orientações internas da organização aplicáveis às informações registradas.
      </p>

      <h2>10. Propriedade intelectual</h2>
      <p>
        A identidade visual, o código, os componentes próprios e demais elementos do Apont Auto são
        protegidos pela legislação aplicável, ressalvados componentes, bibliotecas e serviços de
        terceiros sujeitos às suas próprias licenças e termos.
      </p>

      <h2>11. Evolução e alterações da plataforma</h2>
      <p>
        Funcionalidades, fluxos, módulos, relatórios, integrações e interfaces podem ser atualizados
        para correção, segurança, desempenho ou evolução operacional. Mudanças relevantes nestes
        Termos serão refletidas nesta página com atualização da data da versão vigente.
      </p>

      <h2>12. Limitação de responsabilidade</h2>
      <p>
        O Apont Auto é uma ferramenta de apoio à organização da operação. A plataforma não substitui
        inspeções obrigatórias, procedimentos de segurança, validações legais, análises técnicas ou
        responsabilidades profissionais exigidas para cada atividade. Informações imprecisas ou uso
        inadequado podem comprometer resultados, relatórios e decisões baseadas nos registros.
      </p>

      <h2>13. Suspensão ou restrição de acesso</h2>
      <p>
        O acesso pode ser restringido, suspenso ou revogado quando houver mudança de função,
        encerramento da autorização, risco de segurança, uso incompatível com estes Termos ou outra
        necessidade administrativa da organização responsável.
      </p>

      <h2>14. Legislação aplicável</h2>
      <p>
        Estes Termos devem ser interpretados conforme a legislação brasileira aplicável e as relações
        existentes entre os usuários, a organização responsável pela operação e os prestadores de
        serviços envolvidos.
      </p>

      <h2>15. Contato</h2>
      <p>
        Dúvidas sobre estes Termos, acesso ou utilização da plataforma devem ser encaminhadas pela{" "}
        <a href="/contato">página de contato</a>, onde estão concentrados os canais oficiais de
        atendimento.
      </p>
    </LegalLayout>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — Apont Auto" },
      {
        name: "description",
        content: "Como o Apont Auto coleta, usa e protege os dados dos usuários do sistema.",
      },
      { property: "og:title", content: "Política de Privacidade — Apont Auto" },
      { property: "og:description", content: "Como tratamos dados no Apont Auto." },
      { property: "og:url", content: "https://apontauto.online/privacidade" },
    ],
    links: [{ rel: "canonical", href: "https://apontauto.online/privacidade" }],
  }),
  component: PrivacidadePage,
});

function PrivacidadePage() {
  return (
    <LegalLayout title="Política de Privacidade" updatedAt="15/07/2026">
      <p>
        Esta política descreve como o <strong>Apont Auto</strong> trata dados pessoais dos usuários
        autorizados a acessar o sistema, em conformidade com a{" "}
        <strong>Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018)</strong>.
      </p>

      <h2>1. Dados coletados</h2>
      <ul>
        <li>
          <strong>Cadastro:</strong> nome, e-mail e credenciais de acesso.
        </li>
        <li>
          <strong>Uso:</strong> apontamentos, ordens de serviço e registros de manutenção inseridos
          pelo próprio usuário.
        </li>
        <li>
          <strong>Técnicos:</strong> logs de acesso, endereço IP e informações de sessão para
          segurança.
        </li>
      </ul>

      <h2>2. Finalidade</h2>
      <p>
        Os dados são usados exclusivamente para operar o sistema de apontamento, autenticar
        usuários, gerar relatórios internos e cumprir obrigações legais. Não vendemos dados a
        terceiros e não realizamos publicidade.
      </p>

      <h2>3. Armazenamento</h2>
      <p>
        Os dados são armazenados em infraestrutura Supabase (banco PostgreSQL) com criptografia em
        trânsito (HTTPS/TLS) e controles de acesso por linha (RLS). O acesso administrativo é
        restrito ao responsável técnico.
      </p>

      <h2>4. Compartilhamento</h2>
      <p>
        Os dados <strong>não são compartilhados</strong> com terceiros, exceto quando exigido por
        autoridade competente ou para atender obrigação legal.
      </p>

      <h2>5. Cookies</h2>
      <p>
        Utilizamos apenas cookies essenciais de sessão para manter o usuário autenticado. Não usamos
        cookies de rastreamento nem ferramentas de analytics de terceiros.
      </p>

      <h2>6. Direitos do titular</h2>
      <p>
        Você pode a qualquer momento solicitar acesso, correção, exclusão ou portabilidade dos seus
        dados através da <a href="/contato">página de contato</a>.
      </p>

      <h2>7. Retenção</h2>
      <p>
        Os dados são mantidos enquanto a conta estiver ativa. Contas inativas podem ser removidas
        mediante solicitação ou após 24 meses sem uso.
      </p>

      <h2>8. Contato do responsável</h2>
      <p>
        Encarregado pelo tratamento: <strong>Gabriel Vitor</strong> — gabrielvlp33@gmail.com.
      </p>
    </LegalLayout>
  );
}

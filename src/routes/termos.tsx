import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — Apont Auto" },
      {
        name: "description",
        content: "Termos e condições de uso do sistema Apont Auto.",
      },
      { property: "og:title", content: "Termos de Uso — Apont Auto" },
      { property: "og:description", content: "Regras de uso do Apont Auto." },
      { property: "og:url", content: "https://apontauto.online/termos" },
    ],
    links: [{ rel: "canonical", href: "https://apontauto.online/termos" }],
  }),
  component: TermosPage,
});

function TermosPage() {
  return (
    <LegalLayout title="Termos de Uso" updatedAt="15/07/2026">
      <p>
        Ao acessar o <strong>Apont Auto</strong>, você concorda com os termos abaixo. Se não
        concordar, não utilize o sistema.
      </p>

      <h2>1. Objeto</h2>
      <p>
        O Apont Auto é um sistema corporativo de apontamento e planejamento de manutenção
        industrial, disponibilizado a usuários previamente autorizados.
      </p>

      <h2>2. Acesso</h2>
      <ul>
        <li>
          O acesso é <strong>restrito</strong> — não há cadastro aberto ao público.
        </li>
        <li>As credenciais são pessoais e intransferíveis.</li>
        <li>O usuário é responsável por manter a confidencialidade de sua senha.</li>
      </ul>

      <h2>3. Uso permitido</h2>
      <p>
        O sistema deve ser usado exclusivamente para as finalidades operacionais de manutenção
        industrial autorizadas pela organização. É proibido:
      </p>
      <ul>
        <li>Tentar acessar áreas ou dados sem autorização.</li>
        <li>Realizar engenharia reversa, cópia ou redistribuição do sistema.</li>
        <li>Utilizar o sistema para atividades ilícitas ou que violem direitos de terceiros.</li>
      </ul>

      <h2>4. Propriedade intelectual</h2>
      <p>
        Todo o código, layout, marca e conteúdo do Apont Auto são de titularidade de
        <strong> @oferrolgarcia</strong>, protegidos pelas leis de direitos autorais e propriedade
        intelectual.
      </p>

      <h2>5. Limitação de responsabilidade</h2>
      <p>
        O sistema é fornecido "no estado em que se encontra". Não nos responsabilizamos por perdas
        indiretas decorrentes de indisponibilidade temporária, falhas de terceiros ou uso indevido
        pelo usuário.
      </p>

      <h2>6. Alterações</h2>
      <p>
        Estes termos podem ser atualizados a qualquer momento. A versão vigente estará sempre
        disponível nesta página.
      </p>

      <h2>7. Foro</h2>
      <p>Fica eleito o foro da comarca do responsável para dirimir quaisquer questões.</p>

      <h2>8. Contato</h2>
      <p>
        Dúvidas sobre estes termos: <a href="/contato">página de contato</a>.
      </p>
    </LegalLayout>
  );
}

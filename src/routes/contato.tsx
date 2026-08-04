import { createFileRoute } from "@tanstack/react-router";
import { LegalLayout } from "@/components/legal-layout";
import { Mail, Globe } from "lucide-react";

export const Route = createFileRoute("/contato")({
  head: () => ({
    meta: [
      { title: "Contato — Apont Auto" },
      {
        name: "description",
        content:
          "Fale com o responsável pelo Apont Auto — suporte, dúvidas e solicitações de acesso.",
      },
      { property: "og:title", content: "Contato — Apont Auto" },
      { property: "og:description", content: "Fale com o responsável pelo Apont Auto." },
      { property: "og:url", content: "https://apontauto.online/contato" },
    ],
    links: [{ rel: "canonical", href: "https://apontauto.online/contato" }],
  }),
  component: ContatoPage,
});

function ContatoPage() {
  return (
    <LegalLayout title="Contato">
      <p>
        Para dúvidas sobre o sistema, solicitações de acesso, correções de dados ou assuntos de
        privacidade, utilize os canais abaixo.
      </p>
      <div className="not-prose mt-6 grid gap-3 sm:grid-cols-2">
        <a
          href="mailto:gabrielvlp33@gmail.com"
          className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-4 transition hover:border-primary/40 hover:bg-card"
        >
          <Mail className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">E-mail</p>
            <p className="font-medium">gabrielvlp33@gmail.com</p>
          </div>
        </a>
        <a
          href="https://apontauto.online"
          className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-4 transition hover:border-primary/40 hover:bg-card"
        >
          <Globe className="h-5 w-5 text-primary" />
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Site</p>
            <p className="font-medium">apontauto.online</p>
          </div>
        </a>
      </div>
      <h2>Responsável</h2>
      <p>
        <strong>Gabriel Vitor</strong> — desenvolvedor e responsável pela operação do sistema.
      </p>
      <h2>Prazo de resposta</h2>
      <p>Respondemos em até 5 dias úteis. Solicitações relacionadas à LGPD são priorizadas.</p>
    </LegalLayout>
  );
}

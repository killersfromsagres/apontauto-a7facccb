import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

const logo = { url: "/apontauto-logo.png" };

export function LegalLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo.url} alt="ApontAuto" className="h-8 w-auto" />
            <span className="font-display text-base font-semibold">ApontAuto</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Início
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {updatedAt && (
          <p className="mt-2 text-sm text-muted-foreground">Última atualização: {updatedAt}</p>
        )}
        <article className="prose prose-neutral dark:prose-invert mt-8 max-w-none space-y-4 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </article>
      </main>
      <footer className="border-t border-border/60 py-8 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-4xl px-4">
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-2">
            <Link to="/sobre" className="hover:text-foreground">Sobre</Link>
            <Link to="/contato" className="hover:text-foreground">Contato</Link>
            <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link to="/termos" className="hover:text-foreground">Termos</Link>
          </nav>
          <p className="mt-3">© {new Date().getFullYear()} ApontAuto — Sistema de Apontamento de Manutenção Industrial</p>
        </div>
      </footer>
    </div>
  );
}

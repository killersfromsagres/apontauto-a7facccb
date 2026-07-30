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
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img
              src={logo.url}
              alt="Apont Auto"
              className="h-8 w-auto"
              width={32}
              height={32}
              decoding="async"
              loading="eager"
            />
            <span className="font-display text-base font-semibold">Apont Auto</span>
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
      <footer className="border-t border-border/60 py-10 text-center text-xs text-muted-foreground">
        <div className="mx-auto max-w-4xl px-4">
          <nav className="flex flex-wrap justify-center gap-2 sm:gap-3">
            {[
              { to: "/sobre" as const, label: "Sobre" },
              { to: "/contato" as const, label: "Contato" },
              { to: "/privacidade" as const, label: "Privacidade" },
              { to: "/termos" as const, label: "Termos" },
            ].map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{
                  className:
                    "border-primary/60 bg-primary/10 text-foreground shadow-[0_0_0_1px_hsl(var(--primary)/0.35),0_8px_24px_-12px_hsl(var(--primary)/0.6)]",
                }}
                className="group relative inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-2 text-sm font-medium text-muted-foreground backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card hover:text-foreground hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-primary/50 transition-all duration-300 group-hover:bg-primary group-hover:shadow-[0_0_8px_hsl(var(--primary))]" />
                {item.label}
              </Link>
            ))}
          </nav>
          <p className="mt-5 tracking-wide">
            © {new Date().getFullYear()} Apont Auto — Sistema de Apontamento de Manutenção
            Industrial
          </p>
        </div>
      </footer>
    </div>
  );
}

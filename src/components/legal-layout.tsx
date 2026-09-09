import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

const logo = { url: "/apontauto-logo.png" };

const institutionalLinks = [
  { to: "/sobre" as const, label: "Sobre" },
  { to: "/contato" as const, label: "Contato" },
  { to: "/privacidade" as const, label: "Privacidade" },
  { to: "/termos" as const, label: "Termos" },
];

export function LegalLayout({
  title,
  description,
  updatedAt,
  children,
}: {
  title: string;
  description?: string;
  updatedAt?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-[#080B10] text-slate-100">
      <header className="border-b border-white/[0.07] bg-[#080B10]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-5 py-5 sm:px-7 lg:px-10">
          <Link
            to="/"
            className="flex min-w-0 items-center gap-3.5"
            aria-label="Voltar ao Apont Auto"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/[0.08] bg-white/[0.025]">
              <img
                src={logo.url}
                alt=""
                className="h-7 w-auto"
                width={28}
                height={28}
                decoding="async"
                loading="eager"
              />
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold tracking-[-0.01em] text-white">
                Apont Auto
              </p>
              <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.2em] text-slate-600">
                Institucional
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Navegação institucional">
            {institutionalLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "bg-white/[0.07] text-white" }}
                className="rounded-lg px-3.5 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-white/[0.04] hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            to="/"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.025] px-3.5 py-2.5 text-xs font-medium text-slate-400 transition-colors hover:border-white/[0.12] hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Voltar ao sistema</span>
            <span className="sm:hidden">Voltar</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-7 sm:py-20 lg:px-10 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <header className="max-w-3xl pb-12 sm:pb-16">
            <p className="mb-6 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-600">
              Apont Auto / Institucional
            </p>
            <h1 className="font-display text-3xl font-semibold leading-[1.18] tracking-[-0.035em] text-white sm:text-4xl lg:text-[2.9rem] lg:leading-[1.14]">
              {title}
            </h1>
            {description && (
              <p className="mt-6 max-w-2xl text-[15px] leading-8 text-slate-400 sm:text-base sm:leading-8">
                {description}
              </p>
            )}
            {updatedAt && (
              <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.14em] text-slate-600">
                Atualizado em {updatedAt}
              </p>
            )}
          </header>

          <article className="border-t border-white/[0.08] pt-12 sm:pt-14">
            <div className="institutional-copy">{children}</div>
          </article>
        </div>
      </main>

      <footer className="border-t border-white/[0.07]">
        <div className="mx-auto max-w-6xl px-5 py-9 sm:px-7 lg:px-10">
          <nav
            className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-xs text-slate-500 lg:hidden"
            aria-label="Navegação institucional"
          >
            {institutionalLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "text-white" }}
                className="transition-colors hover:text-slate-200"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="mt-7 flex flex-col items-center justify-between gap-3 border-t border-white/[0.05] pt-7 text-center text-[11px] leading-5 text-slate-600 lg:mt-0 lg:flex-row lg:border-0 lg:pt-0 lg:text-left">
            <p>© {new Date().getFullYear()} Apont Auto. Uso corporativo autorizado.</p>
            <p>Gestão operacional, manutenção, ativos, conformidade e serviços.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

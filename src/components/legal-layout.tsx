import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ShieldCheck } from "lucide-react";

const logo = { url: "/apontauto-logo.png" };

const institutionalLinks = [
  { to: "/sobre" as const, label: "Sobre" },
  { to: "/contato" as const, label: "Contato" },
  { to: "/privacidade" as const, label: "Privacidade" },
  { to: "/termos" as const, label: "Termos" },
];

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
    <div className="relative min-h-dvh overflow-hidden bg-[#070B12] text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(circle_at_50%_-15%,rgba(79,140,255,0.16),transparent_58%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.018)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.018)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:linear-gradient(to_bottom,black,transparent_52%)]"
      />

      <header className="relative z-10 border-b border-white/[0.08] bg-[#070B12]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-5 px-4 py-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex min-w-0 items-center gap-3" aria-label="Voltar ao Apont Auto">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.04]">
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
              <p className="truncate font-display text-sm font-semibold tracking-tight text-white">
                Apont Auto
              </p>
              <p className="truncate text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Central institucional
              </p>
            </div>
          </Link>

          <nav
            className="hidden items-center gap-1 rounded-xl border border-white/[0.08] bg-white/[0.025] p-1 md:flex"
            aria-label="Navegação institucional"
          >
            {institutionalLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{
                  className: "border-white/10 bg-white/[0.08] text-white",
                }}
                className="rounded-lg border border-transparent px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <Link
            to="/"
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/60"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">Voltar ao sistema</span>
            <span className="sm:hidden">Voltar</span>
          </Link>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <div className="mx-auto max-w-4xl">
          <div className="mb-8 sm:mb-10">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-400/15 bg-blue-400/[0.06] px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-200/80">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
              Informação institucional
            </div>
            <h1 className="max-w-3xl font-display text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl lg:text-[2.75rem]">
              {title}
            </h1>
            {updatedAt && (
              <p className="mt-3 text-xs font-medium text-slate-500">
                Última atualização: {updatedAt}
              </p>
            )}
          </div>

          <article className="rounded-3xl border border-white/[0.08] bg-[#0B111C]/80 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:p-8 lg:p-10">
            <div className="prose prose-invert max-w-none text-[15px] leading-7 text-slate-300 prose-headings:font-display prose-headings:tracking-tight prose-headings:text-white prose-h2:mb-3 prose-h2:mt-10 prose-h2:text-xl prose-h2:font-semibold prose-h3:text-base prose-h3:font-semibold prose-p:text-slate-300 prose-strong:font-semibold prose-strong:text-slate-100 prose-a:font-medium prose-a:text-blue-300 prose-a:no-underline hover:prose-a:text-blue-200 prose-li:marker:text-blue-400/70 prose-hr:border-white/10">
              {children}
            </div>
          </article>
        </div>
      </main>

      <footer className="relative z-10 border-t border-white/[0.08] bg-black/10">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
          <nav
            className="flex flex-wrap justify-center gap-2 md:hidden"
            aria-label="Navegação institucional"
          >
            {institutionalLinks.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeProps={{ className: "border-blue-400/20 bg-blue-400/[0.08] text-white" }}
                className="rounded-lg border border-white/[0.08] bg-white/[0.025] px-3 py-2 text-xs font-medium text-slate-400 transition-colors hover:bg-white/[0.05] hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="mt-5 flex flex-col items-center justify-between gap-2 text-center text-[11px] text-slate-600 md:mt-0 md:flex-row md:text-left">
            <p>© {new Date().getFullYear()} Apont Auto. Uso corporativo autorizado.</p>
            <p>Gestão operacional, manutenção e conformidade em uma única plataforma.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

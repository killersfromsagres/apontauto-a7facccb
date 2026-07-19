import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ClipboardCheck, Cog, GanttChart, CalendarCheck } from "lucide-react";

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    // Coleta elementos alvo dentro do escopo do layout legal apenas.
    const article = root.querySelector("article");
    const headings = Array.from(root.querySelectorAll<HTMLElement>("main > h1, main > p"));
    const articleChildren = article
      ? Array.from(article.children).filter((n): n is HTMLElement => n instanceof HTMLElement)
      : [];
    const decor = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal-decor]"));

    const targets = [...headings, ...articleChildren, ...decor];

    if (prefersReduced) {
      // Mostra tudo imediatamente e não instala observers.
      targets.forEach((el) => {
        el.classList.remove("reveal");
        el.classList.add("reveal-in");
      });
      return;
    }

    // Marca stagger por seção do artigo (reset a cada h2).
    let sectionIndex = 0;
    articleChildren.forEach((el) => {
      if (el.tagName === "H2") sectionIndex = 0;
      el.style.transitionDelay = `${Math.min(sectionIndex, 6) * 70}ms`;
      sectionIndex++;
    });
    headings.forEach((el, i) => {
      el.style.transitionDelay = `${i * 90}ms`;
    });

    targets.forEach((el) => el.classList.add("reveal"));

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal-in");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.05 },
    );
    targets.forEach((el) => io.observe(el));

    // Parallax sutil nos ícones decorativos de fundo.
    const parallaxEls = Array.from(
      root.querySelectorAll<HTMLElement>("[data-parallax]"),
    );
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        parallaxEls.forEach((el) => {
          const speed = Number(el.dataset.parallax ?? "0.08");
          el.style.transform = `translate3d(0, ${(-y * speed).toFixed(1)}px, 0)`;
        });
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <div ref={rootRef} className="relative min-h-screen bg-background text-foreground">
      {/* Ícones decorativos temáticos (PCM) — puramente visuais, aria-hidden */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        <Cog
          data-reveal-decor
          data-parallax="0.06"
          className="reveal-parallax absolute -right-10 top-24 h-56 w-56 text-primary/[0.05]"
        />
        <GanttChart
          data-reveal-decor
          data-parallax="0.04"
          className="reveal-parallax absolute -left-6 top-[42%] h-40 w-40 text-primary/[0.05]"
        />
        <CalendarCheck
          data-reveal-decor
          data-parallax="0.05"
          className="reveal-parallax absolute right-6 top-[70%] h-40 w-40 text-primary/[0.04]"
        />
        <ClipboardCheck
          data-reveal-decor
          data-parallax="0.03"
          className="reveal-parallax absolute -left-4 bottom-32 h-44 w-44 text-primary/[0.05]"
        />
      </div>

      <header className="relative border-b border-border/60 bg-card/40 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo.url} alt="ApontAuto" className="h-8 w-auto" width={32} height={32} decoding="async" loading="eager" />
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
      <main className="relative mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {updatedAt && (
          <p className="mt-2 text-sm text-muted-foreground">Última atualização: {updatedAt}</p>
        )}
        <article className="prose prose-neutral dark:prose-invert mt-8 max-w-none space-y-4 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-xl [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:pl-6">
          {children}
        </article>
      </main>
      <footer className="relative border-t border-border/60 py-10 text-center text-xs text-muted-foreground">
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
          <p className="mt-5 tracking-wide">© {new Date().getFullYear()} ApontAuto — Sistema de Apontamento de Manutenção Industrial</p>
        </div>
      </footer>
    </div>
  );
}

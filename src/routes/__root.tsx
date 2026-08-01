import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { LoadingScreen } from "@/components/loading-screen";
import { OfflineBanner } from "@/components/offline-banner";
import { registerServiceWorker } from "@/lib/pwa/register-sw";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço acessado não existe ou foi movido.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight">Erro ao carregar a página</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Algo deu errado. Tente recarregar ou voltar ao dashboard.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#050c14" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "format-detection", content: "telephone=no" },
      { title: "PCM · Planejador de Manutenção — Dev Gabriel Vitor" },
      {
        name: "description",
        content: "Sistema de Apontamento by: Gabriel Vitor",
      },
      { name: "author", content: "Dev Gabriel Vitor" },
      { property: "og:title", content: "PCM · Planejador de Manutenção — Dev Gabriel Vitor" },
      {
        property: "og:description",
        content: "Sistema de Apontamento by: Gabriel Vitor",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "PCM · Planejador de Manutenção — Dev Gabriel Vitor" },
      { name: "twitter:description", content: "Sistema de Apontamento by: Gabriel Vitor" },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b7d6aea0-3819-4924-ac91-46d2f02fb587",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/attachments/og-images/b7d6aea0-3819-4924-ac91-46d2f02fb587",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/pwa-192.png" },
      // Preload do logo (LCP) — mesma imagem usada em header/sidebar/auth
      { rel: "preload", as: "image", href: "/apontauto-logo.png", fetchpriority: "high" },
      // Reduz latência da primeira chamada auth/DB
      {
        rel: "preconnect",
        href: "https://uthidybbrziwvktknryr.supabase.co",
        crossOrigin: "anonymous",
      },
      { rel: "dns-prefetch", href: "https://uthidybbrziwvktknryr.supabase.co" },
      // APIs de clima chamadas direto do cliente em Programação de Taludes.
      { rel: "preconnect", href: "https://api.open-meteo.com", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://api.open-meteo.com" },
      { rel: "dns-prefetch", href: "https://archive-api.open-meteo.com" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },

      // Fonte carregada de forma NÃO-bloqueante (media=print + swap para 'all' pós-load).
      // Elimina o render-blocking do CSS de fontes no primeiro paint (LCP/FCP).
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap",
        media: "print",
        onload: "this.media='all'",
      },
      {
        rel: "preload",
        as: "style",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "ApontAuto",
          url: "https://apontauto.online",
          logo: "https://apontauto.online/apontauto-logo.png",
          description:
            "Sistema corporativo de apontamento e planejamento de manutenção industrial (PCM).",
          founder: { "@type": "Person", name: "Gabriel Vitor" },
          contactPoint: {
            "@type": "ContactPoint",
            email: "gabrielvlp33@gmail.com",
            contactType: "customer support",
            areaServed: "BR",
            availableLanguage: ["Portuguese"],
          },
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" className="dark">
      <head>
        <HeadContent />
      </head>

      <body className="min-h-dvh overflow-x-hidden overscroll-y-none [text-size-adjust:100%] [-webkit-text-size-adjust:100%] [-webkit-tap-highlight-color:transparent]">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    registerServiceWorker();
    void import("@/features/observability/services/error-log").then((m) =>
      m.installErrorTelemetry(),
    );
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        {/* Camada de Performance e Mobile: Lazy-load do LoadingScreen */}
        <LoadingScreen />
        <OfflineBanner />

        {/* Outlet principal envolto em suspense para rotas com lazy loading (Item 7.4) */}
        <div className="flex min-h-dvh flex-col transition-opacity duration-300">
          <Outlet />
        </div>

        <Toaster richColors position="top-right" closeButton />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload agressivo no hover/foco → dados e chunks prontos quando o clique acontece.
    defaultPreload: "intent",
    defaultPreloadDelay: 30,
    defaultPreloadStaleTime: 0,
    // Cross-fade nativo entre rotas (React 19 + View Transitions API) — remove piscadas.
    defaultViewTransition: true,
    // Só mostra o loader global se a transição passar de 300ms; garante 250ms mínimos.
    defaultPendingMs: 300,
    defaultPendingMinMs: 250,
  });

  return router;
};

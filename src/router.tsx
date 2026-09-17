import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "./responsive-system.css";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Cache mais generoso: reduz refetch em navegação SPA sem sacrificar frescor
        // (queries críticas sobrescrevem localmente).
        staleTime: 60_000,
        gcTime: 10 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
        refetchOnMount: false,
        retry: 1,
        // Evita re-render em consumidores quando o payload é estruturalmente igual.
        structuralSharing: true,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadDelay: 30,
    defaultPreloadStaleTime: 0,
    defaultViewTransition: true,
    defaultPendingMs: 500,
    defaultPendingMinMs: 0,
  });

  return router;
};

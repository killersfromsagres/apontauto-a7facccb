import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ApontamentosConsolidatedV2 } from "@/components/apontamentos-consolidated-v2";

const APONTAMENTOS_STORAGE_KEY = "apontauto:apontamentos-manual:v1";

let reloadCleanupHandled = false;

function clearApontamentosDraftOnlyOnReload() {
  if (typeof window === "undefined" || reloadCleanupHandled) return;

  reloadCleanupHandled = true;

  try {
    const navigation = window.performance
      .getEntriesByType("navigation")
      .at(0) as PerformanceNavigationTiming | undefined;

    if (navigation?.type === "reload") {
      window.localStorage.removeItem(APONTAMENTOS_STORAGE_KEY);
    }
  } catch {
    // Storage/Performance indisponível: mantém o comportamento normal da tela.
  }
}

function ApontamentosRoute() {
  useState(() => {
    clearApontamentosDraftOnlyOnReload();
    return true;
  });

  return <ApontamentosConsolidatedV2 />;
}

export const Route = createFileRoute("/_authenticated/apontamentos")({
  component: ApontamentosRoute,
});

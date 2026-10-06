import { useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ApontamentosConsolidated } from "@/components/apontamentos-consolidated";

const APONTAMENTOS_STORAGE_KEY = "apontauto:apontamentos-manual:v1";

function clearApontamentosDraft() {
  if (typeof window === "undefined") return;

  try {
    window.localStorage.removeItem(APONTAMENTOS_STORAGE_KEY);
  } catch {
    // Storage indisponível: a tela continua funcionando apenas com o estado em memória.
  }
}

function ApontamentosRoute() {
  useEffect(() => {
    return () => {
      clearApontamentosDraft();
    };
  }, []);

  return <ApontamentosConsolidated />;
}

export const Route = createFileRoute("/_authenticated/apontamentos")({
  beforeLoad: () => {
    // Impede que um rascunho antigo reapareça ao entrar novamente na seção.
    clearApontamentosDraft();
  },
  component: ApontamentosRoute,
});

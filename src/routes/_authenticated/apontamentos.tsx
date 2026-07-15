import { createFileRoute } from "@tanstack/react-router";
import { ApontamentosConsolidated } from "@/components/apontamentos-consolidated";

export const Route = createFileRoute("/_authenticated/apontamentos")({
  component: ApontamentosConsolidated,
});

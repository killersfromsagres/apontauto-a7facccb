import { createFileRoute } from "@tanstack/react-router";
import { ApontamentoModule } from "@/components/apontamento-module";

export const Route = createFileRoute("/limpeza")({
  component: () => (
    <ApontamentoModule
      titulo="Limpeza"
      descricao="Registro de apontamentos de limpeza com divisão automática de tempo."
      accent="text-emerald-500"
    />
  ),
});

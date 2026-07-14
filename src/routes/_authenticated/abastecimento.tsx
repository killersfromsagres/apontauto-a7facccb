import { createFileRoute } from "@tanstack/react-router";
import { ApontamentoModule } from "@/components/apontamento-module";

export const Route = createFileRoute("/_authenticated/abastecimento")({
  component: () => (
    <ApontamentoModule
      titulo="Abastecimento"
      descricao="Registro de apontamentos de abastecimento com divisão automática de tempo."
      accent="text-orange-500"
    />
  ),
});

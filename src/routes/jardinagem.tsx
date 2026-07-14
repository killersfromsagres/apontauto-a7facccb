import { createFileRoute } from "@tanstack/react-router";
import { ApontamentoModule } from "@/components/apontamento-module";

export const Route = createFileRoute("/jardinagem")({
  component: () => (
    <ApontamentoModule
      titulo="Jardinagem"
      descricao="Registro de apontamentos de jardinagem com divisão automática de tempo."
      accent="text-green-600"
    />
  ),
});

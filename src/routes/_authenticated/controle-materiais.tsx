import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/controle-materiais")({
  beforeLoad: () => {
    throw redirect({ to: "/corretiva-pecas-status", replace: true });
  },
});

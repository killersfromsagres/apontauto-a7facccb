import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/outros")({
  beforeLoad: () => {
    throw redirect({ to: "/painel-legal" });
  },
});

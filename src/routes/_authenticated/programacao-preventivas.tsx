import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/programacao-preventivas")(
  {
    beforeLoad: () => {
      throw redirect({ to: "/programacao", replace: true });
    },
    component: () => null,
  },
);

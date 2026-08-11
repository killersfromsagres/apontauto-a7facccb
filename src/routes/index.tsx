import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/_authenticated/" });
  },
  loader: () => {
    throw redirect({ to: "/_authenticated/" });
  },
  component: () => null,
});

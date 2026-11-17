import { createFileRoute } from "@tanstack/react-router";
import { ClientPortal } from "@/features/demarchi/client-portal";
export const Route = createFileRoute("/cliente")({
  ssr: false,
  head: () => ({ meta: [{ title: "Portal do Cliente · Demarchi" }] }),
  component: ClientPortal,
});

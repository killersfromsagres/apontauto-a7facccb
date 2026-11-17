import { createFileRoute } from "@tanstack/react-router";
import { AdminCentral } from "@/features/demarchi/admin-central";
export const Route = createFileRoute("/_authenticated/central-chamados")({
  head: () => ({ meta: [{ title: "Central Demarchi · Chamados e Manutenção" }] }),
  component: AdminCentral,
});

import { createFileRoute } from "@tanstack/react-router";

import { FilterRequestKanban } from "@/features/water-delivery/pages/filter-request-kanban";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/filtros")({
  validateSearch: (search: Record<string, unknown>) => ({
    qr: typeof search.qr === "string" ? search.qr : undefined,
  }),
  component: FilterRequestKanban,
});

import { createFileRoute } from "@tanstack/react-router";

import { BagReconciliation } from "@/features/water-delivery/pages/bag-reconciliation";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/bags")({
  component: BagReconciliation,
});

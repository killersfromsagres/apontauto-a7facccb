import { createFileRoute } from "@tanstack/react-router";

import { EvidenceGallery } from "@/features/water-delivery/pages/evidence-gallery";

export const Route = createFileRoute("/_authenticated/abastecimento/agua/evidencias")({
  component: EvidenceGallery,
});

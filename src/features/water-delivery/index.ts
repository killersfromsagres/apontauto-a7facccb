// Fachada pública do módulo Entrega de Água.
// Consumidores externos devem importar daqui; o interior da feature é detalhe.

export * from "@/features/water-delivery/types";
export * from "@/features/water-delivery/schemas/water";
export * from "@/features/water-delivery/hooks/use-agua";
export { useAguaSync } from "@/features/water-delivery/offline/offline";

// Tipos públicos do módulo Entrega de Água.
// Um único ponto de importação para quem consome o domínio de fora da feature.

export type {
  Ponto,
  ProgramacaoItem,
  Visita,
  Lote,
  AjustePonto,
  PontoMerge,
  PontoPrioridade,
  FiltroSolicitacao,
  FiltroSituacao,
  FiltroPrioridade,
} from "@/features/water-delivery/queries/api";

export type { VisitaStatus } from "@/features/water-delivery/state-machines/estados";
export type { LeituraAgua, PontoLido, Divergencia } from "@/features/water-delivery/importer/reader";

export type {
  PontoInput,
  EntregaInput,
  FiltroSolicitacaoInput,
  MovimentoBagInput,
} from "@/features/water-delivery/schemas/water";

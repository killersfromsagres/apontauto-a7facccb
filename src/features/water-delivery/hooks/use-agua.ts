// Hooks de leitura do módulo Entrega de Água.
// Centralizam as query keys para que as páginas não repitam cache e invalidação.

import { useQuery } from "@tanstack/react-query";

import {
  hojeISO,
  listFiltros,
  listLotes,
  listPontos,
  listProgramacao,
  listVisitas,
  garantirVisitasDoDia,
} from "@/features/water-delivery/queries/api";
import {
  listFeriados,
  listProgramacaoCompleta,
  listRotas,
} from "@/features/water-delivery/queries/programacao";

export const aguaKeys = {
  all: ["agua"] as const,
  pontos: () => ["agua", "pontos"] as const,
  programacao: () => ["agua", "programacao"] as const,
  programacaoCompleta: () => ["agua", "programacao", "completa"] as const,
  visitas: (inicio: string, fim: string) => ["agua", "visitas", inicio, fim] as const,
  visitasDoDia: (data: string) => ["agua", "visitas", "dia", data] as const,
  rotas: (inicio: string, fim: string) => ["agua", "rotas", inicio, fim] as const,
  filtros: () => ["agua", "filtros"] as const,
  feriados: () => ["agua", "feriados"] as const,
  lotes: () => ["agua", "lotes"] as const,
};

export function usePontos() {
  return useQuery({ queryKey: aguaKeys.pontos(), queryFn: listPontos });
}

export function useProgramacao() {
  return useQuery({ queryKey: aguaKeys.programacao(), queryFn: listProgramacao });
}

export function useProgramacaoCompleta() {
  return useQuery({
    queryKey: aguaKeys.programacaoCompleta(),
    queryFn: listProgramacaoCompleta,
  });
}

export function useVisitas(inicio: string, fim: string) {
  return useQuery({
    queryKey: aguaKeys.visitas(inicio, fim),
    queryFn: () => listVisitas(inicio, fim),
  });
}

export function useVisitasDoDia(data: string = hojeISO()) {
  return useQuery({
    queryKey: aguaKeys.visitasDoDia(data),
    queryFn: () => garantirVisitasDoDia(data),
  });
}

export function useRotas(inicio: string, fim: string) {
  return useQuery({ queryKey: aguaKeys.rotas(inicio, fim), queryFn: () => listRotas(inicio, fim) });
}

export function useFiltrosAgua() {
  return useQuery({ queryKey: aguaKeys.filtros(), queryFn: listFiltros });
}

export function useFeriados() {
  return useQuery({ queryKey: aguaKeys.feriados(), queryFn: listFeriados });
}

export function useLotesImportacao() {
  return useQuery({ queryKey: aguaKeys.lotes(), queryFn: listLotes });
}

// Hooks de leitura do módulo Entrega de Água.
// Centralizam as query keys para que as páginas não repitam cache e invalidação.

import { useQuery } from "@tanstack/react-query";

import { staleTimes } from "@/lib/query/keys";
import {
  hojeISO,
  listVisitasPagina,
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
  visitasPagina: (inicio: string, fim: string, pagina: number, tamanho: number) =>
    ["agua", "visitas", "pagina", inicio, fim, pagina, tamanho] as const,
  fotos: (inicio: string, fim: string, pagina: number, tamanho: number) =>
    ["agua", "fotos", inicio, fim, pagina, tamanho] as const,
  visitasDoDia: (data: string) => ["agua", "visitas", "dia", data] as const,
  rotas: (inicio: string, fim: string) => ["agua", "rotas", inicio, fim] as const,
  filtros: () => ["agua", "filtros"] as const,
  feriados: () => ["agua", "feriados"] as const,
  lotes: () => ["agua", "lotes"] as const,
};

export function usePontos() {
  // Catálogo: muda pouco, evita refetch a cada foco de janela.
  return useQuery({
    queryKey: aguaKeys.pontos(),
    queryFn: listPontos,
    staleTime: staleTimes.long,
    refetchOnWindowFocus: false,
  });
}

/** Histórico paginado — mantém a página anterior visível durante a troca. */
export function useVisitasPagina(
  inicio: string,
  fim: string,
  pagina: number,
  tamanho = 50,
) {
  return useQuery({
    queryKey: aguaKeys.visitasPagina(inicio, fim, pagina, tamanho),
    queryFn: () => listVisitasPagina(inicio, fim, pagina, tamanho),
    placeholderData: (prev) => prev,
    staleTime: staleTimes.default,
    refetchOnWindowFocus: false,
  });
}

export function useProgramacao() {
  return useQuery({
    queryKey: aguaKeys.programacao(),
    queryFn: listProgramacao,
    staleTime: staleTimes.long,
    refetchOnWindowFocus: false,
  });
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
  return useQuery({
    queryKey: aguaKeys.feriados(),
    queryFn: listFeriados,
    staleTime: staleTimes.long,
    refetchOnWindowFocus: false,
  });
}

export function useLotesImportacao() {
  return useQuery({ queryKey: aguaKeys.lotes(), queryFn: listLotes });
}

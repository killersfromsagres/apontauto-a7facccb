// Contrato compartilhado entre o cliente e a server function do Agente de IA.
//
// A IA nunca devolve o arquivo pronto: ela devolve um **plano** (spec) e o
// cliente executa esse plano de forma determinística sobre a base já
// enriquecida (equipe, prédio, andar, ambiente). Isso garante números
// corretos mesmo com milhares de linhas.

import { z } from "zod";

export const AGREGACOES = ["contagem", "soma", "media", "min", "max", "distintos"] as const;
export type Agregacao = (typeof AGREGACOES)[number];

export const OPERADORES = [
  "igual",
  "diferente",
  "contem",
  "naoContem",
  "vazio",
  "naoVazio",
  "maior",
  "menor",
] as const;

export const MetricaSchema = z.object({
  rotulo: z.string().min(1),
  campo: z.string().nullable().default(null),
  agregacao: z.enum(AGREGACOES).default("contagem"),
});

export const FiltroSchema = z.object({
  campo: z.string().min(1),
  operador: z.enum(OPERADORES).default("igual"),
  valor: z.string().nullable().default(null),
});

export const TabelaSchema = z.object({
  id: z.string().min(1),
  nome: z.string().min(1),
  descricao: z.string().nullable().default(null),
  tipo: z.enum(["detalhe", "agrupado"]).default("agrupado"),
  colunas: z.array(z.string()).default([]),
  agruparPor: z.array(z.string()).default([]),
  metricas: z.array(MetricaSchema).default([]),
  filtros: z.array(FiltroSchema).default([]),
  ordenarPor: z.string().nullable().default(null),
  ordem: z.enum(["asc", "desc"]).default("desc"),
  limite: z.number().int().positive().max(20000).nullable().default(null),
});

export const SlideSchema = z.object({
  titulo: z.string().min(1),
  subtitulo: z.string().nullable().default(null),
  bullets: z.array(z.string()).default([]),
  tabelaId: z.string().nullable().default(null),
  grafico: z.enum(["nenhum", "barras", "pizza", "linha"]).default("nenhum"),
});

export const SpecSchema = z.object({
  titulo: z.string().min(1),
  subtitulo: z.string().default(""),
  resumo: z.array(z.string()).default([]),
  formatos: z.array(z.enum(["xlsx", "pptx", "powerbi", "csv"])).min(1),
  tabelas: z.array(TabelaSchema).default([]),
  slides: z.array(SlideSchema).default([]),
  observacoes: z.string().nullable().default(null),
});

export type Spec = z.infer<typeof SpecSchema>;
export type TabelaSpec = z.infer<typeof TabelaSchema>;
export type SlideSpec = z.infer<typeof SlideSchema>;
export type Metrica = z.infer<typeof MetricaSchema>;
export type Filtro = z.infer<typeof FiltroSchema>;

/** Linha já enriquecida (valores sempre string ou number). */
export type DataRow = Record<string, string | number>;

export interface Dataset {
  columns: string[];
  rows: DataRow[];
  fileName: string;
  /** Quantas linhas tiveram o ativo resolvido na base. */
  resolvidos: number;
  naoResolvidos: number;
}

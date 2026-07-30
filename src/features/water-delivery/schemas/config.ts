// Item 22 — Configurações administrativas do módulo Abastecimento de Água.
//
// Tudo aqui é configuração NÃO sensível, persistida em `app_settings`.
// Segredos (tokens da Cloud API, chave do ImgBB) NUNCA ficam neste objeto:
// eles vivem apenas nos secrets do servidor e nunca são devolvidos ao cliente.

import { z } from "zod";

export type ModoFallbackFoto = "somente-fila" | "storage-emergencial";
export type ModoCompartilhamento = "link" | "app" | "cloud-api";

export interface AguaAdminConfig {
  /** Liga/desliga o módulo inteiro para todos os perfis (admin continua vendo). */
  moduloAtivo: boolean;
  /** Ativa/desativa o envio de notificações do módulo. */
  notificacoesAtivas: boolean;

  /** Operação diária. */
  operacao: {
    /** Quantidade padrão de bags sugerida ao criar uma parada. */
    bagsPadrao: number;
    /** Dias úteis (1 = segunda … 7 = domingo). */
    diasUteis: number[];
    /** Janela de trabalho, fuso America/Sao_Paulo. */
    horaInicio: string;
    horaFim: string;
    /** Hora da geração automática das rotas. */
    horaGeracao: number;
    /** Minutos de tolerância antes de considerar a rota/parada atrasada. */
    toleranciaAtrasoMin: number;
  };

  /** Regras de campo. */
  campo: {
    /** Exige ao menos uma evidência para concluir a parada. */
    fotoObrigatoria: boolean;
    /** Exige captura de geolocalização na conclusão. */
    geolocalizacaoObrigatoria: boolean;
    /** Raio (m) aceito entre o ponto cadastrado e a posição capturada. */
    raioGeoMetros: number;
  };

  /** Filtros de água. */
  filtros: {
    /** SLA em horas por prioridade. */
    slaAltaHoras: number;
    slaMediaHoras: number;
    slaBaixaHoras: number;
    /** Periodicidade padrão de troca preventiva, em dias. */
    periodicidadeDias: number;
    /** Dias de antecedência do aviso de vencimento. */
    avisoAntecedenciaDias: number;
  };

  /** Evidências e retenção. */
  evidencias: {
    /** Qualidade da compressão JPEG/WebP (0,5 a 0,95). */
    qualidadeImagem: number;
    /** Lado maior da imagem enviada, em px (1280 a 1600). */
    ladoMaximoPx: number;
    /** O que fazer quando o ImgBB falha. */
    modoFallback: ModoFallbackFoto;
    /** Retenção de histórico técnico (logs/filas), em dias. Evidências nunca são apagadas. */
    retencaoLogsDias: number;
  };

  /** Compartilhamento de evidências. */
  compartilhamento: {
    modo: ModoCompartilhamento;
  };
}

export const DEFAULT_AGUA_ADMIN: AguaAdminConfig = {
  moduloAtivo: true,
  notificacoesAtivas: true,
  operacao: {
    bagsPadrao: 2,
    diasUteis: [1, 2, 3, 4, 5],
    horaInicio: "07:00",
    horaFim: "17:00",
    horaGeracao: 5,
    toleranciaAtrasoMin: 30,
  },
  campo: {
    fotoObrigatoria: true,
    geolocalizacaoObrigatoria: true,
    raioGeoMetros: 150,
  },
  filtros: {
    slaAltaHoras: 24,
    slaMediaHoras: 72,
    slaBaixaHoras: 168,
    periodicidadeDias: 180,
    avisoAntecedenciaDias: 15,
  },
  evidencias: {
    qualidadeImagem: 0.8,
    ladoMaximoPx: 1600,
    modoFallback: "somente-fila",
    retencaoLogsDias: 90,
  },
  compartilhamento: { modo: "link" },
};

export const aguaAdminSchema = z.object({
  moduloAtivo: z.boolean(),
  notificacoesAtivas: z.boolean(),
  operacao: z.object({
    bagsPadrao: z.number().int().min(1, "Mínimo 1 bag").max(200),
    diasUteis: z.array(z.number().int().min(1).max(7)).min(1, "Selecione ao menos um dia"),
    horaInicio: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
    horaFim: z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM"),
    horaGeracao: z.number().int().min(0).max(23),
    toleranciaAtrasoMin: z.number().int().min(0).max(480),
  }),
  campo: z.object({
    fotoObrigatoria: z.boolean(),
    geolocalizacaoObrigatoria: z.boolean(),
    raioGeoMetros: z.number().int().min(20).max(5000),
  }),
  filtros: z.object({
    slaAltaHoras: z.number().int().min(1).max(720),
    slaMediaHoras: z.number().int().min(1).max(720),
    slaBaixaHoras: z.number().int().min(1).max(2160),
    periodicidadeDias: z.number().int().min(7).max(1095),
    avisoAntecedenciaDias: z.number().int().min(1).max(120),
  }),
  evidencias: z.object({
    qualidadeImagem: z.number().min(0.5).max(0.95),
    ladoMaximoPx: z.number().int().min(1280).max(1600),
    modoFallback: z.enum(["somente-fila", "storage-emergencial"]),
    retencaoLogsDias: z.number().int().min(30).max(730),
  }),
  compartilhamento: z.object({ modo: z.enum(["link", "app", "cloud-api"]) }),
});

/** Mescla o que está salvo com os padrões, tolerando configurações antigas. */
export function mergeAguaAdmin(parcial: unknown): AguaAdminConfig {
  const p = (parcial ?? {}) as Partial<AguaAdminConfig>;
  return {
    ...DEFAULT_AGUA_ADMIN,
    ...p,
    operacao: { ...DEFAULT_AGUA_ADMIN.operacao, ...(p.operacao ?? {}) },
    campo: { ...DEFAULT_AGUA_ADMIN.campo, ...(p.campo ?? {}) },
    filtros: { ...DEFAULT_AGUA_ADMIN.filtros, ...(p.filtros ?? {}) },
    evidencias: { ...DEFAULT_AGUA_ADMIN.evidencias, ...(p.evidencias ?? {}) },
    compartilhamento: {
      ...DEFAULT_AGUA_ADMIN.compartilhamento,
      ...(p.compartilhamento ?? {}),
    },
  };
}

export const DIAS_SEMANA: { valor: number; label: string }[] = [
  { valor: 1, label: "Seg" },
  { valor: 2, label: "Ter" },
  { valor: 3, label: "Qua" },
  { valor: 4, label: "Qui" },
  { valor: 5, label: "Sex" },
  { valor: 6, label: "Sáb" },
  { valor: 7, label: "Dom" },
];

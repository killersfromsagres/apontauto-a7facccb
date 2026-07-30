/**
 * Backlog inteligente (item 10 do prompt mestre).
 * Score determinístico e auditável: cada fator gera pontos e justificativa.
 */

export type BacklogFactorKey =
  | "criticidade"
  | "seguranca"
  | "impacto"
  | "idade"
  | "sla"
  | "reincidencia"
  | "material"
  | "duracao";

export type BacklogInput = {
  /** 1 (baixa) a 5 (crítica). */
  criticidadeAtivo?: number;
  riscoSeguranca?: boolean;
  impactoOperacional?: "baixo" | "medio" | "alto";
  /** Dias desde a abertura. */
  idadeDias?: number;
  /** Horas restantes até o SLA (negativo = vencido). */
  slaHorasRestantes?: number;
  /** Ocorrências do mesmo ativo nos últimos 90 dias. */
  reincidencias?: number;
  materialPendente?: boolean;
  duracaoMinutos?: number;
};

export type BacklogFactor = {
  key: BacklogFactorKey;
  label: string;
  points: number;
  reason: string;
};

export type BacklogScore = {
  score: number;
  level: "critico" | "alto" | "medio" | "baixo";
  factors: BacklogFactor[];
  recommendation: string;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export function scoreBacklog(input: BacklogInput): BacklogScore {
  const factors: BacklogFactor[] = [];

  const criticidade = clamp(input.criticidadeAtivo ?? 3, 1, 5);
  factors.push({
    key: "criticidade",
    label: "Criticidade do ativo",
    points: (criticidade - 1) * 6,
    reason: `Ativo com criticidade ${criticidade} de 5.`,
  });

  if (input.riscoSeguranca) {
    factors.push({
      key: "seguranca",
      label: "Risco de segurança",
      points: 25,
      reason: "Ordem sinalizada com risco de segurança.",
    });
  }

  const impactoPts = { baixo: 0, medio: 8, alto: 16 }[input.impactoOperacional ?? "baixo"];
  if (impactoPts > 0) {
    factors.push({
      key: "impacto",
      label: "Impacto operacional",
      points: impactoPts,
      reason: `Impacto operacional ${input.impactoOperacional}.`,
    });
  }

  const idade = clamp(input.idadeDias ?? 0, 0, 120);
  if (idade > 0) {
    factors.push({
      key: "idade",
      label: "Idade da ordem",
      points: clamp(Math.round(idade / 4), 0, 15),
      reason: `${idade} dia(s) em backlog.`,
    });
  }

  if (typeof input.slaHorasRestantes === "number") {
    const h = input.slaHorasRestantes;
    const pts = h < 0 ? 22 : h <= 8 ? 14 : h <= 24 ? 8 : 0;
    if (pts > 0) {
      factors.push({
        key: "sla",
        label: "SLA",
        points: pts,
        reason: h < 0 ? "SLA vencido." : `Restam ${Math.round(h)}h de SLA.`,
      });
    }
  }

  const reinc = clamp(input.reincidencias ?? 0, 0, 10);
  if (reinc > 0) {
    factors.push({
      key: "reincidencia",
      label: "Reincidência",
      points: clamp(reinc * 4, 0, 16),
      reason: `${reinc} ocorrência(s) recentes no mesmo ativo.`,
    });
  }

  if (input.materialPendente) {
    factors.push({
      key: "material",
      label: "Material pendente",
      points: -10,
      reason: "Material pendente impede execução imediata.",
    });
  }

  const dur = input.duracaoMinutos ?? 0;
  if (dur > 0 && dur <= 30) {
    factors.push({
      key: "duracao",
      label: "Execução rápida",
      points: 5,
      reason: "Serviço curto: bom candidato para preencher janelas ociosas.",
    });
  }

  const raw = factors.reduce((acc, f) => acc + f.points, 0);
  const score = clamp(Math.round(raw), 0, 100);
  const level = score >= 70 ? "critico" : score >= 45 ? "alto" : score >= 25 ? "medio" : "baixo";

  const recommendation =
    level === "critico"
      ? "Programar para o próximo turno disponível."
      : level === "alto"
        ? "Programar dentro da semana corrente."
        : level === "medio"
          ? "Incluir na próxima programação semanal."
          : "Manter em backlog e reavaliar periodicamente.";

  return { score, level, factors, recommendation };
}

/** Ordena ordens do maior para o menor score, mantendo estabilidade. */
export function rankBacklog<T>(
  items: T[],
  toInput: (item: T) => BacklogInput,
): Array<{ item: T; score: BacklogScore }> {
  return items
    .map((item) => ({ item, score: scoreBacklog(toInput(item)) }))
    .sort((a, b) => b.score.score - a.score.score);
}

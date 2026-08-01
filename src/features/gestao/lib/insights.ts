import type { GestaoOverviewV2, OsConsolidada } from "../types";

export type Insight = {
  key: string;
  titulo: string;
  evidencia: string;
  impacto: string;
  confianca: "alta" | "media" | "baixa";
  recomendacao: string;
  origem: string;
};

const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? 100 : 0);

/**
 * Insights determinísticos: derivados apenas dos números retornados pelo banco.
 * Nada é inferido sem evidência numérica correspondente.
 */
export function gerarInsights(
  d: GestaoOverviewV2 | undefined,
  os: OsConsolidada[] = [],
): Insight[] {
  if (!d) return [];
  const out: Insight[] = [];

  const varCriadas = pct(d.os.criadas, d.os.criadas_ant);
  if (Math.abs(varCriadas) >= 15 && d.os.criadas_ant > 0) {
    out.push({
      key: "volume-os",
      titulo: varCriadas > 0 ? "Aumento na abertura de OS" : "Queda na abertura de OS",
      evidencia: `${d.os.criadas} OS abertas no período contra ${d.os.criadas_ant} no período anterior (${varCriadas > 0 ? "+" : ""}${varCriadas}%).`,
      impacto:
        varCriadas > 0
          ? "Pressão adicional sobre a capacidade das equipes e risco de crescimento do backlog."
          : "Sobra de capacidade que pode ser direcionada ao backlog envelhecido.",
      confianca: "alta",
      recomendacao:
        varCriadas > 0
          ? "Rebalancear a programação e antecipar as OS com SLA nas próximas 48 horas."
          : "Alocar equipes ociosas nas OS abertas há mais de 30 dias.",
      origem: "vw_gestao_os_consolidada",
    });
  }

  const sla = d.os.concluidas > 0 ? Math.round((d.os.sla_ok / d.os.concluidas) * 100) : null;
  if (sla !== null && sla < 90) {
    out.push({
      key: "sla",
      titulo: "Cumprimento de SLA abaixo da meta",
      evidencia: `${sla}% das ${d.os.concluidas} OS concluídas no período respeitaram o prazo.`,
      impacto: "Risco contratual e acúmulo de reclamações dos solicitantes.",
      confianca: "alta",
      recomendacao: "Revisar prazos das equipes com maior número de OS atrasadas.",
      origem: "gestao_overview_v2 · os.sla_ok",
    });
  }

  const sobrecarga = (d.os_equipes ?? []).filter((e) => e.abertas >= 30 && e.atrasadas > 0);
  for (const e of sobrecarga.slice(0, 3)) {
    out.push({
      key: `equipe-${e.equipe}`,
      titulo: `Equipe ${e.equipe} acima da capacidade`,
      evidencia: `${e.abertas} OS abertas, ${e.atrasadas} atrasadas, tempo médio de ${e.tma_horas}h.`,
      impacto: "Tendência de aumento do atraso e do retrabalho nessa frente.",
      confianca: e.abertas >= 60 ? "alta" : "media",
      recomendacao: "Redistribuir demandas ou reforçar a equipe no próximo ciclo.",
      origem: "gestao_overview_v2 · os_equipes",
    });
  }

  const reincidente = (d.os_reincidentes ?? [])[0];
  if (reincidente && reincidente.ocorrencias >= 3) {
    out.push({
      key: "reincidencia",
      titulo: "Ativo com reincidência elevada",
      evidencia: `${reincidente.ativo} acumula ${reincidente.ocorrencias} ordens de serviço.`,
      impacto: "Indício de falha crônica com custo recorrente de manutenção.",
      confianca: "alta",
      recomendacao: "Abrir análise de causa raiz e avaliar substituição do ativo.",
      origem: "gestao_overview_v2 · os_reincidentes",
    });
  }

  const predio = (d.os_predios ?? [])[0];
  if (predio && predio.abertas >= 20) {
    out.push({
      key: "predio",
      titulo: `Concentração de demandas em ${predio.predio}`,
      evidencia: `${predio.abertas} OS abertas nesse prédio.`,
      impacto: "Local com maior consumo de horas de equipe.",
      confianca: "media",
      recomendacao: "Programar mutirão ou inspeção preventiva no local.",
      origem: "gestao_overview_v2 · os_predios",
    });
  }

  if (d.frota.litros > 0) {
    const varCusto = pct(d.frota.custo, d.frota.custo_ant);
    if (Math.abs(varCusto) >= 20 && d.frota.custo_ant > 0) {
      out.push({
        key: "combustivel",
        titulo:
          varCusto > 0 ? "Custo de combustível acima do padrão" : "Redução no custo de combustível",
        evidencia: `R$ ${d.frota.custo.toFixed(2)} no período contra R$ ${d.frota.custo_ant.toFixed(2)} no anterior (${varCusto > 0 ? "+" : ""}${varCusto}%).`,
        impacto: "Efeito direto no custo operacional mensal da frota.",
        confianca: "media",
        recomendacao:
          varCusto > 0
            ? "Conferir hodômetros, rotas e abastecimentos fora de padrão."
            : "Registrar as boas práticas adotadas no período.",
        origem: "fleet_fuelings",
      });
    }
  }

  if (d.agua.sem_evidencia > 0) {
    out.push({
      key: "agua-evidencia",
      titulo: "Entregas de água sem comprovação",
      evidencia: `${d.agua.sem_evidencia} entregas do período sem foto anexada.`,
      impacto: "Fragiliza a comprovação contratual do serviço prestado.",
      confianca: "alta",
      recomendacao: "Reforçar a obrigatoriedade de evidência no app de campo.",
      origem: "agua_prog_entregas · agua_prog_fotos",
    });
  }

  if (d.legal.proximos_30 > 0 || d.sst.aso_proximos_30 > 0) {
    out.push({
      key: "conformidade",
      titulo: "Risco de vencimento de conformidade",
      evidencia: `${d.legal.proximos_30} itens legais e ${d.sst.aso_proximos_30} ASO vencem nos próximos 30 dias.`,
      impacto: "Exposição a autuações e afastamento de colaboradores.",
      confianca: "alta",
      recomendacao: "Agendar execuções e exames ainda neste ciclo.",
      origem: "legal_items · sst_colaboradores",
    });
  }

  if (d.taludes.pt_suspensas > 0) {
    out.push({
      key: "clima",
      titulo: "Suspensões associadas ao clima",
      evidencia: `${d.taludes.pt_suspensas} permissões de trabalho suspensas.`,
      impacto: "Perda de janelas produtivas em taludes.",
      confianca: "media",
      recomendacao: "Reprogramar serviços para janelas sem previsão de chuva.",
      origem: "talude_pt_releases",
    });
  }

  const semSla = os.filter((o) => !o.prazo_sla).length;
  if (os.length > 0 && semSla / os.length > 0.3) {
    out.push({
      key: "qualidade-dados",
      titulo: "Qualidade de dados comprometida",
      evidencia: `${semSla} de ${os.length} OS carregadas estão sem prazo de SLA.`,
      impacto: "Indicadores de prazo ficam subestimados.",
      confianca: "alta",
      recomendacao: "Corrigir o preenchimento de SLA na origem das importações.",
      origem: "vw_gestao_os_consolidada",
    });
  }

  return out;
}

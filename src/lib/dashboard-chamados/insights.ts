// Agente de análise: computa insights sobre chamados carregados.
import type { ChamadoRow } from "./parser";

export interface Insight {
  tipo: "info" | "atencao" | "critico" | "sucesso";
  titulo: string;
  descricao: string;
  metrica?: string | number;
}

export interface DashboardStats {
  total: number;
  abertos: number;
  andamento: number;
  concluidos: number;
  vencidos: number;
  vencendo48h: number;
  taxaConclusao: number; // 0-100
  porEquipe: Array<{ name: string; total: number; concluidos: number; abertos: number }>;
  porCategoria: Array<{ name: string; value: number }>;
  porCriticidade: Array<{ name: string; value: number }>;
  porSolicitante: Array<{ name: string; total: number; abertos: number }>;
  porPredio: Array<{ name: string; value: number }>;
  porStatus: Array<{ name: string; value: number }>;
  timeline: Array<{ date: string; total: number }>;
  insights: Insight[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function pctSafe(a: number, b: number) {
  return b === 0 ? 0 : Math.round((a / b) * 100);
}

export function computeDashboardStats(rows: ChamadoRow[]): DashboardStats {
  const now = Date.now();
  const total = rows.length;

  const abertos = rows.filter((r) => r.statusNorm === "aberto").length;
  const andamento = rows.filter((r) => r.statusNorm === "andamento").length;
  const concluidos = rows.filter((r) => r.statusNorm === "concluido").length;

  const naoConcluidos = rows.filter((r) => r.statusNorm !== "concluido");
  const vencidos = naoConcluidos.filter((r) => r.dataLimiteTs != null && r.dataLimiteTs < now).length;
  const vencendo48h = naoConcluidos.filter(
    (r) => r.dataLimiteTs != null && r.dataLimiteTs >= now && r.dataLimiteTs - now <= 2 * DAY_MS,
  ).length;

  const taxaConclusao = pctSafe(concluidos, total);

  // Por equipe
  const equipeMap = new Map<string, { total: number; concluidos: number; abertos: number }>();
  for (const r of rows) {
    const k = r.equipe || "Outros";
    const cur = equipeMap.get(k) ?? { total: 0, concluidos: 0, abertos: 0 };
    cur.total++;
    if (r.statusNorm === "concluido") cur.concluidos++;
    else cur.abertos++;
    equipeMap.set(k, cur);
  }
  const porEquipe = [...equipeMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total);

  // Por categoria
  const catMap = new Map<string, number>();
  for (const r of rows) catMap.set(r.categoria, (catMap.get(r.categoria) ?? 0) + 1);
  const porCategoria = [...catMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Criticidade
  const critMap = new Map<string, number>();
  for (const r of rows) critMap.set(r.criticidade, (critMap.get(r.criticidade) ?? 0) + 1);
  const critOrdem = ["ALTA", "MÉDIA", "BAIXA", "NÃO INFORMADA"];
  const porCriticidade = [...critMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => {
      const ai = critOrdem.indexOf(a.name);
      const bi = critOrdem.indexOf(b.name);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
    });

  // Solicitante
  const solMap = new Map<string, { total: number; abertos: number }>();
  for (const r of rows) {
    const k = r.solicitante || "NÃO INFORMADO";
    const cur = solMap.get(k) ?? { total: 0, abertos: 0 };
    cur.total++;
    if (r.statusNorm !== "concluido") cur.abertos++;
    solMap.set(k, cur);
  }
  const porSolicitante = [...solMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  // Prédio
  const predMap = new Map<string, number>();
  for (const r of rows) {
    const k = r.predio || "—";
    predMap.set(k, (predMap.get(k) ?? 0) + 1);
  }
  const porPredio = [...predMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Status
  const stMap = new Map<string, number>();
  for (const r of rows) stMap.set(r.status || "—", (stMap.get(r.status || "—") ?? 0) + 1);
  const porStatus = [...stMap.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Timeline por dia de abertura (últimos 30 dias observados)
  const tlMap = new Map<string, number>();
  for (const r of rows) {
    if (!r.dataAberturaTs) continue;
    const d = new Date(r.dataAberturaTs);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    tlMap.set(key, (tlMap.get(key) ?? 0) + 1);
  }
  const timeline = [...tlMap.entries()]
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Insights
  const insights: Insight[] = [];

  if (total === 0) {
    insights.push({
      tipo: "info",
      titulo: "Nenhum chamado encontrado",
      descricao: "A planilha foi lida, mas nenhuma linha válida foi identificada.",
    });
  } else {
    insights.push({
      tipo: "info",
      titulo: `${total} chamados carregados`,
      descricao: `${concluidos} concluídos (${taxaConclusao}%), ${abertos + andamento} em aberto.`,
      metrica: total,
    });

    if (vencidos > 0) {
      insights.push({
        tipo: "critico",
        titulo: `${vencidos} chamados com SLA vencido`,
        descricao: "Priorize o atendimento — a data-limite já passou e a OS ainda não foi concluída.",
        metrica: vencidos,
      });
    }
    if (vencendo48h > 0) {
      insights.push({
        tipo: "atencao",
        titulo: `${vencendo48h} SLA vencendo em até 48h`,
        descricao: "Chamados próximos do vencimento — antecipe a alocação.",
        metrica: vencendo48h,
      });
    }
    if (taxaConclusao >= 85) {
      insights.push({
        tipo: "sucesso",
        titulo: "Alta taxa de conclusão",
        descricao: `${taxaConclusao}% dos chamados já foram encerrados.`,
        metrica: `${taxaConclusao}%`,
      });
    } else if (taxaConclusao < 40 && total > 20) {
      insights.push({
        tipo: "atencao",
        titulo: "Baixa taxa de conclusão",
        descricao: `Apenas ${taxaConclusao}% dos chamados estão encerrados. Reveja gargalos.`,
        metrica: `${taxaConclusao}%`,
      });
    }

    // Equipe sobrecarregada
    if (porEquipe.length > 0) {
      const top = porEquipe[0];
      const share = pctSafe(top.total, total);
      if (share >= 35) {
        insights.push({
          tipo: "atencao",
          titulo: `Equipe "${top.name}" concentra ${share}% dos chamados`,
          descricao: `Total ${top.total} chamados (${top.abertos} em aberto). Considere reforço ou redistribuição.`,
          metrica: top.total,
        });
      }
    }

    // Solicitante recorrente
    if (porSolicitante.length > 0) {
      const topSol = porSolicitante[0];
      const share = pctSafe(topSol.total, total);
      if (share >= 20) {
        insights.push({
          tipo: "atencao",
          titulo: `"${topSol.name}" é o solicitante dominante`,
          descricao: `Abriu ${topSol.total} chamados (${share}% do total, ${topSol.abertos} em aberto).`,
          metrica: topSol.total,
        });
      }
    }

    // Prédio crítico
    if (porPredio.length > 0) {
      const topPred = porPredio[0];
      const share = pctSafe(topPred.value, total);
      if (share >= 25 && topPred.name !== "—") {
        insights.push({
          tipo: "info",
          titulo: `Prédio "${topPred.name}" concentra ${share}% dos chamados`,
          descricao: `${topPred.value} ocorrências — inspecione causas recorrentes no local.`,
          metrica: topPred.value,
        });
      }
    }

    // Criticidade alta
    const alta = critMap.get("ALTA") ?? 0;
    if (alta > 0) {
      const shareAlta = pctSafe(alta, total);
      insights.push({
        tipo: shareAlta >= 25 ? "critico" : "atencao",
        titulo: `${alta} chamados de criticidade ALTA`,
        descricao: `Representam ${shareAlta}% da base. Garanta priorização diária.`,
        metrica: alta,
      });
    }
  }

  return {
    total,
    abertos,
    andamento,
    concluidos,
    vencidos,
    vencendo48h,
    taxaConclusao,
    porEquipe,
    porCategoria,
    porCriticidade,
    porSolicitante,
    porPredio,
    porStatus,
    timeline,
    insights,
  };
}

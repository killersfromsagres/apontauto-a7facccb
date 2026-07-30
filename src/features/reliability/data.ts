import { supabase } from "@/integrations/supabase/client";
import { toCanonicalStatus } from "@/modules/work-orders";

export type FailureRecord = {
  id: string;
  modalidade: "corretiva" | "refrigeracao";
  numeroOs: string;
  titulo: string;
  ativo: string;
  equipamento: string;
  equipe: string;
  predio: string;
  criadoEm: string;
  inicio: string | null;
  fim: string | null;
  concluida: boolean;
};

export type AssetCriticality = {
  id: string;
  asset_code: string;
  asset_name: string | null;
  classe_abc: "A" | "B" | "C";
  impacto_seguranca: number;
  impacto_operacional: number;
  impacto_ambiental: number;
  redundancia: boolean;
  custo_parada_hora: number | null;
  lead_time_dias: number | null;
  proxima_preventiva: string | null;
  observacao: string | null;
};

export type RcaAnalysis = {
  id: string;
  titulo: string;
  asset_code: string | null;
  asset_name: string | null;
  modalidade: string | null;
  numero_os: string | null;
  modo_falha: string | null;
  ocorrencias: number;
  porques: string[];
  ishikawa: Record<string, string>;
  causa_raiz: string | null;
  status: string;
  eficacia_validada: boolean;
  eficacia_observacao: string | null;
  created_at: string;
};

export type RcaAction = {
  id: string;
  analysis_id: string;
  acao: string;
  responsavel: string | null;
  prazo: string | null;
  status: string;
  evidencia_url: string | null;
  eficaz: boolean | null;
  observacao: string | null;
};

export const ISHIKAWA_KEYS = [
  "metodo",
  "maquina",
  "mao_de_obra",
  "material",
  "medicao",
  "meio_ambiente",
] as const;

export const ISHIKAWA_LABEL: Record<string, string> = {
  metodo: "Método",
  maquina: "Máquina",
  mao_de_obra: "Mão de obra",
  material: "Material",
  medicao: "Medição",
  meio_ambiente: "Meio ambiente",
};

export async function fetchFailures(): Promise<FailureRecord[]> {
  const cols = "id,numero_os,nome_os,ativo,equipamento,equipe,predio,status,created_at,inicio,fim";
  const [cor, ref] = await Promise.all([
    supabase
      .from("corretiva_os")
      .select(cols)
      .order("created_at", { ascending: false })
      .limit(4000),
    supabase
      .from("refrigeracao_os")
      .select(cols)
      .order("created_at", { ascending: false })
      .limit(4000),
  ]);
  if (cor.error) throw cor.error;
  if (ref.error) throw ref.error;
  const map = (rows: Record<string, unknown>[], modalidade: FailureRecord["modalidade"]) =>
    rows.map((r) => ({
      id: String(r.id),
      modalidade,
      numeroOs: String(r.numero_os ?? ""),
      titulo: String(r.nome_os ?? ""),
      ativo: String(r.ativo ?? "").trim(),
      equipamento: String(r.equipamento ?? "").trim(),
      equipe: String(r.equipe ?? "").trim(),
      predio: String(r.predio ?? "").trim(),
      criadoEm: String(r.created_at ?? ""),
      inicio: (r.inicio as string) ?? null,
      fim: (r.fim as string) ?? null,
      concluida: toCanonicalStatus(r.status as string) === "concluida",
    })) satisfies FailureRecord[];
  return [
    ...map((cor.data ?? []) as Record<string, unknown>[], "corretiva"),
    ...map((ref.data ?? []) as Record<string, unknown>[], "refrigeracao"),
  ];
}

export type AssetReliability = {
  ativo: string;
  nome: string;
  falhas: number;
  reincidente: boolean;
  mtbfDias: number | null;
  mttrHoras: number | null;
  ultimaFalha: string | null;
  /** 0-100; `null` quando não há dados suficientes. */
  saude: number | null;
  tendencia: "melhorando" | "estavel" | "piorando" | "sem_dados";
  amostra: number;
};

const DAY = 86_400_000;

/** Agrega confiabilidade por ativo. Nunca inventa saúde sem amostra. */
export function aggregateByAsset(
  failures: FailureRecord[],
  criticality: AssetCriticality[],
): AssetReliability[] {
  const byAsset = new Map<string, FailureRecord[]>();
  for (const f of failures) {
    const key = f.ativo || f.equipamento;
    if (!key) continue;
    const arr = byAsset.get(key) ?? [];
    arr.push(f);
    byAsset.set(key, arr);
  }
  const critMap = new Map(criticality.map((c) => [c.asset_code.toUpperCase(), c]));
  const now = Date.now();

  return Array.from(byAsset.entries())
    .map(([ativo, list]) => {
      const ordered = [...list].sort(
        (a, b) => new Date(a.criadoEm).getTime() - new Date(b.criadoEm).getTime(),
      );
      const times = ordered.map((f) => new Date(f.criadoEm).getTime()).filter(Number.isFinite);
      let mtbfDias: number | null = null;
      if (times.length >= 2) {
        const gaps: number[] = [];
        for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
        mtbfDias = gaps.reduce((s, g) => s + g, 0) / gaps.length / DAY;
      }
      const reparos = ordered
        .filter((f) => f.inicio && f.fim)
        .map((f) => new Date(f.fim!).getTime() - new Date(f.inicio!).getTime())
        .filter((v) => v > 0);
      const mttrHoras = reparos.length
        ? reparos.reduce((s, v) => s + v, 0) / reparos.length / 3_600_000
        : null;

      const ultima = times.length ? new Date(times[times.length - 1]).toISOString() : null;
      const crit = critMap.get(ativo.toUpperCase());

      // Saúde só é calculada com amostra mínima (>= 2 eventos ou criticidade cadastrada).
      let saude: number | null = null;
      if (times.length >= 2 || crit) {
        let score = 100;
        score -= Math.min(40, list.length * 6);
        if (mtbfDias != null) score -= Math.max(0, Math.min(25, (60 - mtbfDias) / 2));
        if (mttrHoras != null) score -= Math.min(15, mttrHoras);
        if (crit) {
          score -= (crit.impacto_seguranca + crit.impacto_operacional + crit.impacto_ambiental) * 2;
          if (crit.redundancia) score += 6;
          if (crit.classe_abc === "A") score -= 5;
        }
        const dias = ultima ? (now - new Date(ultima).getTime()) / DAY : 0;
        score += Math.min(10, dias / 15);
        saude = Math.max(0, Math.min(100, Math.round(score)));
      }

      let tendencia: AssetReliability["tendencia"] = "sem_dados";
      if (times.length >= 4) {
        const meio = Math.floor(times.length / 2);
        const gap = (arr: number[]) =>
          arr.length < 2 ? Infinity : (arr[arr.length - 1] - arr[0]) / (arr.length - 1);
        const antes = gap(times.slice(0, meio));
        const depois = gap(times.slice(meio));
        const delta = (depois - antes) / Math.max(antes, 1);
        tendencia = delta > 0.15 ? "melhorando" : delta < -0.15 ? "piorando" : "estavel";
      }

      return {
        ativo,
        nome: ordered[ordered.length - 1]?.equipamento || ativo,
        falhas: list.length,
        reincidente: list.length >= 3,
        mtbfDias,
        mttrHoras,
        ultimaFalha: ultima,
        saude,
        tendencia,
        amostra: list.length,
      } satisfies AssetReliability;
    })
    .sort((a, b) => b.falhas - a.falhas);
}

/** Pareto 80/20 sobre uma contagem. */
export function pareto(items: { label: string; value: number }[]) {
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const total = sorted.reduce((s, i) => s + i.value, 0) || 1;
  let acc = 0;
  return sorted.map((i) => {
    acc += i.value;
    return { ...i, acumulado: Math.round((acc / total) * 100) };
  });
}

export async function fetchCriticality(): Promise<AssetCriticality[]> {
  const { data, error } = await supabase.from("asset_criticality").select("*").order("asset_code");
  if (error) throw error;
  return (data ?? []) as AssetCriticality[];
}

export async function fetchAnalyses(): Promise<RcaAnalysis[]> {
  const { data, error } = await supabase
    .from("rca_analyses")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    ...(r as unknown as RcaAnalysis),
    porques: Array.isArray(r.porques) ? (r.porques as string[]) : [],
    ishikawa: (r.ishikawa ?? {}) as Record<string, string>,
  }));
}

export async function fetchActions(): Promise<RcaAction[]> {
  const { data, error } = await supabase
    .from("rca_actions")
    .select("*")
    .order("prazo", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RcaAction[];
}

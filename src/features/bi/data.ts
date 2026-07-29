/**
 * BI Studio — carregamento e agregação de dados.
 * Lê as views `vw_bi_*` (e algumas tabelas) com a RLS do próprio usuário.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";
import {
  DATASETS,
  type DatasetKey,
  type Datasets,
  type Row,
  type WidgetSpec,
} from "./catalog";

export type GlobalFilters = {
  /** Dias do período (0 = tudo). */
  periodDays: number;
  equipe: string;
  predio: string;
  modalidade: string;
  veiculo: string;
};

export const DEFAULT_FILTERS: GlobalFilters = {
  periodDays: 90,
  equipe: "",
  predio: "",
  modalidade: "",
  veiculo: "",
};

export const PERIODS = [
  { key: 7, label: "7 dias" },
  { key: 30, label: "30 dias" },
  { key: 90, label: "90 dias" },
  { key: 180, label: "6 meses" },
  { key: 365, label: "12 meses" },
  { key: 0, label: "Tudo" },
];

/** Cliente sem tipagem de schema: as views de BI não estão em `types.ts`. */
export const db = supabase as unknown as SupabaseClient;

const MAX_ROWS = 5000;

export async function loadDataset(key: DatasetKey, periodDays: number): Promise<Row[]> {
  const def = DATASETS[key];
  let query = db
    .from(def.source)
    .select("*")
    .order(def.dateField, { ascending: false })
    .limit(MAX_ROWS);

  if (periodDays > 0) {
    const since = new Date(Date.now() - periodDays * 86_400_000).toISOString();
    query = query.gte(def.dateField, since);
  }

  const { data, error } = await query;
  if (error) throw new Error(`${def.label}: ${error.message}`);
  return (data ?? []) as unknown as Row[];
}

export async function loadDatasets(
  keys: DatasetKey[],
  periodDays: number,
): Promise<Datasets> {
  const unique = [...new Set(keys)];
  const results = await Promise.all(
    unique.map(async (key) => {
      try {
        return [key, await loadDataset(key, periodDays)] as const;
      } catch {
        return [key, [] as Row[]] as const;
      }
    }),
  );
  return Object.fromEntries(results) as Datasets;
}

/* ----------------------------- Filtragem ----------------------------- */

const eq = (a: unknown, b: string) =>
  String(a ?? "").trim().toLowerCase() === b.trim().toLowerCase();

export function applyFilters(dataset: DatasetKey, list: Row[], f: GlobalFilters): Row[] {
  const dims = new Set(DATASETS[dataset].dimensions.map((d) => d.key));
  return list.filter((r) => {
    if (f.equipe && dims.has("equipe") && !eq(r.equipe, f.equipe)) return false;
    if (f.predio && dims.has("predio") && !eq(r.predio, f.predio)) return false;
    if (f.modalidade && dims.has("modalidade") && !eq(r.modalidade, f.modalidade)) return false;
    if (f.veiculo && dims.has("veiculo") && !eq(r.veiculo, f.veiculo)) return false;
    return true;
  });
}

export function filteredDatasets(data: Datasets, f: GlobalFilters): Datasets {
  const out: Datasets = {};
  for (const [key, list] of Object.entries(data) as [DatasetKey, Row[]][]) {
    out[key] = applyFilters(key, list, f);
  }
  return out;
}

/** Valores distintos de uma dimensão em todos os datasets carregados. */
export function distinctValues(data: Datasets, field: string): string[] {
  const set = new Set<string>();
  for (const list of Object.values(data)) {
    for (const r of list ?? []) {
      const v = String((r as Row)[field] ?? "").trim();
      if (v) set.add(v);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, 60);
}

/* ----------------------------- Agregação ----------------------------- */

const toNum = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

function bucketLabel(iso: unknown, bucket: "day" | "week" | "month") {
  const d = new Date(String(iso ?? ""));
  if (Number.isNaN(d.getTime())) return "—";
  if (bucket === "month") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  if (bucket === "week") {
    const first = new Date(d);
    first.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return first.toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

export type Point = { label: string; value: number } & Record<string, unknown>;

function aggregate(list: Row[], agg: string, field?: string) {
  if (agg === "count") return list.length;
  if (agg === "distinct") return new Set(list.map((r) => String(r[field ?? "id"] ?? ""))).size;
  const nums = list.map((r) => toNum(r[field ?? ""]));
  if (!nums.length) return 0;
  if (agg === "sum") return nums.reduce((a, b) => a + b, 0);
  if (agg === "max") return Math.max(...nums);
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Série simples (label/value) para bar, line, area, donut e pareto. */
export function buildSeries(widget: WidgetSpec, list: Row[]): Point[] {
  const def = DATASETS[widget.dataset];
  const groups = new Map<string, Row[]>();

  for (const r of list) {
    let key: string;
    if (widget.bucket) key = bucketLabel(r[def.dateField], widget.bucket);
    else key = String(r[widget.dimension ?? def.dimensions[0]?.key ?? "id"] ?? "—").trim() || "—";
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  let points: Point[] = [...groups.entries()].map(([label, group]) => ({
    label,
    value: Number(aggregate(group, widget.aggregation ?? "count", widget.field).toFixed(2)),
  }));

  if (widget.bucket) {
    points.sort((a, b) => a.label.localeCompare(b.label));
  } else {
    points.sort((a, b) => b.value - a.value);
    if (widget.chart !== "pareto") points = points.slice(0, 14);
  }

  if (widget.chart === "pareto") {
    points = points.slice(0, 12);
    const total = points.reduce((a, p) => a + p.value, 0) || 1;
    let acc = 0;
    points = points.map((p) => {
      acc += p.value;
      return { ...p, acumulado: Number(((acc / total) * 100).toFixed(1)) };
    });
  }

  return points;
}

/** Série com duas dimensões (barras empilhadas / heatmap). */
export function buildMatrix(widget: WidgetSpec, list: Row[]) {
  const dim = widget.dimension ?? "equipe";
  const ser = widget.series ?? "status";
  const seriesKeys = new Set<string>();
  const map = new Map<string, Record<string, number>>();

  for (const r of list) {
    const a = String(r[dim] ?? "—").trim() || "—";
    const b = String(r[ser] ?? "—").trim() || "—";
    seriesKeys.add(b);
    const bucket = map.get(a) ?? {};
    bucket[b] = (bucket[b] ?? 0) + (widget.field ? toNum(r[widget.field]) : 1);
    map.set(a, bucket);
  }

  const keys = [...seriesKeys].sort().slice(0, 10);
  const data = [...map.entries()]
    .map(([label, values]) => {
      const row: Record<string, unknown> = { label };
      let total = 0;
      for (const k of keys) {
        row[k] = values[k] ?? 0;
        total += values[k] ?? 0;
      }
      row.__total = total;
      return row;
    })
    .sort((a, b) => Number(b.__total) - Number(a.__total))
    .slice(0, 14);

  return { keys, data };
}

/** Linhas de tabela analítica (colunas relevantes do dataset). */
export function tableColumns(dataset: DatasetKey): string[] {
  const def = DATASETS[dataset];
  return [
    ...def.dimensions.map((d) => d.key),
    ...(def.measures ?? []).map((m) => m.key),
    def.dateField,
  ].slice(0, 8);
}

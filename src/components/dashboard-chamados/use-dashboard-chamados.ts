import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { ChamadoRow } from "@/lib/dashboard-chamados/parser";
import { computeDashboardStats } from "@/lib/dashboard-chamados/insights";
import {
  fetchBackorderRows,
  setBackorderConcluido,
  setBackorderReaberto,
  subscribeBackorderTable,
} from "@/lib/dashboard-chamados/backorder-sync";

export type Filters = {
  equipe: string;
  categoria: string;
  criticidade: string;
  status: string;
  solicitante: string;
  predio: string;
  periodo: string;
};

export const EMPTY_FILTERS: Filters = {
  equipe: "todas",
  categoria: "todas",
  criticidade: "todas",
  status: "todos",
  solicitante: "todos",
  predio: "todos",
  periodo: "todos",
};

/**
 * Estado do Dashboard de Chamados: carga, realtime, filtros e ações de OS.
 * A view apenas consome — nada de fetch dentro de componentes de apresentação.
 */
export function useDashboardChamados() {
  const [rows, setRows] = useState<ChamadoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [pendingOs, setPendingOs] = useState<Set<string>>(new Set());
  const debounceRef = useRef<number | null>(null);

  const loadRows = useCallback(async (silent = false) => {
    if (!silent) setRefreshing(true);
    try {
      const data = await fetchBackorderRows();
      setRows(data);
      setError(null);
      setLastUpdate(Date.now());
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao carregar backorders";
      console.error("[dashboard] fetchBackorderRows", err);
      setError(message);
      if (!silent) toast.error(message);
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRows(true);
  }, [loadRows]);

  // Realtime: agrupa rajadas de eventos (imports em massa) com debounce.
  useEffect(() => {
    const unsub = subscribeBackorderTable(() => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        void loadRows(true);
      }, 350);
    });
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      unsub();
    };
  }, [loadRows]);

  const uniques = useMemo(() => {
    const eq = new Set<string>();
    const ca = new Set<string>();
    const cr = new Set<string>();
    const st = new Set<string>();
    const so = new Set<string>();
    const pr = new Set<string>();
    for (const r of rows) {
      if (r.equipe) eq.add(r.equipe);
      if (r.categoria) ca.add(r.categoria);
      if (r.criticidade) cr.add(r.criticidade);
      if (r.status) st.add(r.status);
      if (r.solicitante) so.add(r.solicitante);
      if (r.predio) pr.add(r.predio);
    }
    return {
      equipes: [...eq].sort(),
      categorias: [...ca].sort(),
      criticidades: [...cr].sort(),
      statuses: [...st].sort(),
      solicitantes: [...so].sort(),
      predios: [...pr].sort(),
    };
  }, [rows]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const periodoMs = filters.periodo === "todos" ? 0 : Number(filters.periodo) * 86_400_000;
    return rows.filter((r) => {
      if (filters.equipe !== "todas" && r.equipe !== filters.equipe) return false;
      if (filters.categoria !== "todas" && r.categoria !== filters.categoria) return false;
      if (filters.criticidade !== "todas" && r.criticidade !== filters.criticidade) return false;
      if (filters.status !== "todos" && r.status !== filters.status) return false;
      if (filters.solicitante !== "todos" && r.solicitante !== filters.solicitante) return false;
      if (filters.predio !== "todos" && r.predio !== filters.predio) return false;
      if (periodoMs > 0) {
        if (!r.dataAberturaTs) return false;
        if (now - r.dataAberturaTs > periodoMs) return false;
      }
      return true;
    });
  }, [rows, filters]);

  const stats = useMemo(() => computeDashboardStats(filtered), [filtered]);

  const topPredios = useMemo(
    () => [...stats.porPredio].sort((a, b) => b.value - a.value).slice(0, 10),
    [stats.porPredio],
  );

  const activeFilterCount = useMemo(
    () =>
      Object.entries(filters).filter(
        ([key, value]) => value !== EMPTY_FILTERS[key as keyof Filters],
      ).length,
    [filters],
  );

  const toggleConcluido = useCallback(
    async (row: ChamadoRow, next: boolean) => {
      setPendingOs((prev) => new Set(prev).add(row.os));
      // Atualização otimista — o realtime completa o restante em seguida.
      setRows((prev) =>
        prev.map((r) =>
          r.os === row.os
            ? {
                ...r,
                statusNorm: next ? "concluido" : "aberto",
                status: next ? "Concluído" : "Reaberto",
                dataConclusao: next ? new Date().toISOString() : null,
              }
            : r,
        ),
      );
      try {
        if (next) await setBackorderConcluido(row);
        else await setBackorderReaberto(row.os);
        toast.success(next ? `OS ${row.os} concluída` : `OS ${row.os} reaberta`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao sincronizar com backorder");
        void loadRows(true);
      } finally {
        setPendingOs((prev) => {
          const s = new Set(prev);
          s.delete(row.os);
          return s;
        });
      }
    },
    [loadRows],
  );

  return {
    rows,
    filtered,
    stats,
    topPredios,
    uniques,
    filters,
    setFilters,
    activeFilterCount,
    resetFilters: useCallback(() => setFilters(EMPTY_FILTERS), []),
    loading,
    refreshing,
    error,
    lastUpdate,
    reload: loadRows,
    pendingOs,
    toggleConcluido,
  };
}

export type DashboardChamadosState = ReturnType<typeof useDashboardChamados>;

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { subscribeBackorderTable } from "@/lib/dashboard-chamados/backorder-sync";
import {
  EMPTY_STATS,
  buildInsights,
  fetchDashboardFiltros,
  fetchDashboardStats,
  setOsFinalizado,
  type DashFiltros,
  type DashStats,
  type OsStatus,
  type ServerRow,
} from "@/lib/dashboard-chamados/server-stats";

export type Filters = {
  equipe: string;
  categoria: string;
  criticidade: string;
  status: string;
  solicitante: string;
  predio: string;
  periodo: string;
  ano: string;
};

export const EMPTY_FILTERS: Filters = {
  equipe: "todas",
  categoria: "todas",
  criticidade: "todas",
  status: "todos",
  solicitante: "todos",
  predio: "todos",
  periodo: "todos",
  ano: "todos",
};

const EMPTY_UNIQUES: DashFiltros = {
  equipes: [],
  categorias: [],
  criticidades: [],
  predios: [],
  solicitantes: [],
  anos: [],
};

const isAll = (v: string) => v === "todos" || v === "todas";

/**
 * Estado do Dashboard de Chamados.
 * Todos os agregados vêm prontos do servidor (RPC), então a base pode ter
 * centenas de milhares de OS sem travar o navegador.
 */
export function useDashboardChamados() {
  const [stats, setStats] = useState<DashStats>(EMPTY_STATS);
  const [uniques, setUniques] = useState<DashFiltros>(EMPTY_UNIQUES);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [pendingOs, setPendingOs] = useState<Set<string>>(new Set());
  const debounceRef = useRef<number | null>(null);
  const reqRef = useRef(0);

  const query = useMemo(
    () => ({
      equipe: isAll(filters.equipe) ? null : filters.equipe,
      categoria: isAll(filters.categoria) ? null : filters.categoria,
      criticidade: isAll(filters.criticidade) ? null : filters.criticidade,
      status: isAll(filters.status) ? null : (filters.status as OsStatus),
      solicitante: isAll(filters.solicitante) ? null : filters.solicitante,
      predio: isAll(filters.predio) ? null : filters.predio,
      ano: isAll(filters.ano) ? null : Number(filters.ano),
      dias: isAll(filters.periodo) ? null : Number(filters.periodo),
    }),
    [filters],
  );

  const load = useCallback(
    async (silent = false) => {
      const id = ++reqRef.current;
      if (!silent) setRefreshing(true);
      try {
        const data = await fetchDashboardStats(query);
        if (id !== reqRef.current) return;
        setStats(data);
        setError(null);
        setLastUpdate(Date.now());
      } catch (err) {
        if (id !== reqRef.current) return;
        const message = err instanceof Error ? err.message : "Falha ao carregar indicadores";
        console.error("[dashboard] backorder_dashboard_stats", err);
        setError(message);
        if (!silent) toast.error(message);
      } finally {
        if (id === reqRef.current) {
          setRefreshing(false);
          setLoading(false);
        }
      }
    },
    [query],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    fetchDashboardFiltros()
      .then(setUniques)
      .catch((err) => console.error("[dashboard] filtros", err));
  }, []);

  // Realtime com debounce — imports em massa geram rajadas de eventos.
  useEffect(() => {
    const unsub = subscribeBackorderTable(() => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => void load(true), 1200);
    });
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      unsub();
    };
  }, [load]);

  const insights = useMemo(() => buildInsights(stats), [stats]);

  const activeFilterCount = useMemo(
    () =>
      Object.entries(filters).filter(
        ([key, value]) => value !== EMPTY_FILTERS[key as keyof Filters],
      ).length,
    [filters],
  );

  const toggleConcluido = useCallback(
    async (row: ServerRow, next: boolean) => {
      setPendingOs((prev) => new Set(prev).add(row.os));
      setStats((prev) => ({
        ...prev,
        rows: prev.rows.map((r) =>
          r.os === row.os ? { ...r, status: next ? "concluido" : "aberto" } : r,
        ),
      }));
      try {
        await setOsFinalizado(row.os, next);
        toast.success(next ? `OS ${row.os} concluída` : `OS ${row.os} reaberta`);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Falha ao sincronizar com o Backorder");
        void load(true);
      } finally {
        setPendingOs((prev) => {
          const s = new Set(prev);
          s.delete(row.os);
          return s;
        });
      }
    },
    [load],
  );

  return {
    stats,
    insights,
    rows: stats.rows,
    uniques,
    filters,
    setFilters,
    activeFilterCount,
    resetFilters: useCallback(() => setFilters(EMPTY_FILTERS), []),
    loading,
    refreshing,
    error,
    lastUpdate,
    reload: load,
    pendingOs,
    toggleConcluido,
  };
}

export type DashboardChamadosState = ReturnType<typeof useDashboardChamados>;

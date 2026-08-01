import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { subscribeBackorderTable } from "@/lib/dashboard-chamados/backorder-sync";
import { fetchDashboardFiltros, type DashFiltros } from "@/lib/dashboard-chamados/server-stats";
import {
  EMPTY_V2,
  fetchDashboardV2,
  type V2Query,
  type V2Stats,
} from "@/lib/dashboard-chamados/stats-v2";
import type { StatusCat } from "@/lib/backorder/status";

const EMPTY_FILTROS: DashFiltros = {
  equipes: [],
  categorias: [],
  criticidades: [],
  predios: [],
  solicitantes: [],
  anos: [],
};

export interface V2Filters {
  ano: string;
  equipe: string;
  statusCat: string;
  predio: string;
}

export function useDashboardV2() {
  const anoAtual = new Date().getFullYear();
  const [filters, setFilters] = useState<V2Filters>({
    ano: String(anoAtual),
    equipe: "todas",
    statusCat: "todos",
    predio: "todos",
  });
  const [stats, setStats] = useState<V2Stats>(EMPTY_V2);
  const [uniques, setUniques] = useState<DashFiltros>(EMPTY_FILTROS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const reqRef = useRef(0);
  const debounceRef = useRef<number | null>(null);

  const query = useMemo<V2Query>(
    () => ({
      ano: filters.ano === "todos" ? null : Number(filters.ano),
      equipe: filters.equipe === "todas" ? null : filters.equipe,
      statusCat: filters.statusCat === "todos" ? null : (filters.statusCat as StatusCat),
      predio: filters.predio === "todos" ? null : filters.predio,
      rowLimit: 1000,
    }),
    [filters],
  );

  const load = useCallback(
    async (silent = false) => {
      const id = ++reqRef.current;
      if (!silent) setRefreshing(true);
      try {
        const data = await fetchDashboardV2(query);
        if (id !== reqRef.current) return;
        setStats(data);
        setError(null);
        setLastUpdate(Date.now());
      } catch (err) {
        if (id !== reqRef.current) return;
        const message = err instanceof Error ? err.message : "Falha ao carregar indicadores";
        console.error("[dashboard-v2]", err);
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
      .catch((err) => console.error("[dashboard-v2] filtros", err));
  }, []);

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

  const anos = useMemo(() => {
    const set = new Set<number>(uniques.anos);
    set.add(anoAtual);
    return Array.from(set).sort((a, b) => b - a);
  }, [uniques.anos, anoAtual]);

  return {
    stats,
    uniques,
    anos,
    anoAtual,
    filters,
    setFilters,
    loading,
    refreshing,
    error,
    lastUpdate,
    reload: load,
  };
}

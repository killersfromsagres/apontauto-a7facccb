// Suporte offline da execução em campo (Rota do Dia).
//
// Estratégia simples e previsível para uso mobile:
// - a rota do dia é espelhada em localStorage assim que chega da rede;
// - execuções feitas sem internet entram numa fila e são aplicadas na ordem;
// - o envio é tentado ao voltar a conexão, a cada 30s e ao abrir a tela.

import { useCallback, useEffect, useState } from "react";
import { registrarVisita, type Visita } from "@/lib/agua/api";

const CACHE_PREFIX = "agua:rota:";
const FILA_KEY = "agua:fila";

export type VisitaPatch = Partial<Visita> & Record<string, unknown>;

export interface PendenteAgua {
  id: string;
  data: string;
  visitaId: string;
  patch: VisitaPatch;
  criadoEm: number;
}

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function salvarCacheRota(data: string, visitas: Visita[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(`${CACHE_PREFIX}${data}`, JSON.stringify(visitas));
  } catch {
    /* cota cheia — cache é best-effort */
  }
}

export function lerCacheRota(data: string): Visita[] | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(`${CACHE_PREFIX}${data}`);
  return raw ? safeParse<Visita[]>(raw, []) : null;
}

export function lerFila(): PendenteAgua[] {
  if (typeof window === "undefined") return [];
  return safeParse<PendenteAgua[]>(localStorage.getItem(FILA_KEY), []);
}

function gravarFila(fila: PendenteAgua[]): void {
  localStorage.setItem(FILA_KEY, JSON.stringify(fila));
}

/** Enfileira a execução e já aplica o patch no cache local (otimista). */
export function enfileirar(data: string, visitaId: string, patch: VisitaPatch): void {
  const item: PendenteAgua = {
    id: `${visitaId}-${Date.now()}`,
    data,
    visitaId,
    patch,
    criadoEm: Date.now(),
  };
  gravarFila([...lerFila(), item]);

  const cache = lerCacheRota(data);
  if (cache) {
    salvarCacheRota(
      data,
      cache.map((v) => (v.id === visitaId ? { ...v, ...patch } : v)),
    );
  }
  window.dispatchEvent(new Event("agua:fila"));
}

/** Aplica os patches pendentes preservando a ordem; para no primeiro erro de rede. */
export async function sincronizarFila(): Promise<{ enviados: number; restantes: number }> {
  let fila = lerFila();
  let enviados = 0;
  while (fila.length) {
    const [primeiro, ...resto] = fila;
    try {
      await registrarVisita(primeiro.visitaId, primeiro.patch);
    } catch {
      break;
    }
    fila = resto;
    gravarFila(fila);
    enviados += 1;
  }
  window.dispatchEvent(new Event("agua:fila"));
  return { enviados, restantes: fila.length };
}

/** Estado de sincronização para a UI (contador de pendências + online). */
export function useAguaSync() {
  const [pendentes, setPendentes] = useState(0);
  const [online, setOnline] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  const atualizar = useCallback(() => setPendentes(lerFila().length), []);

  const sincronizar = useCallback(async () => {
    if (!navigator.onLine || lerFila().length === 0) return;
    setSincronizando(true);
    try {
      await sincronizarFila();
    } finally {
      setSincronizando(false);
      setPendentes(lerFila().length);
    }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    atualizar();
    void sincronizar();

    const onOnline = () => {
      setOnline(true);
      void sincronizar();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("agua:fila", atualizar);
    const timer = window.setInterval(() => void sincronizar(), 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("agua:fila", atualizar);
      window.clearInterval(timer);
    };
  }, [atualizar, sincronizar]);

  return { pendentes, online, sincronizando, sincronizar };
}

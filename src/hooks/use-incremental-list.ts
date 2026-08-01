import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Renderiza listas grandes em janelas incrementais.
 *
 * Em vez de montar milhares de nós no DOM (custo alto de CPU/memória e travamento
 * em celulares), monta apenas `step` itens e cresce automaticamente quando o
 * usuário chega ao fim da lista (IntersectionObserver — sem listener de scroll).
 */
export function useIncrementalList<T>(items: T[], step = 60) {
  const [limit, setLimit] = useState(step);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  // Toda vez que a fonte muda (filtro, busca, novo carregamento) a janela reinicia.
  useEffect(() => {
    setLimit(step);
  }, [items, step]);

  const visible = useMemo(() => items.slice(0, limit), [items, limit]);
  const hasMore = limit < items.length;

  const loadMore = useCallback(
    () => setLimit((l) => Math.min(l + step, items.length)),
    [step, items.length],
  );

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "300px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loadMore]);

  return { visible, hasMore, loadMore, sentinelRef, total: items.length, shown: visible.length };
}

/**
 * Histórico puro (undo/redo) da edição de polígonos de talude.
 * Mantido fora do componente para permitir teste unitário determinístico.
 */

export type Point = { x: number; y: number };

export type HistoryEntry = { id: string; points: Point[] };

export const HISTORY_LIMIT = 50;

/** Empilha o estado anterior e descarta a pilha de refazer. */
export function pushEntry(stack: HistoryEntry[], entry: HistoryEntry): HistoryEntry[] {
  return [...stack.slice(-(HISTORY_LIMIT - 1)), entry];
}

export type StepResult = {
  /** Nova pilha de origem (sem o item consumido). */
  from: HistoryEntry[];
  /** Nova pilha oposta (com o estado atual empilhado). */
  to: HistoryEntry[];
  /** Entrada que deve ser aplicada à geometria, se houver. */
  applied: HistoryEntry | null;
};

/**
 * Consome o topo de `from`, empilha o estado atual em `to` e devolve a
 * geometria a ser aplicada. Serve tanto para desfazer quanto para refazer.
 */
export function stepHistory(
  from: HistoryEntry[],
  to: HistoryEntry[],
  currentPointsOf: (id: string) => Point[],
): StepResult {
  const last = from[from.length - 1];
  if (!last) return { from, to, applied: null };
  return {
    from: from.slice(0, -1),
    to: pushEntry(to, { id: last.id, points: currentPointsOf(last.id) }),
    applied: last,
  };
}

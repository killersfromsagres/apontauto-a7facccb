import { describe, expect, it } from "vitest";

import { HISTORY_LIMIT, pushEntry, stepHistory, type HistoryEntry } from "@/lib/taludes/history";

const A = [{ x: 0, y: 0 }];
const B = [{ x: 1, y: 1 }];
const C = [{ x: 2, y: 2 }];

describe("undo/redo do polígono", () => {
  it("empilha estados anteriores", () => {
    const stack = pushEntry(pushEntry([], { id: "p", points: A }), { id: "p", points: B });
    expect(stack).toHaveLength(2);
    expect(stack[1].points).toEqual(B);
  });

  it("limita o histórico", () => {
    let stack: HistoryEntry[] = [];
    for (let i = 0; i < HISTORY_LIMIT + 20; i += 1) {
      stack = pushEntry(stack, { id: "p", points: [{ x: i, y: i }] });
    }
    expect(stack).toHaveLength(HISTORY_LIMIT);
    expect(stack[stack.length - 1].points[0].x).toBe(HISTORY_LIMIT + 19);
  });

  it("desfazer aplica o estado anterior e alimenta o refazer", () => {
    const undoStack = pushEntry([], { id: "p", points: A });
    const res = stepHistory(undoStack, [], () => B);
    expect(res.applied?.points).toEqual(A);
    expect(res.from).toHaveLength(0);
    expect(res.to[0].points).toEqual(B);
  });

  it("refazer devolve o estado desfeito", () => {
    const undone = stepHistory(pushEntry([], { id: "p", points: A }), [], () => B);
    const redone = stepHistory(undone.to, undone.from, () => A);
    expect(redone.applied?.points).toEqual(B);
    expect(redone.to[0].points).toEqual(A);
  });

  it("pilha vazia é no-op", () => {
    const res = stepHistory([], [{ id: "p", points: C }], () => A);
    expect(res.applied).toBeNull();
    expect(res.from).toEqual([]);
    expect(res.to).toHaveLength(1);
  });

  it("mantém o histórico por polígono identificado", () => {
    const stack = pushEntry(pushEntry([], { id: "a", points: A }), { id: "b", points: B });
    const res = stepHistory(stack, [], (id) => (id === "b" ? C : A));
    expect(res.applied?.id).toBe("b");
    expect(res.to[0]).toEqual({ id: "b", points: C });
  });
});

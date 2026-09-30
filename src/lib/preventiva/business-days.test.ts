import { describe, expect, it } from "vitest";

import { previousBusinessDay } from "./business-days";

describe("previousBusinessDay", () => {
  it("usa a véspera quando ela é dia útil", () => {
    const deadline = previousBusinessDay(new Date(2026, 9, 2));
    expect(deadline.getFullYear()).toBe(2026);
    expect(deadline.getMonth()).toBe(9);
    expect(deadline.getDate()).toBe(1);
  });

  it("recua para sexta quando o SLA cai na segunda", () => {
    const deadline = previousBusinessDay(new Date(2026, 9, 5));
    expect(deadline.getFullYear()).toBe(2026);
    expect(deadline.getMonth()).toBe(9);
    expect(deadline.getDate()).toBe(2);
  });
});

import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR,
  dedupeTasks,
  durationForCategory,
  isWorkingDay,
  overlaps,
  scheduleBatch,
  scheduleTask,
} from "../scheduling";

const d = (iso: string) => new Date(iso);

describe("scheduling", () => {
  it("respeita dias úteis", () => {
    expect(isWorkingDay(d("2026-07-27T09:00:00"))).toBe(true); // segunda
    expect(isWorkingDay(d("2026-07-25T09:00:00"))).toBe(false); // sábado
    expect(isWorkingDay(d("2026-07-26T09:00:00"))).toBe(false); // domingo
  });

  it("pula feriados", () => {
    const cal = { ...DEFAULT_CALENDAR, holidays: ["2026-07-27"] };
    const slot = scheduleTask(d("2026-07-27T08:00:00"), 30, cal);
    expect(slot.start.getDate()).toBe(28);
    expect(slot.start.getHours()).toBe(8);
  });

  it("inicia na jornada quando antes das 08:00", () => {
    const slot = scheduleTask(d("2026-07-27T06:00:00"), 30);
    expect(slot.start.getHours()).toBe(8);
    expect(slot.end.getHours()).toBe(8);
    expect(slot.end.getMinutes()).toBe(30);
  });

  it("empurra para o próximo dia útil quando não cabe na jornada", () => {
    const slot = scheduleTask(d("2026-07-31T16:45:00"), 60); // sexta
    expect(slot.start.getDate()).toBe(3); // segunda 03/08
    expect(slot.start.getHours()).toBe(8);
  });

  it("pula o intervalo de almoço", () => {
    const slot = scheduleTask(d("2026-07-27T11:45:00"), 60);
    expect(slot.start.getHours()).toBe(13);
  });

  it("duração padrão por categoria", () => {
    expect(durationForCategory("Chaveiro")).toBe(30);
    expect(durationForCategory("Elétrica")).toBe(30);
    expect(durationForCategory("Refrigeração")).toBe(60);
    expect(durationForCategory(undefined)).toBe(60);
  });

  it("agenda lote sem sobreposição", () => {
    const out = scheduleBatch(
      [
        { osNumber: "1", category: "Civil" },
        { osNumber: "2", category: "Civil" },
        { osNumber: "3", category: "Hidráulica" },
      ],
      d("2026-07-27T08:00:00"),
    );
    expect(out).toHaveLength(3);
    expect(overlaps(out[0], out[1])).toBe(false);
    expect(overlaps(out[1], out[2])).toBe(false);
    expect(out[0].end.getTime()).toBe(out[1].start.getTime());
  });

  it("remove OS duplicadas", () => {
    const { unique, duplicates } = dedupeTasks([
      { osNumber: "1540100" },
      { osNumber: " 1540100 " },
      { osNumber: "1540101" },
    ]);
    expect(unique.map((t) => t.osNumber)).toEqual(["1540100", "1540101"]);
    expect(duplicates).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import {
  assetPath,
  compareTickets,
  dueState,
  locationIndex,
  locationText,
  productivity,
  protocol,
  type DemAsset,
  type DemTicket,
} from "./domain";
const assets: DemAsset[] = [
  {
    id: "plant",
    code: "DEM000001",
    name: "Demarchi",
    kind: "planta",
    parent_id: null,
    enabled: true,
  },
  {
    id: "building",
    code: "DEM000002",
    name: "A160",
    kind: "predio",
    parent_id: "plant",
    enabled: true,
  },
  {
    id: "floor",
    code: "DEM000003",
    name: "Térreo",
    kind: "andar",
    parent_id: "building",
    enabled: true,
  },
  {
    id: "room",
    code: "DEM000004",
    name: "Recepção",
    kind: "ambiente",
    parent_id: "floor",
    enabled: true,
  },
];
const ticket = (overrides: Partial<DemTicket> = {}): DemTicket => ({
  id: "ticket",
  number: 1,
  title: "Lâmpada apagada",
  description: "Duas lâmpadas não acendem.",
  asset_id: "room",
  requester_id: "user",
  requester_name: "Solicitante",
  requester_email: "cliente@example.com",
  priority: "baixa",
  status: "aberto",
  created_at: "2026-11-01T12:00:00Z",
  deadline: "2026-12-01T12:00:00Z",
  scheduled_for: null,
  assigned_to: null,
  resolution: "",
  location_detail: "",
  preventive_plan_id: null,
  version: 1,
  ...overrides,
});
describe("Demarchi service desk", () => {
  it("preserves the physical location when temporary codes are renamed", () => {
    expect(locationText("room", assets)).toBe("A160 / Térreo / Recepção");
    expect(
      locationText(
        "room",
        assets.map((a) => ({ ...a, code: "CUSTOM-" + a.id })),
      ),
    ).toBe(locationText("room", assets));
    expect(locationIndex(assets).get("room")).toBe(locationText("room", assets));
  });
  it("does not loop on a malformed imported hierarchy", () => {
    const malformed = assets.map((a) => (a.id === "plant" ? { ...a, parent_id: "room" } : a));
    expect(assetPath("room", malformed)).toHaveLength(4);
  });
  it("orders pending requests by criticality then deadline, and closed requests last", () => {
    const list = [
      ticket({ id: "low" }),
      ticket({ id: "done", priority: "emergencial", status: "concluido" }),
      ticket({ id: "high", priority: "alta" }),
      ticket({ id: "emergency", priority: "emergencial" }),
    ];
    expect(list.sort(compareTickets).map((t) => t.id)).toEqual([
      "emergency",
      "high",
      "low",
      "done",
    ]);
  });
  it("distinguishes overdue, due within 24h, and closed requests", () => {
    const now = new Date("2026-12-01T12:00:01Z").getTime();
    expect(dueState(ticket(), now)).toBe("vencido");
    expect(dueState(ticket(), now - 1000)).toBe("vence_hoje");
    expect(dueState(ticket({ status: "cancelado" }), now)).toBe("encerrado");
  });
  it("counts one completed service per employee even with multiple time entries", () => {
    const people = [
      {
        id: "p",
        user_id: null,
        name: "Técnico",
        email: "",
        kind: "tecnico" as const,
        specialty: "Elétrica",
        active: true,
      },
    ];
    const logs = [
      {
        id: "1",
        ticket_id: "ticket",
        person_id: "p",
        minutes: 60,
        description: "Inspeção",
        performed_on: "2026-11-17",
      },
      {
        id: "2",
        ticket_id: "ticket",
        person_id: "p",
        minutes: 30,
        description: "Reparo",
        performed_on: "2026-11-17",
      },
    ];
    expect(productivity(people, logs, [ticket({ status: "concluido" })])[0]).toMatchObject({
      minutes: 90,
      completed: 1,
    });
  });
  it("creates legible sequential protocols", () => {
    expect(protocol(12)).toBe("DEM-OS-000012");
  });
});

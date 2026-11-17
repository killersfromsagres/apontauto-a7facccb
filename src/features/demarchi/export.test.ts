import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { exportTickets } from "./export";
import { downloadBlob } from "@/lib/download";
import type { DemTicket } from "./domain";
vi.mock("@/lib/download", () => ({ downloadBlob: vi.fn() }));
describe("queue spreadsheet export", () => {
  it("exports the actual selected request, typed hours, filters and Brasília dates", async () => {
    const ticket: DemTicket = {
      id: "t",
      number: 12,
      title: "Reparo da iluminação",
      description: "Lâmpada não acende.",
      asset_id: "room",
      requester_id: "u",
      requester_name: "Cliente",
      requester_email: "cliente@example.com",
      priority: "alta",
      status: "programado",
      created_at: "2026-11-17T15:30:00Z",
      deadline: "2026-11-24T15:30:00Z",
      scheduled_for: "2026-11-20",
      assigned_to: "person",
      resolution: "",
      location_detail: "Porta direita",
      preventive_plan_id: null,
      version: 1,
    };
    await exportTickets(
      [ticket],
      [
        {
          id: "room",
          code: "DEM000001",
          name: "Recepção",
          kind: "ambiente",
          parent_id: null,
          enabled: true,
        },
      ],
      [
        {
          id: "person",
          user_id: null,
          name: "Colaborador",
          email: "",
          kind: "tecnico",
          specialty: "",
          active: true,
        },
      ],
      [
        {
          id: "log",
          ticket_id: "t",
          person_id: "person",
          minutes: 90,
          description: "Reparo",
          performed_on: "2026-11-17",
        },
      ],
    );
    const [blob, filename] = vi.mocked(downloadBlob).mock.calls[0];
    expect(filename).toMatch(/^Demarchi_Chamados_.*\.xlsx$/);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet = workbook.getWorksheet("Chamados")!;
    expect(sheet.getCell("A6").value).toBe("DEM-OS-000012");
    expect(sheet.getCell("I6").value).toBe(7);
    expect(sheet.getCell("O6").value).toBe(1.5);
    expect((sheet.getCell("J6").value as Date).toISOString()).toBe("2026-11-17T12:30:00.000Z");
    expect((sheet.getCell("M6").value as Date).toISOString()).toBe("2026-11-20T00:00:00.000Z");
    expect(sheet.autoFilter).toBeTruthy();
    expect(sheet.views[0]).toMatchObject({ state: "frozen", ySplit: 5 });
  });
});

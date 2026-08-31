import { describe, expect, it } from "vitest";
import { buildComprasPremiumWorkbook, type MaterialCompraRow, type MaterialOsRow } from "./compras-premium-excel";

describe("buildComprasPremiumWorkbook", () => {
  it("serializa resumo e compras com origens diferentes", async () => {
    const items: MaterialCompraRow[] = [
      {
        created_at: "2026-08-31T12:00:00.000Z",
        origem: "corretiva",
        os_id: "os-1",
        descricao: "Lâmpada LED 18W",
        quantidade: 10,
      },
      {
        created_at: "2026-08-31T13:00:00.000Z",
        origem: "refrigeracao",
        os_id: "os-2",
        descricao: "Correia A32",
        quantidade: 4,
      },
    ];

    const osById = new Map<string, MaterialOsRow>([
      ["os-1", { numero_os: "223633", equipe: "Elétrica", predio: "Bloco A", andar: "1º", local: "Sala", solicitante: "Teste" }],
      ["os-2", { numero_os: "223634", equipe: "Refrigeração", predio: "Bloco B", andar: "Térreo", local: "Casa de máquinas", solicitante: "Teste" }],
    ]);

    const workbook = buildComprasPremiumWorkbook(items, osById);

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Resumo de Compras", "Compras"]);
    expect(workbook.getWorksheet("Compras")?.autoFilter).toBeDefined();

    const buffer = await workbook.xlsx.writeBuffer();
    expect(buffer.byteLength).toBeGreaterThan(4_000);
  });
});

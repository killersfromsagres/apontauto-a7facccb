import { describe, expect, it } from "vitest";

import type { BackorderBuilderRow } from "./backorder-spreadsheet-builder";
import {
  applyBackorderMaterialEvidence,
  buildBackorderOsLookupCandidates,
  normalizeBackorderOsKey,
} from "./backorder-material-enrichment";

function row(
  overrides: Partial<BackorderBuilderRow> = {},
): BackorderBuilderRow {
  return {
    id: "backorder-builder:test",
    builderId: "test-1",
    sourceRow: 2,
    sourceSheet: "Backorder",
    numero_os: "223633",
    nome_os: "Troca de componente",
    predio: "Prédio A",
    andar: "1",
    local: "Sala técnica",
    tipo: "BACKORDER",
    tipo_importacao: "backorder_planilha_rapida",
    equipe: "Elétrica",
    data_sla: null,
    data_programada: null,
    inicio: null,
    fim: null,
    ativo: "",
    equipamento: "",
    patrimonio: null,
    status: "aberta",
    updated_at: "2026-09-28T10:00:00.000Z",
    solicitante: null,
    data_criacao: null,
    material_status: null,
    pecas_solicitadas: null,
    confidence: "alta",
    ambiguous: false,
    score: 2,
    originalTeam: null,
    ...overrides,
  } as BackorderBuilderRow;
}

describe("backorder material enrichment", () => {
  it("normaliza números de OS vindos do Excel", () => {
    expect(normalizeBackorderOsKey("  OS-00223633.0 ")).toBe("223633");
    expect(normalizeBackorderOsKey("223633")).toBe("223633");

    expect(buildBackorderOsLookupCandidates("OS-223633.0")).toContain(
      "223633",
    );
  });

  it("recupera material solicitado dos campos consolidados da OS", () => {
    const result = applyBackorderMaterialEvidence(
      [row()],
      [
        {
          id: "os-id-1",
          numero_os: "223633",
          material_status: "solicitado",
          pecas_solicitadas: "Peça: Contator 32A",
        },
      ],
      [],
    );

    expect(result.recoveredCount).toBe(1);
    expect(result.enrichedCount).toBe(1);
    expect(result.rows[0].material_status).toBe("SOLICITADO");
    expect(result.rows[0].pecas_solicitadas).toContain("Contator 32A");
  });

  it("recupera solicitação diretamente de corretiva_pecas quando a OS não foi consolidada", () => {
    const result = applyBackorderMaterialEvidence(
      [row()],
      [
        {
          id: "os-id-1",
          numero_os: "223633",
          material_status: null,
          pecas_solicitadas: null,
        },
      ],
      [
        {
          os_id: "os-id-1",
          descricao: "Disjuntor 20A",
          modelo: "DIN",
          quantidade: 2,
          material_status: "solicitado",
        },
      ],
    );

    expect(result.recoveredCount).toBe(1);
    expect(result.rows[0].material_status).toBe("SOLICITADO");
    expect(result.rows[0].pecas_solicitadas).toContain("Disjuntor 20A");
    expect(result.rows[0].pecas_solicitadas).toContain("Qtd: 2");
  });

  it("preserva o material da planilha e acrescenta somente evidências ausentes", () => {
    const result = applyBackorderMaterialEvidence(
      [
        row({
          material_status: "solicitado",
          pecas_solicitadas: "Cabo PP 3x2,5mm",
        }),
      ],
      [
        {
          id: "os-id-1",
          numero_os: "223633",
          material_status: "solicitado",
          pecas_solicitadas: "Cabo PP 3x2,5mm\nPeça: Terminal elétrico",
        },
      ],
      [
        {
          os_id: "os-id-1",
          descricao: "Terminal elétrico",
          quantidade: 1,
          material_status: "solicitado",
        },
      ],
    );

    expect(result.recoveredCount).toBe(0);
    expect(result.rows[0].pecas_solicitadas).toBe(
      "Cabo PP 3x2,5mm\nPeça: Terminal elétrico",
    );
  });

  it("não marca material quando não existe evidência vinculada à OS", () => {
    const original = row();
    const result = applyBackorderMaterialEvidence(
      [original],
      [
        {
          id: "os-id-1",
          numero_os: "223633",
          material_status: null,
          pecas_solicitadas: null,
        },
      ],
      [],
    );

    expect(result.recoveredCount).toBe(0);
    expect(result.rows[0]).toEqual(original);
  });
});

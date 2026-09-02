import { describe, expect, it } from "vitest";
import type { CorretivaOsImport } from "@/lib/corretiva/reader";
import { resolveImportedCorrectiveTeam } from "@/lib/corretiva/preventiva-import";

function row(overrides: Partial<CorretivaOsImport> = {}): CorretivaOsImport {
  return {
    numero_os: "223700",
    nome_os: "Verificar solicitação",
    predio: "A100",
    andar: "Térreo",
    local: "Sala técnica",
    tipo: "Corretiva",
    equipe: null,
    data_sla: null,
    data_programada: null,
    inicio: null,
    fim: null,
    ativo: "—",
    equipamento: "—",
    solicitante: "Solicitante",
    data_criacao: null,
    ...overrides,
  };
}

describe("resolveImportedCorrectiveTeam", () => {
  it("corrige equipe Civil da planilha quando a OS é claramente elétrica", () => {
    expect(
      resolveImportedCorrectiveTeam(
        row({
          equipe: "Civil",
          nome_os: "Falha no quadro elétrico QGBT com disjuntor desarmando",
          equipamento: "QGBT-02",
        }),
      ),
    ).toBe("Elétrica");
  });

  it("corrige equipe Civil da planilha quando a OS é de Refrigeração", () => {
    expect(
      resolveImportedCorrectiveTeam(
        row({
          equipe: "Civil",
          nome_os: "Fancoil sem refrigeração e condensação excessiva",
          equipamento: "FAN COIL 04",
        }),
      ),
    ).toBe("Refrigeração");
  });

  it("corrige equipe Civil da planilha quando a OS é de Chaveiro", () => {
    expect(
      resolveImportedCorrectiveTeam(
        row({
          equipe: "Civil",
          nome_os: "Trocar fechadura e cilindro da porta travada",
        }),
      ),
    ).toBe("Chaveiro");
  });

  it("preserva a equipe reconhecida quando não existe evidência técnica", () => {
    expect(
      resolveImportedCorrectiveTeam(
        row({
          equipe: "Hidráulica",
          nome_os: "Verificar solicitação no local conforme chamado",
        }),
      ),
    ).toBe("Hidráulica");
  });
});

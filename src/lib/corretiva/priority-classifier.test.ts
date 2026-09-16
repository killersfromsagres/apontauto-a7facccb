import { describe, expect, it } from "vitest";
import { classifyPriority, isBackorderCorrective } from "./priority-classifier";

const reference = new Date(2026, 8, 15, 12);

describe("corrective priority classifier", () => {
  it("classifica curto, choque e fumaça como prioridade crítica", () => {
    const result = classifyPriority(
      {
        nome_os: "Quadro elétrico em curto com faísca e cheiro de queimado",
        local: "Painel principal",
        equipe: "Elétrica",
        data_criacao: "2026-09-15",
      },
      reference,
    );
    expect(result.level).toBe("CRÍTICA");
    expect(result.reasons.some((reason) => reason.includes("Risco elétrico"))).toBe(true);
  });

  it("eleva vazamento em banheiro para alta ou crítica", () => {
    const result = classifyPriority(
      {
        nome_os: "Vazamento contínuo em torneira e piso alagando",
        local: "Banheiro masculino",
        data_criacao: "2026-09-12",
      },
      reference,
    );
    expect(["ALTA", "CRÍTICA"]).toContain(result.level);
    expect(result.score).toBeGreaterThanOrEqual(38);
  });

  it("classifica água próxima de elétrica como crítica", () => {
    const result = classifyPriority(
      {
        nome_os: "Goteira com água caindo sobre a fiação do painel elétrico",
        local: "CCM principal",
        equipe: "Elétrica",
        data_criacao: "2026-09-15",
      },
      reference,
    );
    expect(result.level).toBe("CRÍTICA");
    expect(result.reasons).toContain("Água próxima de instalação elétrica");
  });

  it("considera área de alimentação sem inflar reparo simples para alta/crítica", () => {
    const kitchen = classifyPriority(
      {
        nome_os: "Reparo de bancada",
        local: "Cozinha do restaurante",
        data_criacao: "2026-09-15",
      },
      reference,
    );
    expect(kitchen.reasons).toContain("Área de alimentação");
    expect(["NORMAL", "MÉDIA"]).toContain(kitchen.level);
  });

  it("mantém chamado neutro e recente como normal", () => {
    const result = classifyPriority(
      {
        nome_os: "Ajustar acabamento de rodapé",
        local: "Sala administrativa",
        data_criacao: "2026-09-15",
      },
      reference,
    );
    expect(result.level).toBe("NORMAL");
  });

  it("reconhece Backorder pelo campo tipo sem tratá-lo sozinho como emergência", () => {
    const input = {
      tipo: "Backorder",
      tipo_importacao: "padrao",
      nome_os: "Ajustar acabamento de rodapé",
      local: "Sala administrativa",
      data_criacao: "2026-09-14",
    };
    expect(isBackorderCorrective(input)).toBe(true);
    const result = classifyPriority(input, reference);
    expect(result.isBackorder).toBe(true);
    expect(result.level).not.toBe("CRÍTICA");
    expect(result.reasons.some((reason) => reason.includes("Backorder"))).toBe(true);
  });

  it("reconhece Backorder legado por tipo_importacao", () => {
    expect(isBackorderCorrective({ tipo_importacao: "backorder mensal" })).toBe(true);
  });

  it("SLA vencido e antiguidade aumentam o score", () => {
    const recent = classifyPriority(
      {
        nome_os: "Ajustar acabamento de rodapé",
        local: "Sala administrativa",
        data_criacao: "2026-09-15",
        data_sla: "2026-09-30",
      },
      reference,
    );
    const overdue = classifyPriority(
      {
        nome_os: "Ajustar acabamento de rodapé",
        local: "Sala administrativa",
        data_criacao: "2026-07-01",
        data_sla: "2026-09-01",
      },
      reference,
    );
    expect(overdue.score).toBeGreaterThan(recent.score);
    expect(["ALTA", "CRÍTICA"]).toContain(overdue.level);
    expect(overdue.dueState).toBe("OVERDUE");
  });
});

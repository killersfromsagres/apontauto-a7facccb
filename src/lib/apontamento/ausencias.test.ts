import { describe, expect, it } from "vitest";

import {
  ausenciaNaData,
  dataSeguinte,
  dateKeyToDayNumber,
  diasInclusivos,
  periodoContemData,
  situacaoAusencia,
  statusNaData,
  type Ausencia,
} from "./ausencias";

const ferias: Ausencia = {
  id: "ferias-1",
  matricula: "12345",
  tipo: "ferias",
  inicio: "2026-10-15",
  fim: "2026-10-30",
  criadoEm: "2026-10-15T12:00:00.000Z",
};

describe("períodos de faltas e férias", () => {
  it("mantém o colaborador de férias até a data final inclusive", () => {
    expect(statusNaData("12345", "2026-10-14", [ferias])).toBe("presente");
    expect(statusNaData("12345", "2026-10-15", [ferias])).toBe("ferias");
    expect(statusNaData("12345", "2026-10-16", [ferias])).toBe("ferias");
    expect(statusNaData("12345", "2026-10-29", [ferias])).toBe("ferias");
    expect(statusNaData("12345", "2026-10-30", [ferias])).toBe("ferias");
    expect(statusNaData("12345", "2026-10-31", [ferias])).toBe("presente");
  });

  it("calcula duração inclusiva e retorno no dia seguinte", () => {
    expect(diasInclusivos("2026-10-15", "2026-10-30")).toBe(16);
    expect(dataSeguinte("2026-10-30")).toBe("2026-10-31");
  });

  it("classifica períodos futuros, ativos e encerrados sem depender de fuso horário", () => {
    expect(situacaoAusencia(ferias, "2026-10-14")).toBe("futura");
    expect(situacaoAusencia(ferias, "2026-10-15")).toBe("ativa");
    expect(situacaoAusencia(ferias, "2026-10-30")).toBe("ativa");
    expect(situacaoAusencia(ferias, "2026-10-31")).toBe("encerrada");
  });

  it("trata falta com intervalo de vários dias da mesma forma inclusiva", () => {
    const falta: Ausencia = {
      id: "falta-1",
      matricula: "999",
      tipo: "falta",
      inicio: "2026-10-20",
      fim: "2026-10-22",
      criadoEm: "2026-10-19T12:00:00.000Z",
    };

    expect(statusNaData("999", "2026-10-20", [falta])).toBe("falta");
    expect(statusNaData("999", "2026-10-21", [falta])).toBe("falta");
    expect(statusNaData("999", "2026-10-22", [falta])).toBe("falta");
    expect(statusNaData("999", "2026-10-23", [falta])).toBe("presente");
  });

  it("prioriza férias quando existe sobreposição de registros", () => {
    const falta: Ausencia = {
      id: "falta-overlap",
      matricula: "12345",
      tipo: "falta",
      inicio: "2026-10-20",
      fim: "2026-10-20",
      criadoEm: "2026-10-20T09:00:00.000Z",
    };

    expect(ausenciaNaData("12345", "2026-10-20", [falta, ferias])?.tipo).toBe("ferias");
  });

  it("rejeita datas inválidas e não cria falso período", () => {
    expect(dateKeyToDayNumber("2026-02-30")).toBeNull();
    expect(periodoContemData("2026-10-15", "2026-10-30", "2026-02-30")).toBe(false);
    expect(diasInclusivos("2026-10-30", "2026-10-15")).toBe(0);
  });
});

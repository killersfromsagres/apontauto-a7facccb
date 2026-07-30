/**
 * 23.1 — validação de quantidade, reconciliação de bags e progresso da rota.
 */
import { describe, expect, it } from "vitest";

import { calcularBalanco, validarEntrega, agruparPorPredio } from "@/features/water-delivery/mutations/execucao";
import { calcularEntrega } from "@/features/water-delivery/reports/indicadores";

const entrega = (over: Partial<Parameters<typeof validarEntrega>[0]> = {}) =>
  ({
    status: "concluida",
    bags_entregues: 2,
    bags_recolhidas: 1,
    estoque_antes: 1,
    estoque_depois: 3,
    condicao: "boa",
    recebido_por: "Ana",
    observacao: null,
    motivo: null,
    fotos: ["https://i.ibb.co/a.jpg"],
    assinatura_url: null,
    local_confirmado: true,
    latitude: null,
    longitude: null,
    ...over,
  }) as Parameters<typeof validarEntrega>[0];

describe("validação da entrega em campo", () => {
  it("aceita uma conclusão completa", () => {
    expect(validarEntrega(entrega(), { saldoDisponivel: 10 })).toEqual([]);
  });

  it("bloqueia conclusão sem foto", () => {
    const erros = validarEntrega(entrega({ fotos: [] }), { saldoDisponivel: 10 });
    expect(erros).toContain("A conclusão exige ao menos uma foto do ponto abastecido.");
  });

  it("bloqueia conclusão sem quantidade entregue", () => {
    const erros = validarEntrega(entrega({ bags_entregues: 0 }), { saldoDisponivel: 10 });
    expect(erros).toContain("Informe a quantidade entregue.");
  });

  it("rejeita quantidades negativas", () => {
    const erros = validarEntrega(entrega({ bags_recolhidas: -1 }), { saldoDisponivel: 10 });
    expect(erros).toContain("Quantidades não podem ser negativas.");
  });

  it("exige confirmação do local", () => {
    const erros = validarEntrega(entrega({ local_confirmado: false }), { saldoDisponivel: 10 });
    expect(erros).toContain("Confirme que prédio, andar e espaço estão corretos.");
  });

  it("exige foto e motivo na entrega parcial", () => {
    const erros = validarEntrega(
      entrega({ status: "parcial", fotos: [], motivo: "   " }),
      { saldoDisponivel: 10 },
    );
    expect(erros).toContain("A entrega parcial exige ao menos uma foto.");
    expect(erros).toContain("A entrega parcial exige motivo.");
  });

  it("exige motivo em paradas não realizadas", () => {
    const erros = validarEntrega(
      entrega({ status: "local_fechado", bags_entregues: 0, fotos: [], motivo: null }),
      { saldoDisponivel: 10 },
    );
    expect(erros).toContain("Registrar como não realizada exige motivo.");
  });

  it("impede entregar mais bags do que o saldo carregado", () => {
    const erros = validarEntrega(entrega({ bags_entregues: 12 }), { saldoDisponivel: 5 });
    expect(erros.some((e) => e.includes("maior que o saldo carregado"))).toBe(true);
  });

  it("permite ultrapassar o saldo quando há ajuste autorizado", () => {
    const erros = validarEntrega(entrega({ bags_entregues: 12 }), {
      saldoDisponivel: 5,
      ajusteAutorizado: true,
    });
    expect(erros).toEqual([]);
  });

  it("não limita a quantidade quando não há saldo controlado", () => {
    expect(validarEntrega(entrega({ bags_entregues: 99 }), { saldoDisponivel: null })).toEqual([]);
  });
});

describe("reconciliação de bags no fechamento da rota", () => {
  it("fecha sem divergência quando tudo é contabilizado", () => {
    const b = calcularBalanco({ carregadas: 20, ajustes: 0, entregues: 16, restantes: 3, danificadas: 1 });
    expect(b).toEqual({ esperado: 20, contabilizado: 20, divergencia: 0 });
  });

  it("aponta sobra e falta de bags", () => {
    expect(
      calcularBalanco({ carregadas: 20, ajustes: 0, entregues: 16, restantes: 2, danificadas: 0 }).divergencia,
    ).toBe(-2);
    expect(
      calcularBalanco({ carregadas: 20, ajustes: 0, entregues: 18, restantes: 4, danificadas: 0 }).divergencia,
    ).toBe(2);
  });

  it("considera os ajustes autorizados no esperado", () => {
    const b = calcularBalanco({ carregadas: 20, ajustes: 5, entregues: 22, restantes: 3, danificadas: 0 });
    expect(b.esperado).toBe(25);
    expect(b.divergencia).toBe(0);
  });
});

describe("progresso da rota", () => {
  const visita = (over: Record<string, unknown> = {}) =>
    ({
      id: crypto.randomUUID(),
      ponto_id: "p1",
      data: "2026-07-01",
      status: "concluida",
      bags_previstas: 2,
      bags_entregues: 2,
      bags_recolhidas: 0,
      fotos: ["https://i.ibb.co/a.jpg"],
      predio: "Bloco D55",
      rota_id: "r1",
      ...over,
    }) as any;

  it("calcula o percentual concluído da rota", () => {
    const r = calcularEntrega({
      visitas: [visita(), visita(), visita({ status: "pendente", bags_entregues: 0, fotos: [] })],
      pontos: [{ id: "p1", predio: "Bloco D55", andar: "1", espaco: "Copa" } as any],
    });
    expect(r.totalParadas).toBe(3);
    expect(r.taxaConclusao).toBe(66.7);
  });

  it("agrupa paradas por prédio para a navegação em campo", () => {
    const grupos = agruparPorPredio([
      { predio: "Bloco D55", ordem: 1 },
      { predio: "Bloco D55", ordem: 2 },
      { predio: "Bloco A1", ordem: 3 },
    ]);
    expect([...grupos.keys()]).toEqual(["Bloco D55", "Bloco A1"]);
    expect(grupos.get("Bloco D55")).toHaveLength(2);
  });
});

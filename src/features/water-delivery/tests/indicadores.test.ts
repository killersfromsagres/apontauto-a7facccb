import { describe, expect, it } from "vitest";

import {
  calcularEntrega,
  calcularFiltros,
  minutosEntre,
  pct,
} from "@/features/water-delivery/reports/indicadores";

const visita = (over: Record<string, unknown> = {}) =>
  ({
    id: crypto.randomUUID(),
    ponto_id: "p1",
    data: "2026-07-01",
    dia_semana: 3,
    status: "concluida",
    motivo: null,
    bags_previstas: 2,
    bags_entregues: 2,
    bags_recolhidas: 1,
    estoque_antes: null,
    estoque_depois: null,
    condicao: null,
    recebido_por: null,
    fotos: ["https://i.ibb.co/a.jpg"],
    assinatura_url: null,
    local_confirmado: true,
    latitude: null,
    longitude: null,
    deslocamento_em: "2026-07-01T12:00:00Z",
    atendimento_em: "2026-07-01T12:10:00Z",
    foto_url: null,
    observacao: null,
    responsavel: "Ana",
    veiculo: "V1",
    ordem: 1,
    rota_id: "r1",
    executado_em: "2026-07-01T12:30:00Z",
    ...over,
  }) as any;

const ponto = { id: "p1", predio: "Bloco A", andar: "1", espaco: "Copa" } as any;

describe("indicadores de entrega", () => {
  it("calcula taxa de conclusão, bags e média por ponto", () => {
    const r = calcularEntrega({
      visitas: [
        visita(),
        visita({ status: "nao_realizada", motivo: "Local fechado", bags_entregues: 0 }),
      ],
      pontos: [ponto],
    });
    expect(r.totalParadas).toBe(2);
    expect(r.taxaConclusao).toBe(50);
    expect(r.bagsEntregues).toBe(2);
    expect(r.mediaPorPonto).toBe(2);
    expect(r.motivos[0]).toEqual({ motivo: "Local fechado", qtd: 1 });
  });

  it("aponta evidências faltantes e divergência de bags", () => {
    const r = calcularEntrega({
      visitas: [visita({ fotos: [], foto_url: null, bags_entregues: 1 })],
      pontos: [ponto],
    });
    expect(r.evidenciasFaltantes).toBe(1);
    expect(r.divergenciasBags).toBe(1);
    expect(r.aderenciaPrevistoRealizado).toBe(50);
  });

  it("mede duração da rota e quilometragem pelo hodômetro", () => {
    const rota = {
      id: "r1",
      data: "2026-07-01",
      turno: "manha",
      equipe: "A",
      veiculo: "V1",
      status: "concluida",
      bags_carregadas: 10,
      iniciada_em: "2026-07-01T11:00:00Z",
      finalizada_em: "2026-07-01T14:00:00Z",
      hodometro_inicial: 100,
      hodometro_final: 142,
      divergencia_bags: 2,
    } as any;
    const r = calcularEntrega({ visitas: [visita()], rotas: [rota], pontos: [ponto] });
    expect(r.rotas[0].duracaoMin).toBe(180);
    expect(r.kmTotal).toBe(42);
    expect(r.porVeiculo[0]).toMatchObject({ veiculo: "V1", rotas: 1, km: 42 });
    expect(r.tempoMedioParadaMin).toBe(20);
  });

  it("detecta reincidência de acesso bloqueado", () => {
    const r = calcularEntrega({
      visitas: [
        visita({ status: "acesso_bloqueado" }),
        visita({ status: "acesso_bloqueado" }),
        visita({ ponto_id: "p2", status: "acesso_bloqueado" }),
      ],
      pontos: [ponto],
    });
    expect(r.reincidenciaAcesso).toHaveLength(1);
    expect(r.reincidenciaAcesso[0].qtd).toBe(2);
  });
});

describe("indicadores de filtros", () => {
  const base = (over: Record<string, unknown> = {}) =>
    ({
      id: crypto.randomUUID(),
      situacao: "solicitada",
      prioridade: "alta",
      tipo: "troca",
      origem: "corretiva",
      predio: "Bloco A",
      criado_em: "2026-07-01T10:00:00Z",
      vence_em: "2026-07-02T10:00:00Z",
      concluida_em: null,
      programada_em: null,
      reaberturas: 0,
      avaliacao_nota: null,
      material_quantidade: null,
      ...over,
    }) as any;

  it("conta abertas, vencidas e SLA", () => {
    const r = calcularFiltros({
      solicitacoes: [
        base(),
        base({ situacao: "concluida", concluida_em: "2026-07-01T20:00:00Z" }),
        base({ situacao: "concluida", concluida_em: "2026-07-05T20:00:00Z" }),
      ],
      hoje: "2026-07-10T00:00:00Z",
    });
    expect(r.abertas).toBe(1);
    expect(r.vencidas).toBe(1);
    expect(r.slaCumprimentoPct).toBe(50);
    expect(r.tempoConclusaoMedioH).toBeGreaterThan(0);
  });

  it("separa preventiva de corretiva e lista filtros vencendo", () => {
    const r = calcularFiltros({
      solicitacoes: [base({ origem: "preventiva" }), base()],
      ativos: [
        { id: "f1", situacao: "ativo", proxima_troca: "2026-07-15", predio: "Bloco A" } as any,
        { id: "f2", situacao: "ativo", proxima_troca: "2027-01-01", predio: "Bloco B" } as any,
      ],
      hoje: "2026-07-10T00:00:00Z",
    });
    expect(r.preventivas).toBe(1);
    expect(r.corretivas).toBe(1);
    expect(r.vencendo).toHaveLength(1);
  });
});

describe("utilitários", () => {
  it("pct e minutosEntre são resilientes", () => {
    expect(pct(1, 0)).toBe(0);
    expect(minutosEntre(null, "2026-07-01T10:00:00Z")).toBeNull();
    expect(minutosEntre("2026-07-01T10:00:00Z", "2026-07-01T09:00:00Z")).toBeNull();
  });
});

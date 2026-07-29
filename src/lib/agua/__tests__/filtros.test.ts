import { describe, expect, it } from "vitest";

import {
  ativosParaPreventiva,
  diasParaTroca,
  estadoSla,
  validarAtivo,
  type FiltroAtivo,
} from "@/lib/agua/filtros";

const ativo = (over: Partial<FiltroAtivo> = {}): FiltroAtivo =>
  ({
    id: "a1",
    ponto_id: "p1",
    codigo: null,
    predio: null,
    andar_setor: null,
    espaco: null,
    tipo_equipamento: "Purificador",
    fabricante: "IBBL",
    marca: "IBBL",
    modelo: "FR600",
    modelo_elemento: null,
    patrimonio: null,
    numero_serie: null,
    tipo_filtro: "refil",
    local_instalacao: null,
    instalado_em: "2025-01-10",
    ultima_troca: null,
    periodicidade_dias: 180,
    proxima_troca: "2026-02-10",
    condicao_atual: "boa",
    situacao: "ativo",
    responsavel: null,
    foto_url: null,
    qr_token: "tok-1",
    observacao: null,
    criado_em: "",
    ...over,
  }) as FiltroAtivo;


const HOJE = new Date("2026-01-20T12:00:00");

describe("validarAtivo", () => {
  it("exige ponto, periodicidade válida e uma data-base", () => {
    expect(validarAtivo({})).toBe("Selecione o ponto de entrega.");
    expect(
      validarAtivo({ ponto_id: "p1", tipo_filtro: "refil", periodicidade_dias: 0 }),
    ).toMatch(/Periodicidade/);
    expect(
      validarAtivo({ ponto_id: "p1", tipo_filtro: "refil", periodicidade_dias: 180 }),
    ).toMatch(/data de instalação/);
    expect(
      validarAtivo({
        ponto_id: "p1",
        tipo_filtro: "refil",
        periodicidade_dias: 180,
        instalado_em: "2025-01-10",
      }),
    ).toBeNull();
  });
});

describe("diasParaTroca / preventivas", () => {
  it("conta os dias e detecta trocas vencidas", () => {
    expect(diasParaTroca(ativo(), HOJE)).toBe(21);
    expect(diasParaTroca(ativo({ proxima_troca: "2026-01-10" }), HOJE)).toBe(-10);
    expect(diasParaTroca(ativo({ proxima_troca: null }), HOJE)).toBeNull();
  });

  it("lista apenas ativos dentro da janela, vencidos primeiro", () => {
    const r = ativosParaPreventiva(
      [
        ativo({ id: "longe", proxima_troca: "2026-06-01" }),
        ativo({ id: "vencido", proxima_troca: "2026-01-05" }),
        ativo({ id: "perto", proxima_troca: "2026-02-10" }),
        ativo({ id: "inativo", proxima_troca: "2026-01-21", situacao: "inativo" }),
      ],
      30,
      HOJE,
    );
    expect(r.map((a) => a.id)).toEqual(["vencido", "perto"]);
  });
});

describe("estadoSla", () => {
  const base = { situacao: "aberta" as const, criado_em: "2026-01-20T00:00:00Z" };

  it("marca vencido, atenção e no prazo", () => {
    expect(estadoSla({ ...base, vence_em: "2026-01-20T06:00:00Z" }, HOJE).estado).toBe("vencido");
    // 12h decorridas de 15h totais → 80% do prazo
    expect(estadoSla({ ...base, vence_em: "2026-01-20T15:00:00Z" }, HOJE).estado).toBe("atencao");

    expect(estadoSla({ ...base, vence_em: "2026-01-23T00:00:00Z" }, HOJE).estado).toBe("no_prazo");
  });

  it("ignora solicitações encerradas", () => {
    expect(
      estadoSla({ ...base, situacao: "concluida", vence_em: "2026-01-01T00:00:00Z" }, HOJE).estado,
    ).toBe("encerrado");
  });
});

import { describe, expect, it } from "vitest";

import {
  ROTA_STATUS,
  VISITA_FINAIS,
  VISITA_STATUS,
  podeTransicionarRota,
  podeTransicionarVisita,
  visitaAtendida,
} from "@/lib/agua/estados";
import { TRANSICOES, podeTransicionar } from "@/lib/agua/filtros";

describe("14.1 máquina de estados da rota", () => {
  it("cobre os nove estados da especificação", () => {
    expect(ROTA_STATUS).toHaveLength(9);
    expect(ROTA_STATUS).toContain("concluida_com_divergencia");
  });

  it("permite o caminho feliz completo", () => {
    expect(podeTransicionarRota("rascunho", "planejada")).toBe(true);
    expect(podeTransicionarRota("planejada", "atribuida")).toBe(true);
    expect(podeTransicionarRota("atribuida", "pronta")).toBe(true);
    expect(podeTransicionarRota("pronta", "em_andamento")).toBe(true);
    expect(podeTransicionarRota("em_andamento", "pausada")).toBe(true);
    expect(podeTransicionarRota("pausada", "em_andamento")).toBe(true);
    expect(podeTransicionarRota("em_andamento", "concluida")).toBe(true);
  });

  it("recusa pular etapas ou ressuscitar rota encerrada", () => {
    expect(podeTransicionarRota("planejada", "em_andamento")).toBe(false);
    expect(podeTransicionarRota("rascunho", "concluida")).toBe(false);
    expect(podeTransicionarRota("cancelada", "em_andamento")).toBe(false);
    expect(podeTransicionarRota("concluida", "em_andamento")).toBe(false);
  });

  it("só o gestor cancela fora do fluxo, e nunca uma rota já encerrada", () => {
    expect(podeTransicionarRota("em_andamento", "cancelada", { gestor: true })).toBe(true);
    expect(podeTransicionarRota("concluida", "cancelada", { gestor: true })).toBe(false);
  });

  it("permite corrigir concluída para concluída com divergência", () => {
    expect(podeTransicionarRota("concluida", "concluida_com_divergencia")).toBe(true);
    expect(podeTransicionarRota("concluida_com_divergencia", "concluida")).toBe(true);
  });
});

describe("14.2 máquina de estados da parada", () => {
  it("cobre os estados da especificação", () => {
    for (const s of [
      "pendente",
      "em_deslocamento",
      "em_atendimento",
      "concluida",
      "parcial",
      "sem_necessidade",
      "acesso_bloqueado",
      "local_fechado",
      "falta_bags",
      "endereco_divergente",
      "reprogramada",
      "cancelada",
    ] as const) {
      expect(VISITA_STATUS).toContain(s);
    }
  });

  it("segue o fluxo de campo", () => {
    expect(podeTransicionarVisita("pendente", "em_deslocamento")).toBe(true);
    expect(podeTransicionarVisita("em_deslocamento", "em_atendimento")).toBe(true);
    expect(podeTransicionarVisita("em_atendimento", "parcial")).toBe(true);
    expect(podeTransicionarVisita("pendente", "acesso_bloqueado")).toBe(true);
  });

  it("trava a reabertura de parada encerrada para quem não é gestor", () => {
    for (const final of VISITA_FINAIS) {
      expect(podeTransicionarVisita(final, "pendente")).toBe(false);
      expect(podeTransicionarVisita(final, "pendente", { gestor: true })).toBe(true);
    }
  });

  it("conta apenas concluída e parcial como atendimento efetivo", () => {
    expect(visitaAtendida("concluida")).toBe(true);
    expect(visitaAtendida("parcial")).toBe(true);
    expect(visitaAtendida("local_fechado")).toBe(false);
  });
});

describe("14.3 fluxo da solicitação de filtro", () => {
  it("valida o caminho completo até a validação", () => {
    expect(podeTransicionar("solicitada", "em_triagem")).toBe(true);
    expect(podeTransicionar("em_triagem", "aprovada")).toBe(true);
    expect(podeTransicionar("aprovada", "programada")).toBe(true);
    expect(podeTransicionar("programada", "em_execucao")).toBe(true);
    expect(podeTransicionar("em_execucao", "concluida")).toBe(true);
    expect(podeTransicionar("concluida", "validada")).toBe(true);
  });

  it("recusa atalhos e mudanças a partir de estados finais", () => {
    expect(podeTransicionar("solicitada", "concluida")).toBe(false);
    expect(podeTransicionar("cancelada", "em_triagem")).toBe(false);
    expect(podeTransicionar("validada", "em_execucao")).toBe(false);
  });

  it("permite reabrir concluída e rejeitada", () => {
    expect(podeTransicionar("concluida", "reaberta")).toBe(true);
    expect(podeTransicionar("rejeitada", "reaberta")).toBe(true);
    expect(podeTransicionar("reaberta", "programada")).toBe(true);
  });

  it("nunca aponta para um estado fora da lista oficial", () => {
    const conhecidos = Object.keys(TRANSICOES);
    for (const destinos of Object.values(TRANSICOES)) {
      for (const destino of destinos) expect(conhecidos).toContain(destino);
    }
  });
});

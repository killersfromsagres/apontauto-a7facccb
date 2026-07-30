import { describe, expect, it } from "vitest";

import {
  AGUA_PAPEIS,
  AGUA_PAPEIS_SEM_ACESSO_AUTOMATICO,
  AGUA_PERMISSAO_LABEL,
  AGUA_PERMISSOES,
  escopoRestrito,
  moduloDaPermissao,
  papelTemPermissao,
  type AguaPermissao,
} from "@/features/water-delivery/schemas/permissoes";

describe("15.1 catálogo de permissões", () => {
  it("contém as 18 permissões exigidas pela especificação", () => {
    const esperadas = [
      "water_delivery.view",
      "water_delivery.plan",
      "water_delivery.assign",
      "water_delivery.execute",
      "water_delivery.correct",
      "water_delivery.manage",
      "water_delivery.export",
      "water_delivery.photos.view",
      "water_delivery.photos.upload",
      "water_delivery.whatsapp.share",
      "water_delivery.whatsapp.automatic",
      "water_bags.manage",
      "water_filters.view",
      "water_filters.request",
      "water_filters.triage",
      "water_filters.execute",
      "water_filters.manage",
      "water_filters.export",
    ];
    expect([...AGUA_PERMISSOES].sort()).toEqual(esperadas.sort());
  });

  it("tem rótulo e módulo para cada permissão", () => {
    for (const p of AGUA_PERMISSOES) {
      expect(AGUA_PERMISSAO_LABEL[p]).toBeTruthy();
      expect(["abastecimento-agua", "agua-bags", "agua-filtros"]).toContain(moduloDaPermissao(p));
    }
  });
});

describe("15.2 papéis", () => {
  it("cria os papéis sugeridos", () => {
    for (const papel of [
      "operador_frota",
      "gestor_frota",
      "solicitante_filtro",
      "tecnico_filtro",
      "gestor_pcm",
      "administrador",
      "proprietario",
    ]) {
      expect(AGUA_PAPEIS[papel]).toBeDefined();
    }
  });

  it("operador executa e evidencia, mas não programa nem gerencia", () => {
    expect(papelTemPermissao("operador_frota", "water_delivery.execute")).toBe(true);
    expect(papelTemPermissao("operador_frota", "water_delivery.photos.upload")).toBe(true);
    expect(papelTemPermissao("operador_frota", "water_delivery.plan")).toBe(false);
    expect(papelTemPermissao("operador_frota", "water_delivery.assign")).toBe(false);
    expect(papelTemPermissao("operador_frota", "water_delivery.manage")).toBe(false);
    expect(papelTemPermissao("operador_frota", "water_delivery.correct")).toBe(false);
  });

  it("gestor de frota tem o conjunto completo", () => {
    for (const p of AGUA_PERMISSOES) {
      expect(papelTemPermissao("gestor_frota", p)).toBe(true);
    }
  });

  it("solicitante apenas abre e acompanha; técnico apenas executa", () => {
    expect(AGUA_PAPEIS.solicitante_filtro).toEqual(
      expect.arrayContaining(["water_filters.request", "water_filters.view"]),
    );
    expect(papelTemPermissao("solicitante_filtro", "water_filters.triage")).toBe(false);
    expect(papelTemPermissao("tecnico_filtro", "water_filters.execute")).toBe(true);
    expect(papelTemPermissao("tecnico_filtro", "water_filters.manage")).toBe(false);
  });

  it("corretiva e climatização não recebem nada automaticamente", () => {
    for (const papel of AGUA_PAPEIS_SEM_ACESSO_AUTOMATICO) {
      expect(AGUA_PAPEIS[papel]).toBeUndefined();
      for (const p of AGUA_PERMISSOES) {
        expect(papelTemPermissao(papel, p)).toBe(false);
      }
    }
  });
});

describe("15.3 escopo de visibilidade (espelho das políticas)", () => {
  const perms = (papel: string) => AGUA_PAPEIS[papel] as AguaPermissao[];

  it("operador puro fica restrito às próprias rotas", () => {
    expect(escopoRestrito(perms("operador_frota"))).toBe(true);
  });

  it("gestor enxerga o módulo inteiro", () => {
    expect(escopoRestrito(perms("gestor_frota"))).toBe(false);
    expect(escopoRestrito(perms("gestor_pcm"))).toBe(false);
  });

  it("quem não executa rota não entra na regra de escopo restrito", () => {
    expect(escopoRestrito(perms("solicitante_filtro"))).toBe(false);
    expect(escopoRestrito([])).toBe(false);
  });
});

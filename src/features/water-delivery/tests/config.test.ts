import { describe, expect, it } from "vitest";
import {
  DEFAULT_AGUA_ADMIN,
  aguaAdminSchema,
  mergeAguaAdmin,
} from "@/features/water-delivery/schemas/config";

describe("configurações administrativas (item 22)", () => {
  it("aplica padrões quando não há nada salvo", () => {
    expect(mergeAguaAdmin(undefined)).toEqual(DEFAULT_AGUA_ADMIN);
  });

  it("preserva valores salvos e completa o que falta", () => {
    const cfg = mergeAguaAdmin({ operacao: { bagsPadrao: 7 } });
    expect(cfg.operacao.bagsPadrao).toBe(7);
    expect(cfg.operacao.horaGeracao).toBe(DEFAULT_AGUA_ADMIN.operacao.horaGeracao);
    expect(cfg.campo.fotoObrigatoria).toBe(true);
  });

  it("rejeita lado máximo fora da faixa suportada", () => {
    const ruim = {
      ...DEFAULT_AGUA_ADMIN,
      evidencias: { ...DEFAULT_AGUA_ADMIN.evidencias, ladoMaximoPx: 4000 },
    };
    expect(aguaAdminSchema.safeParse(ruim).success).toBe(false);
  });

  it("exige ao menos um dia útil", () => {
    const ruim = {
      ...DEFAULT_AGUA_ADMIN,
      operacao: { ...DEFAULT_AGUA_ADMIN.operacao, diasUteis: [] },
    };
    expect(aguaAdminSchema.safeParse(ruim).success).toBe(false);
  });

  it("aceita a configuração padrão", () => {
    expect(aguaAdminSchema.safeParse(DEFAULT_AGUA_ADMIN).success).toBe(true);
  });
});

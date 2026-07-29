import { describe, expect, it } from "vitest";

import { cpfLast4, formatCpf, isValidCpf, maskCpf, normalizeCpf } from "@/lib/frota/cpf";

describe("CPF", () => {
  it("normaliza removendo máscara e limitando a 11 dígitos", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
    expect(normalizeCpf("529982247259999")).toBe("52998224725");
    expect(normalizeCpf("")).toBe("");
  });

  it("valida CPFs reais e recusa inválidos", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("111.444.777-35")).toBe(true);
    expect(isValidCpf("529.982.247-26")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
  });

  it("recusa sequências repetidas", () => {
    for (const d of "0123456789") expect(isValidCpf(d.repeat(11))).toBe(false);
  });

  it("formata e mascara sem expor os dígitos iniciais", () => {
    expect(formatCpf("52998224725")).toBe("529.982.247-25");
    const masked = maskCpf("52998224725");
    expect(masked).toBe("***.***.***-25");
    expect(masked).not.toContain("529");
    expect(cpfLast4("52998224725")).toBe("4725");
  });
});

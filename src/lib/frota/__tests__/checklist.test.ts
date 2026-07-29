import { describe, expect, it } from "vitest";

import {
  computeIntegrityScore,
  generateProtocol,
  hasCriticalBlock,
  overallStatus,
  type FilledItem,
} from "@/lib/frota/checklist-catalog";

const ok = (key: string): FilledItem => ({ key, status: "conforme" });
const nc = (key: string, severity: FilledItem["severity"]): FilledItem => ({
  key,
  status: "nao_conforme",
  severity,
});

describe("integridade do checklist", () => {
  it("veículo sem não conformidade tem score 100", () => {
    expect(computeIntegrityScore([ok("freios"), ok("pneus_estepe")])).toBe(100);
  });

  it("penaliza conforme a gravidade e nunca fica negativo", () => {
    const leve = computeIntegrityScore([nc("bancos", "baixa")]);
    const grave = computeIntegrityScore([nc("freios", "critica")]);
    expect(leve).toBeGreaterThan(grave);
    expect(leve).toBeLessThan(100);
    const muitos = computeIntegrityScore(
      Array.from({ length: 12 }, (_, i) => nc(`item_${i}`, "critica")),
    );
    expect(muitos).toBe(0);
  });

  it("itens não se aplica não penalizam", () => {
    expect(
      computeIntegrityScore([{ key: "extintor", status: "nao_se_aplica" }, ok("freios")]),
    ).toBe(100);
  });
});

describe("bloqueio por item crítico", () => {
  it("bloqueia quando há não conformidade crítica", () => {
    expect(hasCriticalBlock([ok("bancos"), nc("freios", "critica")])).toBe(true);
  });

  it("não bloqueia por gravidade alta ou inferior", () => {
    expect(hasCriticalBlock([nc("farois", "alta"), nc("bancos", "media")])).toBe(false);
  });

  it("classifica o status geral do checklist", () => {
    expect(overallStatus([ok("freios")])).toBe("conforme");
    expect(overallStatus([nc("bancos", "baixa")])).toBe("com_ressalvas");
    expect(overallStatus([nc("freios", "critica")])).toBe("nao_conforme");
  });
});

describe("protocolo", () => {
  it("usa o padrão CHK-AAAAMMDD-XXXX", () => {
    const protocol = generateProtocol(new Date(2026, 6, 29));
    expect(protocol).toMatch(/^CHK-20260729-[A-Z0-9]{2,4}$/);
  });
});

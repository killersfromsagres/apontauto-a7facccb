import { describe, expect, it } from "vitest";

import { calcularAlertas, validarMovimento, type BagTipo } from "@/features/water-delivery/queries/bags";
import { mascararPlaca, mascararTelefone, montarMensagem } from "@/features/water-delivery/whatsapp/whatsapp";

const tipo = (over: Partial<BagTipo> = {}): BagTipo => ({
  id: "t1",
  codigo: "BAG20",
  nome: "Bag 20 litros",
  capacidade_label: "20 L",
  capacidade_litros: 20,
  unidade: "un",
  estoque_atual: 5,
  estoque_minimo: 10,
  local_armazenamento: null,
  fornecedor: null,
  ativo: true,
  observacao: null,
  criado_em: "",
  atualizado_em: "",
  ...over,
});

describe("validarMovimento", () => {
  it("exige quantidade positiva inteira", () => {
    expect(validarMovimento({ bagTipoId: "t1", tipo: "entrega", quantidade: 0 })).toBeTruthy();
    expect(validarMovimento({ bagTipoId: "t1", tipo: "entrega", quantidade: 1.5 })).toBeTruthy();
    expect(validarMovimento({ bagTipoId: "t1", tipo: "entrega", quantidade: 2 })).toBeNull();
  });

  it("exige motivo em perda, avaria e ajuste", () => {
    expect(validarMovimento({ bagTipoId: "t1", tipo: "perda", quantidade: 1 })).toBeTruthy();
    expect(
      validarMovimento({ bagTipoId: "t1", tipo: "ajuste", quantidade: 1, motivo: "inventário" }),
    ).toBeNull();
  });
});

describe("calcularAlertas", () => {
  it("acusa estoque abaixo do mínimo", () => {
    const a = calcularAlertas({ tipos: [tipo()], movimentos: [], visitas: [], rotas: [] });
    expect(a.some((x) => x.tipo === "estoque_minimo")).toBe(true);
  });

  it("acusa divergência e avaria de rota", () => {
    const a = calcularAlertas({
      tipos: [],
      movimentos: [],
      visitas: [],
      rotas: [{ id: "r1", data: "2026-01-05", divergencia_bags: -3, bags_danificadas: 2 }],
    });
    expect(a.map((x) => x.tipo)).toEqual(
      expect.arrayContaining(["divergencia_rota", "bag_danificada"]),
    );
  });

  it("não gera alerta quando tudo está no lugar", () => {
    const a = calcularAlertas({
      tipos: [tipo({ estoque_atual: 30 })],
      movimentos: [],
      visitas: [
        { ponto_id: "p1", nome: "A160", bags_previstas: 2, bags_entregues: 2, status: "concluida" },
      ],
      rotas: [{ id: "r1", data: "2026-01-05", divergencia_bags: 0, bags_danificadas: 0 }],
    });
    expect(a).toHaveLength(0);
  });
});

describe("mensagem do WhatsApp", () => {
  it("mascara placa e telefone", () => {
    expect(mascararPlaca("ABC1D23")).toBe("ABC••••");
    expect(mascararTelefone("+55 11 99999-1234")).toBe("55•••••34");
  });

  it("monta a mensagem agrupada por prédio sem expor a placa", () => {
    const msg = montarMensagem(
      {
        data: "2026-01-05",
        colaboradorPrincipal: "João",
        acompanhante: "Maria",
        veiculoPrefixo: "VE-12",
        veiculoPlaca: "ABC1D23",
        podeVerPlaca: false,
        concluidas: 2,
        previstas: 3,
        bagsEntregues: 4,
        ocorrencias: 1,
      },
      [
        { predio: "A160", parada: "A160 · TÉRREO · COPA", url: "https://i.ibb.co/1.jpg" },
        { predio: "A160", parada: "A160 · TÉRREO · CIRCULAÇÃO", url: "https://i.ibb.co/2.jpg" },
        { predio: "B203", parada: "B203 · TÉRREO · SUVINIL", url: "https://i.ibb.co/3.jpg" },
      ],
    );
    expect(msg).toContain("05/01/2026");
    expect(msg).toContain("João + Maria");
    expect(msg).toContain("VE-12 — ABC••••");
    expect(msg).not.toContain("ABC1D23");
    expect(msg).toContain("*A160*");
    expect(msg).toContain("Progresso: 2/3");
  });
});

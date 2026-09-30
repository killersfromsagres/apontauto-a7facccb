import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import type { EstoqueSnapshot } from "./data";
import { generateEstoqueWorkbook } from "./export";

const snapshot: EstoqueSnapshot = {
  items: [
    {
      id: "item-1",
      codigo: "001",
      descricao: "Luva nitrílica",
      categoria: "Luvas",
      tamanho: "M",
      ca_numero: "48761",
      unidade: "UN",
      estoque_atual: 8,
      estoque_ideal: 10,
      estoque_minimo: 3,
      valor_unitario: 5,
      ativo: true,
      created_at: "2026-09-30T12:00:00Z",
      updated_at: "2026-09-30T12:00:00Z",
    },
  ],
  colaboradores: [
    {
      id: "colab-1",
      nome: "Colaborador Teste",
      matricula: "123",
      setor: "Manutenção",
      cargo: "Técnico",
      unidade: "Demarchi",
      ativo: true,
      created_at: "2026-09-30T12:00:00Z",
      updated_at: "2026-09-30T12:00:00Z",
    },
  ],
  movimentos: [
    {
      id: "mov-1",
      item_id: "item-1",
      tipo: "entrada",
      quantidade: 10,
      saldo_anterior: 0,
      saldo_apos: 10,
      valor_unitario: 5,
      colaborador_id: null,
      colaborador_nome: null,
      motivo: "Compra",
      documento: "NF-1",
      observacao: null,
      entrega_id: null,
      data_movimento: "2026-09-30",
      origem: "manual",
      created_at: "2026-09-30T12:00:00Z",
      item: {
        descricao: "Luva nitrílica",
        codigo: "001",
        categoria: "Luvas",
        tamanho: "M",
        ca_numero: "48761",
      },
    },
    {
      id: "mov-2",
      item_id: "item-1",
      tipo: "saida",
      quantidade: 2,
      saldo_anterior: 10,
      saldo_apos: 8,
      valor_unitario: 5,
      colaborador_id: "colab-1",
      colaborador_nome: "Colaborador Teste",
      motivo: "Entrega",
      documento: null,
      observacao: null,
      entrega_id: "ent-1",
      data_movimento: "2026-09-30",
      origem: "entrega_colaborador",
      created_at: "2026-09-30T12:05:00Z",
      item: {
        descricao: "Luva nitrílica",
        codigo: "001",
        categoria: "Luvas",
        tamanho: "M",
        ca_numero: "48761",
      },
    },
  ],
  entregas: [
    {
      id: "ent-1",
      colaborador_id: "colab-1",
      colaborador_nome: "Colaborador Teste",
      colaborador_matricula: "123",
      colaborador_setor: "Manutenção",
      colaborador_funcao: "Técnico",
      colaborador_centro_resultado: "53945 - MANUT",
      colaborador_situacao_sra: "NORMAL",
      colaborador_supervisor: "Supervisor Teste",
      data_entrega: "2026-09-30",
      observacao: "Entrega inicial",
      created_at: "2026-09-30T12:05:00Z",
      itens: [
        {
          id: "ent-item-1",
          item_id: "item-1",
          descricao: "Luva nitrílica",
          ca_numero: "48761",
          quantidade: 2,
          valor_unitario: 5,
        },
      ],
    },
  ],
};

describe("generateEstoqueWorkbook", () => {
  it("gera planilha completa com estoque, movimentações, retiradas e colaboradores", async () => {
    const file = await generateEstoqueWorkbook(snapshot);
    expect(file.filename).toContain("CONTROLE DE ESTOQUE - DEMARCHI SHERWIN WILLIAMS");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.blob.arrayBuffer());

    const summary = workbook.getWorksheet("RESUMO")!;
    expect(summary.getCell("A1").text).toBe("DEMARCHI • SHERWIN WILLIAMS");
    expect(summary.getCell("A3").text).toContain("CONTROLE DE ESTOQUE");

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      "RESUMO",
      "ESTOQUE",
      "MOVIMENTAÇÕES",
      "RETIRADAS",
      "COLABORADORES",
    ]);

    const stock = workbook.getWorksheet("ESTOQUE")!;
    expect(stock.getCell("G5").text).toBe("Entradas");
    expect(stock.getCell("H5").text).toBe("Saídas");
    expect(stock.getCell("I6").value).toBe(8);
    expect(stock.getCell("Q6").value).toBe(50);
    expect(stock.getCell("R6").value).toBe(10);

    const withdrawals = workbook.getWorksheet("RETIRADAS")!;
    expect(withdrawals.getCell("B6").text).toBe("Colaborador Teste");
    expect(withdrawals.getCell("D6").text).toBe("Técnico");
    expect(withdrawals.getCell("E6").text).toBe("53945 - MANUT");
    expect(withdrawals.getCell("H6").text).toBe("Luva nitrílica");
  });
});

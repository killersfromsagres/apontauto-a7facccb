import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { parseSraWorkbook } from "./sra-import";

describe("parseSraWorkbook", () => {
  it("importa somente dados operacionais do SRA", async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("SRA - Documentação e Funcionais");
    sheet.addRow([
      "Empresa",
      "Filial",
      "Descricao Filial",
      "Matricula",
      "Regional",
      "Nome",
      "local",
      "Data do Treinamento",
      "CPF",
      "PIS",
      "Dt Admissao",
      "Dt Demissao",
      "CC",
      "CR",
      "Supervisor",
      "Gerente",
      "Gerente Regional",
      "Cod Cliente",
      "Cliente",
      "Setor do Negocio",
      "Cod Funcao",
      "Função",
      "Escala",
      "Situacao",
      "Sexo",
      "Cat Colaborador",
      "Horario de trabalho",
      "Intervalo",
    ]);
    sheet.addRow([
      "31",
      "0105",
      "IN-HAUS INDUSTR",
      "001703",
      "SP",
      "RODRIGO MACHADO",
      "São Bernardo do Campo",
      new Date(2026, 9, 2),
      "000.000.000-00",
      "123456789",
      new Date(2021, 5, 23),
      null,
      "10001032381",
      "53945 - SP - MAP - BASF DEMARCHI - MANUT",
      "CARLOS GUSTAVO MARRESE",
      "ELEN CRISTINA",
      "MANOEL JOSE",
      "001257",
      "BASF",
      "ENGENHARIA - MANUTENCAO PREDIAL",
      "22673",
      "OFICIAL DE MANUTENCAO PREDIAL",
      "SEGUNDA A SEXTA",
      "NORMAL",
      "M",
      "MENSALISTA",
      "07:30 AS 17:18",
      "12:00 AS 13:00",
    ]);

    const buffer = await workbook.xlsx.writeBuffer();
    const file = new File([buffer], "SRA.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const rows = await parseSraWorkbook(file);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      matricula: "001703",
      nome: "RODRIGO MACHADO",
      funcao: "OFICIAL DE MANUTENCAO PREDIAL",
      situacao_sra: "NORMAL",
      centro_resultado: "53945 - SP - MAP - BASF DEMARCHI - MANUT",
      data_treinamento: "2026-10-02",
    });
    expect(rows[0]).not.toHaveProperty("cpf");
    expect(rows[0]).not.toHaveProperty("pis");
  });
});

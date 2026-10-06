import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";

import {
  buildEvaluationEmailDraft,
  groupEvaluationRows,
  parseEvaluationWorkbook,
  type EvaluationRow,
} from "./evaluation-workbook";

function row(overrides: Partial<EvaluationRow> = {}): EvaluationRow {
  return {
    os: "100",
    descricao: "Troca de luminária",
    especialidade: "ELÉTRICA",
    solicitanteCodigo: "BASF1000",
    solicitanteNome: "MARIA DA SILVA",
    email: "maria@empresa.com",
    estado: "AGUARDANDO APROVAÇÃO",
    statusAvaliacao: "Chamado não avaliado",
    textoAvaliacao: "",
    dataConclusao: "01/10/2026",
    sourceRow: 2,
    ...overrides,
  };
}

describe("evaluation workbook", () => {
  it("agrupa várias OS da mesma pessoa em um único solicitante", () => {
    const groups = groupEvaluationRows([
      row({ os: "100" }),
      row({ os: "101", descricao: "Reparo de tomada" }),
      row({ os: "200", solicitanteCodigo: "BASF2000", solicitanteNome: "JOAO SOUZA", email: "joao@empresa.com" }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.nome === "MARIA DA SILVA")?.items).toHaveLength(2);
  });

  it("gera e-mail corporativo com todas as OS selecionadas e regras do manual", () => {
    const group = groupEvaluationRows([row({ os: "100" }), row({ os: "101", descricao: "Reparo de tomada" })])[0];
    const draft = buildEvaluationEmailDraft(group, group.items, "Equipe de Facilities | Grupo GPS");

    expect(draft.assunto).toContain("2 chamados");
    expect(draft.corpo).toContain("OS 100");
    expect(draft.corpo).toContain("OS 101");
    expect(draft.corpo).toContain("nota de 1 a 5");
    expect(draft.corpo).toContain("nota igual ou inferior a 4");
    expect(draft.corpo).toContain("Submeter aprovações");
  });

  it("lê o modelo da planilha, filtra pendências e remove OS duplicada", async () => {
    const worksheet = XLSX.utils.json_to_sheet([
      {
        "Número OS": 223981,
        "Denominação de Especialidade": "ELÉTRICA",
        "Denominação OS": "Trocar luminárias",
        Solicitante: "BASF1584",
        "Denominação do Solicitante": "THIAGO FERNANDES PRETE",
        "Denominação Estado OS": "AGUARDANDO APROVAÇÃO",
        "Status avaliação": "Chamado não avaliado",
      },
      {
        "Número OS": 223981,
        "Denominação de Especialidade": "ELÉTRICA",
        "Denominação OS": "Trocar luminárias",
        Solicitante: "BASF1584",
        "Denominação do Solicitante": "THIAGO FERNANDES PRETE",
        "Denominação Estado OS": "AGUARDANDO APROVAÇÃO",
        "Status avaliação": "Chamado não avaliado",
      },
      {
        "Número OS": 224247,
        "Denominação de Especialidade": "CIVIL",
        "Denominação OS": "Instalar placa de forro",
        Solicitante: "BASF1584",
        "Denominação do Solicitante": "THIAGO FERNANDES PRETE",
        "Denominação Estado OS": "AGUARDANDO APROVAÇÃO",
        "Status avaliação": "Chamado não avaliado",
      },
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const bytes = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([bytes], "pendencias.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const result = await parseEvaluationWorkbook(file);

    expect(result.pendingRows).toBe(2);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].items.map((item) => item.os)).toEqual(["223981", "224247"]);
  });
});

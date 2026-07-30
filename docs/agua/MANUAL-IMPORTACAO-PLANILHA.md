# Manual de Importação da Planilha

Caminho: **Água → Programação → Importar planilha**. Requer permissão de
programação ou gestão.

## Como o assistente funciona (11 etapas)

| # | Etapa | O que fazer |
|---|---|---|
| 1 | Arquivo | Selecione o `.xlsx`. O sistema calcula um hash do conteúdo para reconhecer reimportações |
| 2 | Abas | Escolha as abas diárias e a consolidada; o dia sugerido de cada aba já vem preenchido |
| 3 | Colunas | Confira o mapeamento automático (prédio, endereço, bags, observação) e corrija o que estiver errado |
| 4 | Normalização | Veja como cada nome será padronizado (acentos, siglas, caixa) |
| 5 | Divergências | Conflitos aparecem em âmbar: ponto em dia extra, dia faltando, ponto só na consolidada, fórmula com erro |
| 6 | Pontos | Lista de pontos novos × existentes, com as fusões sugeridas por grafia parecida |
| 7 | Dias | Distribuição por dia da semana |
| 8 | Quantidade | Bags por ponto e por dia |
| 9 | Ordem | Sequência de atendimento dentro de cada dia |
| 10 | Confirmação | Resumo do que será criado, atualizado e ignorado |
| 11 | Relatório | Resultado final, com o número do lote e o botão de desfazer |

## Regras importantes

- **Nada é excluído automaticamente.** Divergência é sempre apresentada para
  confirmação humana.
- **Reimportar o mesmo arquivo não duplica** pontos nem programação.
- Linhas totalmente vazias são ignoradas; linha sem prédio vira erro listado.
- O mesmo prédio escrito de formas diferentes é unificado em um único ponto,
  com aviso.
- Fusões ficam registradas e podem ser auditadas.

## Resultado esperado com a planilha atual

54 pontos canônicos e 171 paradas semanais, distribuídas em
segunda 31, terça 31, quarta 40, quinta 43 e sexta 26.

## Desfazer

No relatório (ou em Programação → Lotes), **Desfazer lote** remove a
programação criada por aquela importação e **preserva** as execuções já
realizadas.

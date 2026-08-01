// Constantes de dias úteis da programação de água.
//
// Vivem fora de `reader.ts` porque aquele módulo importa `xlsx` (~400 kB) e
// era carregado só por causa de `DIAS`/`DIA_LABEL` em várias telas. Assim, as
// páginas importam apenas estas constantes e o parser pesado fica restrito ao
// assistente de importação.

export const DIAS: { key: string; dia: number; label: string; aliases: RegExp }[] = [
  { key: "segunda", dia: 1, label: "Segunda-feira", aliases: /^segunda/i },
  { key: "terca", dia: 2, label: "Terça-feira", aliases: /^ter(ç|c)a/i },
  { key: "quarta", dia: 3, label: "Quarta-feira", aliases: /^quarta/i },
  { key: "quinta", dia: 4, label: "Quinta-feira", aliases: /^quinta/i },
  { key: "sexta", dia: 5, label: "Sexta-feira", aliases: /^sexta/i },
];

export const DIA_LABEL: Record<number, string> = {
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
  7: "Domingo",
};

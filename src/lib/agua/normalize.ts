/**
 * Normalização textual do cadastro mestre de pontos de entrega de água.
 *
 * Regras (item 6.2): trim, remoção de espaços duplicados, padronização de
 * caixa, normalização de hífens e preservação correta de acentos.
 * Nada aqui altera o significado operacional do local — apenas a forma escrita.
 */

/** Remove espaços das pontas, colapsa espaços internos e normaliza hífens/traços. */
export function limparTexto(valor: string | null | undefined): string {
  if (!valor) return "";
  return valor
    .normalize("NFC")
    // travessões e hífens tipográficos viram hífen simples
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    // espaços especiais (nbsp, narrow nbsp…) viram espaço comum
    .replace(/[\u00a0\u2007\u202f\t]/g, " ")
    // " - " padronizado
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

const MINUSCULAS = new Set([
  "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "a", "o", "com", "para",
]);

/** Caixa de título preservando acentos, siglas e numerações (ex.: "2º Andar - Bloco B"). */
export function caixaTitulo(valor: string | null | undefined): string {
  const base = limparTexto(valor);
  if (!base) return "";
  return base
    .split(" ")
    .map((palavra, i) => {
      const semAcento = palavra.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      // Siglas e códigos (TI, CPD, B2, 3º) permanecem como estão
      if (/^[^a-zà-ÿ]*$/i.test(palavra) && palavra === palavra.toUpperCase()) return palavra;
      if (semAcento.length <= 3 && palavra === palavra.toUpperCase()) return palavra;
      const minuscula = palavra.toLocaleLowerCase("pt-BR");
      if (i > 0 && MINUSCULAS.has(minuscula)) return minuscula;
      return minuscula.charAt(0).toLocaleUpperCase("pt-BR") + minuscula.slice(1);
    })
    .join(" ");
}

/** Código interno: sem espaços, caixa alta, hífen como separador. */
export function normalizarCodigo(valor: string | null | undefined): string {
  return limparTexto(valor)
    .toLocaleUpperCase("pt-BR")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-|-$/g, "");
}

/** Telefone/ramal: mantém dígitos e formata quando for número brasileiro. */
export function normalizarTelefone(valor: string | null | undefined): string {
  const bruto = limparTexto(valor);
  if (!bruto) return "";
  const d = bruto.replace(/\D/g, "");
  if (d.length <= 5) return d; // ramal
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return bruto;
}

/** Chave canônica de unicidade: prédio + andar/setor + espaço. */
export function chaveLocal(predio: string, andar: string, espaco: string): string {
  const parte = (v: string) =>
    limparTexto(v)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "");
  return `${parte(predio)}|${parte(andar)}|${parte(espaco)}`;
}

/** Redução fonética simplificada para o português (detecção de duplicidade). */
export function chaveFonetica(texto: string): string {
  return limparTexto(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, "")
    .replace(/LH/g, "L")
    .replace(/NH/g, "N")
    .replace(/CH/g, "X")
    .replace(/PH/g, "F")
    .replace(/SS|Ç|C(?=[EI])/g, "S")
    .replace(/C/g, "K")
    .replace(/QU?/g, "K")
    .replace(/G(?=[EI])/g, "J")
    .replace(/Z/g, "S")
    .replace(/Y/g, "I")
    .replace(/W/g, "V")
    .replace(/H/g, "")
    .replace(/([A-Z0-9])\1+/g, "$1")
    .replace(/\s+/g, "");
}

/** Distância de Levenshtein (iterativa, O(n·m) com uma linha). */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let linha = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const temp = linha[j];
      linha[j] = Math.min(
        linha[j] + 1,
        linha[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = temp;
    }
  }
  return linha[b.length];
}

/** Similaridade 0–1 entre dois textos já normalizados. */
export function similaridade(a: string, b: string): number {
  const maior = Math.max(a.length, b.length);
  if (!maior) return 1;
  return 1 - levenshtein(a, b) / maior;
}

export type Duplicidade<T> = {
  registro: T;
  tipo: "exata" | "fonetica" | "textual";
  score: number;
};

/**
 * Procura possíveis duplicidades de um local dentro de uma lista existente.
 * Nunca decide sozinho: devolve avisos para confirmação administrativa.
 */
export function detectarDuplicidades<
  T extends { id?: string; predio: string; andar: string; espaco: string },
>(alvo: { id?: string; predio: string; andar: string; espaco: string }, lista: T[]): Duplicidade<T>[] {
  const chaveAlvo = chaveLocal(alvo.predio, alvo.andar, alvo.espaco);
  const fonAlvo = chaveFonetica(`${alvo.predio} ${alvo.andar} ${alvo.espaco}`);
  const achados: Duplicidade<T>[] = [];

  for (const item of lista) {
    if (alvo.id && item.id === alvo.id) continue;
    const chave = chaveLocal(item.predio, item.andar, item.espaco);
    if (chave === chaveAlvo) {
      achados.push({ registro: item, tipo: "exata", score: 1 });
      continue;
    }
    const fon = chaveFonetica(`${item.predio} ${item.andar} ${item.espaco}`);
    if (fon === fonAlvo) {
      achados.push({ registro: item, tipo: "fonetica", score: 0.98 });
      continue;
    }
    const score = similaridade(chaveAlvo, chave);
    if (score >= 0.86) achados.push({ registro: item, tipo: "textual", score });
  }

  return achados.sort((a, b) => b.score - a.score).slice(0, 5);
}

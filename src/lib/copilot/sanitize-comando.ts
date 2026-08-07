// Filtro de comandos-preâmbulo: certas mensagens são apenas "envelopes" que
// antecedem o comando real do usuário. Elas devem ser descartadas e o comando
// seguinte processado normalmente.

const PADROES_IGNORADOS: RegExp[] = [
  /^\s*antes\s+de\s+realizar\s+qualquer\s+a[çc][ãa]o,?\s*entenda\s+o\s+contexto\s+e\s+instru[çc][ãa]o\s+recente\s+do\s+usu[áa]rio,?\s*comando\s+mais\s+recente\s+enviado\s+por\s+ele:?\s*/i,
  /^\s*execute\s+esta\s+instru[çc][ãa]o\s+no\s+projeto:?\s*/i,
];

/**
 * Remove comandos-preâmbulo da entrada.
 * - Se o texto for APENAS o preâmbulo, devolve string vazia (deve ser ignorado
 *   e o próximo comando do usuário será processado como principal).
 * - Se o preâmbulo vier seguido do comando real, devolve só o comando real.
 * - Caso contrário devolve o texto original (apenas com trim).
 */
export function sanitizeComando(entrada: string): string {
  let texto = (entrada ?? "").trim();
  let mudou = true;
  while (mudou) {
    mudou = false;
    for (const padrao of PADROES_IGNORADOS) {
      const novo = texto.replace(padrao, "").trim();
      if (novo !== texto) {
        texto = novo;
        mudou = true;
      }
    }
  }
  return texto;
}

/** true quando a entrada é somente um comando-preâmbulo (sem conteúdo útil). */
export function isComandoIgnorado(entrada: string): boolean {
  const original = (entrada ?? "").trim();
  return original.length > 0 && sanitizeComando(original).length === 0;
}

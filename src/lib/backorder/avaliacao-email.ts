// Gerador de texto corporativo para cobrança de avaliação dos chamados
// concluídos / aguardando aprovação no sistema Prisma.

export interface SolicitanteResumo {
  nome: string;
  total: number;
  concluidos: number;
  aguardando: number;
  oss?: string[];
}

const CAP_EXCECOES = new Set(["de", "da", "do", "das", "dos", "e"]);

/** "MARIA DA SILVA" → "Maria da Silva" */
export function prettyNome(raw: string): string {
  const t = (raw ?? "").trim();
  if (!t) return "Não informado";
  return t
    .toLocaleLowerCase("pt-BR")
    .split(/\s+/)
    .map((w, i) =>
      i > 0 && CAP_EXCECOES.has(w) ? w : w.charAt(0).toLocaleUpperCase("pt-BR") + w.slice(1),
    )
    .join(" ");
}

/** Agrupa por solicitante (coluna E), sem repetir nomes. */
export function agruparSolicitantes(
  rows: Array<{ solicitante?: string | null; statusCat: string; os?: string }>,
): SolicitanteResumo[] {
  const map = new Map<string, SolicitanteResumo>();
  for (const r of rows) {
    const nome = prettyNome(r.solicitante || "Não informado");
    const cur = map.get(nome) ?? { nome, total: 0, concluidos: 0, aguardando: 0, oss: [] };
    cur.total += 1;
    if (r.statusCat === "aguardando_aprovacao") cur.aguardando += 1;
    else cur.concluidos += 1;
    if (r.os && cur.oss!.length < 25) cur.oss!.push(r.os);
    map.set(nome, cur);
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total || a.nome.localeCompare(b.nome));
}

export interface EmailOptions {
  solicitantes: SolicitanteResumo[];
  ano: number | string;
  remetente?: string;
  prazoDias?: number;
}

/** Lista "Nome (n chamados)" pronta para colar no corpo/destinatários. */
export function listaSolicitantes(s: SolicitanteResumo[]): string {
  return s
    .map((x) => `• ${x.nome} — ${x.total} chamado${x.total > 1 ? "s" : ""} para avaliar`)
    .join("\n");
}

export function assuntoEmail(ano: number | string, total: number): string {
  return `Avaliação de chamados concluídos no Prisma — ${total} OS pendentes de validação (${ano})`;
}

export function corpoEmail({
  solicitantes,
  ano,
  remetente = "Equipe de Manutenção Predial — PCM",
  prazoDias = 5,
}: EmailOptions): string {
  const totalOs = solicitantes.reduce((a, b) => a + b.total, 0);
  const totalPessoas = solicitantes.length;
  return `Prezados(as),

Esperamos que estejam bem.

Realizamos o levantamento das ordens de serviço de manutenção corretiva registradas em ${ano} que já foram executadas e encontram-se concluídas ou aguardando aprovação no sistema Prisma. No momento, constam ${totalOs.toLocaleString("pt-BR")} chamado(s) distribuídos entre ${totalPessoas} solicitante(s) pendentes de avaliação.

A avaliação do chamado é a etapa final do fluxo: ela confirma que o serviço foi entregue conforme o solicitado, encerra formalmente a ordem de serviço e permite que os indicadores de atendimento e de SLA reflitam a realidade da operação. Enquanto a validação não é registrada, a OS permanece em aberto no sistema, o que impacta diretamente nossos relatórios gerenciais.

Solicitamos, por gentileza, que cada solicitante acesse o Prisma e realize a avaliação dos chamados listados abaixo no prazo de ${prazoDias} dias úteis:

${listaSolicitantes(solicitantes)}

Como avaliar:
1. Acesse o sistema Prisma com seu login corporativo.
2. Localize a ordem de serviço em "Minhas solicitações" / "Chamados concluídos".
3. Confira o serviço executado e registre a avaliação (nota e comentário, quando aplicável).
4. Confirme para encerrar o chamado.

Caso algum serviço não tenha sido concluído de forma satisfatória, pedimos que registre a observação na própria avaliação ou responda a este e-mail: reabriremos o atendimento com prioridade.

Agradecemos antecipadamente pela colaboração — ela é essencial para a qualidade das informações e para a melhoria contínua dos nossos serviços.

Atenciosamente,
${remetente}`;
}

/** Somente os nomes, separados por "; " — útil para colar no campo Para/Cc. */
export function nomesInline(s: SolicitanteResumo[]): string {
  return s.map((x) => `${x.nome} (${x.total})`).join("; ");
}

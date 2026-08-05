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
  remetente = "Equipe de Gestão Predial — Apont Auto",
  prazoDias = 5,
}: EmailOptions): string {
  const totalOs = solicitantes.reduce((a, b) => a + b.total, 0);
  const totalPessoas = solicitantes.length;
  return `Prezados(as),

Espero que este e-mail os encontre bem.

Gostaria de solicitar a sua colaboração para a finalização de um ciclo importante em nossa operação. Identificamos que existem ${totalOs.toLocaleString("pt-BR")} ordens de serviço sob sua responsabilidade (ou solicitadas por sua área) que já foram concluídas ou aguardam aprovação no sistema.

A sua avaliação é fundamental para assegurarmos a qualidade do atendimento prestado e para que possamos encerrar formalmente estes chamados, mantendo nossos indicadores de performance atualizados e precisos.

Poderia, por gentileza, dedicar alguns minutos para realizar a avaliação dos chamados listados abaixo?

${listaSolicitantes(solicitantes)}

Este procedimento é rápido e pode ser feito diretamente no sistema Prisma. Caso encontre qualquer divergência ou o serviço não tenha atendido plenamente à sua necessidade, por favor, utilize o campo de comentários ou nos responda diretamente para que possamos atuar com prioridade.

Agradecemos antecipadamente pelo apoio e pela parceria de sempre.

Atenciosamente,
${remetente}`;
}

/** Somente os nomes, separados por "; " — útil para colar no campo Para/Cc. */
export function nomesInline(s: SolicitanteResumo[]): string {
  return s.map((x) => `${x.nome} (${x.total})`).join("; ");
}

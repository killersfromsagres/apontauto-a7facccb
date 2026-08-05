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
  return `Avaliação de chamados concluídos — ${total} OS pendentes de validação (${ano})`;
}

export function corpoEmail({
  solicitantes,
  ano,
  remetente = "Equipe de Gestão Predial — Apont Auto",
  prazoDias = 5,
}: EmailOptions): string {
  const totalOs = solicitantes.reduce((a, b) => a + b.total, 0);
  return `Prezado(a),

Espero que este e-mail o(a) encontre bem.

Gostaríamos de solicitar sua gentil colaboração para a finalização de um ciclo importante em nossa operação de Gestão Predial. Identificamos que existem ${totalOs.toLocaleString("pt-BR")} ordens de serviço sob sua responsabilidade (ou solicitadas por sua área) que já foram devidamente concluídas ou aguardam sua aprovação formal no sistema.

Sua avaliação e validação são fundamentais para assegurarmos a excelência no atendimento prestado e para que possamos encerrar formalmente estes processos, garantindo a precisão de nossos indicadores de performance.

Poderia, por gentileza, dedicar um breve momento para realizar a avaliação dos chamados listados abaixo?

${listaSolicitantes(solicitantes)}

Este procedimento é simples e pode ser realizado diretamente no sistema. Caso haja qualquer divergência ou o serviço não tenha atendido plenamente às expectativas, por favor, utilize o campo de comentários ou nos responda diretamente para que possamos atuar com a devida prioridade.

Agradecemos antecipadamente por sua parceria e apoio contínuo.

Atenciosamente,
${remetente}`;
}

/** Somente os nomes, separados por "; " — útil para colar no campo Para/Cc. */
export function nomesInline(s: SolicitanteResumo[]): string {
  return s.map((x) => `${x.nome} (${x.total})`).join("; ");
}

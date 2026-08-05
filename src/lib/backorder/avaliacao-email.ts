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
    .map((x) => `• ${x.nome}: ${x.total} chamado${x.total > 1 ? "s" : ""}`)
    .join("\n");
}

export function assuntoEmail(ano: number | string, total: number): string {
  return `Avaliação de chamados concluídos — Gestão Predial Apont Auto (${ano})`;
}

export function corpoEmail({
  solicitantes,
  ano,
  remetente = "Gestão Predial — Apont Auto",
}: EmailOptions): string {
  const totalOs = solicitantes.reduce((a, b) => a + b.total, 0);
  return `Prezados,

Gostaríamos de solicitar a gentileza de sua colaboração na avaliação dos chamados realizados sob sua solicitação no sistema Prisma.

Identificamos que existem ${totalOs.toLocaleString("pt-BR")} ordens de serviço concluídas que aguardam sua validação final. Sua avaliação é fundamental para que possamos mensurar a qualidade dos serviços prestados e buscar a melhoria contínua de nossos processos.

Anexo a este e-mail, enviamos um relatório detalhado com a soma dos chamados pendentes para cada solicitante.

Poderiam, por favor, acessar o sistema e realizar a avaliação dos itens listados?

Agradecemos imensamente pela parceria e disponibilidade.

Atenciosamente,

${remetente}`;
}

/** Somente os nomes, separados por ", " — útil para colar no campo Para/Cc. */
export function nomesInline(s: SolicitanteResumo[]): string {
  return s.map((x) => x.nome).join(", ");
}

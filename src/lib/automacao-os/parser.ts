// Parser + agendamento para o formato de lote do Prisma4.
// Espelha a lógica de apontamento-prisma4.js para uso no navegador.

export interface LoteEntrada {
  numeroOS: string;
  colaboradores: string[];
  categoria: string;
}

export interface LoteAgendado extends LoteEntrada {
  dataHoraInicio: string;
  dataHoraFim: string;
}

export interface ParseResult {
  itens: LoteEntrada[];
  dataInicio: Date | null;
  erros: string[];
}

const HORA_INICIO = 8;
const HORA_LIMITE = 17;
const TEMPO_TRABALHO_HORAS = 1;
const MIN_INICIO = HORA_INICIO * 60;
const MIN_LIMITE = HORA_LIMITE * 60;

export function parseDataHoraBR(texto: string): Date {
  const m = texto.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2})$/);
  if (!m) throw new Error(`Data/hora "${texto}" fora do formato DD/MM/AAAA HH:mm.`);
  const [, d, mo, y, h, mi] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

export function parseLote(conteudo: string): ParseResult {
  const erros: string[] = [];
  let dataInicio: Date | null = null;
  const itens: LoteEntrada[] = [];

  const idx = conteudo.search(/\[LOTE\]/i);
  const cabecalho = idx === -1 ? conteudo : conteudo.slice(0, idx);
  const corpo = idx === -1 ? "" : conteudo.slice(idx);

  for (const linha of cabecalho.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const sep = linha.indexOf(":");
    if (sep === -1) continue;
    const chave = linha.slice(0, sep).trim().toLowerCase();
    const valor = linha.slice(sep + 1).trim();
    if (chave === "inicio" || chave === "início" || chave === "data_inicio") {
      try {
        dataInicio = parseDataHoraBR(valor);
      } catch (e) {
        erros.push((e as Error).message);
      }
    }
  }

  if (idx === -1) {
    // Formato simples: só "OS: ..."
    const listaOS: string[] = [];
    for (const linha of conteudo.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const lower = linha.toLowerCase();
      if (lower.startsWith("os:")) {
        const osStr = linha.split(":")[1];
        if (osStr) listaOS.push(...osStr.split(",").map((s) => s.trim()).filter(Boolean));
      }
    }
    for (const numeroOS of listaOS) {
      itens.push({ numeroOS, colaboradores: [], categoria: "refrigeracao" });
    }
    return { itens, dataInicio, erros };
  }

  const blocos = corpo.split(/\[LOTE\]/i).map((b) => b.trim()).filter(Boolean);
  for (const bloco of blocos) {
    const linhas = bloco.split("\n").map((l) => l.trim()).filter(Boolean);
    let categoria = "geral";
    let tecnicos: string[] = [];
    let listaOS: string[] = [];
    for (const linha of linhas) {
      const sep = linha.indexOf(":");
      if (sep === -1) continue;
      const chave = linha.slice(0, sep).trim().toLowerCase();
      const valor = linha.slice(sep + 1).trim();
      if (chave === "categoria") categoria = valor.toLowerCase();
      else if (chave === "tecnicos" || chave === "técnicos")
        tecnicos = valor.split(",").map((t) => t.trim()).filter(Boolean);
      else if (chave === "os") listaOS = valor.split(",").map((o) => o.trim()).filter(Boolean);
    }
    for (const numeroOS of listaOS) {
      itens.push({ numeroOS, colaboradores: tecnicos, categoria });
    }
  }

  if (itens.length === 0) erros.push("Nenhuma OS detectada no lote.");
  return { itens, dataInicio, erros };
}

function ehDiaUtil(d: Date) {
  const s = d.getDay();
  return s !== 0 && s !== 6;
}

function proximoDiaUtil(d: Date) {
  const p = new Date(d);
  p.setDate(p.getDate() + 1);
  while (!ehDiaUtil(p)) p.setDate(p.getDate() + 1);
  return p;
}

function fmtData(d: Date) {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function fmtHora(min: number) {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

export function gerarAgendamento(itens: LoteEntrada[], inicio: Date): LoteAgendado[] {
  let dia = ehDiaUtil(inicio) ? new Date(inicio) : proximoDiaUtil(inicio);
  let min = inicio.getHours() * 60 + inicio.getMinutes();
  if (min < MIN_INICIO || min >= MIN_LIMITE) min = MIN_INICIO;

  return itens.map((item) => {
    const dur = TEMPO_TRABALHO_HORAS * 60;
    if (min >= MIN_LIMITE) {
      dia = proximoDiaUtil(dia);
      min = MIN_INICIO;
    }
    const inicioStr = `${fmtData(dia)} ${fmtHora(min)}`;
    const fimStr = `${fmtData(dia)} ${fmtHora(min + dur)}`;
    min += dur;
    return { ...item, dataHoraInicio: inicioStr, dataHoraFim: fimStr };
  });
}

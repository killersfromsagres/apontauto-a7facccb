// Scheduler puro para o painel Prisma.
// Replica a lógica do script Node original: distribui OS em blocos sequenciais
// dentro da janela de trabalho, pulando fins de semana.

export interface ScheduleItem {
  numero_os: string;
  data_hora_inicio: string; // ISO
  data_hora_fim: string; // ISO
}

export interface ScheduleInput {
  dataInicio: Date; // início desejado do lote (com horário)
  horaInicioJornada: string; // "HH:MM"
  horaLimiteJornada: string; // "HH:MM"
  duracaoHoras: number;
  osList: string[];
}

function parseHM(hm: string): { h: number; m: number } {
  const [h, m] = hm.split(":").map((x) => parseInt(x, 10) || 0);
  return { h, m };
}

function setTime(d: Date, hm: string): Date {
  const { h, m } = parseHM(hm);
  const nd = new Date(d);
  nd.setHours(h, m, 0, 0);
  return nd;
}

function isWeekend(d: Date): boolean {
  const w = d.getDay();
  return w === 0 || w === 6;
}

function nextBusinessDay(d: Date): Date {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + 1);
  while (isWeekend(nd)) nd.setDate(nd.getDate() + 1);
  return nd;
}

function ensureBusiness(d: Date): Date {
  let nd = new Date(d);
  while (isWeekend(nd)) {
    nd.setDate(nd.getDate() + 1);
  }
  return nd;
}

export function computeSchedule({
  dataInicio,
  horaInicioJornada,
  horaLimiteJornada,
  duracaoHoras,
  osList,
}: ScheduleInput): ScheduleItem[] {
  const durMin = Math.max(1, Math.round(duracaoHoras * 60));
  const start = parseHM(horaInicioJornada);
  const limit = parseHM(horaLimiteJornada);
  const startMin = start.h * 60 + start.m;
  const limitMin = limit.h * 60 + limit.m;

  // Ponteiro inicial
  let cursor = ensureBusiness(new Date(dataInicio));
  const curMin = cursor.getHours() * 60 + cursor.getMinutes();
  if (curMin < startMin || curMin >= limitMin) {
    cursor = setTime(cursor, horaInicioJornada);
  }

  const out: ScheduleItem[] = [];
  for (const os of osList) {
    // Se essa OS iria estourar o limite, joga pro próximo dia útil
    const cMin = cursor.getHours() * 60 + cursor.getMinutes();
    if (cMin + durMin > limitMin) {
      cursor = setTime(nextBusinessDay(cursor), horaInicioJornada);
    }
    const ini = new Date(cursor);
    const fim = new Date(cursor.getTime() + durMin * 60_000);
    out.push({
      numero_os: os,
      data_hora_inicio: ini.toISOString(),
      data_hora_fim: fim.toISOString(),
    });
    cursor = fim;
  }
  return out;
}

/** Extrai apenas números válidos de um texto solto, deduplica e mantém ordem. */
export function parseOsInput(raw: string): string[] {
  const matches = raw.match(/\d{3,}/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    if (!seen.has(m)) {
      seen.add(m);
      out.push(m);
    }
  }
  return out;
}

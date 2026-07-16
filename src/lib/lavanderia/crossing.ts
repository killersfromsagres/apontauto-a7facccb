import { nextColetaAfter, parseISODate, toISODate, daysBetween } from "./schedule";

export type PecaStatus = "em_higienizacao" | "atrasada" | "retornada";

export interface EventoLite {
  codigo: string;
  tipo: "saida" | "entrada";
  data: string;
}

export interface PecaState {
  codigo: string;
  ultimaSaida: string | null;
  ultimaEntrada: string | null;
  previstoRetorno: string | null; // ISO
  diasAtraso: number;
  status: PecaStatus;
  giro: number; // pares saida→entrada completos
}

/** Cruza eventos por peça e retorna o estado atual + giro. */
export function computePecaStates(events: EventoLite[]): Map<string, PecaState> {
  const byCodigo = new Map<string, EventoLite[]>();
  for (const e of events) {
    const arr = byCodigo.get(e.codigo) ?? [];
    arr.push(e);
    byCodigo.set(e.codigo, arr);
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const out = new Map<string, PecaState>();
  for (const [codigo, arr] of byCodigo) {
    arr.sort((a, b) => a.data.localeCompare(b.data));

    let giro = 0;
    let awaitingReturn = false;
    let ultimaSaida: string | null = null;
    let ultimaEntrada: string | null = null;

    for (const e of arr) {
      if (e.tipo === "saida") {
        // Só conta uma nova saída se não estivermos aguardando retorno
        // (evita duplicatas na saída sequencial sem retorno intermediário).
        ultimaSaida = e.data;
        awaitingReturn = true;
      } else {
        // entrada
        ultimaEntrada = e.data;
        if (awaitingReturn) {
          giro += 1;
          awaitingReturn = false;
        }
      }
    }

    let status: PecaStatus = "retornada";
    let previstoRetorno: string | null = null;
    let diasAtraso = 0;

    if (awaitingReturn && ultimaSaida) {
      const dSaida = parseISODate(ultimaSaida);
      const dPrev = nextColetaAfter(dSaida);
      previstoRetorno = toISODate(dPrev);
      if (dPrev.getTime() < today.getTime()) {
        status = "atrasada";
        diasAtraso = daysBetween(dPrev, today);
      } else {
        status = "em_higienizacao";
      }
    }

    out.set(codigo, {
      codigo,
      ultimaSaida,
      ultimaEntrada,
      previstoRetorno,
      diasAtraso,
      status,
      giro,
    });
  }
  return out;
}

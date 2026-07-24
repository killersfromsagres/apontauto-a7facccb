// Sistema de manipulação de Data/Hora do navegador.
// Substitui window.Date por uma subclasse que aplica um offset entre o "agora real"
// no momento da ativação e a data/hora customizada escolhida pelo usuário.
// O relógio continua correndo normalmente a partir do ponto customizado.

const STORAGE_KEY = "apontauto:time-warp";

type WarpState = {
  enabled: boolean;
  // ms: (customBase - realBaseAtActivation). Somado a Date.now() real dá o "agora falso".
  offsetMs: number;
  // ISO da data customizada escolhida (para exibição/edição).
  customBaseIso: string | null;
  activatedAt: number | null;
};

const DEFAULT_STATE: WarpState = {
  enabled: false,
  offsetMs: 0,
  customBaseIso: null,
  activatedAt: null,
};

// Guarda o Date original UMA vez, antes de qualquer substituição.
const RealDate: DateConstructor =
  typeof window !== "undefined" ? window.Date : (globalThis as any).Date;
const realNow = () => RealDate.now();

let currentState: WarpState = { ...DEFAULT_STATE };
const listeners = new Set<(s: WarpState) => void>();

function readStorage(): WarpState {
  if (typeof window === "undefined") return { ...DEFAULT_STATE };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    const parsed = JSON.parse(raw) as Partial<WarpState>;
    return {
      enabled: !!parsed.enabled,
      offsetMs: Number(parsed.offsetMs ?? 0) || 0,
      customBaseIso: parsed.customBaseIso ?? null,
      activatedAt: parsed.activatedAt ?? null,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeStorage(s: WarpState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

function buildPatchedDate(getOffset: () => number): DateConstructor {
  // Subclasse de Date que injeta o offset quando chamada sem argumentos.
  class PatchedDate extends RealDate {
    constructor(...args: any[]) {
      if (args.length === 0) {
        super(realNow() + getOffset());
      } else {
        // @ts-expect-error — repasse variádico
        super(...args);
      }
    }
    static now(): number {
      return realNow() + getOffset();
    }
    static parse(s: string): number {
      return RealDate.parse(s);
    }
    static UTC(...args: any[]): number {
      // @ts-expect-error — repasse variádico
      return RealDate.UTC(...args);
    }
  }
  // Compatibilidade: chamada sem `new` retorna string, como Date nativo.
  const Wrapper: any = new Proxy(PatchedDate, {
    apply() {
      return new PatchedDate().toString();
    },
  });
  return Wrapper as DateConstructor;
}

let patched = false;
function ensurePatched() {
  if (patched || typeof window === "undefined") return;
  const Patched = buildPatchedDate(() => (currentState.enabled ? currentState.offsetMs : 0));
  // Substitui em window e globalThis. O Date "real" já foi capturado.
  (window as any).Date = Patched;
  (globalThis as any).Date = Patched;
  patched = true;
}

function notify() {
  for (const fn of listeners) fn(currentState);
}

export function getTimeWarpState(): WarpState {
  return { ...currentState };
}

export function subscribeTimeWarp(fn: (s: WarpState) => void): () => void {
  listeners.add(fn);
  fn(currentState);
  return () => listeners.delete(fn);
}

export function enableTimeWarp(customDate: Date): WarpState {
  ensurePatched();
  const real = realNow();
  const custom = customDate.getTime();
  currentState = {
    enabled: true,
    offsetMs: custom - real,
    customBaseIso: new RealDate(custom).toISOString(),
    activatedAt: real,
  };
  writeStorage(currentState);
  notify();
  return { ...currentState };
}

export function disableTimeWarp(): WarpState {
  currentState = { ...DEFAULT_STATE };
  writeStorage(currentState);
  notify();
  return { ...currentState };
}

export function getRealNow(): number {
  return realNow();
}

export function getVirtualNow(): number {
  return realNow() + (currentState.enabled ? currentState.offsetMs : 0);
}

// Auto-init: restaura estado salvo e aplica patch antes do resto do app rodar.
if (typeof window !== "undefined") {
  currentState = readStorage();
  ensurePatched();
}

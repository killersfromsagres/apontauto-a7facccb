/**
 * Ponte para o worker de imagem. Sempre degrada com segurança: se o
 * navegador não tiver Worker/OffscreenCanvas, o chamador cai no caminho
 * síncrono em canvas (main thread).
 */

import type { ImageWorkerRequest, ImageWorkerResponse } from "./image-worker";

export interface ProcessamentoOffThread {
  blob: Blob;
  thumbBlob: Blob;
  hash: string;
  largura: number;
  altura: number;
  mime: string;
}

let worker: Worker | null = null;
let indisponivel = false;

export function suportaOffThread(): boolean {
  return (
    !indisponivel &&
    typeof Worker !== "undefined" &&
    typeof OffscreenCanvas !== "undefined" &&
    typeof createImageBitmap !== "undefined"
  );
}

function obterWorker(): Worker | null {
  if (!suportaOffThread()) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL("./image-worker.ts", import.meta.url), { type: "module" });
      worker.addEventListener("error", () => {
        indisponivel = true;
        worker = null;
      });
    } catch {
      indisponivel = true;
      return null;
    }
  }
  return worker;
}

export function blobParaDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => resolve("");
    reader.readAsDataURL(blob);
  });
}

/** Retorna null quando o worker não está disponível ou falhou. */
export function processarImagemOffThread(
  file: Blob,
  opts: { maxDim: number; quality: number; thumbDim: number; mime: string },
  timeoutMs = 15_000,
): Promise<ProcessamentoOffThread | null> {
  const w = obterWorker();
  if (!w) return Promise.resolve(null);

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return new Promise((resolve) => {
    let finalizado = false;
    const encerrar = (valor: ProcessamentoOffThread | null) => {
      if (finalizado) return;
      finalizado = true;
      w.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      resolve(valor);
    };

    const onMessage = (ev: MessageEvent<ImageWorkerResponse>) => {
      const data = ev.data;
      if (!data || data.id !== id) return;
      if (!data.ok || !data.blob || !data.thumbBlob || !data.hash) {
        encerrar(null);
        return;
      }
      encerrar({
        blob: data.blob,
        thumbBlob: data.thumbBlob,
        hash: data.hash,
        largura: data.largura ?? 0,
        altura: data.altura ?? 0,
        mime: data.mime ?? opts.mime,
      });
    };

    const timer = window.setTimeout(() => encerrar(null), timeoutMs);
    w.addEventListener("message", onMessage);
    const req: ImageWorkerRequest = { id, file, ...opts };
    try {
      w.postMessage(req);
    } catch {
      encerrar(null);
    }
  });
}

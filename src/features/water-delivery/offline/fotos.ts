// Pipeline de evidências do módulo Água (item 10).
//
// Fluxo: comprimir/redimensionar → gerar miniatura → calcular hash →
// enviar pelo proxy autenticado `/api/imgbb-upload` → gravar SOMENTE
// metadados em `agua_fotos`.
//
// Se o ImgBB falhar, a foto fica na fila local (IndexedDB) com status
// "aguardando envio", com retentativa automática em backoff e retry manual.
// O fallback para Supabase Storage é EMERGENCIAL e só roda quando um
// administrador habilita a chave `aguaStorageEmergencial` nas configurações.

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  existeHashNaFila,
  listarFila,
  notificarFila,
  obterItem,
  removerItem,
  salvarItem,
  type FotoFilaItem,
  type FotoMetadados,
} from "@/features/water-delivery/offline/fotos-db";

export type { FotoFilaItem, FotoMetadados } from "@/features/water-delivery/offline/fotos-db";

const db = supabase as unknown as { from: (t: string) => any };

/** Lado maior padrão (configurável entre 1280 e 1600 px). */
export const MAX_DIM_PADRAO = 1600;
const THUMB_DIM = 320;
const QUALIDADE = 0.8;
const MAX_TENTATIVAS_AUTO = 6;

export interface FotoPreparada {
  blob: Blob;
  thumb: string;
  hash: string;
  mime: string;
  largura: number;
  altura: number;
  sizeBytes: number;
  capturadaEm: string;
}

function suportaWebp(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

async function paraBlob(canvas: HTMLCanvasElement, mime: string, q: number): Promise<Blob | null> {
  return new Promise((res) => canvas.toBlob(res, mime, q));
}

export async function hashBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Redimensiona, re-codifica (o re-encode remove EXIF), gera miniatura e
 * calcula o hash. Nunca lança: se o navegador não suportar canvas, envia o
 * original com metadados mínimos.
 */
export async function prepararFoto(
  file: Blob,
  opcoes: { maxDim?: number; quality?: number } = {},
): Promise<FotoPreparada> {
  // Item 22: qualidade e lado máximo vêm das configurações administrativas.
  const admin = getSettings().aguaAdmin?.evidencias;
  const maxDim = opcoes.maxDim ?? admin?.ladoMaximoPx ?? MAX_DIM_PADRAO;
  const quality = opcoes.quality ?? admin?.qualidadeImagem ?? QUALIDADE;

  const capturadaEm = new Date().toISOString();
  const fallback = async (): Promise<FotoPreparada> => ({
    blob: file,
    thumb: "",
    hash: await hashBlob(file),
    mime: file.type || "image/jpeg",
    largura: 0,
    altura: 0,
    sizeBytes: file.size,
    capturadaEm,
  });

  if (typeof createImageBitmap === "undefined" || typeof document === "undefined") {
    return fallback();
  }

  try {
    const bmp = await createImageBitmap(file);
    const alvo = Math.min(1600, Math.max(1280, maxDim));
    const ratio = Math.min(1, alvo / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * ratio));
    const h = Math.max(1, Math.round(bmp.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bmp.close?.();
      return fallback();
    }
    ctx.drawImage(bmp, 0, 0, w, h);

    const mime = suportaWebp() ? "image/webp" : "image/jpeg";
    const blob = (await paraBlob(canvas, mime, quality)) ?? file;

    // Miniatura leve para exibição offline e no histórico.
    const tRatio = Math.min(1, THUMB_DIM / Math.max(w, h));
    const tw = Math.max(1, Math.round(w * tRatio));
    const th = Math.max(1, Math.round(h * tRatio));
    const tCanvas = document.createElement("canvas");
    tCanvas.width = tw;
    tCanvas.height = th;
    tCanvas.getContext("2d")?.drawImage(canvas, 0, 0, tw, th);
    const thumb = tCanvas.toDataURL("image/jpeg", 0.6);

    bmp.close?.();

    return {
      blob,
      thumb,
      hash: await hashBlob(blob),
      mime: blob.type || mime,
      largura: w,
      altura: h,
      sizeBytes: blob.size,
      capturadaEm,
    };
  } catch {
    return fallback();
  }
}

/* ------------------------------------------------------------------ */
/* Envio                                                               */
/* ------------------------------------------------------------------ */

async function enviarParaImgbb(item: FotoFilaItem): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente para enviar as evidências.");

  const form = new FormData();
  form.append("image", item.blob, item.nomeArquivo);
  form.append("name", item.nomeArquivo.replace(/\.[^.]+$/, ""));
  form.append("module", "abastecimento-agua");
  form.append("entity_type", item.meta.filtroSolicitacaoId ? "agua_filtro" : "agua_visita");
  const entityId = item.meta.visitaId ?? item.meta.filtroSolicitacaoId ?? item.meta.pontoId ?? "";
  if (entityId) form.append("entity_id", entityId);

  const res = await fetch("/api/imgbb-upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !json?.url) {
    throw new Error(json?.error ?? `Falha no envio da imagem (${res.status})`);
  }
  // `delete_url` nunca é exposto ao operador (10.2).
  return json.url as string;
}

/** Fallback emergencial — habilitado por administrador em app_settings. */
export async function storageEmergencialAtivo(): Promise<boolean> {
  try {
    const { data } = await supabase.from("app_settings").select("data").limit(1).maybeSingle();
    return Boolean((data?.data as any)?.aguaStorageEmergencial);
  } catch {
    return false;
  }
}

async function enviarParaStorage(item: FotoFilaItem): Promise<string> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess.session?.user?.id;
  if (!uid) throw new Error("Sem sessão para o envio emergencial.");
  const path = `${uid}/${Date.now()}-${item.nomeArquivo}`;
  const { error } = await supabase.storage
    .from("agua-fotos")
    .upload(path, item.blob, { contentType: item.mime, upsert: true });
  if (error) throw error;
  const { data } = await supabase.storage
    .from("agua-fotos")
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
  if (!data?.signedUrl) throw new Error("Falha ao gerar link do armazenamento emergencial.");
  return data.signedUrl;
}

async function registrarMetadados(item: FotoFilaItem, url: string, origem: string): Promise<void> {
  const { data: sess } = await supabase.auth.getSession();
  const payload = {
    rota_id: item.meta.rotaId ?? null,
    visita_id: item.meta.visitaId ?? null,
    ponto_id: item.meta.pontoId ?? null,
    filtro_solicitacao_id: item.meta.filtroSolicitacaoId ?? null,
    tipo: item.meta.tipo ?? "entrega",
    image_url: url,
    thumbnail_url: item.thumb || null,
    image_hash: item.hash,
    mime_type: item.mime,
    largura: item.largura || null,
    altura: item.altura || null,
    size_bytes: item.sizeBytes,
    capturada_em: item.capturadaEm,
    enviada_por: sess.session?.user?.id,
    origem,
    metadados: {
      colaborador: item.meta.colaborador ?? null,
      veiculo: item.meta.veiculo ?? null,
      predio: item.meta.predio ?? null,
      andar: item.meta.andar ?? null,
      espaco: item.meta.espaco ?? null,
      data: item.meta.data ?? null,
    },
  };
  const { error } = await db.from("agua_fotos").insert(payload);
  // Duplicidade (mesma visita + mesmo hash) não é erro: a evidência já existe.
  if (error && !String(error.message ?? "").includes("duplicate key")) throw error;
}

/** Miniatura em dataURL não é gravada em blob; usada só como preview local. */
function backoffMs(tentativas: number): number {
  return Math.min(5 * 60_000, 5_000 * 2 ** Math.max(0, tentativas - 1));
}

export interface EnfileirarResultado {
  id: string;
  hash: string;
  thumb: string;
  /** URL pública quando o envio imediato deu certo. */
  url: string | null;
  duplicada: boolean;
}

/**
 * Prepara e tenta enviar imediatamente. Se falhar, a foto permanece na fila
 * local com status "aguardando envio" — nunca é descartada.
 */
export async function enviarEvidencia(
  file: Blob,
  meta: FotoMetadados,
  opts: { maxDim?: number; nome?: string } = {},
): Promise<EnfileirarResultado> {
  const preparada = await prepararFoto(file, { maxDim: opts.maxDim });

  if (await existeHashNaFila(preparada.hash)) {
    return { id: "", hash: preparada.hash, thumb: preparada.thumb, url: null, duplicada: true };
  }
  if (meta.visitaId) {
    const { data: jaExiste } = await db
      .from("agua_fotos")
      .select("id, image_url")
      .eq("visita_id", meta.visitaId)
      .eq("image_hash", preparada.hash)
      .maybeSingle();
    if (jaExiste?.image_url) {
      return {
        id: jaExiste.id,
        hash: preparada.hash,
        thumb: preparada.thumb,
        url: jaExiste.image_url,
        duplicada: true,
      };
    }
  }

  const ext = preparada.mime.includes("webp") ? "webp" : "jpg";
  const item: FotoFilaItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    blob: preparada.blob,
    thumb: preparada.thumb,
    hash: preparada.hash,
    mime: preparada.mime,
    largura: preparada.largura,
    altura: preparada.altura,
    sizeBytes: preparada.sizeBytes,
    capturadaEm: preparada.capturadaEm,
    nomeArquivo: `${opts.nome ?? "agua"}-${preparada.hash.slice(0, 10)}.${ext}`,
    meta,
    status: "pendente",
    tentativas: 0,
    proximaTentativaEm: Date.now(),
    criadoEm: Date.now(),
  };
  await salvarItem(item);

  const url = await tentarEnviar(item.id);
  return { id: item.id, hash: item.hash, thumb: item.thumb, url, duplicada: false };
}

/** Tenta enviar um item específico. Retorna a URL pública ou null. */
export async function tentarEnviar(id: string): Promise<string | null> {
  const item = await obterItem(id);
  if (!item || item.status === "enviando") return item?.url ?? null;

  await salvarItem({ ...item, status: "enviando" });
  try {
    let url: string;
    let origem = "imgbb";
    try {
      url = await enviarParaImgbb(item);
    } catch (err) {
      if (await storageEmergencialAtivo()) {
        url = await enviarParaStorage(item);
        origem = "storage-emergencial";
      } else {
        throw err;
      }
    }
    await registrarMetadados(item, url, origem);
    // Confirmação recebida: o binário local pode ser descartado (10.3).
    await removerItem(id);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("agua:foto-enviada", { detail: { id, url, meta: item.meta } }));
    }
    return url;
  } catch (e) {
    const tentativas = item.tentativas + 1;
    await salvarItem({
      ...item,
      status: "erro",
      tentativas,
      proximaTentativaEm: Date.now() + backoffMs(tentativas),
      ultimoErro: (e as Error)?.message ?? "Falha no envio",
    });
    return null;
  }
}

/** Processa a fila respeitando o backoff. Chamado ao voltar a rede e a cada 30s. */
export async function processarFilaFotos(force = false): Promise<{ enviadas: number; restantes: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { enviadas: 0, restantes: (await listarFila()).length };
  }
  const fila = await listarFila();
  let enviadas = 0;
  for (const item of fila) {
    if (!force && item.proximaTentativaEm > Date.now()) continue;
    if (!force && item.tentativas >= MAX_TENTATIVAS_AUTO) continue; // aguarda retry manual
    const url = await tentarEnviar(item.id);
    if (url) enviadas += 1;
  }
  const restantes = (await listarFila()).length;
  notificarFila();
  return { enviadas, restantes };
}

/* ------------------------------------------------------------------ */
/* Hook de UI                                                          */
/* ------------------------------------------------------------------ */

export function useFilaFotosAgua() {
  const [itens, setItens] = useState<FotoFilaItem[]>([]);
  const [processando, setProcessando] = useState(false);

  const atualizar = useCallback(() => {
    void listarFila().then(setItens).catch(() => setItens([]));
  }, []);

  const reenviar = useCallback(
    async (id?: string) => {
      setProcessando(true);
      try {
        if (id) await tentarEnviar(id);
        else await processarFilaFotos(true);
      } finally {
        setProcessando(false);
        atualizar();
      }
    },
    [atualizar],
  );

  useEffect(() => {
    atualizar();
    void processarFilaFotos();

    const onOnline = () => void processarFilaFotos().then(atualizar);
    window.addEventListener("online", onOnline);
    window.addEventListener("agua:fotos", atualizar);
    const timer = window.setInterval(() => void processarFilaFotos().then(atualizar), 30_000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("agua:fotos", atualizar);
      window.clearInterval(timer);
    };
  }, [atualizar]);

  return { itens, pendentes: itens.length, processando, reenviar, atualizar };
}

/* ------------------------------------------------------------------ */
/* Histórico (10.4)                                                    */
/* ------------------------------------------------------------------ */

export interface FotoHistorico {
  id: string;
  rota_id: string | null;
  visita_id: string | null;
  ponto_id: string | null;
  filtro_solicitacao_id: string | null;
  tipo: string;
  image_url: string;
  thumbnail_url: string | null;
  image_hash: string | null;
  capturada_em: string | null;
  enviada_em: string;
  enviada_por: string | null;
  origem: string;
  metadados: Record<string, unknown>;
}

const FOTO_COLS =
  "id, rota_id, visita_id, ponto_id, filtro_solicitacao_id, tipo, image_url, thumbnail_url, image_hash, capturada_em, enviada_em, enviada_por, origem, metadados";

export async function listFotos(de: string, ate: string): Promise<FotoHistorico[]> {
  const { data, error } = await db
    .from("agua_fotos")
    .select(FOTO_COLS)
    .gte("enviada_em", `${de}T00:00:00`)
    .lte("enviada_em", `${ate}T23:59:59`)
    .order("enviada_em", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as FotoHistorico[];
}

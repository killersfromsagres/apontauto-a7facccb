// Execução offline e sincronização do módulo Água (item 16).
//
// Reaproveita o núcleo de outbox do projeto (`@/lib/offline/outbox-core`):
// backoff exponencial, limite de tentativas, dead-letter e idempotência.
//
// Garantias implementadas aqui:
// - cada ação recebe uma idempotency key persistida no servidor
//   (`agua_visitas.offline_idempotency_key`) — reenviar não duplica entrega;
// - o servidor só recebe "concluída" depois que a evidência obrigatória subiu:
//   enquanto a foto está na fila do IndexedDB, a ação fica aguardando;
// - conflito é resolvido por versão (`atualizado_em`) + eventos: se o servidor
//   mudou depois da base local, a ação vai para a dead-letter para revisão;
// - o cache é sanitizado (sem CPF, documentos, tokens ou segredos).

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Visita, VisitaStatus } from "@/lib/agua/api";
import { listarFila } from "@/lib/agua/fotos-db";
import {
  EVENTO_FILA,
  aguaOutboxStore,
  cacheGet,
  cacheSet,
  deviceId,
  notificarFila,
  outboxAll,
  outboxPut,
  outboxUpdate,
} from "@/lib/agua/outbox-db";
import {
  DEFAULT_MAX_ATTEMPTS,
  drainOutbox,
  retryDeadLetters,
  type OutboxRecord,
  type SyncReport,
} from "@/lib/offline/outbox-core";

const db = supabase as unknown as { from: (t: string) => any };

const CACHE_PREFIX = "agua:rota:";
const AGUARDA_EVIDENCIA_MS = 15_000;

/** Status que só podem chegar ao servidor com evidência confirmada. */
export const STATUS_EXIGE_EVIDENCIA: VisitaStatus[] = ["concluida", "parcial"];

/** Chaves nunca gravadas no cache local (item 16.1). */
const CHAVES_SENSIVEIS =
  /(cpf|cnpj|rg|documento|senha|password|token|secret|segredo|api[_-]?key|authorization|credential)/i;

export type AguaAcaoKind = "visita.andamento" | "visita.entrega" | "visita.retificacao";

export interface AguaAcaoPayload {
  visitaId: string;
  data: string;
  patch: Record<string, unknown>;
  /** Versão local usada como base do patch (agua_visitas.atualizado_em). */
  baseAtualizadoEm?: string | null;
  /** Linhas de retificação a inserir junto (imutabilidade do histórico). */
  retificacoes?: Record<string, unknown>[];
  motivo?: string | null;
  deviceId: string;
  criadoEm: string;
}

export type AguaPendente = OutboxRecord<AguaAcaoPayload>;

/* ------------------------------------------------------------------ */
/* Cache dos cards                                                     */
/* ------------------------------------------------------------------ */

/** Remove campos sensíveis antes de qualquer gravação local. */
export function sanitizarParaCache<T>(valor: T): T {
  if (Array.isArray(valor)) return valor.map((v) => sanitizarParaCache(v)) as unknown as T;
  if (valor && typeof valor === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
      if (CHAVES_SENSIVEIS.test(k)) continue;
      out[k] = sanitizarParaCache(v);
    }
    return out as T;
  }
  return valor;
}

export function salvarCacheRota(data: string, visitas: Visita[]): void {
  if (typeof window === "undefined") return;
  const limpas = sanitizarParaCache(visitas);
  try {
    localStorage.setItem(`${CACHE_PREFIX}${data}`, JSON.stringify(limpas));
  } catch {
    /* cota cheia — cache é best-effort */
  }
  void cacheSet(`${CACHE_PREFIX}${data}`, limpas).catch(() => undefined);
}

export function lerCacheRota(data: string): Visita[] | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(`${CACHE_PREFIX}${data}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Visita[];
  } catch {
    return null;
  }
}

/** Leitura de contingência: o localStorage pode ter sido limpo pelo sistema. */
export async function lerCacheRotaAsync(data: string): Promise<Visita[] | null> {
  return lerCacheRota(data) ?? (await cacheGet<Visita[]>(`${CACHE_PREFIX}${data}`).catch(() => null));
}

function aplicarNoCache(data: string, visitaId: string, patch: Record<string, unknown>): void {
  const cache = lerCacheRota(data);
  if (!cache) return;
  salvarCacheRota(
    data,
    cache.map((v) => (v.id === visitaId ? ({ ...v, ...patch } as Visita) : v)),
  );
}

/* ------------------------------------------------------------------ */
/* Fila                                                                */
/* ------------------------------------------------------------------ */

function novoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `acao-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export async function lerFila(): Promise<AguaPendente[]> {
  return outboxAll<AguaAcaoPayload>().catch(() => []);
}

/**
 * Enfileira uma ação de campo e já aplica o patch no cache (conclusão local).
 * O `id` do registro é a idempotency key enviada ao servidor.
 */
export async function enfileirar(
  kind: AguaAcaoKind,
  entrada: Omit<AguaAcaoPayload, "deviceId" | "criadoEm">,
): Promise<string> {
  const id = novoId();
  const payload: AguaAcaoPayload = {
    ...entrada,
    patch: sanitizarParaCache(entrada.patch),
    deviceId: deviceId(),
    criadoEm: new Date().toISOString(),
  };
  await outboxPut<AguaAcaoPayload>({ id, kind, payload, createdAt: Date.now(), attempts: 0 });
  aplicarNoCache(entrada.data, entrada.visitaId, { ...entrada.patch, _pendente: true });
  return id;
}

/** Uma parada tem evidência pendente enquanto houver foto na fila local. */
async function evidenciaPendente(visitaId: string): Promise<boolean> {
  try {
    const fila = await listarFila();
    return fila.some((f) => f.meta?.visitaId === visitaId && f.status !== "enviada" && !f.url);
  } catch {
    return false;
  }
}

function exigeEvidencia(payload: AguaAcaoPayload): boolean {
  const status = payload.patch.status as VisitaStatus | undefined;
  return !!status && STATUS_EXIGE_EVIDENCIA.includes(status);
}

class ConflitoVersao extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConflitoVersao";
  }
}

async function enviarAcao(record: AguaPendente): Promise<void> {
  const { payload } = record;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id ?? null;

  const { data: atual, error: readErr } = await db
    .from("agua_visitas")
    .select("id, status, atualizado_em, offline_idempotency_key")
    .eq("id", payload.visitaId)
    .maybeSingle();
  if (readErr) throw readErr;
  if (!atual) throw new ConflitoVersao("Parada não existe mais no servidor.");

  // Idempotência: a mesma ação já foi aplicada numa tentativa anterior.
  if (atual.offline_idempotency_key === record.id) return;

  // Conflito por versão: alguém finalizou/alterou a parada depois da base local.
  if (
    payload.baseAtualizadoEm &&
    atual.atualizado_em &&
    new Date(atual.atualizado_em).getTime() > new Date(payload.baseAtualizadoEm).getTime() &&
    record.kind !== "visita.retificacao"
  ) {
    throw new ConflitoVersao(
      "A parada foi alterada no servidor depois do registro feito no aparelho. Revise antes de reenviar.",
    );
  }

  if (payload.retificacoes?.length) {
    const { error: retErr } = await db
      .from("agua_retificacoes")
      .insert(payload.retificacoes.map((r) => ({ ...r, usuario_id: uid })));
    if (retErr) throw retErr;
  }

  const { error } = await db
    .from("agua_visitas")
    .update({
      ...payload.patch,
      offline_idempotency_key: record.id,
      executado_por: uid,
      executado_em: new Date().toISOString(),
    })
    .eq("id", payload.visitaId);
  if (error) throw error;

  const { error: evErr } = await db.from("agua_visita_eventos").insert({
    visita_id: payload.visitaId,
    tipo: payload.patch.status ? `status:${payload.patch.status}` : "ajuste",
    dados: { ...payload.patch, origem: "offline", device: payload.deviceId, acao: record.id },
    usuario_id: uid,
  });
  if (evErr) throw evErr;
}

/** Processa a fila com backoff, dead-letter e trava por evidência obrigatória. */
export async function sincronizarFila(): Promise<SyncReport> {
  const store = aguaOutboxStore<AguaAcaoPayload>();
  const agora = Date.now();

  // Nada é marcado como concluído no servidor antes da foto obrigatória subir.
  for (const item of await store.all()) {
    if (item.dead || !exigeEvidencia(item.payload)) continue;
    if (await evidenciaPendente(item.payload.visitaId)) {
      await store.update(item.id, { nextAttemptAt: agora + AGUARDA_EVIDENCIA_MS });
    }
  }

  const report = await drainOutbox<AguaAcaoPayload>(store, enviarAcao);

  // Conflito de versão não se resolve com retry: vai direto para revisão.
  for (const erro of report.errors) {
    if (/alterada no servidor|não existe mais/i.test(erro.message) && !erro.dead) {
      await outboxUpdate(erro.id, { dead: true, attempts: DEFAULT_MAX_ATTEMPTS });
      report.deadLetters += 1;
      report.remaining = Math.max(0, report.remaining - 1);
    }
  }

  // Item 17 — falha definitiva de envio vira aviso na central.
  if (report.deadLetters > 0) {
    const { notificarAgua } = await import("@/lib/agua/notificacoes");
    await notificarAgua({
      evento: "falha_upload",
      corpo: `${report.deadLetters} registro(s) de água não foram sincronizados e aguardam revisão em Configurações → Fila de sincronização.`,
      deepLink: "/abastecimento/agua/configuracoes",
      chave: `falha_upload:${new Date().toISOString().slice(0, 13)}`,
      metadata: { dead_letters: report.deadLetters },
    });
  }

  notificarFila();
  return report;
}


/** Reabilita os itens da dead-letter (botão “tentar novamente”). */
export async function tentarNovamenteFalhas(): Promise<number> {
  const total = await retryDeadLetters(aguaOutboxStore<AguaAcaoPayload>());
  notificarFila();
  return total;
}

/* ------------------------------------------------------------------ */
/* Hook de UI                                                          */
/* ------------------------------------------------------------------ */

export function useAguaSync() {
  const [itens, setItens] = useState<AguaPendente[]>([]);
  const [online, setOnline] = useState(true);
  const [sincronizando, setSincronizando] = useState(false);

  const atualizar = useCallback(async () => {
    setItens(await lerFila());
  }, []);

  const sincronizar = useCallback(async () => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const fila = await lerFila();
    if (!fila.some((i) => !i.dead)) return;
    setSincronizando(true);
    try {
      await sincronizarFila();
    } finally {
      setSincronizando(false);
      await atualizar();
    }
  }, [atualizar]);

  const tentarNovamente = useCallback(async () => {
    await tentarNovamenteFalhas();
    await atualizar();
    await sincronizar();
  }, [atualizar, sincronizar]);

  useEffect(() => {
    setOnline(navigator.onLine);
    void atualizar();
    void sincronizar();

    const onOnline = () => {
      setOnline(true);
      void sincronizar();
    };
    const onOffline = () => setOnline(false);
    const onFila = () => void atualizar();

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(EVENTO_FILA, onFila);
    window.addEventListener("agua:fotos", onFila);
    const timer = window.setInterval(() => void sincronizar(), 30_000);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(EVENTO_FILA, onFila);
      window.removeEventListener("agua:fotos", onFila);
      window.clearInterval(timer);
    };
  }, [atualizar, sincronizar]);

  const falhas = itens.filter((i) => i.dead);

  return {
    itens,
    pendentes: itens.filter((i) => !i.dead).length,
    falhas: falhas.length,
    listaFalhas: falhas,
    online,
    sincronizando,
    sincronizar,
    tentarNovamente,
  };
}

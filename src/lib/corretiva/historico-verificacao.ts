/**
 * Conferência de OS de corretiva no histórico de execução.
 *
 * Fonte de verdade: a tabela `public.corretiva_historico_verificacoes`.
 * O `localStorage` permanece apenas como (a) resíduo legado a ser migrado e
 * (b) cache de leitura para exibir algo enquanto a rede não responde. Nunca
 * como fonte principal quando o banco está acessível.
 */
import { supabase } from "@/integrations/supabase/client";

const STORAGE_PREFIX = "apont-auto:corretiva-historico:verificadas:v1";

type VerificationStorage = Pick<Storage, "getItem" | "setItem">;

/** Metadados de uma conferência persistida. */
export type VerificacaoRegistro = {
  osId: string;
  numeroOs: string;
  verificadoEm: string;
  verificadoPor: string | null;
  verificadoPorNome: string | null;
};

/** Mapa `os_id -> registro`, consumido diretamente pela UI. */
export type VerificacaoMap = ReadonlyMap<string, VerificacaoRegistro>;

/* ------------------------------------------------------------------ *
 * Funções puras — cache local legado                                  *
 * ------------------------------------------------------------------ */

function resolveStorage(storage?: VerificationStorage): VerificationStorage | null {
  if (storage) return storage;
  if (typeof window === "undefined") return null;

  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function verifiedOsStorageKey(scope: string): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(scope)}`;
}

export function loadVerifiedOsIds(scope: string, storage?: VerificationStorage): Set<string> {
  const target = resolveStorage(storage);
  if (!target) return new Set();

  try {
    const raw = target.getItem(verifiedOsStorageKey(scope));
    if (!raw) return new Set();

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();

    return new Set(
      parsed.filter((id): id is string => typeof id === "string" && id.length > 0),
    );
  } catch {
    return new Set();
  }
}

export function saveVerifiedOsIds(
  scope: string,
  ids: ReadonlySet<string>,
  storage?: VerificationStorage,
): boolean {
  const target = resolveStorage(storage);
  if (!target) return false;

  try {
    target.setItem(verifiedOsStorageKey(scope), JSON.stringify([...ids].sort()));
    return true;
  } catch {
    return false;
  }
}

export function withVerifiedOs(
  ids: ReadonlySet<string>,
  osId: string,
  verified: boolean,
): Set<string> {
  const next = new Set(ids);
  if (verified) next.add(osId);
  else next.delete(osId);
  return next;
}

/* ------------------------------------------------------------------ *
 * Funções puras — manipulação do mapa de verificações                 *
 * ------------------------------------------------------------------ */

/** Aplica/remove um registro sem mutar o mapa original. */
export function withVerificacao(
  current: VerificacaoMap,
  osId: string,
  registro: VerificacaoRegistro | null,
): VerificacaoMap {
  const next = new Map(current);
  if (registro) next.set(osId, registro);
  else next.delete(osId);
  return next;
}

/** IDs que ainda não foram conferidos — base da exportação. */
export function pendingOsIds(
  osIds: readonly string[],
  verificacoes: VerificacaoMap,
): string[] {
  return osIds.filter((id) => !verificacoes.has(id));
}

/** IDs presentes no cache legado que ainda não existem no banco. */
export function legacyIdsToMigrate(
  legacy: ReadonlySet<string>,
  verificacoes: VerificacaoMap,
): string[] {
  return [...legacy].filter((id) => id.length > 0 && !verificacoes.has(id));
}

/** Rótulo curto de autoria para o card verificado. */
export function verificacaoAutorLabel(registro: VerificacaoRegistro): string | null {
  const nome = registro.verificadoPorNome?.trim();
  return nome ? `por ${nome}` : null;
}

/* ------------------------------------------------------------------ *
 * Acesso ao banco                                                     *
 * ------------------------------------------------------------------ */

type VerificacaoRow = {
  os_id: string;
  numero_os: string;
  verificado_em: string;
  verificado_por: string | null;
};

function toRegistro(row: VerificacaoRow, nomes: ReadonlyMap<string, string>): VerificacaoRegistro {
  return {
    osId: row.os_id,
    numeroOs: row.numero_os,
    verificadoEm: row.verificado_em,
    verificadoPor: row.verificado_por,
    verificadoPorNome: row.verificado_por ? (nomes.get(row.verificado_por) ?? null) : null,
  };
}

async function fetchNomes(ids: readonly string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unicos);

  // Nome é enfeite: falha aqui não pode derrubar o histórico.
  if (error || !data) return new Map();

  const map = new Map<string, string>();
  for (const row of data) {
    if (row.full_name) map.set(row.id, row.full_name);
  }
  return map;
}

/** Carrega todas as conferências persistidas (paginado, sem truncar). */
export async function fetchVerificacoes(): Promise<VerificacaoMap> {
  const pageSize = 1000;
  const rows: VerificacaoRow[] = [];

  for (let page = 0; ; page += 1) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .from("corretiva_historico_verificacoes")
      .select("os_id, numero_os, verificado_em, verificado_por")
      .order("verificado_em", { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) throw new Error(error.message);
    const batch = (data ?? []) as VerificacaoRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  const nomes = await fetchNomes(rows.map((row) => row.verificado_por).filter((id): id is string => !!id));
  return new Map(rows.map((row) => [row.os_id, toRegistro(row, nomes)]));
}

/**
 * Marca uma OS como verificada. Lança em caso de falha para que a UI não
 * mostre a marcação sem a persistência ter acontecido.
 */
export async function marcarVerificada(
  osId: string,
  numeroOs: string,
  userId: string | null,
): Promise<VerificacaoRegistro> {
  if (!osId) throw new Error("OS inválida para conferência.");

  const { data, error } = await supabase
    .from("corretiva_historico_verificacoes")
    .upsert(
      {
        os_id: osId,
        numero_os: numeroOs,
        verificado_em: new Date().toISOString(),
        verificado_por: userId,
      },
      { onConflict: "os_id" },
    )
    .select("os_id, numero_os, verificado_em, verificado_por")
    .single();

  if (error || !data) throw new Error(error?.message ?? "Falha ao registrar a conferência.");

  const nomes = await fetchNomes(data.verificado_por ? [data.verificado_por] : []);
  return toRegistro(data as VerificacaoRow, nomes);
}

/** Desfaz a conferência: a OS volta para pendentes e para a exportação. */
export async function desmarcarVerificada(osId: string): Promise<void> {
  const { error } = await supabase
    .from("corretiva_historico_verificacoes")
    .delete()
    .eq("os_id", osId);

  if (error) throw new Error(error.message);
}

/**
 * Migra marcações legadas do localStorage para o banco, sem duplicar.
 * Retorna quantos registros foram efetivamente criados.
 */
export async function migrarVerificacoesLegadas(
  scope: string,
  verificacoes: VerificacaoMap,
  numeroPorOsId: ReadonlyMap<string, string>,
  userId: string | null,
): Promise<number> {
  const legacy = loadVerifiedOsIds(scope);
  const pendentes = legacyIdsToMigrate(legacy, verificacoes);
  if (pendentes.length === 0) return 0;

  const payload = pendentes.map((osId) => ({
    os_id: osId,
    numero_os: numeroPorOsId.get(osId) ?? "—",
    verificado_por: userId,
    origem: "migracao-local",
  }));

  const { error } = await supabase
    .from("corretiva_historico_verificacoes")
    .upsert(payload, { onConflict: "os_id", ignoreDuplicates: true });

  if (error) throw new Error(error.message);
  return payload.length;
}

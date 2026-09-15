import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Database, Download, HardDrive, Image, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/recuperacao-local")({
  component: RecuperacaoLocalPage,
});

type BlobMeta = {
  key: IDBValidKey;
  type: string;
  size: number;
};

type RecoverySnapshot = {
  version: 1;
  exportedAt: string;
  origin: string;
  database: string;
  osCache: unknown[];
  outbox: unknown[];
  drafts: unknown[];
  blobs: BlobMeta[];
};

const DB_NAME = "corretiva-offline";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Falha ao ler IndexedDB"));
  });
}

async function databaseExists(name: string): Promise<boolean | null> {
  try {
    const api = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
    if (!api.databases) return null;
    const databases = await api.databases();
    return databases.some((db) => db.name === name);
  } catch {
    return null;
  }
}

async function openExistingDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;

  const exists = await databaseExists(DB_NAME);
  if (exists === false) return null;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME);
    let createdDuringProbe = false;

    request.onupgradeneeded = () => {
      // Se databases() não está disponível e o banco não existia, o browser cria
      // um banco vazio ao abrir. Marcamos para não tratar isso como recuperação.
      createdDuringProbe = true;
    };
    request.onsuccess = () => {
      const db = request.result;
      if (createdDuringProbe && db.objectStoreNames.length === 0) {
        db.close();
        try {
          indexedDB.deleteDatabase(DB_NAME);
        } catch {
          // diagnóstico somente leitura; falha de limpeza não interrompe a tela
        }
        resolve(null);
        return;
      }
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("Não foi possível abrir o cache offline"));
  });
}

async function readStore(db: IDBDatabase, storeName: string): Promise<unknown[]> {
  if (!db.objectStoreNames.contains(storeName)) return [];
  const transaction = db.transaction(storeName, "readonly");
  return requestToPromise(transaction.objectStore(storeName).getAll());
}

async function readBlobMeta(db: IDBDatabase): Promise<BlobMeta[]> {
  if (!db.objectStoreNames.contains("blobs")) return [];
  const transaction = db.transaction("blobs", "readonly");
  const store = transaction.objectStore("blobs");
  const [keys, values] = await Promise.all([
    requestToPromise(store.getAllKeys()),
    requestToPromise(store.getAll()),
  ]);

  return values.map((value, index) => ({
    key: keys[index] ?? index,
    type: value instanceof Blob ? value.type || "application/octet-stream" : typeof value,
    size: value instanceof Blob ? value.size : 0,
  }));
}

async function buildSnapshot(): Promise<RecoverySnapshot | null> {
  const db = await openExistingDb();
  if (!db) return null;

  try {
    const [osCache, outbox, drafts, blobs] = await Promise.all([
      readStore(db, "os_cache"),
      readStore(db, "outbox"),
      readStore(db, "drafts"),
      readBlobMeta(db),
    ]);

    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      origin: window.location.origin,
      database: DB_NAME,
      osCache,
      outbox,
      drafts,
      blobs,
    };
  } finally {
    db.close();
  }
}

function downloadJson(snapshot: RecoverySnapshot) {
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  anchor.href = url;
  anchor.download = `apontauto-recuperacao-local-${stamp}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: typeof Database }) {
  return (
    <GlassCard className="border-white/10 bg-white/[0.035] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </div>
    </GlassCard>
  );
}

function RecuperacaoLocalPage() {
  const [loading, setLoading] = useState(true);
  const [snapshot, setSnapshot] = useState<RecoverySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inspect = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await buildSnapshot();
      setSnapshot(result);
    } catch (err) {
      console.error("[recuperacao-local]", err);
      setError(err instanceof Error ? err.message : "Falha ao inspecionar dados locais");
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void inspect();
  }, []);

  const totalRecoverable = useMemo(() => {
    if (!snapshot) return 0;
    return snapshot.osCache.length + snapshot.outbox.length + snapshot.drafts.length + snapshot.blobs.length;
  }, [snapshot]);

  return (
    <PageShell
      title="Recuperação Local"
      description="Diagnóstico somente leitura do cache offline deste navegador. Nenhum dado é apagado ou enviado automaticamente."
      actions={
        <Button variant="outline" size="sm" onClick={() => void inspect()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Verificar novamente
        </Button>
      }
    >
      <div className="space-y-5">
        <GlassCard className="border-amber-500/20 bg-amber-500/[0.05] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">Não limpe os dados deste site.</p>
              <p className="text-muted-foreground">
                O cache offline é específico deste navegador e deste domínio. Limpar cookies/dados do site,
                usar modo anônimo ou trocar de domínio pode impedir a recuperação.
              </p>
            </div>
          </div>
        </GlassCard>

        {loading ? (
          <GlassCard className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto mb-3 h-6 w-6 animate-spin" />
            Lendo cache offline…
          </GlassCard>
        ) : error ? (
          <GlassCard className="border-red-500/25 bg-red-500/[0.05] p-5 text-sm text-red-200">
            {error}
          </GlassCard>
        ) : !snapshot ? (
          <GlassCard className="p-6">
            <div className="flex items-start gap-3">
              <HardDrive className="mt-0.5 h-5 w-5 text-muted-foreground" />
              <div>
                <p className="font-semibold">Nenhum cache `corretiva-offline` encontrado neste navegador.</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Tente abrir esta página no computador/celular e no mesmo domínio onde os apontamentos eram feitos anteriormente.
                </p>
              </div>
            </div>
          </GlassCard>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="OS em cache" value={snapshot.osCache.length} icon={Database} />
              <StatCard label="Operações pendentes" value={snapshot.outbox.length} icon={RefreshCw} />
              <StatCard label="Rascunhos" value={snapshot.drafts.length} icon={HardDrive} />
              <StatCard label="Fotos locais" value={snapshot.blobs.length} icon={Image} />
            </div>

            <GlassCard className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">Snapshot encontrado</h2>
                    <Badge variant={totalRecoverable > 0 ? "default" : "secondary"}>
                      {totalRecoverable} item(ns)
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    O arquivo exportado contém OS em cache, fila offline, rascunhos e metadados das fotos.
                    Ele não contém senha, token de sessão ou credenciais do Supabase.
                  </p>
                </div>
                <Button
                  onClick={() => {
                    downloadJson(snapshot);
                    toast.success("Backup local exportado.");
                  }}
                  disabled={totalRecoverable === 0}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Baixar backup local
                </Button>
              </div>
            </GlassCard>

            {snapshot.outbox.length > 0 && (
              <GlassCard className="border-cyan-500/20 bg-cyan-500/[0.04] p-4 text-sm">
                <p className="font-semibold text-cyan-200">Há operações offline ainda não sincronizadas.</p>
                <p className="mt-1 text-muted-foreground">
                  Não force sincronização enquanto as tabelas do Supabase atual não forem reconstruídas; o backup preserva essa fila para restauração controlada.
                </p>
              </GlassCard>
            )}
          </>
        )}
      </div>
    </PageShell>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { useMemo, useState } from "react";
import { CloudDownload, Database, Loader2, ShieldCheck, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const Route = createFileRoute("/_authenticated/recuperacao-cloud")({
  component: RecuperacaoCloudPage,
});

// Backend histórico identificado no próprio histórico Git/Lovable do projeto.
// A publishable key é pública por definição; nenhuma chave privilegiada é usada aqui.
const LEGACY_URL = "https://uthidybbrziwvktknryr.supabase.co";
const LEGACY_PUBLISHABLE_KEY = "sb_publishable_4K0A758AP4Cr4mi6VcWwUg_rLMZi_VD";
const LEGACY_PROJECT_REF = "uthidybbrziwvktknryr";
const LOGIN_DOMAIN = "apontauto.local";
const PAGE_SIZE = 1000;
const MAX_ROWS_PER_TABLE = 100_000;

// Fallback caso o endpoint OpenAPI não esteja disponível.
const KNOWN_OPERATIONAL_TABLES = [
  "corretiva_equipes",
  "corretiva_os",
  "corretiva_fotos",
  "corretiva_pecas",
  "corretiva_problemas",
  "corretiva_historico_verificacoes",
  "refrigeracao_os",
  "refrigeracao_fotos",
  "refrigeracao_pecas",
  "refrigeracao_problemas",
  "rondas_calhas",
  "rondas_calhas_historico",
  "talude_maps",
  "talude_marcacoes",
  "legal_items",
  "legal_item_executions",
  "legal_item_attachments",
  "assets_ref",
  "backorder_os",
] as const;

type InventoryRow = {
  table: string;
  exists: boolean;
  count: number | null;
  error?: string;
};

type Snapshot = {
  format: "apontauto-cloud-recovery-v1";
  sourceProjectRef: string;
  exportedAt: string;
  tables: Record<string, unknown[]>;
  inventory: InventoryRow[];
};

function legacyFetch(apiKey: string): typeof fetch {
  return (input, init) => {
    const headers = new Headers(
      typeof Request !== "undefined" && input instanceof Request ? input.headers : undefined,
    );
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    if (headers.get("Authorization") === `Bearer ${apiKey}`) {
      headers.delete("Authorization");
    }
    headers.set("apikey", apiKey);
    return fetch(input, { ...init, headers });
  };
}

function createLegacyClient() {
  return createClient(LEGACY_URL, LEGACY_PUBLISHABLE_KEY, {
    global: { fetch: legacyFetch(LEGACY_PUBLISHABLE_KEY) },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function loginToEmail(login: string) {
  const value = login.trim().toLowerCase();
  return value.includes("@") ? value : `${value}@${LOGIN_DOMAIN}`;
}

async function discoverTables(accessToken: string): Promise<string[]> {
  try {
    const response = await fetch(`${LEGACY_URL}/rest/v1/`, {
      headers: {
        apikey: LEGACY_PUBLISHABLE_KEY,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/openapi+json, application/json",
      },
    });
    if (!response.ok) return [...KNOWN_OPERATIONAL_TABLES];
    const openapi = (await response.json()) as { paths?: Record<string, unknown> };
    const discovered = Object.keys(openapi.paths ?? {})
      .filter((path) => /^\/[A-Za-z0-9_]+$/.test(path))
      .map((path) => path.slice(1))
      .filter((name) => name && !name.startsWith("rpc"));
    return discovered.length
      ? Array.from(new Set([...discovered, ...KNOWN_OPERATIONAL_TABLES])).sort()
      : [...KNOWN_OPERATIONAL_TABLES];
  } catch {
    return [...KNOWN_OPERATIONAL_TABLES];
  }
}

async function tableCount(client: ReturnType<typeof createLegacyClient>, table: string) {
  const { count, error } = await client
    .from(table as never)
    .select("*", { count: "exact", head: true });
  if (error) {
    const missing = error.code === "42P01" || /does not exist|schema cache/i.test(error.message);
    return {
      table,
      exists: !missing,
      count: null,
      error: error.message,
    } satisfies InventoryRow;
  }
  return { table, exists: true, count: count ?? 0 } satisfies InventoryRow;
}

async function readAllRows(client: ReturnType<typeof createLegacyClient>, table: string) {
  const rows: unknown[] = [];
  for (let from = 0; from < MAX_ROWS_PER_TABLE; from += PAGE_SIZE) {
    const { data, error } = await client
      .from(table as never)
      .select("*")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as unknown[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

function downloadSnapshot(snapshot: Snapshot) {
  const json = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `ApontAuto_Recuperacao_Cloud_${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function RecuperacaoCloudPage() {
  const { isAdmin, loading: checkingAdmin } = useIsAdmin();
  const [login, setLogin] = useState("admin");
  const [password, setPassword] = useState("");
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sourceToken, setSourceToken] = useState<string | null>(null);

  const totals = useMemo(() => {
    const existing = inventory.filter((item) => item.exists);
    return {
      tables: existing.length,
      rows: existing.reduce((sum, item) => sum + (item.count ?? 0), 0),
    };
  }, [inventory]);

  if (checkingAdmin) {
    return (
      <PageShell title="Recuperação Cloud" description="Verificando acesso administrativo…">
        <Loader2 className="h-5 w-5 animate-spin" />
      </PageShell>
    );
  }

  if (!isAdmin) {
    return (
      <PageShell title="Recuperação Cloud" description="Área restrita">
        <GlassCard className="p-6 text-sm text-muted-foreground">
          Apenas administradores podem usar a ferramenta de recuperação.
        </GlassCard>
      </PageShell>
    );
  }

  const inspectLegacy = async () => {
    if (!password) {
      toast.error("Informe a senha usada no sistema antigo.");
      return;
    }

    setChecking(true);
    setInventory([]);
    setConnected(false);
    setSourceToken(null);
    try {
      const client = createLegacyClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: loginToEmail(login),
        password,
      });
      if (error || !data.session) {
        throw new Error(error?.message || "Não foi possível autenticar no Cloud histórico.");
      }

      const tables = await discoverTables(data.session.access_token);
      const results: InventoryRow[] = [];
      for (const table of tables) {
        results.push(await tableCount(client, table));
      }

      setInventory(results);
      setConnected(true);
      setSourceToken(data.session.access_token);
      setPassword("");

      const foundRows = results.reduce((sum, item) => sum + (item.count ?? 0), 0);
      toast.success(
        foundRows > 0
          ? `Cloud histórico acessível: ${foundRows} registro(s) localizados.`
          : "Cloud histórico respondeu, mas nenhuma linha operacional foi localizada.",
      );
    } catch (error) {
      setPassword("");
      const message = error instanceof Error ? error.message : "Falha ao consultar Cloud histórico.";
      toast.error(message);
    } finally {
      setChecking(false);
    }
  };

  const exportLegacy = async () => {
    if (!connected || !sourceToken) return;
    setExporting(true);
    const toastId = toast.loading("Extraindo snapshot completo do Cloud histórico…");
    try {
      const client = createLegacyClient();
      const { data, error } = await client.auth.setSession({
        access_token: sourceToken,
        refresh_token: sourceToken,
      });
      // setSession exige refresh token real em algumas versões; se falhar, peça nova autenticação.
      if (error || !data.session) {
        throw new Error("Sessão de recuperação expirou. Execute a verificação novamente.");
      }

      const tables: Record<string, unknown[]> = {};
      const existing = inventory.filter((item) => item.exists && (item.count ?? 0) > 0);
      for (const item of existing) {
        tables[item.table] = await readAllRows(client, item.table);
      }

      const snapshot: Snapshot = {
        format: "apontauto-cloud-recovery-v1",
        sourceProjectRef: LEGACY_PROJECT_REF,
        exportedAt: new Date().toISOString(),
        tables,
        inventory,
      };
      downloadSnapshot(snapshot);
      toast.success(
        `Snapshot preservado: ${Object.keys(tables).length} tabela(s) e ${Object.values(tables).reduce((sum, rows) => sum + rows.length, 0)} registro(s).`,
        { id: toastId },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível extrair o snapshot.", {
        id: toastId,
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageShell
      title="Recuperação do Lovable Cloud"
      description="Auditoria isolada do backend histórico. O Supabase atual e o login do sistema não são alterados."
    >
      <div className="space-y-5">
        <GlassCard className="border-amber-500/20 bg-amber-500/[0.04] p-5">
          <div className="flex gap-3">
            <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-foreground">Modo somente leitura</p>
              <p className="text-muted-foreground">
                Esta ferramenta não troca o backend do Apont Auto e não grava nada no Cloud antigo. Ela apenas tenta localizar e exportar os dados para um arquivo de recuperação.
              </p>
            </div>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="mb-5 flex items-center gap-3">
            <div className="rounded-xl border border-primary/25 bg-primary/10 p-2.5">
              <Database className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold">Cloud histórico</h2>
              <p className="text-xs text-muted-foreground">Projeto identificado pelo histórico do próprio Lovable/GitHub.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="legacy-login">Login antigo</Label>
              <Input id="legacy-login" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="legacy-password">Senha do sistema antigo</Label>
              <Input
                id="legacy-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="A senha não é salva"
              />
            </div>
          </div>

          <Button className="mt-4" onClick={inspectLegacy} disabled={checking}>
            {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
            Verificar Cloud histórico
          </Button>
        </GlassCard>

        {inventory.length > 0 && (
          <GlassCard className="p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Inventário encontrado</h2>
                <p className="text-xs text-muted-foreground">
                  {totals.tables} tabela(s) acessível(is) · {totals.rows} registro(s) contabilizados
                </p>
              </div>
              <Button onClick={exportLegacy} disabled={!connected || exporting || totals.rows === 0}>
                {exporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-2 h-4 w-4" />}
                Baixar snapshot completo
              </Button>
            </div>

            <div className="max-h-[520px] overflow-auto rounded-xl border border-border/60">
              <div className="divide-y divide-border/50">
                {inventory.map((item) => (
                  <div key={item.table} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-mono text-xs text-foreground">{item.table}</div>
                      {item.error && !item.exists && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">Não existe/não está exposta no Cloud.</div>
                      )}
                    </div>
                    <Badge variant={item.exists ? "secondary" : "outline"}>
                      {item.exists ? `${item.count ?? "?"} registros` : "ausente"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        )}
      </div>
    </PageShell>
  );
}

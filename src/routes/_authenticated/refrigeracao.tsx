import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { toast } from "sonner";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Camera,
  Package,
  AlertTriangle,
  Search,
  X,
  Loader2,
  CheckCircle2,
  Snowflake,
  Save,
  ArrowLeft,
  Download,
  Link2,
  Copy,
  ExternalLink,
  ImageIcon,
  Trash2,
} from "lucide-react";
import { clearOsTable } from "@/lib/os-management.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import {
  cacheOsList,
  getCachedOsList,
  outboxAdd,
  outboxAll,
  blobPut,
  blobGet,
  blobDelete,
  updateCachedOs,
  draftGet,
  draftPut,
  draftDelete,
  type OsCacheRow,
  type OutboxItem,
} from "@/lib/refrigeracao/db";
import { compressImage } from "@/lib/refrigeracao/image";
import { syncPending } from "@/lib/refrigeracao/sync";
import { OsPhotosButton } from "@/components/refrigeracao/os-photos-button";
import { RefrigImportDialog } from "@/components/refrigeracao/refrig-import-dialog";
import { useIsOwner } from "@/hooks/use-is-owner";
import { useVirtualizer } from "@tanstack/react-virtual";

import {
  EQUIPES_REFRIGERACAO,
  loadEquipe,
  saveEquipe,
  matchEquipe,
  type EquipeFiltro,
} from "@/lib/refrigeracao/equipe";

export const Route = createFileRoute("/_authenticated/refrigeracao")({
  component: RefrigeracaoPage,
});

const OS_COLUMNS =
  "id, numero_os, nome_os, predio, andar, local, tipo, equipe, data_sla, data_programada, inicio, fim, ativo, equipamento, patrimonio, status, updated_at";

function uuid() {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

/**
 * Cores por equipe de refrigeração (fluorescentes):
 * Refrigeração 1 → azul bebê · Refrigeração 2 → verde fluorescente · Refrigeração 3 → rosa fluorescente
 */
function equipeStyles(equipe: string | null | undefined): {
  row: string;
  dot: string;
  badge: string;
} {
  const n = (equipe ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

  // Refrigeração 1 — azul bebê fluorescente
  if (n.includes("1"))
    return {
      row: "border-l-4 border-[#89CFF0] bg-[#89CFF0]/10 hover:bg-[#89CFF0]/20",
      dot: "bg-[#89CFF0] shadow-[0_0_8px_2px_rgba(137,207,240,0.9)]",
      badge: "bg-[#89CFF0]/20 text-sky-800 border-[#89CFF0]/50 font-semibold dark:text-[#89CFF0]",
    };

  // Refrigeração 2 — verde fluorescente
  if (n.includes("2"))
    return {
      row: "border-l-4 border-lime-400 bg-lime-50/70 hover:bg-lime-100/70 dark:bg-lime-500/10 dark:hover:bg-lime-500/20",
      dot: "bg-lime-400 shadow-[0_0_8px_2px_rgba(163,230,53,0.9)]",
      badge:
        "bg-lime-100 text-lime-800 border-lime-300 font-semibold dark:bg-lime-500/20 dark:text-lime-200 dark:border-lime-400/50",
    };

  // Refrigeração 3 — rosa fluorescente
  if (n.includes("3"))
    return {
      row: "border-l-4 border-pink-400 bg-pink-50/70 hover:bg-pink-100/70 dark:bg-pink-500/10 dark:hover:bg-pink-500/20",
      dot: "bg-pink-400 shadow-[0_0_8px_2px_rgba(244,114,182,0.9)]",
      badge:
        "bg-pink-100 text-pink-800 border-pink-300 font-semibold dark:bg-pink-500/20 dark:text-pink-200 dark:border-pink-400/50",
    };

  return {
    row: "border-l-4 border-transparent hover:bg-accent/60",
    dot: "bg-muted-foreground/40",
    badge: "",
  };
}


function useOnlineStatus() {
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

type SyncResultLike = Awaited<ReturnType<typeof syncPending>>;

function describePendingItem(item: OutboxItem): string {
  const suffix = item.lastError ? `: ${item.lastError}` : " sem erro detalhado registrado";
  return `${item.kind} · OS ${item.numeroOs}${suffix}`;
}

async function getSyncFailureMessage(result: SyncResultLike): Promise<string> {
  const direct = result.firstError ?? result.errors?.[0]?.message;
  if (direct) return `Falha: ${direct}`;

  const pendingItems = await outboxAll().catch(() => [] as OutboxItem[]);
  const itemWithError = pendingItems.find((item) => item.lastError) ?? pendingItems[0];
  if (itemWithError) return `Falha: ${describePendingItem(itemWithError)}`;

  const total = result.remaining || result.failed || 1;
  return `${total} pendente(s) — tentaremos novamente.`;
}

function RefrigeracaoPage() {
  const online = useOnlineStatus();
  const { isOwner } = useIsOwner();
  const [osList, setOsList] = useState<OsCacheRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [equipe, setEquipe] = useState<EquipeFiltro>("todas");
  const [tipoFiltro, setTipoFiltro] = useState<"todas" | "preventiva" | "corretiva">("todas");

  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setEquipe(loadEquipe());
  }, []);

  const setEquipeAndPersist = (v: EquipeFiltro) => {
    setEquipe(v);
    saveEquipe(v);
  };

  const refreshPending = async () => setPending((await outboxAll()).length);

  const doSync = async (silent = false) => {
    if (!navigator.onLine) {
      if (!silent) toast.error("Sem conexão com a internet.");
      return;
    }
    setSyncing(true);
    try {
      const r = await syncPending();
      if (!silent && r.sent > 0) toast.success(`${r.sent} registro(s) sincronizado(s).`);
      if (r.failed > 0 && !silent) {
        toast.error(await getSyncFailureMessage(r));
      }
    } catch (e: any) {
      console.error("[refrigeracao] doSync fatal", e);
      if (!silent) toast.error(e?.message ?? "Falha ao sincronizar");
    } finally {
      setSyncing(false);
      refreshPending();
    }
  };

  const refreshOsFromServer = useCallback(async () => {
    const { data, error } = await supabase
      .from("refrigeracao_os")
      .select(OS_COLUMNS)
      .order("numero_os", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as unknown as OsCacheRow[];
    await cacheOsList(rows);
    setOsList(rows);
  }, []);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const cached = await getCachedOsList();
        if (mounted && cached.length) setOsList(cached);
      } catch {
        /* falha silenciosa: cache local é um extra */
      }
      
      if (navigator.onLine) {
        try {
          await refreshOsFromServer();
        } catch (e: any) {
          if (mounted && osList.length === 0)
            toast.error("Não foi possível carregar OS do servidor.");
        }
      }
      
      if (mounted) {
        setLoadingList(false);
        refreshPending();
        doSync(true);
      }
    })();

    const onOnline = () => {
      if (mounted) doSync(true);
      refreshOsFromServer().catch(() => {});
    };

    const onFocus = () => {
      if (mounted && navigator.onLine) {
        doSync(true);
        refreshOsFromServer().catch(() => {});
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);

    const iv = window.setInterval(() => {
      if (mounted && navigator.onLine) {
        doSync(true);
        // Opcional: atualização periódica da lista se desejar tempo real
        // refreshOsFromServer().catch(() => {});
      }
    }, 10_000);

    return () => {
      mounted = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
      window.clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshOsFromServer]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = osList.filter((o) => {
      if (!matchEquipe(o.equipe, equipe)) return false;
      if (tipoFiltro !== "todas") {
        const t = (o.tipo ?? "").toLowerCase();
        if (tipoFiltro === "preventiva" && !t.includes("preventiv")) return false;
        if (tipoFiltro === "corretiva" && !t.includes("corretiv")) return false;
      }
      if (!q) return true;
      return (
        o.numero_os.toLowerCase().includes(q) ||
        o.ativo.toLowerCase().includes(q) ||
        o.equipamento.toLowerCase().includes(q) ||
        (o.patrimonio ?? "").toLowerCase().includes(q) ||
        (o.nome_os ?? "").toLowerCase().includes(q) ||
        (o.predio ?? "").toLowerCase().includes(q) ||
        (o.local ?? "").toLowerCase().includes(q)
      );
    });
    return [...base].sort((a, b) => {
      const pa = a.predio ?? "\uffff";
      const pb = b.predio ?? "\uffff";
      const pc = pa.localeCompare(pb, "pt-BR", { sensitivity: "base", numeric: true });
      if (pc !== 0) return pc;
      const aa = (a.andar ?? "").toString();
      const ab = (b.andar ?? "").toString();
      const ac = aa.localeCompare(ab, "pt-BR", { numeric: true, sensitivity: "base" });
      if (ac !== 0) return ac;
      return a.numero_os.localeCompare(b.numero_os, "pt-BR", { numeric: true });
    });
  }, [osList, search, equipe, tipoFiltro]);

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 110,
    overscan: 5,
  });

  const selected = osList.find((o) => o.id === selectedId) ?? null;

  const patchLocal = (id: string, patch: Partial<OsCacheRow>) => {
    setOsList((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    updateCachedOs(id, patch).catch(() => {});
  };

  return (
    <PageShell
      title="Refrigeração"
      description="Manutenção de AC — funciona offline. Sincronização automática."
      actions={
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {isOwner && (
            <div className="flex-1 sm:flex-none w-full sm:w-auto">
              <RefrigImportDialog onDone={() => refreshOsFromServer().catch(() => {})} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 flex-1 sm:flex-none w-full sm:w-auto">
            <StatusChip online={online} syncing={syncing} pending={pending} />
            <Button
              size="sm"
              variant="outline"
              className="h-11 flex-1 sm:flex-none sm:w-auto"
              onClick={() => doSync(false)}
              disabled={syncing || !online}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              Sincronizar
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 h-11 px-3">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar chamados pendentes?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Serão removidas apenas as OS que <strong>não estão concluídas</strong>. Todo o
                    histórico de OS concluídas (com fotos e peças) será preservado. Use isso para
                    preparar a nova programação mensal.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={async () => {
                      try {
                        const res = await clearOsTable({
                          data: { module: "refrigeracao", keepCompleted: true },
                        });
                        toast.success(
                          `${res.deleted} chamados pendentes removidos. Histórico preservado.`,
                        );
                        window.location.reload();
                      } catch (e: any) {
                        toast.error("Erro ao limpar: " + e.message);
                      }
                    }}
                  >
                    Confirmar Limpeza
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      }

    >
      {!selected ? (
        <GlassCard className="p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-2 sm:min-w-[240px]">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Minha equipe
              </span>
              <Select value={equipe} onValueChange={(v) => setEquipeAndPersist(v as EquipeFiltro)}>
                <SelectTrigger className="h-11 flex-1 text-base sm:w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as equipes</SelectItem>
                  {EQUIPES_REFRIGERACAO.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-1 items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar OS, ativo, local…"
                className="h-11 text-base"
              />
            </div>
          </div>

          {/* Pílulas de tipo (iOS 17-like) */}
          <div className="mb-3 flex flex-wrap gap-2">
            {(
              [
                { v: "todas", label: "Todas" },
                { v: "preventiva", label: "Preventivas" },
                { v: "corretiva", label: "Corretivas" },
              ] as const
            ).map((opt) => {
              const active = tipoFiltro === opt.v;
              return (
                <button
                  key={opt.v}
                  type="button"
                  onClick={() => setTipoFiltro(opt.v)}
                  className={`rounded-full border px-4 py-1.5 text-xs font-medium transition-all duration-200 active:scale-95 ${
                    active
                      ? "border-primary/40 bg-primary text-primary-foreground shadow-sm"
                      : "border-white/10 bg-white/5 text-muted-foreground backdrop-blur-xl hover:border-primary/30 hover:text-foreground dark:bg-white/[0.04]"
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {equipe !== "todas" && (
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-[10px]">
                {equipe}
              </Badge>
              <span>Mostrando apenas OS desta equipe.</span>
              <button
                type="button"
                onClick={() => setEquipeAndPersist("todas")}
                className="ml-auto text-primary underline-offset-2 hover:underline"
              >
                Ver todas
              </button>
            </div>
          )}
          {loadingList ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin" />
              Carregando OS…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {osList.length === 0
                ? "Nenhuma OS disponível. O gestor precisa importar a planilha."
                : "Nenhuma OS encontrada para essa busca."}
            </div>
          ) : (
            <div
              ref={parentRef}
              className="h-[600px] w-full overflow-auto scrollbar-thin"
              style={{
                contain: "strict",
              }}
            >
              <div
                style={{
                  height: `${virtualizer.getTotalSize()}px`,
                  width: "100%",
                  position: "relative",
                }}
              >
                {virtualizer.getVirtualItems().map((virtualRow) => {
                  const o = filtered[virtualRow.index];
                  const st = equipeStyles(o.equipe);
                  const isDone = (o.status ?? "").toLowerCase() === "concluida";
                  const rowCls = isDone
                    ? "border-l-4 border-emerald-500 bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
                    : st.row;
                  return (
                    <div
                      key={o.id}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      className="p-1"
                    >
                      <div
                        className={`flex h-full w-full min-w-0 items-start gap-3 rounded-md px-2 py-3 text-left transition ${rowCls}`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedId(o.id)}
                          className="flex min-w-0 flex-1 items-start gap-3 text-left"
                        >
                          {isDone ? (
                            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <Snowflake className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`font-mono text-sm font-semibold ${isDone ? "text-emerald-800 dark:text-emerald-300" : ""}`}
                              >
                                OS {o.numero_os}
                              </span>
                              {isDone ? (
                                <Badge className="border border-emerald-500/40 bg-emerald-500/20 text-[10px] text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300">
                                  <CheckCircle2 className="mr-1 h-3 w-3" /> Concluída
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px]">
                                  {o.status}
                                </Badge>
                              )}
                              {o.equipe && (
                                <Badge variant="outline" className={`text-[10px] ${st.badge}`}>
                                  <span
                                    className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${st.dot}`}
                                  />
                                  {o.equipe}
                                </Badge>
                              )}
                              {o.tipo && (
                                <Badge variant="secondary" className="text-[10px]">
                                  {o.tipo}
                                </Badge>
                              )}
                            </div>
                            {o.nome_os && (
                              <div
                                className={`mt-0.5 truncate text-sm font-medium ${isDone ? "text-emerald-900/80 dark:text-emerald-200/90" : ""}`}
                              >
                                {o.nome_os}
                              </div>
                            )}
                            <div className="mt-0.5 truncate text-sm text-muted-foreground">
                              {o.equipamento} · Ativo {o.ativo}
                            </div>
                            <div className="truncate text-xs text-muted-foreground/80">
                              {[o.predio, o.andar, o.local].filter(Boolean).join(" · ") || "—"}
                            </div>
                          </div>
                        </button>
                        <div className="shrink-0 self-center">
                          <OsPhotosButton osId={o.id} numeroOs={o.numero_os} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </GlassCard>
      ) : (
        <OsDetail
          os={selected}
          onBack={() => setSelectedId(null)}
          onQueued={refreshPending}
          onPatchLocal={(p) => patchLocal(selected.id, p)}
          online={online}
        />
      )}
    </PageShell>
  );
}

function StatusChip({
  online,
  syncing,
  pending,
}: {
  online: boolean;
  syncing: boolean;
  pending: number;
}) {
  const cls = !online
    ? "bg-amber-500/15 text-amber-600 border-amber-500/30 shadow-[0_0_10px_rgba(245,158,11,0.2)]"
    : syncing
      ? "bg-sky-500/15 text-sky-600 border-sky-500/30 animate-pulse"
      : pending > 0
        ? "bg-orange-500/15 text-orange-600 border-orange-500/30 shadow-[0_0_10px_rgba(249,115,22,0.2)]"
        : "bg-emerald-500/15 text-emerald-600 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.1)]";
  const Icon = !online ? WifiOff : syncing ? Loader2 : pending > 0 ? RefreshCw : Wifi;
  const label = !online
    ? `Offline${pending > 0 ? ` · ${pending} pendentes` : " — Local"}`
    : syncing
      ? "Sincronizando..."
      : pending > 0
        ? `${pending} pendentes`
        : "Sincronizado";
  return (
    <span
      className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium ${cls}`}
    >
      <Icon className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function OsDetail({
  os,
  onBack,
  onQueued,
  onPatchLocal,
  online,
}: {
  os: OsCacheRow;
  onBack: () => void;
  onQueued: () => void;
  onPatchLocal: (patch: Partial<OsCacheRow>) => void;
  online: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  type Preview = { id: string; url: string; blobKey: string };
  const [previews, setPreviews] = useState<Preview[]>([]);

  // Patrimônio (opcional — colaborador preenche)
  const [patrim, setPatrim] = useState(os.patrimonio ?? "");
  const [savingPatrim, setSavingPatrim] = useState(false);

  // Peças (lista) — permite solicitar várias peças diferentes em uma única transação
  type PecaDraft = {
    id: string;
    descricao: string;
    quantidade: string;
    urgencia: string;
    observacao: string;
    patrimonio: string;
    modelo: string;
    btus: string;
  };
  const emptyPeca = (): PecaDraft => ({
    id: uuid(),
    descricao: "",
    quantidade: "1",
    urgencia: "media",
    observacao: "",
    patrimonio: (patrim || os.patrimonio || "").trim(),
    modelo: "",
    btus: "",
  });
  const [pecas, setPecas] = useState<PecaDraft[]>([]);

  // Problemas (lista) — permite sinalizar vários problemas
  type ProblemaDraft = { id: string; descricao: string; gravidade: string };
  const emptyProblema = (): ProblemaDraft => ({
    id: uuid(),
    descricao: "",
    gravidade: "falha",
  });
  const [problemas, setProblemas] = useState<ProblemaDraft[]>([]);

  // Observações Técnicas (Histórico Permanente)
  const [obsTecnica, setObsTecnica] = useState("");
  const [obsTecnicaOriginal, setObsTecnicaOriginal] = useState("");
  const [savingObs, setSavingObs] = useState(false);

  const [saving, setSaving] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);

  useEffect(() => {
    setPatrim(os.patrimonio ?? "");
  }, [os.id, os.patrimonio]);

  // Histórico do mesmo Ativo + Equipamento: sugere patrimônio e mostra alertas
  const { data: priorInfo } = useQuery({
    queryKey: ["refrig-prior", os.ativo, os.equipamento, os.id],
    enabled: !!os.ativo && !!os.equipamento,
    staleTime: 60_000,
    queryFn: async () => {
      const [osRes, pecRes, probRes, histRes] = await Promise.all([
        supabase
          .from("refrigeracao_os")
          .select("id, numero_os, patrimonio, status, fim")
          .eq("ativo", os.ativo)
          .eq("equipamento", os.equipamento)
          .neq("id", os.id)
          .order("fim", { ascending: false, nullsFirst: false })
          .limit(20),
        supabase
          .from("refrigeracao_pecas")
          .select(
            "id, descricao, quantidade, urgencia, status_gestor, created_at, os_id, refrigeracao_os!inner(ativo, equipamento)",
          )
          .eq("refrigeracao_os.ativo", os.ativo)
          .eq("refrigeracao_os.equipamento", os.equipamento)
          .neq("os_id", os.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("refrigeracao_problemas")
          .select(
            "id, descricao, gravidade, created_at, os_id, refrigeracao_os!inner(ativo, equipamento)",
          )
          .eq("refrigeracao_os.ativo", os.ativo)
          .eq("refrigeracao_os.equipamento", os.equipamento)
          .neq("os_id", os.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("refrigeracao_historico_permanente")
          .select("patrimonio, informacoes_tecnicas")
          .eq("ativo", os.ativo)
          .eq("equipamento", os.equipamento)
          .maybeSingle(),
      ]);

      const suggested =
        histRes.data?.patrimonio ||
        ((osRes.data ?? [])
          .map((r: any) => (r.patrimonio ?? "").trim())
          .find((v: string) => v.length > 0) ??
          "");

      return {
        suggested,
        priorOs: (osRes.data ?? []) as any[],
        pecas: (pecRes.data ?? []) as any[],
        problemas: (probRes.data ?? []) as any[],
        historicoPermanente: histRes.data,
      };
    },
  });

  // Auto-preenche patrimonio e informações técnicas a partir do histórico permanente
  useEffect(() => {
    const s = (priorInfo?.suggested ?? "").trim();
    if (s && !(os.patrimonio ?? "").trim() && !patrim.trim()) {
      setPatrim(s);
    }
    
    const info = priorInfo?.historicoPermanente?.informacoes_tecnicas;
    if (info && !obsTecnica) {
      setObsTecnica(info);
      setObsTecnicaOriginal(info);
    }
  }, [priorInfo?.suggested, priorInfo?.historicoPermanente, os.patrimonio, os.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restaura rascunho salvo (fotos + textos) ao entrar na OS
  useEffect(() => {
    let cancelled = false;
    setDraftLoaded(false);
    setPreviews([]);
    setPecas([]);
    setProblemas([]);
    (async () => {
      try {
        const d = await draftGet(os.id);
        if (cancelled || !d) {
          setDraftLoaded(true);
          return;
        }
        const restored: Preview[] = [];
        for (const f of d.fotos) {
          const blob = await blobGet(f.blobKey);
          if (blob) restored.push({ id: f.id, blobKey: f.blobKey, url: URL.createObjectURL(blob) });
        }
        if (cancelled) return;
        setPreviews(restored);
        setPecas(
          (d.pecas ?? []).map((p: any) => ({
            id: p.id,
            descricao: p.descricao ?? "",
            quantidade: p.quantidade ?? "1",
            urgencia: p.urgencia ?? "media",
            observacao: p.observacao ?? "",
            patrimonio: p.patrimonio ?? "",
            modelo: p.modelo ?? "",
            btus: p.btus ?? "",
          })),
        );

        setProblemas(d.problemas ?? []);
        if (d.fotos.length + (d.pecas?.length ?? 0) + (d.problemas?.length ?? 0) > 0) {
          setDraftSavedAt(d.updatedAt);
        }
      } catch {
        /* falha silenciosa: cache local é um extra */
      }
      setDraftLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [os.id]);

  // Auto-save do rascunho (debounced)
  useEffect(() => {
    if (!draftLoaded) return;
    const hasAny = previews.length > 0 || pecas.length > 0 || problemas.length > 0;
    const t = setTimeout(() => {
      if (!hasAny) {
        draftDelete(os.id).catch(() => {});
        setDraftSavedAt(null);
        return;
      }
      const draft = {
        osId: os.id,
        fotos: previews.map((p) => ({ id: p.id, blobKey: p.blobKey })),
        pecas,
        problemas,
        updatedAt: Date.now(),
      };
      draftPut(draft)
        .then(() => setDraftSavedAt(draft.updatedAt))
        .catch(() => {});
    }, 1000); // Rascunho salvo a cada 1s se houver alterações
    return () => clearTimeout(t);
  }, [previews, pecas, problemas, draftLoaded, os.id]);

  const savePatrimonio = async () => {
    const v = patrim.trim();
    if (v === (os.patrimonio ?? "")) return;
    setSavingPatrim(true);
    try {
      await outboxAdd({
        id: uuid(),
        kind: "patrimonio",
        osId: os.id,
        numeroOs: os.numero_os,
        payload: { patrimonio: v || null },
        createdAt: Date.now(),
        attempts: 0,
      });
      onPatchLocal({ patrimonio: v || null });
      onQueued();
      if (online) {
        const r = await syncPending();
        onQueued();
        if (r.failed > 0) toast.error(await getSyncFailureMessage(r));
      }
      toast.success("Patrimônio salvo.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar patrimônio");
    } finally {
      setSavingPatrim(false);
    }
  };

  const saveObsTecnica = async () => {
    if (obsTecnica === obsTecnicaOriginal) return;
    setSavingObs(true);
    try {
      const { error } = await supabase
        .from("refrigeracao_historico_permanente")
        .upsert(
          {
            ativo: os.ativo,
            equipamento: os.equipamento,
            informacoes_tecnicas: obsTecnica.trim(),
            data_ultima_atualizacao: new Date().toISOString(),
          },
          { onConflict: "ativo,equipamento" }
        );
      if (error) throw error;
      setObsTecnicaOriginal(obsTecnica);
      toast.success("Informações técnicas salvas no histórico permanente.");
    } catch (e: any) {
      toast.error("Erro ao salvar histórico: " + e.message);
    } finally {
      setSavingObs(false);
    }
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files) return;
    const next: Preview[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const blob = await compressImage(f);
      const id = uuid();
      const blobKey = `draft:${os.id}:${id}`;
      await blobPut(blobKey, blob);
      next.push({ id, blobKey, url: URL.createObjectURL(blob) });
    }
    if (next.length) setPreviews((p) => [...p, ...next]);
  };

  const removePreview = (id: string) => {
    setPreviews((p) => {
      const rm = p.find((x) => x.id === id);
      if (rm) {
        URL.revokeObjectURL(rm.url);
        blobDelete(rm.blobKey).catch(() => {});
      }
      return p.filter((x) => x.id !== id);
    });
  };

  const saveAll = async () => {
    const items: OutboxItem[] = [];
    for (const p of previews) {
      items.push({
        id: p.id,
        kind: "foto",
        osId: os.id,
        numeroOs: os.numero_os,
        payload: { blobKey: p.blobKey },
        createdAt: Date.now(),
        attempts: 0,
      });
    }

    for (const p of pecas) {
      if (!p.descricao.trim()) continue;
      items.push({
        id: p.id,
        kind: "peca",
        osId: os.id,
        numeroOs: os.numero_os,
        payload: {
          descricao: p.descricao.trim(),
          quantidade: Number(p.quantidade) || 1,
          urgencia: p.urgencia,
          observacao: p.observacao.trim() || null,
          patrimonio: (p.patrimonio || patrim || os.patrimonio || "").trim() || null,
          modelo: p.modelo.trim() || null,
          btus: p.btus.trim() || null,
        },
        createdAt: Date.now(),
        attempts: 0,
      });
    }

    for (const pr of problemas) {
      if (!pr.descricao.trim()) continue;
      items.push({
        id: pr.id,
        kind: "problema",
        osId: os.id,
        numeroOs: os.numero_os,
        payload: { descricao: pr.descricao.trim(), gravidade: pr.gravidade },
        createdAt: Date.now(),
        attempts: 0,
      });
    }
    if (items.length === 0) {
      toast.warning("Nada para salvar. Adicione foto, peça ou problema.");
      return;
    }
    // Marca a OS como Concluída ao enviar
    const nowIso = new Date().toISOString();
    items.push({
      id: uuid(),
      kind: "status",
      osId: os.id,
      numeroOs: os.numero_os,
      payload: { status: "concluida", fim: nowIso },
      createdAt: Date.now(),
      attempts: 0,
    });
    setSaving(true);
    try {
      for (const it of items) await outboxAdd(it);
      previews.forEach((p) => URL.revokeObjectURL(p.url));
      setPreviews([]);
      setPecas([]);
      setProblemas([]);
      await draftDelete(os.id).catch(() => {});
      setDraftSavedAt(null);
      onPatchLocal({ status: "concluida", fim: nowIso });

      onQueued();
      toast.success(
        online
          ? "OS concluída. Enviando ao servidor…"
          : "Salvo offline. Enviaremos assim que houver internet.",
      );
      if (online) {
        try {
          const r = await syncPending();
          onQueued();
          if (r.sent > 0) toast.success(`${r.sent} enviado(s) ao servidor.`);
          if (r.failed > 0) toast.error(await getSyncFailureMessage(r));
        } catch {
          /* falha silenciosa: cache local é um extra */
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleBack = () => {
    // Rascunho já foi salvo automaticamente — sair não perde nada.
    previews.forEach((p) => URL.revokeObjectURL(p.url));
    onBack();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 sticky top-0 z-10 bg-background/80 backdrop-blur-md pb-2">

        <Button
          variant="outline"
          size="lg"
          onClick={handleBack}
          className="h-12 flex-1 justify-start gap-2 text-base font-semibold sm:flex-none"
        >
          <ArrowLeft className="h-5 w-5" />
          Voltar à lista
        </Button>
        {draftSavedAt && (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-600">
            <Save className="h-3.5 w-3.5" />
            Rascunho salvo — fotos e textos ficam guardados nesta OS
          </span>
        )}
      </div>

      <GlassCard className="overflow-hidden p-4">
        <div className="mb-3 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              OS selecionada
            </div>
            <div className="truncate font-mono text-lg font-bold">#{os.numero_os}</div>
            {os.nome_os && (
              <div className="mt-0.5 text-sm text-muted-foreground break-words [overflow-wrap:anywhere]">
                {os.nome_os}
              </div>
            )}
          </div>
          <Badge variant="outline" className="shrink-0 text-[10px]">
            {os.status}
          </Badge>
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          <ReadOnly label="Ativo" value={os.ativo} />
          <ReadOnly label="Equipamento" value={os.equipamento} />
          <ReadOnly label="Tipo" value={os.tipo ?? "—"} />
        </div>
        
        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <ReadOnly label="Prédio" value={os.predio ?? "—"} />
          <ReadOnly label="Andar" value={os.andar ?? "—"} />
          <ReadOnly label="Local" value={os.local ?? "—"} />
        </div>

        <div className="mt-4 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-3">
          <ReadOnly label="Equipe" value={os.equipe ?? "—"} />
          <ReadOnly label="Data SLA" value={fmtDate(os.data_sla)} />
          <ReadOnly label="Data programada" value={fmtDate(os.data_programada)} />
        </div>
      </GlassCard>

      {priorInfo &&
        (priorInfo.pecas.length > 0 || priorInfo.problemas.length > 0 || priorInfo.suggested) && (
          <GlassCard className="border-amber-500/30 bg-amber-50/60 p-4 dark:bg-amber-500/5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="min-w-0 flex-1 space-y-2">
                <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                  Histórico deste equipamento
                </h3>
                <p className="text-xs text-amber-700/90 dark:text-amber-200/80">
                  Encontramos registros anteriores para{" "}
                  <span className="font-mono">{os.ativo}</span> · {os.equipamento}.
                </p>
                {priorInfo.suggested && !(os.patrimonio ?? "").trim() && (
                  <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs text-emerald-800 dark:text-emerald-300">
                    Patrimônio sugerido de OS anteriores:{" "}
                    <span className="font-mono font-semibold">{priorInfo.suggested}</span> — já
                    preenchido abaixo, revise e salve.
                  </div>
                )}
                {priorInfo.pecas.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800/80 dark:text-amber-200/80">
                      Peças já solicitadas ({priorInfo.pecas.length})
                    </div>
                    <ul className="mt-1 space-y-1">
                      {priorInfo.pecas.slice(0, 5).map((p: any) => (
                        <li key={p.id} className="flex flex-wrap items-center gap-1.5 text-xs">
                          <Badge variant="outline" className="text-[10px]">
                            Qtd {p.quantidade}
                          </Badge>
                          <span className="font-medium">{p.descricao}</span>
                          <Badge variant="secondary" className="text-[10px]">
                            {p.urgencia}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {p.status_gestor}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {priorInfo.problemas.length > 0 && (
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800/80 dark:text-amber-200/80">
                      Problemas já sinalizados ({priorInfo.problemas.length})
                    </div>
                    <ul className="mt-1 space-y-1">
                      {priorInfo.problemas.slice(0, 5).map((pr: any) => (
                        <li key={pr.id} className="flex flex-wrap items-start gap-1.5 text-xs">
                          <Badge variant="outline" className="text-[10px]">
                            {pr.gravidade}
                          </Badge>
                          <span className="line-clamp-2">{pr.descricao}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </GlassCard>
        )}

      <GlassCard className="p-4 border-primary/20 bg-primary/5">
        <SectionTitle icon={RefreshCw} label="Informações Técnicas Permanentes" />
        <p className="mt-1 text-xs text-muted-foreground">
          Estas informações são vinculadas ao <strong>Ativo/Equipamento</strong> e serão preenchidas automaticamente em OS futuras.
        </p>
        <div className="mt-3 space-y-2">
          <Textarea
            value={obsTecnica}
            onChange={(e) => setObsTecnica(e.target.value)}
            placeholder="Ex.: Modelo, BTUs, Gás refrigerante, histórico de vazamentos..."
            className="min-h-[100px] text-sm"
          />
          <Button
            onClick={saveObsTecnica}
            disabled={savingObs || obsTecnica === obsTecnicaOriginal}
            className="w-full sm:w-auto h-11"
          >
            {savingObs ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Atualizar Histórico Permanente
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <SectionTitle icon={Package} label="Patrimônio (opcional)" />
        <p className="mt-1 text-xs text-muted-foreground">
          Se você identificou o número de patrimônio do equipamento em campo, registre aqui.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Input
            value={patrim}
            onChange={(e) => setPatrim(e.target.value)}
            placeholder="Ex.: PAT-01234"
            className="h-11 max-w-xs"
          />
          <Button
            onClick={savePatrimonio}
            disabled={savingPatrim || patrim.trim() === (os.patrimonio ?? "")}
            className="h-11"
          >
            {savingPatrim ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Salvar patrimônio
          </Button>
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <SectionTitle icon={Camera} label="Fotos (opcional)" />
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={() => fileInputRef.current?.click()}
          >
            <Camera className="mr-2 h-4 w-4" /> Adicionar fotos
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(e.target.files)}
          />
        </div>
        {previews.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {previews.map((p, idx) => (
              <div
                key={p.id}
                className="group relative aspect-square overflow-hidden rounded-md border"
              >
                <img loading="lazy" decoding="async" src={p.url} className="h-full w-full object-cover" alt="preview" />
                <div className="absolute right-1 top-1 flex gap-1">
                  <a
                    href={p.url}
                    download={`OS-${os.numero_os}-foto-${idx + 1}.jpg`}
                    className="rounded-full bg-black/60 p-1 text-white transition hover:bg-black/80"
                    aria-label="Baixar foto"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={() => removePreview(p.id)}
                    className="rounded-full bg-black/60 p-1 text-white transition hover:bg-red-600"
                    aria-label="Remover foto"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <HostedPhotoLinksCard osId={os.id} tipo={os.tipo} pendingCount={previews.length} />

      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={Package} label={`Solicitar peças (${pecas.length})`} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPecas((l) => [...l, emptyPeca()])}
          >
            <Package className="mr-2 h-4 w-4" /> Adicionar peça
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Anexo de foto é <span className="font-medium">opcional</span> — use a seção "Fotos" acima
          se quiser registrar imagens.
        </p>
        {pecas.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Nenhuma peça adicionada. Clique em "Adicionar peça" para solicitar uma ou mais.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {pecas.map((p, idx) => (
              <div key={p.id} className="rounded-md border bg-background/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Peça #{idx + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPecas((l) => l.filter((x) => x.id !== p.id))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <Label>Descrição da peça</Label>
                    <Input
                      value={p.descricao}
                      onChange={(e) =>
                        setPecas((l) =>
                          l.map((x) => (x.id === p.id ? { ...x, descricao: e.target.value } : x)),
                        )
                      }
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label>Quantidade</Label>
                    <Input
                      type="number"
                      min={1}
                      value={p.quantidade}
                      onChange={(e) =>
                        setPecas((l) =>
                          l.map((x) => (x.id === p.id ? { ...x, quantidade: e.target.value } : x)),
                        )
                      }
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label>Urgência</Label>
                    <Select
                      value={p.urgencia}
                      onValueChange={(v) =>
                        setPecas((l) => l.map((x) => (x.id === p.id ? { ...x, urgencia: v } : x)))
                      }
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="baixa">Baixa</SelectItem>
                        <SelectItem value="media">Média</SelectItem>
                        <SelectItem value="alta">Alta — parado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Patrimônio</Label>
                    <Input
                      value={p.patrimonio}
                      onChange={(e) =>
                        setPecas((l) =>
                          l.map((x) => (x.id === p.id ? { ...x, patrimonio: e.target.value } : x)),
                        )
                      }
                      placeholder={patrim || os.patrimonio || "—"}
                      className="h-11"
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      Preenchido automaticamente com o patrimônio da OS.
                    </p>
                  </div>
                  <div>
                    <Label>Modelo</Label>
                    <Input
                      value={p.modelo}
                      onChange={(e) =>
                        setPecas((l) =>
                          l.map((x) => (x.id === p.id ? { ...x, modelo: e.target.value } : x)),
                        )
                      }
                      placeholder="Ex.: Split Inverter, Cassete…"
                      className="h-11"
                    />
                  </div>
                  <div>
                    <Label>BTUs</Label>
                    <Input
                      value={p.btus}
                      onChange={(e) =>
                        setPecas((l) =>
                          l.map((x) => (x.id === p.id ? { ...x, btus: e.target.value } : x)),
                        )
                      }
                      placeholder="Ex.: 9000, 12000, 24000…"
                      className="h-11"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label>Observação</Label>
                    <Textarea
                      value={p.observacao}
                      onChange={(e) =>
                        setPecas((l) =>
                          l.map((x) => (x.id === p.id ? { ...x, observacao: e.target.value } : x)),
                        )
                      }
                      rows={2}
                      placeholder="Detalhes adicionais (opcional)"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <GlassCard className="p-4">
        <div className="flex items-center justify-between gap-2">
          <SectionTitle icon={AlertTriangle} label={`Sinalizar problemas (${problemas.length})`} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setProblemas((l) => [...l, emptyProblema()])}
          >
            <AlertTriangle className="mr-2 h-4 w-4" /> Adicionar problema
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Anexo de foto é <span className="font-medium">opcional</span> — use a seção "Fotos" acima
          se quiser registrar imagens.
        </p>
        {problemas.length === 0 ? (
          <p className="mt-3 text-xs text-muted-foreground">
            Nenhum problema sinalizado. Clique em "Adicionar problema" para registrar.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {problemas.map((pr, idx) => (
              <div key={pr.id} className="rounded-md border bg-background/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Problema #{idx + 1}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setProblemas((l) => l.filter((x) => x.id !== pr.id))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid gap-3">
                  <div>
                    <Label>Descrição do problema</Label>
                    <Textarea
                      value={pr.descricao}
                      onChange={(e) =>
                        setProblemas((l) =>
                          l.map((x) => (x.id === pr.id ? { ...x, descricao: e.target.value } : x)),
                        )
                      }
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label>Gravidade</Label>
                    <Select
                      value={pr.gravidade}
                      onValueChange={(v) =>
                        setProblemas((l) =>
                          l.map((x) => (x.id === pr.id ? { ...x, gravidade: v } : x)),
                        )
                      }
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="observacao">Observação</SelectItem>
                        <SelectItem value="falha">Funcionando com falha</SelectItem>
                        <SelectItem value="critico">Crítico — parado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-10 md:bottom-2">
        <Button
          size="lg"
          className="h-14 w-full text-base font-semibold shadow-lg"
          onClick={saveAll}
          loading={saving}
        >
          {saving ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-5 w-5" />
          )}
          {online ? "Salvar e enviar" : "Salvar offline"}
        </Button>
      </div>
    </div>
  );
}

/**
 * Card exclusivo do fluxo Preventiva: mostra os links públicos (ImgBB) das
 * fotos já hospedadas para esta OS, com abrir/copiar e estados de upload.
 * Só renderiza para OS de tipo preventiva.
 */
function HostedPhotoLinksCard({
  osId,
  tipo,
  pendingCount,
}: {
  osId: string;
  tipo: string | null;
  pendingCount: number;
}) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["refrig-fotos-links", osId],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("refrigeracao_fotos")
        .select("id, image_url, created_at, legenda")
        .eq("os_id", osId)
        .not("image_url", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        image_url: string;
        created_at: string;
        legenda: string | null;
      }>;
    },
  });

  void tipo;

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between gap-2">
        <SectionTitle icon={Link2} label="Foto do equipamento (link hospedado)" />
        {isFetching && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Fotos anexadas são hospedadas automaticamente e o link fica salvo aqui. Clique em{" "}
        <span className="font-medium">Abrir</span> para visualizar ou salvar no dispositivo.
      </p>

      {pendingCount > 0 && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs text-muted-foreground backdrop-blur-xl">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
          {pendingCount} foto(s) aguardando envio — o link aparece após a sincronização.
        </div>
      )}

      {isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando links…
        </div>
      ) : error ? (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs">
          <span>Falha ao carregar links.</span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 rounded-full"
            onClick={() => refetch()}
          >
            Tentar novamente
          </Button>
        </div>
      ) : (data ?? []).length === 0 ? (
        <div className="mt-3 flex items-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-muted-foreground">
          <ImageIcon className="h-4 w-4" />
          Nenhum link disponível ainda. Adicione uma foto acima.
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {(data ?? []).map((f) => (
            <li
              key={f.id}
              className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2 pr-3 backdrop-blur-xl transition-all duration-200 hover:border-primary/30 hover:bg-white/[0.07]"
            >
              <a
                href={f.image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="relative block h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-white/10 bg-black/20"
                aria-label="Abrir foto"
              >
                <img
                  src={f.image_url}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </a>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[11px] text-muted-foreground">
                  {f.image_url}
                </div>
                <div className="text-[10px] text-muted-foreground/70">
                  {new Date(f.created_at).toLocaleString("pt-BR")}
                </div>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 rounded-full px-3 text-xs transition-transform active:scale-95"
                  onClick={() => copy(f.image_url)}
                >
                  <Copy className="mr-1 h-3 w-3" /> Copiar
                </Button>
                <a
                  href={f.image_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-8 items-center rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground shadow-sm transition-transform active:scale-95"
                >
                  <ExternalLink className="mr-1 h-3 w-3" /> Abrir
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </GlassCard>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <Label className="text-[10px] uppercase text-muted-foreground/70 tracking-wider">
        {label}
      </Label>
      <div className="mt-1 min-w-0 overflow-hidden rounded-xl border border-white/5 bg-white/5 px-3 py-2.5 text-sm font-medium text-white/90 shadow-sm backdrop-blur-sm transition-colors hover:bg-white/[0.08] break-words [overflow-wrap:anywhere]">
        {value}
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 text-primary" />
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </h3>
    </div>
  );
}

function fmtDate(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString("pt-BR");
}

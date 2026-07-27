import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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
  Wrench,
  Users,
  Pencil,
  Save,
  ArrowLeft,
  Download,
  PenLine,
} from "lucide-react";
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
} from "@/lib/corretiva/db";
import { compressImage } from "@/lib/corretiva/image";
import { syncPending } from "@/lib/corretiva/sync";

import {
  loadEquipe,
  saveEquipe,
  matchEquipe,
  equipeStyles,
  type EquipeFiltro,
} from "@/lib/corretiva/equipe";
import { SignaturePad } from "@/components/corretiva/signature-pad";
import { OsPhotosButton } from "@/components/refrigeracao/os-photos-button";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const Route = createFileRoute("/_authenticated/corretiva")({
  component: CorretivaPage,
});

const OS_COLUMNS =
  "id, numero_os, nome_os, predio, andar, local, tipo, equipe, data_sla, data_programada, inicio, fim, ativo, equipamento, patrimonio, status, updated_at";

function uuid() {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
}

function useOnlineStatus() {
  const [online, setOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
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

type EquipeRow = { id: string; nome: string; colaboradores: string; ordem: number };

function CorretivaPage() {
  const online = useOnlineStatus();
  const { isAdmin } = useIsAdmin();
  const [osList, setOsList] = useState<OsCacheRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [equipe, setEquipe] = useState<EquipeFiltro>("todas");
  const [equipes, setEquipes] = useState<EquipeRow[]>([]);
  const [managingTeams, setManagingTeams] = useState(false);
  const [lockedEquipe, setLockedEquipe] = useState<string | null>(null);

  useEffect(() => {
    setEquipe(loadEquipe());
    void reloadEquipes();
  }, []);


  const reloadEquipes = async () => {
    const { data } = await supabase
      .from("corretiva_equipes")
      .select("id, nome, colaboradores, ordem")
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true });
    setEquipes((data ?? []) as EquipeRow[]);
  };


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
      console.error("[corretiva] doSync fatal", e);
      if (!silent) toast.error(e?.message ?? "Falha ao sincronizar");
    } finally {
      setSyncing(false);
      refreshPending();
    }
  };

  const refreshOsFromServer = async () => {
    const { data, error } = await supabase
      .from("corretiva_os")
      .select(OS_COLUMNS)
      .order("numero_os", { ascending: true });
    if (error) throw error;
    const rows = (data ?? []) as unknown as OsCacheRow[];
    await cacheOsList(rows);
    setOsList(rows);
  };

  useEffect(() => {
    (async () => {
      try {
        const cached = await getCachedOsList();
        if (cached.length) setOsList(cached);
      } catch {}
      if (navigator.onLine) {
        try {
          await refreshOsFromServer();
        } catch (e: any) {
          if (osList.length === 0)
            toast.error("Não foi possível carregar OS: " + (e?.message ?? ""));
        }
      }
      setLoadingList(false);
      refreshPending();
      doSync(true);
    })();
    const on = () => doSync(true);
    window.addEventListener("online", on);
    const focus = () => { if (navigator.onLine) doSync(true); };
    window.addEventListener("focus", focus);
    const iv = window.setInterval(() => { if (navigator.onLine) doSync(true); }, 30_000);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("focus", focus);
      window.clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return osList.filter((o) => {
      if (!matchEquipe(o.equipe, equipe)) return false;
      if (!q) return true;
      return (
        o.numero_os.toLowerCase().includes(q) ||
        o.ativo.toLowerCase().includes(q) ||
        o.equipamento.toLowerCase().includes(q) ||
        (o.nome_os ?? "").toLowerCase().includes(q) ||
        (o.predio ?? "").toLowerCase().includes(q) ||
        (o.local ?? "").toLowerCase().includes(q)
      );
    });
  }, [osList, search, equipe]);

  const selected = osList.find((o) => o.id === selectedId) ?? null;

  const patchLocal = (id: string, patch: Partial<OsCacheRow>) => {
    setOsList((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    updateCachedOs(id, patch).catch(() => {});
  };

  const currentEquipe = equipes.find((e) => e.nome === equipe) ?? null;

  return (
    <PageShell
      title="Gestão de Corretivas"
      description="Registro de corretivas em campo — funciona offline. Fotos, peças e problemas são salvos localmente e enviados quando houver internet."
      actions={
        <>
          <StatusChip online={online} syncing={syncing} pending={pending} />
          <Button
            size="sm"
            variant="outline"
            onClick={() => doSync(false)}
            disabled={syncing || !online}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            Sincronizar
          </Button>
        </>
      }
    >
      {/* Colaborador / Equipe */}
      <GlassCard className="mb-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Equipe</div>
              <div className="text-base font-semibold">{currentEquipe?.nome ?? (equipe === "todas" ? "Todas" : equipe)}</div>
            </div>
          </div>
          {currentEquipe && (
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Colaboradores</div>
              <div className="text-sm">{currentEquipe.colaboradores || "—"}</div>
            </div>
          )}
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              className="ml-auto"
              onClick={() => setManagingTeams((v) => !v)}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {managingTeams ? "Fechar edição" : "Editar equipes"}
            </Button>
          )}
        </div>
      </GlassCard>

      {isAdmin && managingTeams && (
        <EquipesEditor equipes={equipes} onChange={reloadEquipes} />
      )}

      {!selected ? (
        <GlassCard className="p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            {!lockedEquipe && (
              <div className="flex flex-col items-stretch gap-1 sm:flex-row sm:items-center sm:gap-2 sm:min-w-[240px]">
                <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Minha equipe
                </span>
                <Select
                  value={equipe}
                  onValueChange={(v) => setEquipeAndPersist(v as EquipeFiltro)}
                >
                  <SelectTrigger className="h-11 flex-1 text-base sm:w-[220px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as equipes</SelectItem>
                    {equipes.map((e) => (
                      <SelectItem key={e.id} value={e.nome}>
                        {e.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex flex-1 items-center gap-2">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por OS, nome, ativo, prédio, local…"
                className="h-11 text-base"
              />
            </div>
          </div>
          {!lockedEquipe && equipe !== "todas" && (
            <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary" className="text-[10px]">{equipe}</Badge>
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
                ? "Nenhuma OS disponível. Importe a planilha em Configurações ou peça ao gestor."
                : "Nenhuma OS encontrada para essa busca."}
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {filtered.map((o) => {
                const st = equipeStyles(o.equipe);
                const isDone = (o.status ?? "").toLowerCase() === "concluida";
                const rowCls = isDone
                  ? "border-l-4 border-emerald-500 bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
                  : st.row;
                return (
                <li key={o.id}>
                  <div className={`flex w-full items-start gap-3 rounded-md px-2 py-3 text-left transition ${rowCls}`}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(o.id)}
                      className="flex flex-1 items-start gap-3 text-left"
                    >
                      {isDone ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                      )}

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`font-mono text-sm font-semibold ${isDone ? "text-emerald-800 dark:text-emerald-300" : ""}`}>
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
                              <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${st.dot}`} />
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
                          <div className={`mt-0.5 truncate text-sm font-medium ${isDone ? "text-emerald-900/80 dark:text-emerald-200/90" : ""}`}>
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
                      <OsPhotosButton osId={o.id} numeroOs={o.numero_os} modulo="corretiva" />
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>

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
    ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
    : syncing
      ? "bg-sky-500/15 text-sky-600 border-sky-500/30"
      : pending > 0
        ? "bg-orange-500/15 text-orange-600 border-orange-500/30"
        : "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
  const Icon = !online ? WifiOff : syncing ? Loader2 : pending > 0 ? RefreshCw : Wifi;
  const label = !online
    ? `Offline${pending > 0 ? ` · ${pending} pendente(s)` : ""}`
    : syncing
      ? "Sincronizando…"
      : pending > 0
        ? `${pending} pendente(s)`
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

  // Rubrica do solicitante (confirma que o serviço foi realizado)
  const [assinatura, setAssinatura] = useState<string | null>(null);
  const [assinaturaNome, setAssinaturaNome] = useState("");

  // Peças (lista) — permite solicitar várias peças diferentes em uma única transação
  type PecaDraft = {
    id: string;
    descricao: string;
    modelo: string;
    quantidade: string;
    urgencia: string;
    observacao: string;
  };
  const emptyPeca = (): PecaDraft => ({
    id: uuid(),
    descricao: "",
    modelo: "",
    quantidade: "1",
    urgencia: "media",
    observacao: "",
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

  const [saving, setSaving] = useState(false);
  const [draftLoaded, setDraftLoaded] = useState(false);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);


  // Restaura rascunho salvo (fotos + textos) ao entrar na OS
  useEffect(() => {
    let cancelled = false;
    setDraftLoaded(false);
    setPreviews([]);
    setPecas([]);
    setProblemas([]);
    setAssinatura(null);
    setAssinaturaNome("");
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
        setPecas((d.pecas ?? []).map((p) => ({ ...p, modelo: p.modelo ?? "" })));
        setProblemas(d.problemas ?? []);
        setAssinatura(d.assinatura ?? null);
        setAssinaturaNome(d.assinaturaNome ?? "");
        if (d.fotos.length + (d.pecas?.length ?? 0) + (d.problemas?.length ?? 0) > 0) {
          setDraftSavedAt(d.updatedAt);
        }
      } catch {}
      setDraftLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [os.id]);

  // Auto-save do rascunho (debounced)
  useEffect(() => {
    if (!draftLoaded) return;
    const hasAny =
      previews.length > 0 || pecas.length > 0 || problemas.length > 0 || !!assinatura;
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
        assinatura,
        assinaturaNome,
        updatedAt: Date.now(),
      };
      draftPut(draft)
        .then(() => setDraftSavedAt(draft.updatedAt))
        .catch(() => {});
    }, 400);
    return () => clearTimeout(t);
  }, [previews, pecas, problemas, assinatura, assinaturaNome, draftLoaded, os.id]);


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
          modelo: p.modelo.trim() || null,
          quantidade: Number(p.quantidade) || 1,
          urgencia: p.urgencia,
          observacao: p.observacao.trim() || null,
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
    if (!assinatura) {
      toast.error("Colete a rubrica do solicitante antes de finalizar.");
      return;
    }
    const assinadoEm = new Date().toISOString();
    items.push({
      id: uuid(),
      kind: "assinatura",
      osId: os.id,
      numeroOs: os.numero_os,
      payload: { dataUrl: assinatura, nome: assinaturaNome.trim() || null, assinadoEm },
      createdAt: Date.now(),
      attempts: 0,
    });
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
      setAssinatura(null);
      setAssinaturaNome("");
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
        } catch {}
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
      <div className="flex flex-wrap items-center gap-2">
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


      <GlassCard className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              OS selecionada
            </div>
            <div className="truncate font-mono text-lg font-bold">#{os.numero_os}</div>
            {os.nome_os && (
              <div className="mt-0.5 truncate text-sm text-muted-foreground">{os.nome_os}</div>
            )}
          </div>
          <Badge variant="outline" className="text-[10px]">{os.status}</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          <ReadOnly label="Ativo" value={os.ativo} />
          <ReadOnly label="Equipamento" value={os.equipamento} />
          <ReadOnly label="Tipo" value={os.tipo ?? "—"} />
          <ReadOnly label="Prédio" value={os.predio ?? "—"} />
          <ReadOnly label="Andar" value={os.andar ?? "—"} />
          <ReadOnly label="Local" value={os.local ?? "—"} />
          <ReadOnly label="Equipe" value={os.equipe ?? "—"} />
          <ReadOnly label="Data SLA" value={fmtDate(os.data_sla)} />
          <ReadOnly label="Data programada" value={fmtDate(os.data_programada)} />
        </div>
      </GlassCard>

      <GlassCard className="p-4">
        <SectionTitle icon={Camera} label="Fotos" />
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
                <img src={p.url} className="h-full w-full object-cover" alt="preview" />
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
                  <div className="sm:col-span-2">
                    <Label>Modelo / especificação</Label>
                    <Input
                      value={p.modelo}
                      onChange={(e) =>
                        setPecas((l) =>
                          l.map((x) => (x.id === p.id ? { ...x, modelo: e.target.value } : x)),
                        )
                      }
                      placeholder="ex.: Torneira, Lâmpada..."
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
                          l.map((x) =>
                            x.id === p.id ? { ...x, quantidade: e.target.value } : x,
                          ),
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
                        setPecas((l) =>
                          l.map((x) => (x.id === p.id ? { ...x, urgencia: v } : x)),
                        )
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
                  <div className="sm:col-span-2">
                    <Label>Observação</Label>
                    <Textarea
                      value={p.observacao}
                      onChange={(e) =>
                        setPecas((l) =>
                          l.map((x) =>
                            x.id === p.id ? { ...x, observacao: e.target.value } : x,
                          ),
                        )
                      }
                      rows={2}
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
                          l.map((x) =>
                            x.id === pr.id ? { ...x, descricao: e.target.value } : x,
                          ),
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


      <GlassCard className="p-4">
        <SectionTitle icon={PenLine} label="Rubrica do solicitante" />
        <p className="mt-1 text-xs text-muted-foreground">
          Peça ao solicitante que assine na tela com o dedo, confirmando que o serviço foi
          realizado. A rubrica é obrigatória para finalizar a OS.
        </p>
        <div className="mt-3 space-y-3">
          <div>
            <Label>Nome do solicitante</Label>
            <Input
              value={assinaturaNome}
              onChange={(e) => setAssinaturaNome(e.target.value)}
              placeholder="Ex.: Maria Silva"
              className="h-11 max-w-sm"
            />
          </div>
          <SignaturePad value={assinatura} onChange={setAssinatura} />
        </div>
      </GlassCard>

      <div className="sticky bottom-2 z-10">
        <Button
          size="lg"
          className="h-14 w-full text-base font-semibold shadow-lg"
          onClick={saveAll}
          disabled={saving}
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

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">{value}</div>
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

function EquipesEditor({
  equipes,
  onChange,
}: {
  equipes: EquipeRow[];
  onChange: () => void | Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, { nome: string; colaboradores: string }>>({});
  const [newNome, setNewNome] = useState("");
  const [newColabs, setNewColabs] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const draftFor = (e: EquipeRow) =>
    drafts[e.id] ?? { nome: e.nome, colaboradores: e.colaboradores ?? "" };

  const save = async (e: EquipeRow) => {
    const d = draftFor(e);
    setSaving(e.id);
    const { error } = await supabase
      .from("corretiva_equipes")
      .update({ nome: d.nome.trim(), colaboradores: d.colaboradores.trim() })
      .eq("id", e.id);
    setSaving(null);
    if (error) {
      toast.error("Erro ao salvar equipe: " + error.message);
      return;
    }
    toast.success("Equipe atualizada.");
    setDrafts((prev) => {
      const copy = { ...prev };
      delete copy[e.id];
      return copy;
    });
    await onChange();
  };

  const remove = async (e: EquipeRow) => {
    if (!confirm(`Remover equipe "${e.nome}"?`)) return;
    const { error } = await supabase.from("corretiva_equipes").delete().eq("id", e.id);
    if (error) {
      toast.error("Erro ao remover: " + error.message);
      return;
    }
    toast.success("Equipe removida.");
    await onChange();
  };

  const create = async () => {
    const nome = newNome.trim();
    if (!nome) {
      toast.error("Informe o nome da equipe.");
      return;
    }
    setSaving("__new__");
    const { error } = await supabase
      .from("corretiva_equipes")
      .insert({ nome, colaboradores: newColabs.trim(), ordem: equipes.length });
    setSaving(null);
    if (error) {
      toast.error("Erro ao criar: " + error.message);
      return;
    }
    setNewNome("");
    setNewColabs("");
    toast.success("Equipe criada.");
    await onChange();
  };

  return (
    <GlassCard className="mb-3 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Pencil className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Editar equipes e colaboradores</h3>
      </div>
      <div className="space-y-3">
        {equipes.map((e) => {
          const d = draftFor(e);
          const dirty = d.nome !== e.nome || d.colaboradores !== (e.colaboradores ?? "");
          return (
            <div
              key={e.id}
              className="grid grid-cols-1 gap-2 rounded-md border border-border/50 p-3 sm:grid-cols-[1fr_2fr_auto]"
            >
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">Equipe</Label>
                <Input
                  value={d.nome}
                  onChange={(ev) =>
                    setDrafts((p) => ({ ...p, [e.id]: { ...d, nome: ev.target.value } }))
                  }
                  className="h-9"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">
                  Colaboradores (ex: Emerson - William)
                </Label>
                <Input
                  value={d.colaboradores}
                  onChange={(ev) =>
                    setDrafts((p) => ({ ...p, [e.id]: { ...d, colaboradores: ev.target.value } }))
                  }
                  className="h-9"
                />
              </div>
              <div className="flex items-end gap-2">
                <Button
                  size="sm"
                  onClick={() => save(e)}
                  disabled={!dirty || saving === e.id}
                >
                  {saving === e.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                </Button>
                <Button size="sm" variant="outline" onClick={() => remove(e)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}

        <div className="grid grid-cols-1 gap-2 rounded-md border border-dashed border-border p-3 sm:grid-cols-[1fr_2fr_auto]">
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Nova equipe</Label>
            <Input value={newNome} onChange={(e) => setNewNome(e.target.value)} className="h-9" placeholder="Ex: Elétrica" />
          </div>
          <div>
            <Label className="text-[10px] uppercase text-muted-foreground">Colaboradores</Label>
            <Input
              value={newColabs}
              onChange={(e) => setNewColabs(e.target.value)}
              className="h-9"
              placeholder="Ex: João - Pedro"
            />
          </div>
          <div className="flex items-end">
            <Button size="sm" onClick={create} disabled={saving === "__new__"}>
              {saving === "__new__" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Adicionar"}
            </Button>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}


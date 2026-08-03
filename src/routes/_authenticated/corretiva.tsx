import { useEffect, useMemo, useState } from "react";
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
  Save,
  ArrowLeft,
  Trash2,
  Calendar,
  MoreVertical,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
} from "@/lib/corretiva/db";
import { compressImage } from "@/lib/corretiva/image";
import { syncPending } from "@/lib/corretiva/sync";
import { OsPhotosButton } from "@/components/refrigeracao/os-photos-button";
import { loadEquipe, saveEquipe, matchEquipe, equipeStyles, type EquipeFiltro } from "@/lib/corretiva/equipe";
import { isPreventiva } from "@/lib/corretiva/preventiva-import";
import { PreventivaImportDialog } from "@/components/corretiva/preventiva-import-dialog";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  SEMANA_INICIAL,
  fetchLiberacoes,
  intervaloSemana,
  semanaDaOs,
  semanaKey,
  setLiberacao,
} from "@/lib/corretiva/semanas";

export const Route = createFileRoute("/_authenticated/corretiva")({
  component: CorretivaPage,
});

/**
 * Cores fluorescentes por equipe de corretiva:
 * Hidráulica → laranja fluorescente
 * Civil → verde água fluorescente
 * Chaveiro → roxo fluorescente
 * Elétrica → verde fluorescente
 * Pintura → rosa fluorescente
 * Refrigeração → azul bebê fluorescente (corretiva, não preventiva)
 */
function getTeamStyles(equipe: string | null | undefined) {
  const styles = equipeStyles(equipe);
  return styles;
}

const OS_COLUMNS =
  "id, numero_os, nome_os, predio, andar, local, tipo, equipe, data_sla, data_programada, inicio, fim, ativo, equipamento, patrimonio, status, updated_at, solicitante, data_criacao";

function uuid() {
  return (crypto as any).randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
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
  const [mesFiltro, setMesFiltro] = useState<string>("08");
  const [aba, setAba] = useState<"corretiva" | "preventiva">("corretiva");
  /** "atual" = semana 32 em diante · "todas" · "AAAA-SS" para uma semana específica. */
  const [semanaFiltro, setSemanaFiltro] = useState<string>("atual");
  const [liberadas, setLiberadas] = useState<Record<string, boolean>>({});
  const [savingSemana, setSavingSemana] = useState<string | null>(null);

  const carregarLiberacoes = async () => {
    try {
      const rows = await fetchLiberacoes();
      setLiberadas(
        Object.fromEntries(rows.map((r) => [semanaKey(r.ano, r.semana), r.liberada])),
      );
    } catch {
      /* offline: mantém o cache em memória */
    }
  };

  useEffect(() => {
    carregarLiberacoes();
  }, []);





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
      if (r.failed > 0 && !silent) toast.error(`${r.failed} falha(s) na sincronização.`);
    } catch (e: any) {
      if (!silent) toast.error("Falha ao sincronizar");
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
          if (osList.length === 0) toast.error("Não foi possível carregar OS");
        }
      }
      setLoadingList(false);
      refreshPending();
      doSync(true);
    })();
    const iv = window.setInterval(() => {
      if (navigator.onLine) doSync(true);
    }, 30_000);
    return () => window.clearInterval(iv);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return osList.filter((o) => {
      const prev = isPreventiva(o.tipo);
      if (aba === "preventiva" ? !prev : prev) return false;
      if (!matchEquipe(o.equipe, equipe)) return false;
      if (mesFiltro !== "todos") {
        const dateStr = o.data_criacao || o.updated_at;
        const date = dateStr ? new Date(dateStr) : null;
        if (!date || String(date.getMonth() + 1).padStart(2, "0") !== mesFiltro) return false;
      }
      if (!q) return true;
      return (
        o.numero_os.toLowerCase().includes(q) ||
        o.ativo.toLowerCase().includes(q) ||
        o.equipamento.toLowerCase().includes(q) ||
        (o.nome_os ?? "").toLowerCase().includes(q) ||
        (o.predio ?? "").toLowerCase().includes(q) ||
        (o.local ?? "").toLowerCase().includes(q)
      );
    }).sort((a, b) => a.numero_os.localeCompare(b.numero_os, "pt-BR", { numeric: true }));
  }, [osList, search, equipe, mesFiltro, aba]);


  const selected = osList.find((o) => o.id === selectedId) ?? null;

  const patchLocal = (id: string, patch: Partial<OsCacheRow>) => {
    setOsList((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    updateCachedOs(id, patch).catch(() => {});
  };

  return (
    <PageShell
      title={aba === "preventiva" ? "Manutenção Preventiva" : "Programação — Campo"}
      description="Gestão de Campo — otimizado para mobile com evidências fotográficas."
      actions={
        <div className="flex items-center gap-2">
          <PreventivaImportDialog
            mode="corretiva"
            onDone={() => refreshOsFromServer().catch(() => {})}
          />
          <PreventivaImportDialog
            mode="preventiva"
            onDone={() => refreshOsFromServer().catch(() => {})}
          />


          <Badge variant={online ? "outline" : "destructive"} className="gap-1.5 py-1 px-2">
            {online ? <Wifi className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3" />}
            {online ? "Online" : "Offline"}
          </Badge>
          {pending > 0 && (
            <Badge variant="secondary" className="gap-1.5 py-1 px-2 bg-amber-500/20 text-amber-500 border-amber-500/20">
              <RefreshCw className={`h-3 w-3 ${syncing ? "animate-spin" : ""}`} />
              {pending} pendente(s)
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={() => doSync(false)} disabled={syncing || !online}>
            Sincronizar
          </Button>

          {isAdmin && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Limpar Chamados
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Limpar chamados?</AlertDialogTitle>
                  <AlertDialogDescription>Esta ação removerá permanentemente as OS de corretiva da base de dados.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-red-600 hover:bg-red-700"
                    onClick={async () => {
                      try {
                        await clearOsTable({ data: { module: "corretiva" } });
                        toast.success("Tabela limpa");
                        window.location.reload();
                      } catch (e: any) {
                        toast.error("Erro ao limpar");
                      }
                    }}
                  >
                    Confirmar
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      }
    >
      {!selected ? (
        <GlassCard className="p-4">
          <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-white/5 p-1">
            {([
              { k: "corretiva", label: "Corretivas" },
              { k: "preventiva", label: "Preventivas" },
            ] as const).map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setAba(t.k)}
                className={cn(
                  "min-h-11 rounded-lg px-4 text-sm font-medium transition-all",
                  aba === t.k
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar OS, ativo, local…"
                  className="pl-9 h-11 text-base"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={mesFiltro} onValueChange={setMesFiltro}>
                <SelectTrigger className="h-11 w-[140px] bg-white/5 border-white/10">
                  <Calendar className="mr-2 h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os meses</SelectItem>
                  {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map(m => (
                    <SelectItem key={m} value={m}>Mês {m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={equipe} onValueChange={(v) => setEquipeAndPersist(v as EquipeFiltro)}>
                <SelectTrigger className="h-11 w-[160px] bg-white/5 border-white/10">
                  <SelectValue placeholder="Equipe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas Equipes</SelectItem>
                  {/* As equipes de corretiva são dinâmicas, aqui usamos as principais para o filtro rápido */}
                  {["Civil", "Eletrica", "Hidraulica", "Chaveiro", "Pintura", "Refrigeracao"].map(e => (
                    <SelectItem key={e} value={e}>{e}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loadingList ? (
            <div className="p-12 text-center text-muted-foreground"><Loader2 className="mx-auto mb-2 animate-spin" /> Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">Nenhuma OS encontrada.</div>
          ) : (
            <div className="space-y-2">
              {filtered.map((o) => {
                const isDone = (o.status ?? "").toLowerCase() === "concluida";
                const styles = getTeamStyles(o.equipe);
                const rowCls = isDone 
                  ? "border-l-4 border-emerald-500 bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
                  : styles.row;

                return (
                  <button
                    key={o.id}
                    onClick={() => setSelectedId(o.id)}
                    className={`w-full flex items-start gap-3 p-4 rounded-xl text-left transition-all active:scale-[0.98] ${rowCls}`}
                  >
                    <div className={`mt-1.5 h-3 w-3 rounded-full shrink-0 ${isDone ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : styles.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-mono font-bold ${isDone ? 'text-emerald-800 dark:text-emerald-300' : 'text-white/90'}`}>OS {o.numero_os}</span>
                        {isDone && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/20 text-[10px]">CONCLUÍDA</Badge>}
                      </div>
                      <h3 className="text-sm font-medium text-white/80 line-clamp-1">{o.nome_os}</h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{o.predio} · {o.andar} · {o.local}</p>
                      <div className="mt-2 flex items-center gap-2">
                        <Badge variant="outline" className={cn("text-[10px] py-0 px-2", styles.badge)}>{o.equipe || "Sem Equipe"}</Badge>
                        <span className="text-[10px] text-muted-foreground">{o.ativo}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </GlassCard>
      ) : (
        <OSDetailView
          os={selected}
          onBack={() => setSelectedId(null)}
          onUpdate={(patch) => patchLocal(selected.id, patch)}
        />
      )}
    </PageShell>
  );
}

function OSDetailView({ os, onBack, onUpdate }: { os: OsCacheRow; onBack: () => void; onUpdate: (p: Partial<OsCacheRow>) => void }) {
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const isDone = os.status === "concluida";

  useEffect(() => {
    draftGet(os.id).then((d) => setDraft(d || { osId: os.id, fotos: [], pecas: [], problemas: [], updatedAt: Date.now() }));
  }, [os.id]);

  const saveDraft = async (newDraft: any) => {
    const d = { ...newDraft, updatedAt: Date.now() };
    setDraft(d);
    await draftPut(d);
  };

  const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const compressed = await compressImage(file);
      const blobKey = `photo-${uuid()}`;
      await blobPut(blobKey, compressed);
      const photo = { id: uuid(), blobKey };
      const newDraft = { ...draft, fotos: [...(draft.fotos || []), photo] };
      await saveDraft(newDraft);
      toast.success("Foto capturada!");
    } catch (err) {
      toast.error("Erro ao processar imagem");
    }
  };

  const handleFinalize = async () => {
    if (!draft.fotos?.length) {
      toast.error("Anexe pelo menos uma foto como evidência.");
      return;
    }
    setSaving(true);
    try {
      // 1. Queue Status Update
      await outboxAdd({
        id: uuid(),
        kind: "status",
        osId: os.id,
        numeroOs: os.numero_os,
        payload: { status: "concluida", fim: new Date().toISOString() },
        createdAt: Date.now(),
        attempts: 0
      });

      // 2. Queue Photos
      for (const f of draft.fotos) {
        await outboxAdd({
          id: f.id,
          kind: "foto",
          osId: os.id,
          numeroOs: os.numero_os,
          payload: { blobKey: f.blobKey, legenda: "Evidência de campo" },
          createdAt: Date.now(),
          attempts: 0
        });
      }

      onUpdate({ status: "concluida" });
      await draftDelete(os.id);
      toast.success("OS enviada para sincronização!");
      onBack();
    } catch (err) {
      toast.error("Erro ao salvar rascunho");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <OsPhotosButton osId={os.id} modulo="corretiva" variant="outline" size="sm" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <GlassCard className="p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <Badge variant="outline" className="mb-2 border-primary/20 bg-primary/10 text-primary">OS {os.numero_os}</Badge>
                <h1 className="text-2xl font-bold text-white">{os.nome_os}</h1>
                <p className="text-muted-foreground mt-1">{os.predio} · {os.andar} · {os.local}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-muted-foreground block mb-1 uppercase tracking-wider">Status Atual</span>
                <Badge className={isDone ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/20" : "bg-blue-500/20 text-blue-400 border-blue-500/20"}>
                  {isDone ? "Concluída" : "Aberta"}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
              <div><Label className="text-[10px] uppercase text-muted-foreground">Ativo</Label><p className="text-sm font-medium text-white/90">{os.ativo}</p></div>
              <div><Label className="text-[10px] uppercase text-muted-foreground">Equipamento</Label><p className="text-sm font-medium text-white/90">{os.equipamento}</p></div>
              <div><Label className="text-[10px] uppercase text-muted-foreground">Equipe</Label><p className="text-sm font-medium text-white/90">{os.equipe}</p></div>
              <div><Label className="text-[10px] uppercase text-muted-foreground">SLA</Label><p className="text-sm font-medium text-white/90">{os.data_sla ? new Date(os.data_sla).toLocaleDateString() : 'N/A'}</p></div>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2"><Camera className="h-5 w-5 text-primary" /> Evidências Fotográficas</h2>
              {!isDone && (
                <div className="relative">
                  <Input type="file" accept="image/*" capture="environment" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleAddPhoto} />
                  <Button size="sm" className="gap-2 pointer-events-none"><Camera className="h-4 w-4" /> Tirar Foto</Button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {draft?.fotos?.map((f: any) => (
                <div key={f.id} className="relative aspect-square rounded-lg overflow-hidden border border-white/10 bg-white/5">
                  <LocalImage blobKey={f.blobKey} />
                  {!isDone && (
                    <Button
                      size="icon"
                      variant="destructive"
                      className="absolute top-1 right-1 h-6 w-6 rounded-full"
                      onClick={async () => {
                        await blobDelete(f.blobKey);
                        await saveDraft({ ...draft, fotos: draft.fotos.filter((x: any) => x.id !== f.id) });
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
              {(!draft?.fotos || draft.fotos.length === 0) && (
                <div className="col-span-full py-12 text-center border-2 border-dashed border-white/10 rounded-xl bg-white/[0.02]">
                  <Camera className="mx-auto h-8 w-8 text-muted-foreground/30 mb-2" />
                  <p className="text-sm text-muted-foreground">Nenhuma foto capturada.</p>
                </div>
              )}
            </div>
          </GlassCard>
        </div>

        <div className="space-y-6">
          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><Package className="h-5 w-5 text-primary" /> Peças e Materiais</h2>
            <p className="text-xs text-muted-foreground mb-4 italic">*Funcionalidade de rascunho em desenvolvimento para Corretiva</p>
            {!isDone && (
              <Button variant="outline" className="w-full border-dashed" disabled>Adicionar Item</Button>
            )}
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><AlertTriangle className="h-5 w-5 text-primary" /> Diagnóstico</h2>
            <Textarea placeholder="Descreva os problemas encontrados ou observações técnicas..." className="min-h-[120px] bg-white/5" disabled={isDone} />
          </GlassCard>

          {!isDone && (
            <Button className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20" onClick={handleFinalize} disabled={saving}>
              {saving ? <Loader2 className="mr-2 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
              Finalizar Atendimento
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function LocalImage({ blobKey }: { blobKey: string }) {
  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    blobGet(blobKey).then(b => {
      if (b) setSrc(URL.createObjectURL(b));
    });
  }, [blobKey]);
  if (!src) return <div className="w-full h-full flex items-center justify-center"><Loader2 className="animate-spin text-muted-foreground/20" /></div>;
  return <img loading="lazy" decoding="async" src={src} className="w-full h-full object-cover" alt="Evidência" />;
}

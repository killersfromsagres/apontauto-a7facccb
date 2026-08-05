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
  Lock,
  MoreVertical,
  FileSpreadsheet,
  Settings2,
  Zap,
  ScrollText,
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
  "id, numero_os, nome_os, predio, andar, local, tipo, equipe, data_sla, data_programada, inicio, fim, ativo, equipamento, patrimonio, status, updated_at, solicitante, data_criacao, material_status";

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
  const [mesFiltro, setMesFiltro] = useState<string>("todos");
  const [aba, setAba] = useState<"corretiva" | "preventiva">("corretiva");
  /** "atual" = semana 32 em diante · "todas" · "AAAA-SS" para uma semana específica. */
  const [semanaFiltro, setSemanaFiltro] = useState<string>("todas");
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
          if (osList.length === 0) toast.error("Não foi possível carregar OS: The user denied permission to access the database.");
        }
      }
      setLoadingList(false);
      refreshPending();
      doSync(true);
    })();
    const iv = window.setInterval(() => {
      if (navigator.onLine) doSync(true);
    }, 10_000); // Sincronização agressiva a cada 10s
    const onOnline = () => { if (navigator.onLine) doSync(true); };
    const onFocus = () => { if (navigator.onLine) doSync(true); };
    window.addEventListener("online", onOnline);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(iv);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  /** Semanas ISO presentes na base (>= semana 32), com contagem de OS. */
  const semanasDisponiveis = useMemo(() => {
    const map = new Map<string, { ano: number; semana: number; total: number }>();
    for (const o of osList) {
      const s = semanaDaOs(o as any);
      if (!s) continue;
      if (s.semana < SEMANA_INICIAL) continue;
      const key = semanaKey(s.ano, s.semana);
      const cur = map.get(key);
      if (cur) cur.total += 1;
      else map.set(key, { ano: s.ano, semana: s.semana, total: 1 });
    }
    return Array.from(map.entries())
      .map(([key, v]) => ({ key, ...v }))
      .sort((a, b) => a.key.localeCompare(b.key));
  }, [osList]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    
    // Lista de datas únicas para o filtro da Coluna F
    const datasDisponiveis = Array.from(new Set(osList
      .map(o => o.data_criacao ? new Date(o.data_criacao).toLocaleDateString('pt-BR') : null)
      .filter(Boolean)
    )).sort();

    return osList.filter((o) => {
      const isBackorder = o.tipo === "Backorder";
      const isPreventivaAba = isPreventiva(o.tipo);
      
      // Ajuste de abas: 
      // Se aba for 'preventiva', mostramos OS do tipo 'Backorder' ou 'Preventiva'
      // Se aba for 'corretiva', mostramos OS do tipo 'Corretiva'
      if (aba === "preventiva") {
        if (!isBackorder && !isPreventivaAba) return false;
      } else {
        if (isBackorder || isPreventivaAba) return false;
      }

      if (!matchEquipe(o.equipe, equipe)) return false;

      const s = semanaDaOs(o as any);
      const key = s ? semanaKey(s.ano, s.semana) : null;
      if (semanaFiltro === "atual") {
        if (!s || s.semana < SEMANA_INICIAL) return false;
      } else if (semanaFiltro !== "todas") {
        if (key !== semanaFiltro) return false;
      }
      // Colaboradores só enxergam semanas liberadas pelo gestor.
      if (!isAdmin && key && s && s.semana >= SEMANA_INICIAL && !liberadas[key]) return false;

      if (mesFiltro !== "todos") {
        const dateStr = o.data_criacao || o.updated_at;
        const date = dateStr ? new Date(dateStr) : null;
        if (!date || String(date.getMonth() + 1).padStart(2, "0") !== mesFiltro) return false;
      }
      if (search && search.includes("/")) {
        const dateStr = o.data_criacao ? new Date(o.data_criacao).toLocaleDateString('pt-BR') : null;
        if (dateStr !== search) return false;
      }

      if (!q || q.includes("/")) return true;
      return (
        o.numero_os.toLowerCase().includes(q) ||
        o.ativo.toLowerCase().includes(q) ||
        o.equipamento.toLowerCase().includes(q) ||
        (o.nome_os ?? "").toLowerCase().includes(q) ||
        (o.predio ?? "").toLowerCase().includes(q) ||
        (o.local ?? "").toLowerCase().includes(q)
      );
    }).sort((a, b) => {
      // Ordenação: priorizar data de criação para identificar atrasos
      const da = a.data_criacao ? new Date(a.data_criacao).getTime() : 0;
      const db = b.data_criacao ? new Date(b.data_criacao).getTime() : 0;
      return da - db || a.numero_os.localeCompare(b.numero_os, "pt-BR", { numeric: true });
    });
  }, [osList, search, equipe, mesFiltro, aba, semanaFiltro, liberadas, isAdmin]);

  const toggleSemana = async (ano: number, semana: number, valor: boolean) => {
    const key = semanaKey(ano, semana);
    setSavingSemana(key);
    try {
      await setLiberacao(ano, semana, valor);
      setLiberadas((prev) => ({ ...prev, [key]: valor }));
      toast.success(valor ? `Semana ${semana} liberada` : `Semana ${semana} bloqueada`);
    } catch {
      toast.error("Não foi possível atualizar a liberação.");
    } finally {
      setSavingSemana(null);
    }
  };



  const selected = osList.find((o) => o.id === selectedId) ?? null;

  const patchLocal = (id: string, patch: Partial<OsCacheRow>) => {
    setOsList((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    updateCachedOs(id, patch).catch(() => {});
  };

  return (
    <PageShell
      title={aba === "preventiva" ? "Backorder — Campo" : "Programação — Campo"}
      description={aba === "preventiva" ? "Controle de backorder agendado." : "Gestão de corretivas e backorder."}
      backButton
      backUrl="/"
      onBack={selectedId ? () => setSelectedId(null) : undefined}



      actions={
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {isAdmin && (
            <div className="flex flex-1 flex-wrap items-center gap-2 sm:flex-none">
              <PreventivaImportDialog
                mode="corretiva"
                onDone={() => refreshOsFromServer().catch(() => {})}
              />
              <PreventivaImportDialog
                mode="backorder"
                onDone={() => refreshOsFromServer().catch(() => {})}
              />
              <Dialog>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" className="h-11 flex-1 gap-2 sm:h-9 sm:flex-none">
                    <Lock className="h-4 w-4" />
                    <span className="sm:inline">Liberar</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Liberação da programação por semana</DialogTitle>
                    <DialogDescription>
                      A partir da semana {SEMANA_INICIAL}. Colaboradores só visualizam e executam
                      as OS das semanas liberadas.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
                    {semanasDisponiveis.length === 0 ? (
                      <p className="py-6 text-center text-sm text-muted-foreground">
                        Nenhuma semana encontrada na programação atual.
                      </p>
                    ) : (
                      semanasDisponiveis.map((s) => {
                        const ativa = !!liberadas[s.key];
                        return (
                          <div
                            key={s.key}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">
                                Semana {s.semana}/{s.ano}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {intervaloSemana(s.ano, s.semana)} · {s.total} OS
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "text-[10px]",
                                  ativa
                                    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-400"
                                    : "border-amber-500/30 bg-amber-500/15 text-amber-400",
                                )}
                              >
                                {ativa ? "Liberada" : "Bloqueada"}
                              </Badge>
                              <Button
                                size="sm"
                                variant={ativa ? "outline" : "default"}
                                disabled={savingSemana === s.key}
                                onClick={() => toggleSemana(s.ano, s.semana, !ativa)}
                              >
                                {savingSemana === s.key ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : ativa ? (
                                  "Bloquear"
                                ) : (
                                  "Liberar"
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          )}

          <div className="flex flex-1 items-center gap-2 sm:flex-none">
            <Button
              size="sm"
              variant="outline"
              className="h-11 flex-1 gap-2 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 sm:h-9 sm:flex-none"
              onClick={() => window.location.href = '/corretiva-historico'}
            >
              <ScrollText className="h-4 w-4" />
              <span>Histórico</span>
            </Button>
            <Badge variant={online ? "outline" : "destructive"} className="h-11 px-2.5 sm:h-9">
              {online ? <Wifi className="h-3 w-3 text-emerald-500" /> : <WifiOff className="h-3 w-3" />}
            </Badge>
            <Button
              size="sm"
              variant="outline"
              className="h-11 flex-1 sm:h-9 sm:flex-none"
              onClick={() => doSync(false)}
              disabled={syncing || !online}
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            </Button>
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" className="h-11 bg-red-500/10 text-red-500 border-red-500/20 hover:bg-red-500/20 px-3 sm:h-9">
                    <Trash2 className="h-4 w-4" />
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
        </div>
      }
    >

      {!selected ? (
        <GlassCard className="flex flex-col gap-4 p-4">
          {isAdmin && (
            <div className="flex items-center justify-between px-1 mb-1">
              <h2 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Settings2 className="h-4 w-4" /> Gestão Administrativa
              </h2>
              <Badge variant="outline" className="text-[10px] bg-primary/5 text-primary border-primary/20">
                Acesso Total
              </Badge>
            </div>
          )}
          <div className="inline-flex w-full overflow-x-auto rounded-xl border border-white/10 bg-white/5 p-1 sm:w-auto">

            {([
              { k: "corretiva", label: "Corretivas" },
              { k: "preventiva", label: "Backorder" },
            ] as const).map((t) => (
              <button
                key={t.k}
                type="button"
                onClick={() => setAba(t.k)}
                className={cn(
                  "flex-1 min-h-11 rounded-lg px-4 text-sm font-medium transition-all sm:flex-none",
                  aba === t.k
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="mb-4 space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
                <Select value={equipe} onValueChange={(v) => setEquipeAndPersist(v as EquipeFiltro)}>
                  <SelectTrigger className="h-11 w-[160px] bg-white/5 border-white/10">
                    <SelectValue placeholder="Equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas Equipes</SelectItem>
                    <SelectItem value="Chaveiro">Chaveiro</SelectItem>
                    <SelectItem value="Civil">Civil</SelectItem>
                    <SelectItem value="Hidráulica">Hidráulica</SelectItem>
                    <SelectItem value="Elétrica">Elétrica</SelectItem>
                    <SelectItem value="Pintura">Pintura</SelectItem>
                    <SelectItem value="Refrigeração">Refrigeração</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-4">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                  Filtrar Planilha por Data de Abertura (Coluna F)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Filtre os dados exibindo apenas as linhas onde a "Data/Hora Solicitação" (coluna F) corresponde a um valor específico.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Select
                  value={search === "" ? "todos" : search}
                  onValueChange={(v) => setSearch(v === "todos" ? "" : v)}
                >
                  <SelectTrigger className="h-10 w-full sm:w-[300px] bg-white/5 border-white/10">
                    <SelectValue placeholder="Selecionar Data (Coluna F)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas as Datas</SelectItem>
                    {Array.from(new Set(osList
                      .map(o => o.data_criacao ? new Date(o.data_criacao).toLocaleDateString('pt-BR') : null)
                      .filter(Boolean)
                    )).sort((a, b) => {
                      const [da, ma, ya] = a!.split('/').map(Number);
                      const [db, mb, yb] = b!.split('/').map(Number);
                      return new Date(ya, ma - 1, da).getTime() - new Date(yb, mb - 1, db).getTime();
                    }).map((date) => (
                      <SelectItem key={date!} value={date!}>{date}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {search && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSearch("")}
                    className="h-10 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <X className="mr-2 h-3 w-3" /> Limpar Filtro
                  </Button>
                )}
              </div>
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
                const isBackorder = aba === "preventiva";
                
                const rowCls = isDone 
                  ? "border-l-4 border-emerald-500 bg-emerald-50/70 hover:bg-emerald-100/70 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20"
                  : "border-l-4 border-red-500 bg-red-50/70 hover:bg-red-100/70 dark:bg-red-500/10 dark:hover:bg-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.15)]";

                const dotColor = isDone 
                  ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' 
                  : styles.dot;

                return (
                  <button
                    key={o.id}
                    onClick={() => {
                      if (selectedId === o.id) return;
                      setSelectedId(o.id);
                    }}
                    className={cn(
                      "w-full flex items-start gap-3 p-4 rounded-xl text-left transition-colors",
                      rowCls
                    )}
                  >
                    <div className={cn("mt-1.5 h-3 w-3 rounded-full shrink-0", dotColor)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-lg font-mono font-black tracking-tight ${isDone ? 'text-emerald-800 dark:text-emerald-300' : 'text-white'}`}>OS {o.numero_os}</span>
                          {(() => {
                            if (!o.data_criacao) return null;
                            const diff = (new Date().getTime() - new Date(o.data_criacao).getTime()) / (1000 * 60 * 60 * 24);
                            if (diff >= 30) {
                              return (
                                <Badge variant="destructive" className="animate-pulse bg-red-600 hover:bg-red-700 text-[10px] h-4 px-1.5 py-0 border-none">
                                  {Math.floor(diff)}d atraso
                                </Badge>
                              );
                            }
                            return null;
                          })()}
                        </div>
                        {isDone && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/20 text-[10px]">CONCLUÍDA</Badge>}
                        {o.material_status === "solicitado" && (
                          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[9px] font-bold animate-pulse px-1.5 h-4">
                            MATERIAL SOLICITADO
                          </Badge>
                        )}
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
  const { isAdmin } = useIsAdmin();
  const [draft, setDraft] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const isDone = os.status === "concluida";

  useEffect(() => {
    draftGet(os.id).then((d) => setDraft(d || { osId: os.id, fotos: [], pecas: [], problemas: [], updatedAt: Date.now() }));
  }, [os.id]);

  useEffect(() => {
    if (draft && !isDone) {
      const iv = setInterval(() => {
        draftPut({ ...draft, updatedAt: Date.now() });
      }, 5000); // Autosave every 5s if modified
      return () => clearInterval(iv);
    }
  }, [draft, isDone]);

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
        payload: { status: "concluida", fim: new Date().toISOString(), assinatura_nome: draft.assinaturaNome },
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

      // 3. Queue Pieces/Materials
      if (draft.pecas?.length) {
        for (const p of draft.pecas) {
          await outboxAdd({
            id: uuid(),
            kind: "peca",
            osId: os.id,
            numeroOs: os.numero_os,
            payload: { ...p },
            createdAt: Date.now(),
            attempts: 0
          });
        }
      }

      // 4. Queue Problems/Diagnosis
      if (draft.problemas?.length) {
        for (const pr of draft.problemas) {
          await outboxAdd({
            id: uuid(),
            kind: "problema",
            osId: os.id,
            numeroOs: os.numero_os,
            payload: { ...pr },
            createdAt: Date.now(),
            attempts: 0
          });
        }
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
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2 h-9 border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            onClick={() => window.location.href = '/corretiva-historico'}
          >
            <ScrollText className="h-4 w-4" />
            <span className="hidden sm:inline">Histórico</span>
          </Button>
          <OsPhotosButton osId={os.id} modulo="corretiva" variant="outline" size="sm" />
        </div>
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

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 p-4 rounded-xl bg-white/5 border border-white/5">
              <div><Label className="text-[10px] uppercase text-muted-foreground">Ativo</Label><p className="text-sm font-medium text-white/90 break-words">{os.ativo}</p></div>
              <div><Label className="text-[10px] uppercase text-muted-foreground">Data Abertura</Label><p className="text-sm font-medium text-white/90">{os.data_criacao ? new Date(os.data_criacao).toLocaleDateString("pt-BR") : "—"}</p></div>
              <div>
                <Label className="text-[10px] uppercase text-muted-foreground">SLA (Dias de Atraso)</Label>
                {(() => {
                  if (!os.data_criacao) return <p className="text-sm font-medium text-white/90">—</p>;
                  const diff = Math.floor((new Date().getTime() - new Date(os.data_criacao).getTime()) / (1000 * 60 * 60 * 24));
                  const atraso = diff - 30;
                  return (
                    <p className={cn("text-sm font-bold", atraso > 0 ? "text-red-500" : "text-emerald-400")}>
                      {atraso > 0 ? `${atraso} dias em atraso` : "No prazo"}
                    </p>
                  );
                })()}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 mt-2 rounded-xl bg-white/5 border border-white/5">
              <div><Label className="text-[10px] uppercase text-muted-foreground">Prédio</Label><p className="text-sm font-medium text-white/90">{os.predio || "—"}</p></div>
              <div><Label className="text-[10px] uppercase text-muted-foreground">Andar</Label><p className="text-sm font-medium text-white/90">{os.andar || "—"}</p></div>
              <div><Label className="text-[10px] uppercase text-muted-foreground">Local</Label><p className="text-sm font-medium text-white/90 break-words">{os.local || "—"}</p></div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 mt-2 rounded-xl bg-white/5 border border-white/5">
              <div><Label className="text-[10px] uppercase text-muted-foreground">Equipe</Label><p className="text-sm font-medium text-white/90">{os.equipe}</p></div>
              <div><Label className="text-[10px] uppercase text-muted-foreground">Solicitante</Label><p className="text-sm font-medium text-white/90 break-words">{os.solicitante || "—"}</p></div>
              <div><Label className="text-[10px] uppercase text-muted-foreground">Tipo</Label><p className="text-sm font-medium text-white/90">{os.tipo === "Backorder" ? "Backorder" : "Corretiva"}</p></div>
              {os.material_status && (
                <div className="md:col-span-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">Material</Label>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 animate-pulse text-[10px] font-bold py-0.5">
                      MATERIAL SOLICITADO
                    </Badge>
                  </div>
                </div>
              )}
            </div>

            {isAdmin && (
              <div className="mt-4 flex flex-wrap gap-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                <div className="w-full mb-1">
                  <p className="text-[10px] font-bold uppercase tracking-tight text-primary/70">
                    Ações Administrativas
                  </p>
                </div>
                
                <Select
                  value={os.equipe || ""}
                  onValueChange={async (novaEquipe) => {
                    if (!navigator.onLine) return toast.error("Offline: Não é possível reclassificar agora.");
                    try {
                      const { error } = await supabase
                        .from("corretiva_os")
                        .update({ equipe: novaEquipe })
                        .eq("id", os.id);
                      if (error) throw error;
                      onUpdate({ equipe: novaEquipe });
                      toast.success(`OS reclassificada para ${novaEquipe}`);
                    } catch {
                      toast.error("Erro ao reclassificar");
                    }
                  }}
                >
                  <SelectTrigger className="h-10 flex-1 bg-background/50 border-primary/20">
                    <div className="flex items-center gap-2">
                      <Settings2 className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs">Reclassificar Equipe</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {["Hidráulica", "Elétrica", "Civil", "Chaveiro", "Pintura", "Refrigeração"].map((e) => (
                      <SelectItem key={e} value={e}>{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant="outline"
                  className="h-10 flex-1 gap-2 border-emerald-500/30 hover:bg-emerald-500/10 hover:text-emerald-400 text-xs"
                  onClick={async () => {
                    if (!navigator.onLine) return toast.error("Offline: Não é possível finalizar agora.");
                    try {
                      const { error } = await supabase
                        .from("corretiva_os")
                        .update({ 
                          status: "concluida",
                          fim: new Date().toISOString(),
                          assinatura_nome: "Finalizado pelo Admin (Sem foto)"
                        } as any)
                        .eq("id", os.id);
                      if (error) throw error;
                      onUpdate({ status: "concluida" });
                      toast.success("OS finalizada administrativamente.");
                      onBack();
                    } catch {
                      toast.error("Erro ao finalizar OS");
                    }
                  }}
                >
                  <Zap className="h-3.5 w-3.5 text-emerald-400" />
                  Finalizar sem foto
                </Button>

                <Button
                  variant="outline"
                  className={cn(
                    "h-10 flex-1 gap-2 text-xs transition-all duration-300",
                    os.material_status === "solicitado"
                      ? "bg-amber-500/20 border-amber-500/40 text-amber-400 shadow-[0_0_15px_rgba(245,158,11,0.2)]"
                      : "border-white/10 hover:bg-amber-500/10 hover:text-amber-400 hover:border-amber-500/30"
                  )}
                  onClick={async () => {
                    if (!navigator.onLine) return toast.error("Offline: Não é possível alterar agora.");
                    const novoStatus = os.material_status === "solicitado" ? null : "solicitado";
                    try {
                      const { error } = await supabase
                        .from("corretiva_os")
                        .update({ 
                          material_status: novoStatus 
                        } as any)
                        .eq("id", os.id);
                      if (error) throw error;
                      onUpdate({ material_status: novoStatus });
                      toast.success(novoStatus ? "Material marcado como solicitado" : "Etiqueta de material removida");
                    } catch {
                      toast.error("Erro ao atualizar status de material");
                    }
                  }}
                >
                  <Package className={cn("h-3.5 w-3.5", os.material_status === "solicitado" ? "animate-bounce" : "")} />
                  {os.material_status === "solicitado" ? "Remover Material" : "Solicitar Material"}
                </Button>
              </div>
            )}
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
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><Package className="h-5 w-5 text-primary" /> Confirmar Solicitante</h2>
            <div className="space-y-2">
              <Label htmlFor="assinatura_nome">Nome completo do solicitante</Label>
              <Input
                id="assinatura_nome"
                placeholder="Ex: João da Silva Santos"
                className="h-12 bg-white/5 text-base"
                value={draft?.assinaturaNome || ""}
                onChange={(e) => saveDraft({ ...draft, assinaturaNome: e.target.value })}
                disabled={isDone}
              />
            </div>
            
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><Package className="h-5 w-5 text-primary" /> Peças e Materiais</h2>
            <div className="flex items-center justify-between gap-2 mb-4">
              <p className="text-xs text-muted-foreground">Adicione peças necessárias para o serviço.</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  const newDraft = { ...draft, pecas: [...(draft.pecas || []), { id: uuid(), descricao: "", quantidade: "1", urgencia: "media", observacao: "" }] };
                  saveDraft(newDraft);
                }}
                disabled={isDone}
              >
                <Package className="mr-2 h-4 w-4" /> Adicionar
              </Button>
            </div>
            
            <div className="space-y-3">
              {draft?.pecas?.map((p: any, idx: number) => (
                <div key={p.id} className="rounded-md border border-white/10 bg-white/5 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Item #{idx + 1}</span>
                    {!isDone && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => {
                          const newDraft = { ...draft, pecas: draft.pecas.filter((x: any) => x.id !== p.id) };
                          saveDraft(newDraft);
                        }}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Input
                      placeholder="Descrição da peça"
                      value={p.descricao}
                      onChange={(e) => {
                        const newDraft = { ...draft, pecas: draft.pecas.map((x: any) => x.id === p.id ? { ...x, descricao: e.target.value } : x) };
                        saveDraft(newDraft);
                      }}
                      disabled={isDone}
                      className="h-9 bg-white/5 text-sm"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="number"
                        placeholder="Qtd"
                        value={p.quantidade}
                        onChange={(e) => {
                          const newDraft = { ...draft, pecas: draft.pecas.map((x: any) => x.id === p.id ? { ...x, quantidade: e.target.value } : x) };
                          saveDraft(newDraft);
                        }}
                        disabled={isDone}
                        className="h-9 bg-white/5 text-sm"
                      />
                      <Select
                        value={p.urgencia}
                        onValueChange={(v) => {
                          const newDraft = { ...draft, pecas: draft.pecas.map((x: any) => x.id === p.id ? { ...x, urgencia: v } : x) };
                          saveDraft(newDraft);
                        }}
                        disabled={isDone}
                      >
                        <SelectTrigger className="h-9 bg-white/5 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="baixa">Baixa</SelectItem>
                          <SelectItem value="media">Média</SelectItem>
                          <SelectItem value="alta">Alta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              ))}
              {(!draft?.pecas || draft.pecas.length === 0) && (
                <p className="text-[10px] text-center text-muted-foreground py-2">Nenhuma peça solicitada.</p>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-4"><AlertTriangle className="h-5 w-5 text-primary" /> Diagnóstico</h2>
            <Textarea 
              placeholder="Descreva os problemas encontrados ou observações técnicas..." 
              className="min-h-[120px] bg-white/5" 
              value={draft?.problemas?.[0]?.descricao || ""}
              onChange={(e) => {
                const newDraft = { ...draft, problemas: [{ id: draft.problemas?.[0]?.id || uuid(), descricao: e.target.value, gravidade: "falha" }] };
                saveDraft(newDraft);
              }}
              disabled={isDone} 
            />
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

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
  Snowflake,
  Save,
  ArrowLeft,
  Download,
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
} from "@/lib/refrigeracao/db";
import { compressImage } from "@/lib/refrigeracao/image";
import { syncPending } from "@/lib/refrigeracao/sync";

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
 * Cores por equipe para destaque visual na lista de atuações.
 * Refrigeração 1: azul claro · Refrigeração 2: verde água · Refrigeração 3: rosa claro
 */
function equipeStyles(equipe: string | null | undefined): { row: string; dot: string; badge: string } {
  const n = (equipe ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
  if (n === "refrigeracao 1")
    return {
      row: "border-l-4 border-sky-400 bg-sky-50/70 hover:bg-sky-100/70 dark:bg-sky-500/10 dark:hover:bg-sky-500/20",
      dot: "bg-sky-400",
      badge: "bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-500/20 dark:text-sky-200 dark:border-sky-500/40",
    };
  if (n === "refrigeracao 2")
    return {
      row: "border-l-4 border-teal-400 bg-teal-50/70 hover:bg-teal-100/70 dark:bg-teal-500/10 dark:hover:bg-teal-500/20",
      dot: "bg-teal-400",
      badge: "bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-500/20 dark:text-teal-200 dark:border-teal-500/40",
    };
  if (n === "refrigeracao 3")
    return {
      row: "border-l-4 border-pink-300 bg-pink-50/70 hover:bg-pink-100/70 dark:bg-pink-500/10 dark:hover:bg-pink-500/20",
      dot: "bg-pink-300",
      badge: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-500/20 dark:text-pink-200 dark:border-pink-500/40",
    };
  return {
    row: "border-l-4 border-transparent hover:bg-accent/60",
    dot: "bg-muted-foreground/40",
    badge: "",
  };
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

function RefrigeracaoPage() {
  const online = useOnlineStatus();
  const [osList, setOsList] = useState<OsCacheRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [loadingList, setLoadingList] = useState(true);
  const [equipe, setEquipe] = useState<EquipeFiltro>("todas");

  useEffect(() => {
    setEquipe(loadEquipe());
  }, []);

  const setEquipeAndPersist = (v: EquipeFiltro) => {
    setEquipe(v);
    saveEquipe(v);
  };

  const refreshPending = async () => setPending((await outboxAll()).length);

  const doSync = async (silent = false) => {
    if (!navigator.onLine) return;
    setSyncing(true);
    try {
      const r = await syncPending();
      if (!silent && r.sent > 0) toast.success(`${r.sent} registro(s) sincronizado(s).`);
      if (r.failed > 0 && !silent) toast.error(`${r.failed} pendente(s) — tentaremos novamente.`);
    } catch (e: any) {
      if (!silent) toast.error(e?.message ?? "Falha ao sincronizar");
    } finally {
      setSyncing(false);
      refreshPending();
    }
  };

  const refreshOsFromServer = async () => {
    const { data, error } = await supabase
      .from("refrigeracao_os")
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
    const on = () => doSync(false);
    window.addEventListener("online", on);
    return () => window.removeEventListener("online", on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = osList.filter((o) => {
      if (!matchEquipe(o.equipe, equipe)) return false;
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
      const pa = (a.predio ?? "\uffff");
      const pb = (b.predio ?? "\uffff");
      const pc = pa.localeCompare(pb, "pt-BR", { sensitivity: "base", numeric: true });
      if (pc !== 0) return pc;
      const aa = (a.andar ?? "").toString();
      const ab = (b.andar ?? "").toString();
      const ac = aa.localeCompare(ab, "pt-BR", { numeric: true, sensitivity: "base" });
      if (ac !== 0) return ac;
      return a.numero_os.localeCompare(b.numero_os, "pt-BR", { numeric: true });
    });
  }, [osList, search, equipe]);

  const selected = osList.find((o) => o.id === selectedId) ?? null;

  const patchLocal = (id: string, patch: Partial<OsCacheRow>) => {
    setOsList((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
    updateCachedOs(id, patch).catch(() => {});
  };

  return (
    <PageShell
      title="Refrigeração"
      description="Manutenção de Ar Condicionado — funciona offline. Salve seus dados; sincronizamos automaticamente quando houver internet."
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
      {!selected ? (
        <GlassCard className="p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 sm:min-w-[240px]">
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Minha equipe
              </span>
              <Select
                value={equipe}
                onValueChange={(v) => setEquipeAndPersist(v as EquipeFiltro)}
              >
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
                placeholder="Buscar por OS, nome, ativo, prédio, local, patrimônio…"
                className="h-11 text-base"
              />
            </div>
          </div>
          {equipe !== "todas" && (
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
                ? "Nenhuma OS disponível. O gestor precisa importar a planilha."
                : "Nenhuma OS encontrada para essa busca."}
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {filtered.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(o.id)}
                    className="flex w-full items-start gap-3 rounded-md px-2 py-3 text-left transition hover:bg-accent/60"
                  >
                    <Snowflake className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">OS {o.numero_os}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {o.status}
                        </Badge>
                        {o.tipo && (
                          <Badge variant="secondary" className="text-[10px]">
                            {o.tipo}
                          </Badge>
                        )}
                        {!o.patrimonio && (
                          <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-600">
                            sem patrimônio
                          </Badge>
                        )}
                      </div>
                      {o.nome_os && (
                        <div className="mt-0.5 truncate text-sm font-medium">{o.nome_os}</div>
                      )}
                      <div className="mt-0.5 truncate text-sm text-muted-foreground">
                        {o.equipamento} · Ativo {o.ativo}
                      </div>
                      <div className="truncate text-xs text-muted-foreground/80">
                        {[o.predio, o.andar, o.local].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
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
  };
  const emptyPeca = (): PecaDraft => ({
    id: uuid(),
    descricao: "",
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

  useEffect(() => {
    setPatrim(os.patrimonio ?? "");
  }, [os.id, os.patrimonio]);

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
        setPecas(d.pecas ?? []);
        setProblemas(d.problemas ?? []);
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
      previews.length > 0 || pecas.length > 0 || problemas.length > 0;
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
    }, 400);
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
        await syncPending();
        onQueued();
      }
      toast.success("Patrimônio salvo.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar patrimônio");
    } finally {
      setSavingPatrim(false);
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

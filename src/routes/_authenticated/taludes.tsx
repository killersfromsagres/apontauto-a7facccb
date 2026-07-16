import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Clock,
  Download,
  Image as ImageIcon,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TaludeMapCanvas } from "@/components/taludes/talude-map-canvas";
import { TaludeDetailPanel } from "@/components/taludes/talude-detail-panel";
import {
  createMapFromFile,
  createTalude,
  deleteMap,
  deleteTalude,
  fetchMaps,
  fetchTaludes,
  formatDateBR,
  getSignedMapUrl,
  STATUS_META,
  todayISO,
  updateTalude,
  type Point,
  type Talude,
  type TaludeMap,
  type TaludeStatus,
} from "@/lib/taludes";
import { exportMapPNG } from "@/lib/talude-export";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/taludes")({
  component: TaludesPage,
});

function TaludesPage() {
  const qc = useQueryClient();
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Point[]>([]);
  const [draftNumero, setDraftNumero] = useState<number | "">("");
  const [selectedTaludeId, setSelectedTaludeId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const mapsQ = useQuery({ queryKey: ["talude-maps"], queryFn: fetchMaps });
  const maps = mapsQ.data ?? [];

  useEffect(() => {
    if (!selectedMapId && maps.length > 0) setSelectedMapId(maps[0].id);
  }, [maps, selectedMapId]);

  const currentMap: TaludeMap | undefined = maps.find((m) => m.id === selectedMapId);

  const taludesQ = useQuery({
    queryKey: ["taludes", selectedMapId],
    queryFn: () => (selectedMapId ? fetchTaludes(selectedMapId) : Promise.resolve([])),
    enabled: !!selectedMapId,
  });
  const taludes = taludesQ.data ?? [];

  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    if (!currentMap) return;
    getSignedMapUrl(currentMap.image_path)
      .then((u) => {
        if (!cancelled) setImageUrl(u);
      })
      .catch((e) => toast.error(e?.message ?? "Erro ao carregar imagem."));
    return () => {
      cancelled = true;
    };
  }, [currentMap]);

  const stats = useMemo(() => {
    const s: Record<TaludeStatus, number> = { programado: 0, em_execucao: 0, finalizado: 0 };
    taludes.forEach((t) => (s[t.status] += 1));
    return s;
  }, [taludes]);

  const nextNumero = useMemo(() => {
    if (taludes.length === 0) return 1;
    return Math.max(...taludes.map((t) => t.numero)) + 1;
  }, [taludes]);

  useEffect(() => {
    if (editing && draftNumero === "") setDraftNumero(nextNumero);
  }, [editing, nextNumero, draftNumero]);

  const handleUpload = async (file: File) => {
    const nome = window.prompt("Nome deste mapa:", file.name.replace(/\.[^.]+$/, ""));
    if (!nome) return;
    try {
      const created = await createMapFromFile(file, nome);
      await qc.invalidateQueries({ queryKey: ["talude-maps"] });
      setSelectedMapId(created.id);
      toast.success("Mapa enviado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar mapa.");
    }
  };

  const handleDeleteMap = async () => {
    if (!currentMap) return;
    if (!confirm(`Excluir o mapa "${currentMap.nome}" e todos os seus taludes?`)) return;
    try {
      await deleteMap(currentMap);
      await qc.invalidateQueries({ queryKey: ["talude-maps"] });
      setSelectedMapId(null);
      toast.success("Mapa excluído.");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao excluir mapa.");
    }
  };

  const startEditing = () => {
    setEditing(true);
    setDraft([]);
    setDraftNumero(nextNumero);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft([]);
    setDraftNumero("");
  };

  const finishTalude = async () => {
    if (!currentMap) return;
    if (draft.length < 3) {
      toast.error("Desenhe ao menos 3 vértices.");
      return;
    }
    const numero = typeof draftNumero === "number" ? draftNumero : Number(draftNumero);
    if (!Number.isFinite(numero) || numero < 1) {
      toast.error("Número do talude inválido.");
      return;
    }
    if (taludes.some((t) => t.numero === numero)) {
      toast.error(`Já existe um Talude ${String(numero).padStart(2, "0")} neste mapa.`);
      return;
    }
    try {
      await createTalude({
        map_id: currentMap.id,
        numero,
        polygon: draft,
        data_programada: todayISO(),
        periodicidade_dias: currentMap.periodicidade_dias,
      });
      await qc.invalidateQueries({ queryKey: ["taludes", currentMap.id] });
      setDraft([]);
      setDraftNumero(numero + 1);
      toast.success(`Talude ${String(numero).padStart(2, "0")} criado.`);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar talude.");
    }
  };

  const moveExistingPoint = async (taludeId: string, i: number, p: Point) => {
    // otimiza: atualiza no cache imediato + persiste (debounce leve por drag)
    const t = taludes.find((x) => x.id === taludeId);
    if (!t) return;
    const next = t.polygon.map((pp, idx) => (idx === i ? p : pp));
    qc.setQueryData<Talude[]>(["taludes", currentMap?.id], (arr) =>
      (arr ?? []).map((x) => (x.id === taludeId ? { ...x, polygon: next } : x)),
    );
  };

  // Ao terminar arrasto: persiste — usamos mouseup global via evento sintético (aqui, ao sair do edit)
  useEffect(() => {
    if (!editing) return;
    const onUp = async () => {
      // persiste geometrias que mudaram (heurística: envia tudo do map atual)
      if (!currentMap) return;
      const cached = qc.getQueryData<Talude[]>(["taludes", currentMap.id]) ?? [];
      const original = taludesQ.data ?? [];
      const changed = cached.filter((c) => {
        const o = original.find((x) => x.id === c.id);
        if (!o) return false;
        return JSON.stringify(o.polygon) !== JSON.stringify(c.polygon);
      });
      for (const c of changed) {
        try {
          await updateTalude(c.id, { polygon: c.polygon });
        } catch (e: any) {
          toast.error(e?.message ?? "Erro ao salvar geometria.");
        }
      }
      if (changed.length > 0) await qc.invalidateQueries({ queryKey: ["taludes", currentMap.id] });
    };
    window.addEventListener("mouseup", onUp);
    return () => window.removeEventListener("mouseup", onUp);
  }, [editing, currentMap, qc, taludesQ.data]);

  const openDetails = (id: string) => {
    setSelectedTaludeId(id);
    setDetailOpen(true);
  };

  const saveTalude = async (patch: Partial<Talude>) => {
    if (!selectedTaludeId) return;
    await updateTalude(selectedTaludeId, patch);
    await qc.invalidateQueries({ queryKey: ["taludes", currentMap?.id] });
  };

  const removeTalude = async (id: string) => {
    await deleteTalude(id);
    await qc.invalidateQueries({ queryKey: ["taludes", currentMap?.id] });
  };

  const doExport = async () => {
    if (!currentMap || !imageUrl) return;
    setExporting(true);
    try {
      await exportMapPNG({ map: currentMap, imageUrl, taludes });
      toast.success("PNG gerado.");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao exportar.");
    } finally {
      setExporting(false);
    }
  };

  const selectedTalude = taludes.find((t) => t.id === selectedTaludeId) ?? null;

  return (
    <PageShell
      title="Programação de Taludes"
      description="Gerencie status, cronograma e mapa interativo por talude."
      actions={
        <>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-4 w-4" />
            Novo mapa
          </Button>
          <Button onClick={doExport} disabled={!currentMap || !imageUrl || exporting}>
            {exporting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Baixar Mapa (PNG)
          </Button>
        </>
      }
    >
      {maps.length === 0 ? (
        <EmptyState onUpload={() => fileRef.current?.click()} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label>Mapa ativo</Label>
              <Select
                value={selectedMapId ?? undefined}
                onValueChange={(v) => setSelectedMapId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {maps.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {currentMap && (
              <Button variant="outline" size="sm" onClick={handleDeleteMap}>
                <Trash2 className="mr-1.5 h-4 w-4" />
                Excluir mapa
              </Button>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <StatCard status="programado" count={stats.programado} />
            <StatCard status="em_execucao" count={stats.em_execucao} />
            <StatCard status="finalizado" count={stats.finalizado} />
          </div>

          {/* Editor toolbar */}
          <Card className="flex flex-wrap items-center gap-2 p-3 sm:gap-3">
            {!editing ? (
              <Button onClick={startEditing} size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                Adicionar talude
              </Button>
            ) : (
              <>
                <Pencil className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">
                  Clique no mapa para adicionar vértices — mín. 3.
                </span>
                <div className="flex items-center gap-2">
                  <Label htmlFor="num" className="text-xs">
                    Talude nº
                  </Label>
                  <Input
                    id="num"
                    type="number"
                    min={1}
                    className="w-20"
                    value={draftNumero}
                    onChange={(e) =>
                      setDraftNumero(e.target.value === "" ? "" : Number(e.target.value))
                    }
                  />
                </div>
                <Button size="sm" onClick={finishTalude} disabled={draft.length < 3}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  Salvar polígono ({draft.length})
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDraft([])} disabled={draft.length === 0}>
                  Limpar rascunho
                </Button>
                <Button size="sm" variant="outline" onClick={cancelEditing}>
                  <X className="mr-1.5 h-4 w-4" />
                  Sair da edição
                </Button>
              </>
            )}
          </Card>

          {/* Mapa */}
          {currentMap && imageUrl ? (
            <TaludeMapCanvas
              imageUrl={imageUrl}
              taludes={taludes}
              editing={editing}
              draftPoints={draft}
              onAddPoint={(p) => setDraft((d) => [...d, p])}
              onMoveDraftPoint={(i, p) =>
                setDraft((d) => d.map((pp, idx) => (idx === i ? p : pp)))
              }
              onMoveExistingPoint={moveExistingPoint}
              onSelectTalude={openDetails}
              onHoverTalude={setHoveredId}
              hoveredId={hoveredId}
              selectedId={selectedTaludeId}
            />
          ) : (
            <div className="flex h-48 items-center justify-center rounded-xl border border-dashed border-border/60 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Carregando mapa...
            </div>
          )}

          {/* Lista compacta */}
          <TaludesList taludes={taludes} onOpen={openDetails} />
        </div>
      )}

      <TaludeDetailPanel
        talude={selectedTalude}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onSave={saveTalude}
        onDelete={removeTalude}
        defaultPeriodicidade={currentMap?.periodicidade_dias ?? 180}
      />
    </PageShell>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/60 bg-card/40 p-10 text-center">
      <ImageIcon className="h-10 w-10 text-muted-foreground" />
      <h3 className="font-display text-lg font-semibold">Nenhum mapa cadastrado</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        Envie a imagem do mapa com os taludes já demarcados e numerados. Depois desenhe
        as áreas de cada talude sobre a imagem para começar a gerir o cronograma.
      </p>
      <Button onClick={onUpload} className="mt-2">
        <Upload className="mr-1.5 h-4 w-4" />
        Enviar imagem do mapa
      </Button>
    </div>
  );
}

function StatCard({ status, count }: { status: TaludeStatus; count: number }) {
  const meta = STATUS_META[status];
  const Icon = status === "programado" ? Clock : status === "em_execucao" ? Loader2 : CheckCircle2;
  return (
    <Card
      className="flex items-center gap-3 p-3 sm:p-4"
      style={{ borderColor: `${meta.hex}55` }}
    >
      <div
        className="flex h-9 w-9 items-center justify-center rounded-lg sm:h-10 sm:w-10"
        style={{ backgroundColor: meta.hexSoft, color: meta.hex }}
      >
        <Icon className={cn("h-5 w-5", status === "em_execucao" && "animate-spin")}
          style={status === "em_execucao" ? { animationDuration: "3s" } : undefined}
        />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {meta.label}
        </p>
        <p className="font-display text-xl font-bold sm:text-2xl" style={{ color: meta.hex }}>
          {count}
        </p>
      </div>
    </Card>
  );
}

function TaludesList({ taludes, onOpen }: { taludes: Talude[]; onOpen: (id: string) => void }) {
  if (taludes.length === 0) return null;
  const today = todayISO();
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border/50 bg-muted/30 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Taludes ({taludes.length})
      </div>
      <div className="divide-y divide-border/40">
        {taludes.map((t) => {
          const meta = STATUS_META[t.status];
          const atrasado =
            t.status === "programado" && t.data_programada && t.data_programada <= today;
          return (
            <button
              key={t.id}
              onClick={() => onOpen(t.id)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
            >
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-xs font-bold text-white"
                style={{ backgroundColor: meta.hex }}
              >
                T{String(t.numero).padStart(2, "0")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">
                    {t.nome ?? `Talude ${String(t.numero).padStart(2, "0")}`}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                    style={{ backgroundColor: meta.hexSoft, color: meta.hex }}
                  >
                    {meta.label}
                  </span>
                  {atrasado && (
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-400">
                      Atrasado
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  Prog: {formatDateBR(t.data_programada)} · Exec: {formatDateBR(t.data_execucao)} ·
                  Concl: {formatDateBR(t.data_conclusao)} · Próx: {formatDateBR(t.proxima_data)}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

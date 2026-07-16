import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Upload,
  Download,
  Plus,
  Trash2,
  Clock,
  Loader2,
  CheckCircle2,
  Pencil,
  X,
  Save,
  AlertTriangle,
  MapPin,
  ZoomIn,
  ZoomOut,
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { downloadBlob } from "@/lib/download";
import {
  listMaps,
  getMapDetail,
  createMap,
  deleteMap,
  upsertTalude,
  deleteTalude,
} from "@/lib/taludes.functions";
import { STATUS_META, exportMapPNG, type TaludeStatus } from "@/lib/taludes/export";
import referenceMap from "@/assets/demarchi-taludes.png.asset.json";

export const Route = createFileRoute("/_authenticated/taludes")({
  head: () => ({
    meta: [
      { title: "Programação de Taludes | Apont Auto" },
      {
        name: "description",
        content:
          "Gestão interativa de status, cronograma e mapa de taludes com exportação em PNG.",
      },
    ],
  }),
  component: TaludesPage,
});

interface Point {
  x: number;
  y: number;
}
interface TaludeRow {
  id: string;
  map_id: string;
  numero: number;
  nome: string | null;
  status: TaludeStatus;
  polygon: Point[];
  data_programada: string | null;
  data_execucao: string | null;
  data_conclusao: string | null;
  proxima_data: string | null;
  periodicidade_dias: number | null;
  observacoes: string | null;
}

const statusIcon: Record<TaludeStatus, typeof Clock> = {
  programado: Clock,
  em_execucao: Loader2,
  finalizado: CheckCircle2,
};

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (iso: string, days: number) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
const fmtBr = (iso: string | null) => {
  if (!iso) return "-";
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
};

function TaludesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMaps);
  const detailFn = useServerFn(getMapDetail);
  const createFn = useServerFn(createMap);
  const deleteMapFn = useServerFn(deleteMap);
  const upsertFn = useServerFn(upsertTalude);
  const deleteFn = useServerFn(deleteTalude);

  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);

  const mapsQuery = useQuery({
    queryKey: ["talude-maps"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!selectedMapId && mapsQuery.data && mapsQuery.data.length > 0) {
      setSelectedMapId(mapsQuery.data[0].id);
    }
  }, [mapsQuery.data, selectedMapId]);

  const detailQuery = useQuery({
    queryKey: ["talude-map-detail", selectedMapId],
    queryFn: () => detailFn({ data: { id: selectedMapId! } }),
    enabled: !!selectedMapId,
    staleTime: 30_000,
  });

  const [imageUrl, setImageUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const path = detailQuery.data?.map.image_path;
    if (!path) {
      setImageUrl(null);
      return;
    }
    if (path.startsWith("http") || path.startsWith("/")) {
      setImageUrl(path);
      return;
    }
    supabase.storage
      .from("talude-maps")
      .createSignedUrl(path, 60 * 60 * 6)
      .then(({ data, error }) => {
        if (!cancelled) setImageUrl(error || !data ? null : data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [detailQuery.data?.map.image_path]);

  // Create-map form state
  const [creating, setCreating] = useState(false);
  const [newMapName, setNewMapName] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const createRefMap = async () => {
    setCreating(true);
    try {
      const m = await createFn({
        data: {
          nome: "DEMARCHI — Referência",
          image_path: referenceMap.url,
          periodicidade_dias: 180,
        },
      });
      await qc.invalidateQueries({ queryKey: ["talude-maps"] });
      setSelectedMapId(m.id);
      toast.success("Mapa de referência criado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar mapa");
    } finally {
      setCreating(false);
    }
  };

  const createFromUpload = async () => {
    if (!uploadFile || !newMapName.trim()) {
      toast.error("Informe nome e imagem");
      return;
    }
    setCreating(true);
    try {
      const ext = uploadFile.name.split(".").pop() || "png";
      const path = `${crypto.randomUUID()}.${ext}`;
      const up = await supabase.storage
        .from("talude-maps")
        .upload(path, uploadFile, { upsert: false, contentType: uploadFile.type });
      if (up.error) throw up.error;
      // read dimensions
      const dims = await new Promise<{ w: number; h: number }>((res) => {
        const img = new Image();
        img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight });
        img.onerror = () => res({ w: 0, h: 0 });
        img.src = URL.createObjectURL(uploadFile);
      });
      const m = await createFn({
        data: {
          nome: newMapName.trim(),
          image_path: path,
          image_width: dims.w || undefined,
          image_height: dims.h || undefined,
          periodicidade_dias: 180,
        },
      });
      await qc.invalidateQueries({ queryKey: ["talude-maps"] });
      setSelectedMapId(m.id);
      setNewMapName("");
      setUploadFile(null);
      toast.success("Mapa criado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar imagem");
    } finally {
      setCreating(false);
    }
  };

  const removeMap = async () => {
    if (!selectedMapId) return;
    if (!confirm("Excluir este mapa e todos os taludes?")) return;
    try {
      await deleteMapFn({ data: { id: selectedMapId } });
      setSelectedMapId(null);
      await qc.invalidateQueries({ queryKey: ["talude-maps"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  };

  // Interaction state
  const [selectedTaludeId, setSelectedTaludeId] = useState<string | null>(null);
  const [drawingNumero, setDrawingNumero] = useState<string>("");
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [editingPolygonFor, setEditingPolygonFor] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const map = detailQuery.data?.map;
  const taludes = ((detailQuery.data?.taludes ?? []) as unknown) as TaludeRow[];
  const selected = taludes.find((t) => t.id === selectedTaludeId) || null;

  const alerts = useMemo(() => {
    const t0 = today();
    return taludes.filter(
      (t) => t.status === "programado" && t.data_programada && t.data_programada <= t0,
    );
  }, [taludes]);

  const overlaps = useMemo(() => {
    const bbox = (poly: Point[]) => {
      let minX = 100, minY = 100, maxX = 0, maxY = 0;
      for (const p of poly) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { minX, minY, maxX, maxY };
    };
    const pairs: Array<[number, number]> = [];
    const list = taludes.filter((t) => t.polygon.length >= 3);
    const boxes = list.map((t) => ({ n: t.numero, b: bbox(t.polygon) }));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].b;
        const b = boxes[j].b;
        const overlapArea =
          Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX)) *
          Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
        const minArea = Math.min(
          (a.maxX - a.minX) * (a.maxY - a.minY),
          (b.maxX - b.minX) * (b.maxY - b.minY),
        ) || 1;
        if (overlapArea / minArea > 0.35) pairs.push([boxes[i].n, boxes[j].n]);
      }
    }
    return pairs;
  }, [taludes]);

  const svgRef = useRef<SVGSVGElement>(null);
  const clickToPct = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100)),
    };
  };

  const handleMapClick = (e: React.MouseEvent) => {
    if (!drawingNumero && !editingPolygonFor) return;
    if (draggingIdx !== null) return;
    const p = clickToPct(e);
    if (!p) return;
    setDrawingPoints((prev) => [...prev, p]);
  };

  const handleVertexPointerDown = (idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    setDraggingIdx(idx);
  };
  const handleSvgPointerMove = (e: React.PointerEvent) => {
    if (draggingIdx === null) return;
    const p = clickToPct(e);
    if (!p) return;
    setDrawingPoints((prev) => prev.map((pt, i) => (i === draggingIdx ? p : pt)));
  };
  const handleSvgPointerUp = () => setDraggingIdx(null);
  const removeVertex = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setDrawingPoints((prev) => prev.filter((_, i) => i !== idx));
  };

  const finishPolygon = async () => {
    if (!map) return;
    if (drawingPoints.length < 3) {
      toast.error("Um polígono precisa de pelo menos 3 pontos");
      return;
    }
    try {
      if (editingPolygonFor) {
        const existing = taludes.find((t) => t.id === editingPolygonFor);
        if (!existing) return;
        await upsertFn({
          data: {
            id: existing.id,
            map_id: map.id,
            numero: existing.numero,
            polygon: drawingPoints,
          },
        });
        toast.success(`Talude ${existing.numero}: área atualizada`);
      } else {
        const num = parseInt(drawingNumero, 10);
        if (!num || num <= 0) {
          toast.error("Número do talude inválido");
          return;
        }
        if (taludes.some((t) => t.numero === num)) {
          toast.error(`Talude ${num} já existe`);
          return;
        }
        await upsertFn({
          data: {
            map_id: map.id,
            numero: num,
            polygon: drawingPoints,
            status: "programado",
            data_programada: today(),
          },
        });
        toast.success(`Talude ${num} criado`);
      }
      setDrawingPoints([]);
      setDrawingNumero("");
      setEditingPolygonFor(null);
      await qc.invalidateQueries({ queryKey: ["talude-map-detail", map.id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    }
  };

  const cancelDrawing = () => {
    setDrawingPoints([]);
    setDrawingNumero("");
    setEditingPolygonFor(null);
  };

  const startRedraw = (t: TaludeRow) => {
    setEditingPolygonFor(t.id);
    setDrawingPoints(t.polygon.map((p) => ({ ...p })));
    setDrawingNumero("");
    setSelectedTaludeId(t.id);
    toast.info(`Editando talude ${t.numero} — arraste os pontos, clique para adicionar, botão direito para remover`);
  };

  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<TaludeRow> & { id: string }) => {
      const t = taludes.find((x) => x.id === patch.id);
      if (!t || !map) throw new Error("Talude não encontrado");
      return upsertFn({
        data: {
          id: t.id,
          map_id: map.id,
          numero: t.numero,
          nome: patch.nome ?? t.nome,
          polygon: t.polygon,
          status: patch.status ?? t.status,
          data_programada: patch.data_programada ?? t.data_programada,
          data_execucao: patch.data_execucao ?? t.data_execucao,
          data_conclusao: patch.data_conclusao ?? t.data_conclusao,
          proxima_data: patch.proxima_data ?? t.proxima_data,
          periodicidade_dias: patch.periodicidade_dias ?? t.periodicidade_dias,
          observacoes: patch.observacoes ?? t.observacoes,
        },
      });
    },
    onSuccess: () => {
      if (map) qc.invalidateQueries({ queryKey: ["talude-map-detail", map.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar"),
  });

  const changeStatus = (t: TaludeRow, status: TaludeStatus) => {
    const patch: Partial<TaludeRow> & { id: string } = { id: t.id, status };
    if (status === "em_execucao" && !t.data_execucao) patch.data_execucao = today();
    if (status === "finalizado") {
      const dc = t.data_conclusao || today();
      patch.data_conclusao = dc;
      const per = t.periodicidade_dias || map?.periodicidade_dias || 180;
      patch.proxima_data = addDays(dc, per);
    }
    updateMutation.mutate(patch);
  };

  const cycleStatus = (t: TaludeRow) => {
    const order: TaludeStatus[] = ["programado", "em_execucao", "finalizado"];
    const next = order[(order.indexOf(t.status) + 1) % order.length];
    changeStatus(t, next);
    toast.success(`Talude ${t.numero}: ${STATUS_META[next].label}`);
  };

  const bumpDate = (t: TaludeRow, days: number) => {
    const field: "data_programada" | "data_conclusao" | "proxima_data" =
      t.status === "finalizado"
        ? "proxima_data"
        : t.status === "em_execucao"
          ? "data_conclusao"
          : "data_programada";
    const base = (t[field] as string | null) || today();
    updateMutation.mutate({ id: t.id, [field]: addDays(base, days) } as Partial<TaludeRow> & { id: string });
  };

  const removeTalude = async (t: TaludeRow) => {
    if (!confirm(`Excluir talude ${t.numero}?`)) return;
    try {
      await deleteFn({ data: { id: t.id } });
      if (map) await qc.invalidateQueries({ queryKey: ["talude-map-detail", map.id] });
      setSelectedTaludeId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  };

  const doExport = async () => {
    if (!map || !imageUrl) return;
    try {
      toast.info("Gerando PNG…");
      const blob = await exportMapPNG({
        imageUrl,
        mapName: map.nome,
        taludes: taludes.map((t) => ({
          numero: t.numero,
          nome: t.nome,
          status: t.status,
          polygon: t.polygon,
          data_programada: t.data_programada,
          data_execucao: t.data_execucao,
          data_conclusao: t.data_conclusao,
          proxima_data: t.proxima_data,
        })),
      });
      downloadBlob(blob, `taludes_${map.nome.replace(/\s+/g, "_")}_${today()}.png`);
      toast.success("PNG gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    }
  };

  // ─── Empty state ─────────────────────────────
  if (!mapsQuery.isLoading && (!mapsQuery.data || mapsQuery.data.length === 0)) {
    return (
      <PageShell
        title="Programação de Taludes"
        description="Cadastre o mapa base para começar a demarcar e programar os taludes."
      >
        <GlassCard>
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Enviar imagem do mapa
              </h3>
              <Label>Nome do mapa</Label>
              <Input
                value={newMapName}
                onChange={(e) => setNewMapName(e.target.value)}
                placeholder="Ex: Planta Geral — DEMARCHI"
              />
              <Label>Imagem (PNG/JPG)</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              />
              <Button onClick={createFromUpload} disabled={creating} className="w-full">
                <Upload className="mr-2 h-4 w-4" />
                {creating ? "Enviando…" : "Criar mapa"}
              </Button>
            </div>
            <div className="space-y-3 rounded-xl border border-dashed border-border/60 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                Ou usar o mapa DEMARCHI
              </h3>
              <p className="text-xs text-muted-foreground">
                Carrega a planta de referência já anexada, com numeração 1–10 já visível para
                demarcação manual.
              </p>
              <Button onClick={createRefMap} disabled={creating} variant="secondary" className="w-full">
                <MapPin className="mr-2 h-4 w-4" />
                Usar mapa de referência
              </Button>
            </div>
          </div>
        </GlassCard>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Programação de Taludes"
      description="Demarque, acompanhe status e exporte o mapa atualizado em PNG."
      actions={
        <div className="flex flex-wrap gap-2">
          {mapsQuery.data && mapsQuery.data.length > 0 && (
            <Select value={selectedMapId ?? undefined} onValueChange={setSelectedMapId}>
              <SelectTrigger className="min-w-[200px]">
                <SelectValue placeholder="Selecionar mapa" />
              </SelectTrigger>
              <SelectContent>
                {mapsQuery.data.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" onClick={doExport} disabled={!imageUrl || taludes.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Baixar PNG
          </Button>
          <Button variant="ghost" size="icon" onClick={removeMap} title="Excluir mapa">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* ── Mapa ── */}
        <GlassCard>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-xs">
              {(["programado", "em_execucao", "finalizado"] as TaludeStatus[]).map((s) => {
                const meta = STATUS_META[s];
                const Icon = statusIcon[s];
                return (
                  <span
                    key={s}
                    className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-white"
                    style={{ background: meta.fill }}
                  >
                    <Icon className="h-3 w-3" /> {meta.label}
                  </span>
                );
              })}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {drawingNumero || editingPolygonFor ? (
                <>
                  <span className="text-[11px] text-muted-foreground">
                    Pontos: {drawingPoints.length} — clique no mapa para adicionar
                  </span>
                  <Button size="sm" onClick={finishPolygon} disabled={drawingPoints.length < 3}>
                    <Save className="mr-1 h-3.5 w-3.5" /> Finalizar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelDrawing}>
                    <X className="mr-1 h-3.5 w-3.5" /> Cancelar
                  </Button>
                </>
              ) : (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min={1}
                    placeholder="Nº"
                    className="h-8 w-16"
                    value={drawingNumero}
                    onChange={(e) => setDrawingNumero(e.target.value)}
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      if (!drawingNumero) {
                        toast.error("Informe o número do talude");
                        return;
                      }
                      setDrawingPoints([]);
                      toast.info("Clique no mapa para adicionar pontos (≥3)");
                    }}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Novo talude
                  </Button>
                </div>
              )}
            </div>
          </div>

          {alerts.length > 0 && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              {alerts.length} talude(s) com data programada vencida — atualize o status.
            </div>
          )}
          {overlaps.length > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-3 py-2 text-xs text-orange-700 dark:text-orange-300">
              <AlertTriangle className="h-4 w-4" />
              Áreas sobrepostas: {overlaps.map(([a, b]) => `T${a}↔T${b}`).join(", ")}
            </div>
          )}

          {/* quick number chips */}
          {taludes.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1">
              {taludes
                .slice()
                .sort((a, b) => a.numero - b.numero)
                .map((t) => {
                  const meta = STATUS_META[t.status];
                  const isSel = t.id === selectedTaludeId;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTaludeId(t.id)}
                      className={`h-7 min-w-[28px] rounded-md px-2 text-[11px] font-bold text-white transition-transform hover:scale-110 ${
                        isSel ? "ring-2 ring-primary ring-offset-1" : ""
                      }`}
                      style={{ background: meta.fill }}
                      title={`Talude ${t.numero} — ${meta.label}`}
                    >
                      {t.numero}
                    </button>
                  );
                })}
            </div>
          )}

          <div className="relative w-full overflow-hidden rounded-xl border border-border/50 bg-black/5">
            {imageUrl ? (
              <div className="relative w-full">
                <img src={imageUrl} alt={map?.nome} className="block h-auto w-full select-none" draggable={false} />
                <svg
                  ref={svgRef}
                  onClick={handleMapClick}
                  onPointerMove={handleSvgPointerMove}
                  onPointerUp={handleSvgPointerUp}
                  onPointerLeave={handleSvgPointerUp}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className={`absolute inset-0 h-full w-full ${drawingNumero || editingPolygonFor ? "cursor-crosshair" : ""}`}
                >
                  {taludes.map((t) => {
                    if (t.polygon.length < 3) return null;
                    const meta = STATUS_META[t.status];
                    const isSel = t.id === selectedTaludeId;
                    const isHover = t.id === hoverId;
                    const isEditing = t.id === editingPolygonFor;
                    if (isEditing) return null;
                    const pts = t.polygon.map((p) => `${p.x},${p.y}`).join(" ");
                    const cx = t.polygon.reduce((a, p) => a + p.x, 0) / t.polygon.length;
                    const cy = t.polygon.reduce((a, p) => a + p.y, 0) / t.polygon.length;
                    return (
                      <g
                        key={t.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (drawingNumero || editingPolygonFor) return;
                          if (selectedTaludeId === t.id) {
                            cycleStatus(t);
                          } else {
                            setSelectedTaludeId(t.id);
                          }
                        }}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setSelectedTaludeId(t.id);
                          cycleStatus(t);
                        }}
                        onMouseEnter={(e) => {
                          setHoverId(t.id);
                          const p = clickToPct(e);
                          if (p) setHoverPos(p);
                        }}
                        onMouseMove={(e) => {
                          const p = clickToPct(e);
                          if (p) setHoverPos(p);
                        }}
                        onMouseLeave={() => {
                          setHoverId((cur) => (cur === t.id ? null : cur));
                        }}
                        className="cursor-pointer"
                      >
                        <polygon
                          points={pts}
                          fill={meta.fill}
                          fillOpacity={isSel ? 0.6 : isHover ? 0.55 : 0.4}
                          stroke={meta.stroke}
                          strokeWidth={isSel || isHover ? 0.55 : 0.3}
                          strokeLinejoin="round"
                          style={{
                            transition: "fill 300ms ease, fill-opacity 300ms ease, stroke-width 200ms ease",
                            filter:
                              t.status === "em_execucao"
                                ? "drop-shadow(0 0 0.6px rgba(245,158,11,0.9))"
                                : isHover || isSel
                                  ? "drop-shadow(0 0 0.5px rgba(0,0,0,0.55))"
                                  : undefined,
                            animation: t.status === "em_execucao" ? "taludePulse 2s ease-in-out infinite" : undefined,
                          }}
                        />
                        {/* number label — amarelo com contorno escuro (estilo mapa original) */}
                        <text
                          x={cx}
                          y={cy - 1.2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize="3"
                          fontWeight="900"
                          fill="#fde047"
                          style={{ pointerEvents: "none", paintOrder: "stroke" }}
                          stroke="#0f172a"
                          strokeWidth="0.55"
                        >
                          {t.numero}
                        </text>
                        {/* date label under number */}
                        {(() => {
                          const dateIso =
                            t.status === "finalizado"
                              ? t.proxima_data || t.data_conclusao
                              : t.status === "em_execucao"
                                ? t.data_execucao
                                : t.data_programada;
                          if (!dateIso) return null;
                          const [y, m, d] = dateIso.split("T")[0].split("-");
                          return (
                            <text
                              x={cx}
                              y={cy + 1.8}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              fontSize="1.5"
                              fontWeight="700"
                              fill="#ffffff"
                              style={{ pointerEvents: "none", paintOrder: "stroke" }}
                              stroke="#0f172a"
                              strokeWidth="0.35"
                            >
                              {`${d}/${m}/${y.slice(2)}`}
                            </text>
                          );
                        })()}
                      </g>
                    );
                  })}
                  {/* drawing / editing preview with draggable vertices */}
                  {drawingPoints.length > 0 && (
                    <>
                      <polygon
                        points={drawingPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                        fill={editingPolygonFor ? "#8b5cf6" : "#ef4444"}
                        fillOpacity="0.25"
                        stroke={editingPolygonFor ? "#8b5cf6" : "#ef4444"}
                        strokeWidth="0.35"
                        strokeDasharray="0.8,0.6"
                      />
                      {drawingPoints.map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r={draggingIdx === i ? 1.1 : 0.85}
                          fill={editingPolygonFor ? "#8b5cf6" : "#ef4444"}
                          stroke="#fff"
                          strokeWidth="0.15"
                          style={{ cursor: "grab", touchAction: "none" }}
                          onPointerDown={(e) => handleVertexPointerDown(i, e)}
                          onContextMenu={(e) => removeVertex(i, e)}
                        />
                      ))}
                    </>
                  )}
                </svg>
                {/* Hover tooltip (HTML, positioned in % over image) */}
                {hoverId && hoverPos && !editingPolygonFor && !drawingNumero && (() => {
                  const t = taludes.find((x) => x.id === hoverId);
                  if (!t) return null;
                  const meta = STATUS_META[t.status];
                  const left = Math.min(hoverPos.x, 75);
                  const top = Math.min(hoverPos.y + 2, 90);
                  return (
                    <div
                      className="pointer-events-none absolute z-10 min-w-[160px] rounded-md border border-border/60 bg-background/95 p-2 text-[11px] shadow-lg backdrop-blur"
                      style={{ left: `${left}%`, top: `${top}%` }}
                    >
                      <div className="mb-1 flex items-center gap-1.5 font-semibold">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: meta.fill }}
                        />
                        Talude {t.numero} — {meta.label}
                      </div>
                      <div className="space-y-0.5 text-muted-foreground">
                        <div>Prog: <strong className="text-foreground">{fmtBr(t.data_programada)}</strong></div>
                        <div>Exec: <strong className="text-foreground">{fmtBr(t.data_execucao)}</strong></div>
                        <div>Conc: <strong className="text-foreground">{fmtBr(t.data_conclusao)}</strong></div>
                        <div>Próx: <strong className="text-foreground">{fmtBr(t.proxima_data)}</strong></div>
                      </div>
                    </div>
                  );
                })()}
                <style>{`@keyframes taludePulse { 0%,100% { fill-opacity: 0.4 } 50% { fill-opacity: 0.65 } }`}</style>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Carregando mapa…
              </div>
            )}
          </div>
        </GlassCard>

        {/* ── Sidebar taludes ── */}
        <div className="space-y-4">
          <GlassCard>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
              Taludes ({taludes.length})
            </h3>
            {taludes.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nenhum talude cadastrado. Use "Novo talude" para começar a demarcar.
              </p>
            ) : (
              <ul className="max-h-72 space-y-1.5 overflow-auto pr-1">
                {taludes.map((t) => {
                  const meta = STATUS_META[t.status];
                  const Icon = statusIcon[t.status];
                  const isSel = t.id === selectedTaludeId;
                  return (
                    <li key={t.id}>
                      <button
                        onClick={() => setSelectedTaludeId(t.id)}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-all ${
                          isSel
                            ? "border-primary/60 bg-primary/10"
                            : "border-border/50 hover:bg-accent/40"
                        }`}
                      >
                        <span
                          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                          style={{ background: meta.fill }}
                        >
                          {t.numero}
                        </span>
                        <span className="flex-1 truncate font-medium">
                          {t.nome || `Talude ${String(t.numero).padStart(2, "0")}`}
                        </span>
                        <Icon
                          className={`h-3.5 w-3.5 shrink-0 ${t.status === "em_execucao" ? "animate-spin" : ""}`}
                          style={{ color: meta.fill }}
                        />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassCard>

          {selected && (
            <GlassCard>
              <TaludeDetail
                talude={selected}
                onChangeStatus={(s) => changeStatus(selected, s)}
                onPatch={(patch) => updateMutation.mutate({ id: selected.id, ...patch })}
                onRedraw={() => startRedraw(selected)}
                onDelete={() => removeTalude(selected)}
                onBumpDate={(days) => bumpDate(selected, days)}
                onCycleStatus={() => cycleStatus(selected)}
                saving={updateMutation.isPending}
              />
            </GlassCard>
          )}
        </div>
      </div>
    </PageShell>
  );
}

function TaludeDetail({
  talude,
  onChangeStatus,
  onPatch,
  onRedraw,
  onDelete,
  onBumpDate,
  onCycleStatus,
  saving,
}: {
  talude: TaludeRow;
  onChangeStatus: (s: TaludeStatus) => void;
  onPatch: (patch: Partial<TaludeRow>) => void;
  onRedraw: () => void;
  onDelete: () => void;
  onBumpDate: (days: number) => void;
  onCycleStatus: () => void;
  saving: boolean;
}) {
  const [local, setLocal] = useState({
    nome: talude.nome ?? "",
    data_programada: talude.data_programada ?? "",
    data_execucao: talude.data_execucao ?? "",
    data_conclusao: talude.data_conclusao ?? "",
    proxima_data: talude.proxima_data ?? "",
    periodicidade_dias: talude.periodicidade_dias == null ? "" : String(talude.periodicidade_dias),
    observacoes: talude.observacoes ?? "",
  });

  useEffect(() => {
    setLocal({
      nome: talude.nome ?? "",
      data_programada: talude.data_programada ?? "",
      data_execucao: talude.data_execucao ?? "",
      data_conclusao: talude.data_conclusao ?? "",
      proxima_data: talude.proxima_data ?? "",
      periodicidade_dias: talude.periodicidade_dias == null ? "" : String(talude.periodicidade_dias),
      observacoes: talude.observacoes ?? "",
    });
  }, [talude.id]);

  const meta = STATUS_META[talude.status];

  const save = () => {
    // validation
    const dp = local.data_programada || null;
    const de = local.data_execucao || null;
    const dc = local.data_conclusao || null;
    if (de && dp && de < dp) return toast.error("Execução anterior à programada");
    if (dc && de && dc < de) return toast.error("Conclusão anterior à execução");
    onPatch({
      nome: local.nome || null,
      data_programada: dp,
      data_execucao: de,
      data_conclusao: dc,
      proxima_data: local.proxima_data || null,
      periodicidade_dias: local.periodicidade_dias ? parseInt(local.periodicidade_dias, 10) : null,
      observacoes: local.observacoes || null,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span
          className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white"
          style={{ background: meta.fill }}
        >
          {talude.numero}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {talude.nome || `Talude ${String(talude.numero).padStart(2, "0")}`}
          </p>
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{meta.label}</p>
        </div>
        <Button size="icon" variant="ghost" onClick={onRedraw} title="Redesenhar área">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} title="Excluir">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      <div>
        <Label className="text-[10px] uppercase">Status</Label>
        <Select value={talude.status} onValueChange={(v) => onChangeStatus(v as TaludeStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="programado">Programado</SelectItem>
            <SelectItem value="em_execucao">Em Execução</SelectItem>
            <SelectItem value="finalizado">Finalizado</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="secondary" className="mt-2 w-full" onClick={onCycleStatus} disabled={saving}>
          Avançar status (ciclar cor)
        </Button>
      </div>

      <div className="rounded-lg border border-border/60 bg-muted/30 p-2">
        <Label className="text-[10px] uppercase">Avançar data ({talude.status === "finalizado" ? "próxima" : talude.status === "em_execucao" ? "conclusão" : "programada"})</Label>
        <div className="mt-1 grid grid-cols-4 gap-1">
          {[1, 7, 30, talude.periodicidade_dias || 180].map((d, i) => (
            <Button key={i} size="sm" variant="outline" onClick={() => onBumpDate(d)} disabled={saving}>
              +{d}d
            </Button>
          ))}
        </div>
      </div>


      <div>
        <Label className="text-[10px] uppercase">Nome / identificação</Label>
        <Input
          value={local.nome}
          onChange={(e) => setLocal((p) => ({ ...p, nome: e.target.value }))}
          placeholder={`Talude ${String(talude.numero).padStart(2, "0")}`}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-[10px] uppercase">Programada</Label>
          <Input type="date" value={local.data_programada} onChange={(e) => setLocal((p) => ({ ...p, data_programada: e.target.value }))} />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Execução</Label>
          <Input type="date" value={local.data_execucao} onChange={(e) => setLocal((p) => ({ ...p, data_execucao: e.target.value }))} />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Conclusão</Label>
          <Input type="date" value={local.data_conclusao} onChange={(e) => setLocal((p) => ({ ...p, data_conclusao: e.target.value }))} />
        </div>
        <div>
          <Label className="text-[10px] uppercase">Próxima</Label>
          <Input type="date" value={local.proxima_data} onChange={(e) => setLocal((p) => ({ ...p, proxima_data: e.target.value }))} />
        </div>
        <div className="col-span-2">
          <Label className="text-[10px] uppercase">Periodicidade (dias)</Label>
          <Input
            type="number"
            min={1}
            value={local.periodicidade_dias}
            onChange={(e) => setLocal((p) => ({ ...p, periodicidade_dias: e.target.value }))}
            placeholder="180"
          />
        </div>
      </div>

      <div>
        <Label className="text-[10px] uppercase">Observações</Label>
        <Textarea
          rows={3}
          value={local.observacoes}
          onChange={(e) => setLocal((p) => ({ ...p, observacoes: e.target.value }))}
        />
      </div>

      <div className="rounded-md bg-muted/40 p-2 text-[11px] text-muted-foreground">
        <div>Programada: <strong>{fmtBr(talude.data_programada)}</strong></div>
        <div>Execução: <strong>{fmtBr(talude.data_execucao)}</strong></div>
        <div>Conclusão: <strong>{fmtBr(talude.data_conclusao)}</strong></div>
        <div>Próxima: <strong>{fmtBr(talude.proxima_data)}</strong></div>
      </div>

      <Button onClick={save} disabled={saving} className="w-full">
        <Save className="mr-2 h-4 w-4" />
        {saving ? "Salvando…" : "Salvar alterações"}
      </Button>
    </div>
  );
}

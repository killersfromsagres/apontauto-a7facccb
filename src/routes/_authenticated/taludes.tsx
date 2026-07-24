import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  ImagePlus,
  Loader2,
  Map as MapIcon,
  Pencil,
  Plus,
  Save,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

import { PageShell } from "@/components/page-shell";
import { GlassCard } from "@/components/glass-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { downloadBlob } from "@/lib/download";
import {
  createMap,
  createMarcacao,
  deleteMap,
  deleteMarcacao,
  listMaps,
  listMarcacoes,
  updateMarcacao,
  uploadMapImage,
  type Point,
  type TaludeMap,
  type TaludeMarcacao,
} from "@/lib/taludes/api";
import { renderMapToBlob } from "@/lib/taludes/render";

export const Route = createFileRoute("/_authenticated/taludes")({
  head: () => ({
    meta: [
      { title: "Demarcação de Taludes | Apont Auto" },
      {
        name: "description",
        content:
          "Suba imagens de mapas, demarque áreas de taludes com precisão e baixe o mapa final com numeração e datas.",
      },
      { property: "og:title", content: "Demarcação de Taludes" },
      {
        property: "og:description",
        content: "Sistema de demarcação e catalogação de taludes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaludesPage,
});

const CORES = [
  "#f59e0b",
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtBr(iso: string) {
  const [y, m, d] = iso.split("T")[0].split("-");
  return `${d}/${m}/${y}`;
}

function TaludesPage() {
  const qc = useQueryClient();
  const mapsQuery = useQuery({ queryKey: ["talude_maps"], queryFn: listMaps });
  const [openMap, setOpenMap] = useState<TaludeMap | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaludeMap | null>(null);

  const delMap = useMutation({
    mutationFn: (id: string) => deleteMap(id),
    onSuccess: () => {
      toast.success("Mapa excluído");
      qc.invalidateQueries({ queryKey: ["talude_maps"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (openMap) {
    return (
      <MapEditor
        map={openMap}
        onBack={() => setOpenMap(null)}
      />
    );
  }

  return (
    <PageShell
      title="Demarcação de Taludes"
      description="Suba um mapa, desenhe polígonos com precisão, atribua número e data — e baixe a imagem final."
      
      actions={
        <Button onClick={() => setUploadOpen(true)} className="gap-2">
          <ImagePlus className="h-4 w-4" /> Novo mapa
        </Button>
      }
    >
      {mapsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando mapas…
        </div>
      ) : mapsQuery.data && mapsQuery.data.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {mapsQuery.data.map((m) => (
            <GlassCard key={m.id} className="p-0 overflow-hidden group">
              <button
                type="button"
                onClick={() => setOpenMap(m)}
                className="block w-full text-left"
              >
                <div className="relative aspect-video bg-muted overflow-hidden">
                  <img
                    src={m.image_url}
                    alt={m.nome}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                </div>
                <div className="p-4 space-y-1">
                  <div className="font-semibold text-base truncate">{m.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    Criado em {fmtBr(m.created_at)}
                  </div>
                </div>
              </button>
              <div className="px-4 pb-4 flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="flex-1 gap-1"
                  onClick={() => setOpenMap(m)}
                >
                  <Pencil className="h-3.5 w-3.5" /> Abrir
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setDeleteTarget(m)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard className="py-16 text-center space-y-3">
          <MapIcon className="h-10 w-10 mx-auto text-muted-foreground" />
          <div className="text-lg font-medium">Nenhum mapa cadastrado</div>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Clique em <b>Novo mapa</b> para enviar uma imagem e começar a demarcar as áreas de taludes.
          </p>
          <div>
            <Button onClick={() => setUploadOpen(true)} className="gap-2">
              <ImagePlus className="h-4 w-4" /> Novo mapa
            </Button>
          </div>
        </GlassCard>
      )}

      <UploadMapDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onCreated={(map) => {
          qc.invalidateQueries({ queryKey: ["talude_maps"] });
          setUploadOpen(false);
          setOpenMap(map);
        }}
      />

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mapa</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove o mapa <b>{deleteTarget?.nome}</b> e todas as suas
              demarcações. Ação irreversível.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && delMap.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function UploadMapDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (m: TaludeMap) => void;
}) {
  const [nome, setNome] = useState("");
  const [observacao, setObservacao] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!open) {
      setNome("");
      setObservacao("");
      setFile(null);
      setPreview(null);
    }
  }, [open]);

  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setPreview(u);
    if (!nome) setNome(file.name.replace(/\.[^.]+$/, ""));
    return () => URL.revokeObjectURL(u);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  const handleSubmit = async () => {
    if (!file) {
      toast.error("Selecione uma imagem do mapa");
      return;
    }
    if (!nome.trim()) {
      toast.error("Dê um nome ao mapa");
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadMapImage(file);
      const map = await createMap({
        nome: nome.trim(),
        observacao: observacao.trim() || undefined,
        image_url: uploaded.url,
        image_width: uploaded.width,
        image_height: uploaded.height,
      });
      toast.success("Mapa criado — pronto para demarcar");
      onCreated(map);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao criar mapa");
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Novo mapa de taludes</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Imagem do mapa</Label>
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              disabled={uploading}
            />
          </div>
          {preview && (
            <div className="rounded-xl overflow-hidden border bg-muted">
              <img src={preview} alt="Pré-visualização" className="w-full max-h-64 object-contain" />
            </div>
          )}
          <div>
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} disabled={uploading} />
          </div>
          <div>
            <Label>Observação (opcional)</Label>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={2}
              disabled={uploading}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={uploading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={uploading} className="gap-2">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Criar mapa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================================ EDITOR ================================ */

interface DraftMarc {
  polygon: Point[];
  numero: number;
  data: string;
  rotulo: string;
  observacao: string;
  cor: string;
}

function MapEditor({ map, onBack }: { map: TaludeMap; onBack: () => void }) {
  const qc = useQueryClient();
  const marcQuery = useQuery({
    queryKey: ["talude_marcacoes", map.id],
    queryFn: () => listMarcacoes(map.id),
  });
  const marcacoes = marcQuery.data ?? [];

  const nextNumero = useMemo(() => {
    const nums = marcacoes.map((m) => m.numero);
    let n = 1;
    while (nums.includes(n)) n++;
    return n;
  }, [marcacoes]);

  const [mode, setMode] = useState<"view" | "draw">("view");
  const [draftPts, setDraftPts] = useState<Point[]>([]);
  const [draftDialog, setDraftDialog] = useState<DraftMarc | null>(null);
  const [editing, setEditing] = useState<TaludeMarcacao | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [displaySize, setDisplaySize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });

  const measure = useCallback(() => {
    const el = imgRef.current;
    if (!el) return;
    setDisplaySize({ w: el.clientWidth, h: el.clientHeight });
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (imgRef.current) ro.observe(imgRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mode !== "draw") return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setDraftPts((prev) => [...prev, { x, y }]);
  };

  const cancelDraw = () => {
    setDraftPts([]);
    setMode("view");
  };

  const finishDraw = () => {
    if (draftPts.length < 3) {
      toast.error("Adicione pelo menos 3 pontos");
      return;
    }
    setDraftDialog({
      polygon: draftPts,
      numero: nextNumero,
      data: todayIso(),
      rotulo: "",
      observacao: "",
      cor: CORES[(nextNumero - 1) % CORES.length],
    });
  };

  const undoPoint = () => setDraftPts((p) => p.slice(0, -1));

  const createMarc = useMutation({
    mutationFn: (input: DraftMarc) =>
      createMarcacao({
        map_id: map.id,
        numero: input.numero,
        data: input.data,
        rotulo: input.rotulo.trim() || null,
        observacao: input.observacao.trim() || null,
        cor: input.cor,
        polygon: input.polygon,
      }),
    onSuccess: () => {
      toast.success("Demarcação salva");
      qc.invalidateQueries({ queryKey: ["talude_marcacoes", map.id] });
      setDraftDialog(null);
      setDraftPts([]);
      setMode("view");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const editMarc = useMutation({
    mutationFn: (input: { id: string; patch: Partial<TaludeMarcacao> }) =>
      updateMarcacao(input.id, input.patch),
    onSuccess: () => {
      toast.success("Demarcação atualizada");
      qc.invalidateQueries({ queryKey: ["talude_marcacoes", map.id] });
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMarc = useMutation({
    mutationFn: (id: string) => deleteMarcacao(id),
    onSuccess: () => {
      toast.success("Demarcação removida");
      qc.invalidateQueries({ queryKey: ["talude_marcacoes", map.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await renderMapToBlob(map.image_url, marcacoes);
      downloadBlob(blob, `${map.nome.replace(/[^\w\-]+/g, "_")}.png`);
      toast.success("Imagem exportada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageShell
      title={map.nome}
      description={
        map.observacao ??
        `Clique em "Desenhar" e marque pontos ao redor do talude. ${marcacoes.length} demarcaç${marcacoes.length === 1 ? "ão" : "ões"}.`
      }
      
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <Button
            variant="secondary"
            onClick={handleExport}
            disabled={exporting || marcacoes.length === 0}
            className="gap-2"
          >
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Baixar PNG
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
        <GlassCard className="p-3 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {mode === "view" ? (
              <Button onClick={() => setMode("draw")} className="gap-2">
                <Plus className="h-4 w-4" /> Desenhar nova área
              </Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={undoPoint}
                  disabled={draftPts.length === 0}
                  className="gap-1"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Desfazer ponto
                </Button>
                <Button
                  size="sm"
                  onClick={finishDraw}
                  disabled={draftPts.length < 3}
                  className="gap-1"
                >
                  <Save className="h-3.5 w-3.5" /> Concluir ({draftPts.length})
                </Button>
                <Button size="sm" variant="ghost" onClick={cancelDraw} className="gap-1">
                  <X className="h-3.5 w-3.5" /> Cancelar
                </Button>
              </div>
            )}
            <Badge variant="secondary">
              {marcacoes.length} demarcaç{marcacoes.length === 1 ? "ão" : "ões"}
            </Badge>
          </div>

          <div
            ref={wrapRef}
            className="relative w-full rounded-xl overflow-hidden border bg-muted select-none"
            style={{ aspectRatio: `${map.image_width} / ${map.image_height}` }}
            onClick={handleClick}
          >
            <img
              ref={imgRef}
              src={map.image_url}
              alt={map.nome}
              onLoad={measure}
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain pointer-events-none"
            />
            {displaySize.w > 0 && (
              <svg
                className={`absolute inset-0 h-full w-full ${mode === "draw" ? "cursor-crosshair" : "cursor-default"}`}
                viewBox={`0 0 ${displaySize.w} ${displaySize.h}`}
                preserveAspectRatio="none"
              >
                {marcacoes.map((m) => {
                  const pts = m.polygon
                    .map((p) => `${(p.x / 100) * displaySize.w},${(p.y / 100) * displaySize.h}`)
                    .join(" ");
                  const cx =
                    (m.polygon.reduce((a, p) => a + p.x, 0) / m.polygon.length / 100) *
                    displaySize.w;
                  const cy =
                    (m.polygon.reduce((a, p) => a + p.y, 0) / m.polygon.length / 100) *
                    displaySize.h;
                  const isSel = selectedId === m.id;
                  return (
                    <g
                      key={m.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(m.id);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <polygon
                        points={pts}
                        fill={m.cor}
                        fillOpacity={isSel ? 0.45 : 0.28}
                        stroke={m.cor}
                        strokeWidth={isSel ? 3 : 2}
                      />
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fontSize={Math.max(14, displaySize.w * 0.022)}
                        fontWeight={800}
                        fill="#fde047"
                        stroke="#0f172a"
                        strokeWidth={3}
                        paintOrder="stroke"
                      >
                        {m.numero}
                      </text>
                    </g>
                  );
                })}

                {mode === "draw" && draftPts.length > 0 && (
                  <>
                    <polygon
                      points={draftPts
                        .map((p) => `${(p.x / 100) * displaySize.w},${(p.y / 100) * displaySize.h}`)
                        .join(" ")}
                      fill="#0ea5e9"
                      fillOpacity={0.25}
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                    />
                    {draftPts.map((p, i) => (
                      <circle
                        key={i}
                        cx={(p.x / 100) * displaySize.w}
                        cy={(p.y / 100) * displaySize.h}
                        r={5}
                        fill="#ffffff"
                        stroke="#0ea5e9"
                        strokeWidth={2}
                      />
                    ))}
                  </>
                )}
              </svg>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            Modo desenho: clique para adicionar cada ponto do contorno do talude. Precisa de no mínimo 3 pontos. Ao concluir, preencha número e data.
          </p>
        </GlassCard>

        <GlassCard className="p-4 space-y-3">
          <div className="font-semibold">Demarcações</div>
          {marcacoes.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma área ainda. Use <b>Desenhar nova área</b>.
            </p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {marcacoes.map((m) => (
                <div
                  key={m.id}
                  className={`rounded-xl border p-3 flex gap-3 items-start hover:bg-accent/40 transition-colors ${
                    selectedId === m.id ? "ring-2 ring-primary" : ""
                  }`}
                  onMouseEnter={() => setSelectedId(m.id)}
                >
                  <div
                    className="mt-1 h-8 w-8 rounded-lg flex items-center justify-center font-bold text-white shadow"
                    style={{ backgroundColor: m.cor }}
                  >
                    {m.numero}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {m.rotulo || `Talude ${m.numero}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {fmtBr(m.data)}
                    </div>
                    {m.observacao && (
                      <div className="text-xs mt-1 line-clamp-2 text-muted-foreground">
                        {m.observacao}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      onClick={() => setEditing(m)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Excluir demarcação ${m.numero}?`)) removeMarc.mutate(m.id);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Dialog: nova demarcação */}
      <Dialog
        open={!!draftDialog}
        onOpenChange={(o) => {
          if (!o) setDraftDialog(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova demarcação</DialogTitle>
          </DialogHeader>
          {draftDialog && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Número</Label>
                  <Input
                    type="number"
                    min={1}
                    value={draftDialog.numero}
                    onChange={(e) =>
                      setDraftDialog({ ...draftDialog, numero: Number(e.target.value) || 1 })
                    }
                  />
                </div>
                <div>
                  <Label>Data</Label>
                  <Input
                    type="date"
                    value={draftDialog.data}
                    onChange={(e) => setDraftDialog({ ...draftDialog, data: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label>Rótulo (opcional)</Label>
                <Input
                  value={draftDialog.rotulo}
                  onChange={(e) => setDraftDialog({ ...draftDialog, rotulo: e.target.value })}
                  placeholder="Ex.: Talude Norte"
                />
              </div>
              <div>
                <Label>Cor</Label>
                <ColorPicker
                  value={draftDialog.cor}
                  onChange={(cor) => setDraftDialog({ ...draftDialog, cor })}
                />
              </div>
              <div>
                <Label>Observação</Label>
                <Textarea
                  rows={2}
                  value={draftDialog.observacao}
                  onChange={(e) => setDraftDialog({ ...draftDialog, observacao: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDraftDialog(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => draftDialog && createMarc.mutate(draftDialog)}
              disabled={createMarc.isPending}
              className="gap-2"
            >
              {createMarc.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: editar */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar demarcação</DialogTitle>
          </DialogHeader>
          {editing && (
            <EditMarcacaoForm
              value={editing}
              onSubmit={(patch) => editMarc.mutate({ id: editing.id, patch })}
              submitting={editMarc.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2 mt-1">
      {CORES.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={`h-8 w-8 rounded-lg border-2 transition-transform ${
            value === c ? "ring-2 ring-primary scale-110" : "border-transparent"
          }`}
          style={{ backgroundColor: c }}
          aria-label={`Cor ${c}`}
        />
      ))}
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-8 rounded-lg border cursor-pointer"
      />
    </div>
  );
}

function EditMarcacaoForm({
  value,
  onSubmit,
  submitting,
}: {
  value: TaludeMarcacao;
  onSubmit: (patch: Partial<TaludeMarcacao>) => void;
  submitting: boolean;
}) {
  const [numero, setNumero] = useState(value.numero);
  const [data, setData] = useState(value.data);
  const [rotulo, setRotulo] = useState(value.rotulo ?? "");
  const [observacao, setObservacao] = useState(value.observacao ?? "");
  const [cor, setCor] = useState(value.cor);

  return (
    <>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Número</Label>
            <Input
              type="number"
              min={1}
              value={numero}
              onChange={(e) => setNumero(Number(e.target.value) || 1)}
            />
          </div>
          <div>
            <Label>Data</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
        </div>
        <div>
          <Label>Rótulo</Label>
          <Input value={rotulo} onChange={(e) => setRotulo(e.target.value)} />
        </div>
        <div>
          <Label>Cor</Label>
          <ColorPicker value={cor} onChange={setCor} />
        </div>
        <div>
          <Label>Observação</Label>
          <Textarea
            rows={2}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
          />
        </div>
      </div>
      <DialogFooter className="mt-4">
        <Button
          onClick={() =>
            onSubmit({
              numero,
              data,
              rotulo: rotulo.trim() || null,
              observacao: observacao.trim() || null,
              cor,
            })
          }
          disabled={submitting}
          className="gap-2"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar alterações
        </Button>
      </DialogFooter>
    </>
  );
}

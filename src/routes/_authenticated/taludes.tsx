import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileJson,
  FileText,
  History,
  Image as ImageIcon,
  ImagePlus,
  Loader2,
  Lock,
  Map as MapIcon,
  MoveDown,
  MoveUp,
  Pencil,
  Printer,
  Ruler,
  Save,
  Trash2,
  Unlock,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { PolygonEditor, type EditorPolygon } from "@/components/taludes/polygon-editor";
import { CORES_TALUDE, TaludePropertiesPanel } from "@/components/taludes/talude-properties-panel";
import {
  createMap,
  createMarcacaoFull,
  createVersion,
  deleteMap,
  deleteMarcacao,
  listMaps,
  listMarcacoes,
  listVersions,
  logGeometryEvent,
  restoreVersion,
  updateMap,
  updateMarcacao,
  uploadMapImage,
  type Point,
  type TaludeMap,
  type TaludeMapVersion,
  type TaludeMarcacao,
} from "@/lib/taludes/api";
import { exportGeoJson, exportJson, exportPdf, exportPng, scaleOf } from "@/lib/taludes/export";
import { metersPerPixel } from "@/lib/taludes/geometry";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const Route = createFileRoute("/_authenticated/taludes")({
  head: () => ({
    meta: [
      { title: "Demarcação de Taludes | Apont Auto" },
      {
        name: "description",
        content:
          "Editor profissional de taludes: polígonos precisos, calibração de escala, versões, histórico e exportação em PNG, PDF, JSON e GeoJSON.",
      },
      { property: "og:title", content: "Demarcação de Taludes" },
      {
        property: "og:description",
        content: "Editor profissional de demarcação e catalogação de taludes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TaludesPage,
});

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
    return <MapEditor map={openMap} onBack={() => setOpenMap(null)} />;
  }

  return (
    <PageShell
      title="Demarcação de Taludes"
      description="Editor profissional: polígonos precisos, calibração de escala, versões e exportações."
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mapsQuery.data.map((m) => (
            <GlassCard key={m.id} className="group overflow-hidden p-0">
              <button
                type="button"
                onClick={() => setOpenMap(m)}
                className="block w-full text-left"
              >
                <div className="relative aspect-video overflow-hidden bg-muted">
                  <img
                    src={m.image_url}
                    alt={m.nome}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                </div>
                <div className="space-y-1 p-4">
                  <div className="truncate text-base font-semibold">{m.nome}</div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    Criado em {fmtBr(m.created_at)}
                    {scaleOf(m) ? (
                      <Badge variant="secondary" className="h-5">
                        Calibrado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="h-5 text-amber-500">
                        Sem escala
                      </Badge>
                    )}
                  </div>
                </div>
              </button>
              <div className="flex gap-2 px-4 pb-4">
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
                  aria-label="Excluir mapa"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </GlassCard>
          ))}
        </div>
      ) : (
        <GlassCard className="space-y-3 py-16 text-center">
          <MapIcon className="mx-auto h-10 w-10 text-muted-foreground" />
          <div className="text-lg font-medium">Nenhum mapa cadastrado</div>
          <p className="mx-auto max-w-md text-sm text-muted-foreground">
            Clique em <b>Novo mapa</b> para enviar uma imagem e começar a demarcar.
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

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir mapa</AlertDialogTitle>
            <AlertDialogDescription>
              Isso remove o mapa <b>{deleteTarget?.nome}</b> e todas as suas demarcações. Ação
              irreversível.
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
    setNome((n) => n || file.name.replace(/\.[^.]+$/, ""));
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const handleSubmit = async () => {
    if (!file) return toast.error("Selecione uma imagem do mapa");
    if (!nome.trim()) return toast.error("Dê um nome ao mapa");
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
            <div className="overflow-hidden rounded-xl border bg-muted">
              <img
                src={preview}
                alt="Pré-visualização"
                className="max-h-64 w-full object-contain"
              />
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
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Criar mapa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================================ EDITOR ================================ */

const DRAFT_KEY = (id: string) => `talude-draft:${id}`;

function MapEditor({ map: initialMap, onBack }: { map: TaludeMap; onBack: () => void }) {
  const qc = useQueryClient();
  const { isAdmin } = useIsAdmin();
  const [map, setMap] = useState(initialMap);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TaludeMarcacao | null>(null);
  const [calPending, setCalPending] = useState<{ a: Point; b: Point } | null>(null);
  const [calMeters, setCalMeters] = useState("");
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const marcQuery = useQuery({
    queryKey: ["talude_marcacoes", map.id],
    queryFn: () => listMarcacoes(map.id),
  });
  const marcacoes = useMemo(
    () =>
      [...(marcQuery.data ?? [])].sort(
        (a, b) => (a.ordem ?? 0) - (b.ordem ?? 0) || a.numero - b.numero,
      ),
    [marcQuery.data],
  );

  const nextNumero = useMemo(() => {
    const nums = marcacoes.map((m) => m.numero);
    let n = 1;
    while (nums.includes(n)) n++;
    return n;
  }, [marcacoes]);

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["talude_marcacoes", map.id] }),
    [qc, map.id],
  );

  /* ------------------------------ mutações ------------------------------ */

  const create = useMutation({
    mutationFn: async (points: Point[]) => {
      const created = await createMarcacaoFull(map.id, {
        numero: nextNumero,
        data: todayIso(),
        cor: CORES_TALUDE[(nextNumero - 1) % CORES_TALUDE.length],
        polygon: points,
        ordem: marcacoes.length,
        opacidade: 0.32,
      });
      await logGeometryEvent(map.id, created.id, "create", null, points);
      return created;
    },
    onSuccess: (created) => {
      toast.success(`Talude ${created.numero} demarcado`);
      setSelectedId(created.id);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patchMarc = useMutation({
    mutationFn: async (input: {
      id: string;
      patch: Partial<TaludeMarcacao>;
      geometryBefore?: Point[];
    }) => {
      await updateMarcacao(input.id, input.patch);
      if (input.patch.polygon) {
        await logGeometryEvent(
          map.id,
          input.id,
          "update",
          input.geometryBefore ?? null,
          input.patch.polygon,
        );
      }
    },
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (m: TaludeMarcacao) => {
      await logGeometryEvent(map.id, m.id, "delete", m.polygon, null);
      await deleteMarcacao(m.id);
    },
    onSuccess: () => {
      toast.success("Demarcação removida");
      setDeleteTarget(null);
      setSelectedId(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const duplicate = useMutation({
    mutationFn: async (m: TaludeMarcacao) => {
      const shifted = m.polygon.map((p) => ({
        x: Math.min(100, p.x + 2),
        y: Math.min(100, p.y + 2),
      }));
      return createMarcacaoFull(map.id, {
        ...m,
        numero: nextNumero,
        polygon: shifted,
        ordem: marcacoes.length,
        codigo: m.codigo ? `${m.codigo}-CÓPIA` : null,
      } as never);
    },
    onSuccess: () => {
      toast.success("Demarcação duplicada");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const snapshot = useMutation({
    mutationFn: (reason: string) => createVersion(map, marcacoes, reason),
    onSuccess: () => {
      toast.success("Versão salva no histórico");
      qc.invalidateQueries({ queryKey: ["talude_versions", map.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ----------------------------- rascunho local ----------------------------- */

  const handleDraft = useCallback(
    (id: string, points: Point[]) => {
      try {
        localStorage.setItem(DRAFT_KEY(map.id), JSON.stringify({ id, points, at: Date.now() }));
      } catch {
        /* storage cheio — ignorar */
      }
    },
    [map.id],
  );

  const handleGeometry = useCallback(
    (id: string, points: Point[]) => {
      const before = marcacoes.find((m) => m.id === id)?.polygon;
      patchMarc.mutate({ id, patch: { polygon: points }, geometryBefore: before });
      try {
        localStorage.removeItem(DRAFT_KEY(map.id));
      } catch {
        /* ignore */
      }
    },
    [marcacoes, patchMarc, map.id],
  );

  /* ------------------------------- calibração ------------------------------- */

  const applyCalibration = async () => {
    if (!calPending) return;
    const meters = Number(calMeters.replace(",", "."));
    if (!meters || meters <= 0) return toast.error("Informe a distância real em metros");
    const cal = { a: calPending.a, b: calPending.b, meters };
    const mpp = metersPerPixel(cal, map.image_width, map.image_height);
    try {
      await updateMap(map.id, {
        calibration: cal,
        meters_per_unit: mpp,
        calibrated_at: new Date().toISOString(),
      });
      setMap((m) => ({ ...m, calibration: cal, meters_per_unit: mpp }));
      setCalPending(null);
      setCalMeters("");
      toast.success("Escala calibrada — áreas e perímetros disponíveis");
      qc.invalidateQueries({ queryKey: ["talude_maps"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao calibrar");
    }
  };

  /* ------------------------------- exportações ------------------------------ */

  const slug = map.nome.replace(/[^\w-]+/g, "_");

  const runExport = async (kind: "png" | "pdf" | "json" | "geojson") => {
    setExporting(true);
    try {
      if (kind === "png") downloadBlob(await exportPng(map, marcacoes), `${slug}.png`);
      if (kind === "pdf")
        downloadBlob(await exportPdf(map, marcacoes, "Equipe PCM"), `${slug}.pdf`);
      if (kind === "json") downloadBlob(exportJson(map, marcacoes), `${slug}-backup.json`);
      if (kind === "geojson") downloadBlob(exportGeoJson(map, marcacoes), `${slug}.geojson`);
      toast.success("Exportação concluída");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao exportar");
    } finally {
      setExporting(false);
    }
  };

  const editorPolygons: EditorPolygon[] = marcacoes.map((m) => ({
    id: m.id,
    points: m.polygon,
    color: m.cor,
    opacity: m.opacidade ?? 0.32,
    visible: m.visivel !== false,
    locked: !!m.bloqueado,
    label: String(m.numero),
  }));

  const selected = marcacoes.find((m) => m.id === selectedId) ?? null;
  const calibrado = scaleOf(map) != null;

  return (
    <PageShell
      title={map.nome}
      description={`${marcacoes.length} demarcaç${marcacoes.length === 1 ? "ão" : "ões"} · ${
        calibrado ? "escala calibrada" : "mapa sem calibração"
      }`}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={onBack} className="gap-2">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
          <Button variant="secondary" onClick={() => setVersionsOpen(true)} className="gap-2">
            <History className="h-4 w-4" /> Versões
          </Button>
          <Button
            variant="secondary"
            onClick={() => snapshot.mutate("Versão manual")}
            loading={snapshot.isPending}
            className="gap-2"
          >
            {snapshot.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Salvar versão
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button className="gap-2" disabled={exporting || marcacoes.length === 0}>
                {exporting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Exportar
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => runExport("png")}>
                <ImageIcon className="mr-2 h-4 w-4" /> PNG em alta resolução
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => runExport("pdf")}>
                <FileText className="mr-2 h-4 w-4" /> PDF A4 paisagem com legenda
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => runExport("json")}>
                <FileJson className="mr-2 h-4 w-4" /> JSON de backup
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => runExport("geojson")} disabled={!calibrado}>
                <FileJson className="mr-2 h-4 w-4" /> GeoJSON{" "}
                {calibrado ? "" : "(requer calibração)"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.print()}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <GlassCard className="space-y-3 p-3">
          {!calibrado && (
            <div className="flex items-center gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs">
              <Ruler className="h-4 w-4 text-amber-500" />
              Mapa <b>não calibrado</b>: use a ferramenta “Calibrar escala” para habilitar área e
              perímetro em metros.
            </div>
          )}
          <PolygonEditor
            imageUrl={map.image_url}
            imageWidth={map.image_width}
            imageHeight={map.image_height}
            polygons={editorPolygons}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onGeometryChange={handleGeometry}
            onDraftChange={handleDraft}
            onCreate={(pts) => create.mutate(pts)}
            calibration={map.calibration}
            onCalibrate={(a, b) => setCalPending({ a, b })}
          />
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="space-y-2 p-4">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Camadas</div>
              <Badge variant="secondary">{marcacoes.length}</Badge>
            </div>
            {marcacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma área. Use a ferramenta <b>Desenhar</b> no editor.
              </p>
            ) : (
              <div className="max-h-[40vh] space-y-1.5 overflow-y-auto pr-1">
                {marcacoes.map((m, i) => (
                  <div
                    key={m.id}
                    className={`flex items-center gap-2 rounded-xl border p-2 transition-colors ${
                      selectedId === m.id ? "ring-2 ring-primary" : "hover:bg-accent/40"
                    }`}
                    onClick={() => setSelectedId(m.id)}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white"
                      style={{ backgroundColor: m.cor }}
                    >
                      {m.numero}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {m.nome || m.rotulo || m.codigo || `Talude ${m.numero}`}
                    </span>
                    <IconBtn
                      label={m.visivel === false ? "Mostrar" : "Ocultar"}
                      onClick={() =>
                        patchMarc.mutate({ id: m.id, patch: { visivel: m.visivel === false } })
                      }
                    >
                      {m.visivel === false ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                    </IconBtn>
                    <IconBtn
                      label={m.bloqueado ? "Desbloquear" : "Bloquear"}
                      onClick={() =>
                        patchMarc.mutate({ id: m.id, patch: { bloqueado: !m.bloqueado } })
                      }
                    >
                      {m.bloqueado ? (
                        <Lock className="h-3.5 w-3.5" />
                      ) : (
                        <Unlock className="h-3.5 w-3.5" />
                      )}
                    </IconBtn>
                    <IconBtn
                      label="Subir camada"
                      disabled={i === 0}
                      onClick={() => {
                        const prev = marcacoes[i - 1];
                        patchMarc.mutate({ id: m.id, patch: { ordem: prev.ordem ?? i - 1 } });
                        patchMarc.mutate({ id: prev.id, patch: { ordem: m.ordem ?? i } });
                      }}
                    >
                      <MoveUp className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn
                      label="Descer camada"
                      disabled={i === marcacoes.length - 1}
                      onClick={() => {
                        const nxt = marcacoes[i + 1];
                        patchMarc.mutate({ id: m.id, patch: { ordem: nxt.ordem ?? i + 1 } });
                        patchMarc.mutate({ id: nxt.id, patch: { ordem: m.ordem ?? i } });
                      }}
                    >
                      <MoveDown className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label="Duplicar" onClick={() => duplicate.mutate(m)}>
                      <Copy className="h-3.5 w-3.5" />
                    </IconBtn>
                    <IconBtn label="Excluir" danger onClick={() => setDeleteTarget(m)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </IconBtn>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard className="space-y-3 p-4">
            <div className="font-semibold">Dados do talude</div>
            {selected ? (
              <TaludePropertiesPanel key={selected.id} map={map} marcacao={selected} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Selecione uma demarcação no mapa ou na lista de camadas.
              </p>
            )}
          </GlassCard>
        </div>
      </div>

      {/* Calibração */}
      <Dialog open={!!calPending} onOpenChange={(o) => !o && setCalPending(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Calibrar escala</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Distância real entre os dois pontos (metros)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={calMeters}
              onChange={(e) => setCalMeters(e.target.value)}
              placeholder="Ex.: 25"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCalPending(null)}>
              Cancelar
            </Button>
            <Button onClick={applyCalibration}>Aplicar escala</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Exclusão */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir demarcação</AlertDialogTitle>
            <AlertDialogDescription>
              O talude {deleteTarget?.numero} será removido do mapa. O histórico de geometria é
              preservado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteTarget && remove.mutate(deleteTarget)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <VersionsDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        mapId={map.id}
        canRestore={isAdmin}
        onRestored={invalidate}
      />
    </PageShell>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <Button
      size="icon"
      variant="ghost"
      aria-label={label}
      title={label}
      disabled={disabled}
      className={`h-7 w-7 shrink-0 ${danger ? "text-destructive hover:text-destructive" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </Button>
  );
}

function VersionsDialog({
  open,
  onOpenChange,
  mapId,
  canRestore,
  onRestored,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mapId: string;
  canRestore: boolean;
  onRestored: () => void;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["talude_versions", mapId],
    queryFn: () => listVersions(mapId),
    enabled: open,
  });

  const restore = useMutation({
    mutationFn: (v: TaludeMapVersion) => restoreVersion(v),
    onSuccess: () => {
      toast.success("Versão restaurada");
      qc.invalidateQueries({ queryKey: ["talude_versions", mapId] });
      onRestored();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Histórico de versões</DialogTitle>
        </DialogHeader>
        {q.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
          </div>
        ) : (q.data?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma versão salva ainda. Use <b>Salvar versão</b> para criar um ponto de restauração.
          </p>
        ) : (
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {q.data!.map((v) => (
              <div key={v.id} className="flex items-center gap-3 rounded-xl border p-3">
                <Badge variant="secondary">v{v.version_number}</Badge>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{v.reason || "Sem descrição"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(v.created_at).toLocaleString("pt-BR")} ·{" "}
                    {v.snapshot?.marcacoes?.length ?? 0} demarcações
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!canRestore || restore.isPending}
                  onClick={() => restore.mutate(v)}
                >
                  Restaurar
                </Button>
              </div>
            ))}
          </div>
        )}
        {!canRestore && (
          <p className="text-xs text-muted-foreground">
            Somente administradores e gestores podem restaurar versões.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

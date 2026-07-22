import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

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
  Minus,
  RotateCcw,
  Info,
  ShieldCheck,
  Wand2,
} from "lucide-react";
import { AutoMarkDialog } from "@/components/taludes/auto-mark-dialog";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { downloadBlob } from "@/lib/download";
import {
  listMaps,
  getMapDetail,
  createMap,
  deleteMap,
  upsertTalude,
  deleteTalude,
  verifyAndRepairMap,
} from "@/lib/taludes.functions";
import { STATUS_META, type TaludeStatus } from "@/lib/taludes/constants";
import {
  polygonAreaPct,
  polygonPerimeterPct,
  realMetrics,
  formatArea,
  formatPerimeter,
  polygonLabelAnchor,
} from "@/lib/taludes/geometry";
import referenceMap from "@/assets/mapa-taludes-default.png.asset.json";
import {
  useImageEnhancer,
  ImageEnhancerControls,
  LogoMaskOverlay,
  sampleBorderColor,
} from "@/components/taludes/image-enhancer";

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
  cor: string | null;
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

function rgbLikeToHex(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  if (s.startsWith("#")) return s.length === 7 ? s : null;
  const m = s.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!m) return null;
  const toHex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return `#${toHex(+m[1])}${toHex(+m[2])}${toHex(+m[3])}`;
}

function TaludesPage() {
  const qc = useQueryClient();
  const listFn = listMaps;
  const detailFn = getMapDetail;
  const createFn = createMap;
  const deleteMapFn = deleteMap;
  const upsertFn = upsertTalude;
  const deleteFn = deleteTalude;
  const verifyFn = verifyAndRepairMap;

  const [auditing, setAuditing] = useState(false);
  const [auditReport, setAuditReport] = useState<Awaited<ReturnType<typeof verifyAndRepairMap>> | null>(null);
  const [autoMarkOpen, setAutoMarkOpen] = useState(false);

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

  // Migração de nome legado do mapa de referência
  useEffect(() => {
    const legacy = mapsQuery.data?.find(
      (m: { id: string; nome: string }) => m.nome === "DEMARCHI — Referência",
    );
    if (!legacy) return;
    supabase
      .from("talude_maps")
      .update({ nome: "Mapa site Sherwin Williams - Demarchi" })
      .eq("id", legacy.id)
      .then(() => qc.invalidateQueries({ queryKey: ["talude-maps"] }));
  }, [mapsQuery.data, qc]);

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
    if (creating) return;
    setCreating(true);
    try {
      // Idempotência: se já existe um mapa de referência, apenas selecione-o.
      const existing = mapsQuery.data?.find(
        (m: { id: string; image_path: string; nome: string }) =>
          m.image_path === referenceMap.url ||
          m.nome === "Mapa site Sherwin Williams - Demarchi" ||
          m.nome === "DEMARCHI — Referência",
      );

      if (existing) {
        setSelectedMapId(existing.id);
        toast.success("Mapa de referência selecionado");
        return;
      }
      const m = await createFn({
        data: {
          nome: "Mapa site Sherwin Williams - Demarchi",
          image_path: referenceMap.url,
          periodicidade_dias: 180,
        },
      });
      await qc.invalidateQueries({ queryKey: ["talude-maps"] });
      setSelectedMapId(m.id);
      toast.success("Mapa de referência criado");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[taludes] createRefMap failed", e);
      toast.error(`Falha ao carregar mapa padrão: ${msg}`);
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
  const [drawingNewMode, setDrawingNewMode] = useState<boolean>(false);
  const [drawingPoints, setDrawingPoints] = useState<Point[]>([]);
  const [editingPolygonFor, setEditingPolygonFor] = useState<string | null>(null);
  const [numberPromptOpen, setNumberPromptOpen] = useState(false);
  const [pendingNumber, setPendingNumber] = useState<string>("");
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);
  const [selectedVertexIdx, setSelectedVertexIdx] = useState<number | null>(null);
  const [cursorPct, setCursorPct] = useState<Point | null>(null);
  const [snapHint, setSnapHint] = useState<Point | null>(null);
  // Undo/redo local ao editor de polígono (não persiste entre sessões).
  const historyRef = useRef<{ past: Point[][]; future: Point[][] }>({ past: [], future: [] });
  const resetHistory = () => { historyRef.current = { past: [], future: [] }; };
  const pushHistory = (arr: Point[]) => {
    historyRef.current.past.push(arr.map((p) => ({ ...p })));
    if (historyRef.current.past.length > 100) historyRef.current.past.shift();
    historyRef.current.future = [];
  };
  const undoDrawing = () => {
    setDrawingPoints((prev) => {
      const h = historyRef.current;
      if (!h.past.length) return prev;
      h.future.push(prev.map((p) => ({ ...p })));
      return h.past.pop()!;
    });
    setSelectedVertexIdx(null);
  };
  const redoDrawing = () => {
    setDrawingPoints((prev) => {
      const h = historyRef.current;
      if (!h.future.length) return prev;
      h.past.push(prev.map((p) => ({ ...p })));
      return h.future.pop()!;
    });
    setSelectedVertexIdx(null);
  };
  const [zoomedTaludeId, setZoomedTaludeId] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [view, setView] = useState({ scale: 1, tx: 0, ty: 0 });
  const [panState, setPanState] = useState<null | { sx: number; sy: number; tx: number; ty: number; moved: boolean }>(null);
  const [shiftDown, setShiftDown] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageLayerRef = useRef<HTMLDivElement>(null);
  // ── Enhancer de imagem (ajustes + cobertura de logos) ───────────────
  const {
    adj: imgAdj,
    updateAdj: updateImgAdj,
    resetAdj: resetImgAdj,
    masks: imgMasks,
    addMask: addImgMask,
    removeMask: removeImgMask,
    clearMasks: clearImgMasks,
    filter: imgFilter,
  } = useImageEnhancer(selectedMapId);
  const [maskMode, setMaskMode] = useState(false);
  const [maskDrag, setMaskDrag] = useState<null | { sx: number; sy: number; x: number; y: number; w: number; h: number }>(null);
  useEffect(() => { setMaskMode(false); setMaskDrag(null); }, [selectedMapId]);
  useEffect(() => {
    setImgLoaded(false);
    setImgSize(null);
    setView({ scale: 1, tx: 0, ty: 0 });
  }, [imageUrl]);

  // Track Shift (straight-line lock) and Space (pan tool)
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftDown(true);
      if (e.code === "Space") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag !== "INPUT" && tag !== "TEXTAREA") {
          e.preventDefault();
          setSpaceDown(true);
        }
      }
    };
    const ku = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftDown(false);
      if (e.code === "Space") setSpaceDown(false);
    };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  const resetView = () => setView({ scale: 1, tx: 0, ty: 0 });
  const zoomBy = (factor: number) => {
    setView((v) => {
      const newScale = Math.min(8, Math.max(1, v.scale * factor));
      if (newScale === v.scale) return v;
      const r = newScale / v.scale;
      // zoom relative to center (50, 50)
      return { scale: newScale, tx: 50 - (50 - v.tx) * r, ty: 50 - (50 - v.ty) * r };
    });
  };

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      // Auto-zoom (edit / talude focus) supersedes manual wheel
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = ((e.clientX - rect.left) / rect.width) * 100;
      const cy = ((e.clientY - rect.top) / rect.height) * 100;
      // Smoother, finer-grained zoom step
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setView((v) => {
        const newScale = Math.min(8, Math.max(1, v.scale * factor));
        if (newScale === v.scale) return v;
        const r = newScale / v.scale;
        return { scale: newScale, tx: cx - (cx - v.tx) * r, ty: cy - (cy - v.ty) * r };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [imageUrl]);




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

  // Label owner por numero: só a maior parte de cada grupo recebe o número,
  // evitando labels duplicados quando um talude é formado por múltiplas áreas.
  const labelOwnerIds = useMemo(() => {
    const bestByNumero = new Map<number, { id: string; area: number }>();
    for (const t of taludes) {
      if (t.polygon.length < 3) continue;
      // área aproximada (shoelace)
      let a = 0;
      const p = t.polygon;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        a += (p[j].x + p[i].x) * (p[j].y - p[i].y);
      }
      const area = Math.abs(a) / 2;
      const cur = bestByNumero.get(t.numero);
      if (!cur || area > cur.area) bestByNumero.set(t.numero, { id: t.id, area });
    }
    return new Set(Array.from(bestByNumero.values()).map((v) => v.id));
  }, [taludes]);


  const svgRef = useRef<SVGSVGElement>(null);
  const clickToPct = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    const rect = svg?.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;

    // The SVG is stretched 1:1 over the displayed image and may be moved by
    // CSS zoom/pan transforms. getBoundingClientRect() already includes those
    // transforms, so the stored 0..100 coordinates match the exact pixels the
    // user sees and the original-size PNG export draws.
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    return {
      x: Math.max(0, Math.min(100, Number.isFinite(x) ? x : 0)),
      y: Math.max(0, Math.min(100, Number.isFinite(y) ? y : 0)),
    };
  };

  const SNAP_DIST = 1.2;
  const snapPoint = (p: Point, ignoreIdx: number | null = null): { p: Point; snapped: boolean } => {
    let best: { d: number; x: number; y: number } = { d: Infinity, x: p.x, y: p.y };
    for (const t of taludes) {
      if (t.id === editingPolygonFor) continue;
      for (const v of t.polygon) {
        const d = Math.hypot(v.x - p.x, v.y - p.y);
        if (d < best.d) best = { d, x: v.x, y: v.y };
      }
    }
    drawingPoints.forEach((v, i) => {
      if (i === ignoreIdx) return;
      const d = Math.hypot(v.x - p.x, v.y - p.y);
      if (d < best.d) best = { d, x: v.x, y: v.y };
    });
    if (best.d <= SNAP_DIST) return { p: { x: best.x, y: best.y }, snapped: true };
    return { p, snapped: false };
  };

  // Constrain a point to 0°/45°/90° axes relative to an anchor (Shift-lock)
  const constrainStraight = (anchor: Point, p: Point): Point => {
    const dx = p.x - anchor.x;
    const dy = p.y - anchor.y;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const ratio = absX === 0 ? Infinity : absY / absX;
    // 45° band when the two components are close
    if (ratio > 0.4142 && ratio < 2.4142) {
      const m = Math.min(absX, absY);
      return { x: anchor.x + Math.sign(dx) * m, y: anchor.y + Math.sign(dy) * m };
    }
    if (absX >= absY) return { x: p.x, y: anchor.y };
    return { x: anchor.x, y: p.y };
  };

  const CLOSE_SNAP = 1.8;
  const handleMapClick = (e: React.MouseEvent) => {
    if (!drawingNumero && !editingPolygonFor && !drawingNewMode) return;
    if (draggingIdx !== null) return;
    if (spaceDown || panState) return;
    const p = clickToPct(e);
    if (!p) return;
    let candidate = p;
    if (shiftDown && drawingPoints.length > 0) {
      candidate = constrainStraight(drawingPoints[drawingPoints.length - 1], p);
    }
    // Fechamento automático: clicando perto do primeiro vértice, finaliza.
    if (drawingPoints.length >= 3) {
      const first = drawingPoints[0];
      if (Math.hypot(candidate.x - first.x, candidate.y - first.y) <= CLOSE_SNAP) {
        void finishPolygon();
        return;
      }
    }
    const { p: sp } = snapPoint(candidate);
    pushHistory(drawingPoints);
    setDrawingPoints((prev) => [...prev, sp]);
    setSelectedVertexIdx(drawingPoints.length);
  };

  const handleVertexPointerDown = (idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pushHistory(drawingPoints);
    setDraggingIdx(idx);
    setSelectedVertexIdx(idx);
  };
  const handleSvgPointerMove = (e: React.PointerEvent) => {
    const p = clickToPct(e);
    if (!p) return;
    setCursorPct(p);
    if (draggingIdx === null) {
      setSnapHint(null);
      return;
    }
    let candidate = p;
    if (shiftDown && drawingPoints.length > 1) {
      const anchor =
        drawingPoints[(draggingIdx - 1 + drawingPoints.length) % drawingPoints.length];
      candidate = constrainStraight(anchor, p);
    }
    const { p: sp, snapped } = snapPoint(candidate, draggingIdx);
    setSnapHint(snapped ? sp : null);
    setDrawingPoints((prev) => prev.map((pt, i) => (i === draggingIdx ? sp : pt)));
  };

  const handleSvgPointerUp = () => {
    setDraggingIdx(null);
    setSnapHint(null);
  };
  const removeVertex = (idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    pushHistory(drawingPoints);
    setDrawingPoints((prev) => prev.filter((_, i) => i !== idx));
    setSelectedVertexIdx(null);
  };
  const insertVertexAt = (afterIdx: number, p: Point) => {
    pushHistory(drawingPoints);
    setDrawingPoints((prev) => {
      const arr = [...prev];
      arr.splice(afterIdx + 1, 0, p);
      return arr;
    });
    setSelectedVertexIdx(afterIdx + 1);
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
        const metrics = realMetrics(drawingPoints, {
          imageWidthPx: map.image_width,
          imageHeightPx: map.image_height,
          metersPerPixel: (map as { escala_m_por_px?: number | null }).escala_m_por_px ?? null,
        });
        await upsertFn({
          data: {
            id: existing.id,
            map_id: map.id,
            numero: existing.numero,
            polygon: drawingPoints,
            area_m2: metrics.areaM2,
            perimetro_m: metrics.perimetroM,
          },
        });
        toast.success(`Talude ${existing.numero}: área atualizada`);
        setDrawingPoints([]);
        setDrawingNumero("");
        setEditingPolygonFor(null);
        await qc.invalidateQueries({ queryKey: ["talude-map-detail", map.id] });
        return;
      }

      // New talude flow: if number already typed, save; otherwise open prompt.
      if (drawingNumero) {
        await commitNewTalude(drawingNumero);
      } else {
        // Suggest the next available number
        const used = new Set(taludes.map((t) => t.numero));
        let next = 1;
        while (used.has(next)) next++;
        setPendingNumber(String(next));
        setNumberPromptOpen(true);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar");
    }
  };

  const commitNewTalude = async (numStr: string) => {
    if (!map) return;
    const num = parseInt(numStr, 10);
    if (!num || num <= 0) {
      toast.error("Número do talude inválido");
      return;
    }
    const existingList = taludes.filter((t) => t.numero === num);
    const metrics = realMetrics(drawingPoints, {
      imageWidthPx: map.image_width,
      imageHeightPx: map.image_height,
      metersPerPixel: (map as { escala_m_por_px?: number | null }).escala_m_por_px ?? null,
    });

    if (existingList.length > 0) {
      // Mantém a numeração e a data original do primeiro registro; substitui
      // a demarcação pela nova e remove as partes antigas para que o número
      // sempre exiba apenas a demarcação mais recente.
      const primary = existingList.reduce((a, b) => {
        const ad = a.data_programada || "9999-99-99";
        const bd = b.data_programada || "9999-99-99";
        return ad <= bd ? a : b;
      });
      await upsertFn({
        data: {
          id: primary.id,
          map_id: map.id,
          numero: primary.numero,
          polygon: drawingPoints,
          status: primary.status,
          data_programada: primary.data_programada,
          area_m2: metrics.areaM2,
          perimetro_m: metrics.perimetroM,
        },
      });
      for (const extra of existingList) {
        if (extra.id !== primary.id) {
          await deleteFn({ data: { id: extra.id } });
        }
      }
      toast.success(`Talude ${num}: demarcação substituída (data original preservada)`);
    } else {
      await upsertFn({
        data: {
          map_id: map.id,
          numero: num,
          polygon: drawingPoints,
          status: "programado",
          data_programada: today(),
          area_m2: metrics.areaM2,
          perimetro_m: metrics.perimetroM,
        },
      });
      toast.success(`Talude ${num} criado`);
    }

    setDrawingPoints([]);
    setDrawingNumero("");
    setDrawingNewMode(false);
    setNumberPromptOpen(false);
    setPendingNumber("");
    setEditingPolygonFor(null);
    await qc.invalidateQueries({ queryKey: ["talude-map-detail", map.id] });
  };

  const cancelDrawing = () => {
    setDrawingPoints([]);
    setDrawingNumero("");
    setDrawingNewMode(false);
    setNumberPromptOpen(false);
    setPendingNumber("");
    setEditingPolygonFor(null);
    setSelectedVertexIdx(null);
    setSnapHint(null);
    setCursorPct(null);
    resetHistory();
  };

  // Keyboard shortcuts while drawing/editing polygon
  useEffect(() => {
    const isDrawing = !!(drawingNumero || editingPolygonFor || drawingNewMode);
    if (!isDrawing) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && !e.shiftKey && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        undoDrawing();
        return;
      }
      if (mod && ((e.shiftKey && (e.key === "z" || e.key === "Z")) || e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redoDrawing();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        cancelDrawing();
      } else if (e.key === "Enter" && drawingPoints.length >= 3) {
        e.preventDefault();
        void finishPolygon();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedVertexIdx !== null) {
        e.preventDefault();
        pushHistory(drawingPoints);
        setDrawingPoints((prev) => prev.filter((_, i) => i !== selectedVertexIdx));
        setSelectedVertexIdx(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawingNumero, editingPolygonFor, drawingNewMode, selectedVertexIdx, drawingPoints]);

  const startRedraw = (t: TaludeRow) => {
    resetHistory();
    setEditingPolygonFor(t.id);
    setDrawingPoints(t.polygon.map((p) => ({ ...p })));
    setDrawingNumero("");
    setSelectedTaludeId(t.id);
    toast.info(`Editando talude ${t.numero} — arraste os pontos, clique para adicionar, botão direito para remover. Ctrl+Z desfaz.`);
  };

  // Inicia nova demarcação para o mesmo número: ao finalizar, substitui a
  // demarcação existente preservando a data original.
  const startNewPart = (t: TaludeRow) => {
    resetHistory();
    setEditingPolygonFor(null);
    setDrawingPoints([]);
    setDrawingNewMode(true);
    setDrawingNumero(String(t.numero));
    setSelectedTaludeId(t.id);
    toast.info(`Redemarcar talude ${t.numero} — a área anterior será substituída, mantendo a data original`);
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
          cor: patch.cor !== undefined ? patch.cor : t.cor,
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

  const clearResidualUIFor = (id: string) => {
    setSelectedTaludeId((cur) => (cur === id ? null : cur));
    setHoverId((cur) => (cur === id ? null : cur));
    setZoomedTaludeId((cur) => (cur === id ? null : cur));
    if (editingPolygonFor === id) {
      setEditingPolygonFor(null);
      setDrawingPoints([]);
      setDrawingNumero("");
    }
  };

  const removeTalude = async (t: TaludeRow) => {
    if (!confirm(`Excluir talude ${t.numero}?`)) return;
    try {
      await deleteFn({ data: { id: t.id } });
      clearResidualUIFor(t.id);
      if (map) await qc.invalidateQueries({ queryKey: ["talude-map-detail", map.id] });
      toast.success(`Talude ${t.numero} removido`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  };

  const runAudit = async (dryRun = false) => {
    if (!map) return;
    setAuditing(true);
    try {
      const report = await verifyFn({ data: { map_id: map.id, dry_run: dryRun } });
      setAuditReport(report);
      await qc.invalidateQueries({ queryKey: ["talude-map-detail", map.id] });
      // Also purge UI state for any talude that no longer exists after the audit
      const stillExists = new Set(taludes.map((x) => x.id));
      if (selectedTaludeId && !stillExists.has(selectedTaludeId)) setSelectedTaludeId(null);
      if (hoverId && !stillExists.has(hoverId)) setHoverId(null);
      if (zoomedTaludeId && !stillExists.has(zoomedTaludeId)) setZoomedTaludeId(null);
      if (editingPolygonFor && !stillExists.has(editingPolygonFor)) {
        setEditingPolygonFor(null);
        setDrawingPoints([]);
      }
      const totalIssues = report.checks.length;
      if (totalIssues === 0) {
        toast.success("Nenhum problema encontrado ✓");
      } else {
        toast.success(
          `Auditoria: ${report.fixed.length} correções aplicadas · ${report.unresolved.length} pendente(s)`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na auditoria");
    } finally {
      setAuditing(false);
    }
  };

  const doExport = async () => {
    if (!map || !imageUrl) return;
    try {
      toast.info("Gerando PNG…");
      const { exportMapPNG } = await import("@/lib/taludes/export");
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

  const doExportPDF = async () => {
    if (!map || !imageUrl) return;
    try {
      toast.info("Gerando relatório PDF…");
      const { buildSlopeReport } = await import("@/lib/taludes/report");
      const blob = await buildSlopeReport(
        {
          nome: map.nome,
          imageUrl,
          imageWidthPx: map.image_width,
          imageHeightPx: map.image_height,
          metersPerPixel: (map as { escala_m_por_px?: number | null }).escala_m_por_px ?? null,
        },
        taludes.map((t) => ({
          numero: t.numero,
          nome: t.nome,
          status: t.status,
          polygon: t.polygon,
          data_programada: t.data_programada,
          data_execucao: t.data_execucao,
          data_conclusao: t.data_conclusao,
          proxima_data: t.proxima_data,
          periodicidade_dias: t.periodicidade_dias,
        })),
      );
      downloadBlob(blob, `taludes_${map.nome.replace(/\s+/g, "_")}_${today()}.pdf`);
      toast.success("Relatório PDF gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar PDF");
    }
  };

  const doExportDXF = async () => {
    if (!map) return;
    try {
      toast.info("Gerando DXF…");
      const { dxfBlob } = await import("@/lib/taludes/dxf");
      const blob = dxfBlob({
        mapName: map.nome,
        imageWidthPx: map.image_width,
        imageHeightPx: map.image_height,
        metersPerPixel: (map as { escala_m_por_px?: number | null }).escala_m_por_px ?? null,
        taludes: taludes.map((t) => ({
          numero: t.numero,
          nome: t.nome,
          status: t.status,
          polygon: t.polygon,
        })),
      });
      downloadBlob(blob, `taludes_${map.nome.replace(/\s+/g, "_")}_${today()}.dxf`);
      toast.success("DXF gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar DXF");
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
                Mapa site Sherwin Williams - Demarchi
              </h3>
              <p className="text-xs text-muted-foreground">
                Carrega a planta oficial da unidade DEMARCHI já otimizada, pronta para demarcação
                dos taludes.
              </p>
              <Button onClick={createRefMap} disabled={creating} variant="secondary" className="w-full">
                <MapPin className="mr-2 h-4 w-4" />
                Carregar Mapa site Sherwin Williams - Demarchi
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
              <SelectTrigger className="w-full sm:min-w-[280px] sm:max-w-[420px]">
                <SelectValue placeholder="Selecionar mapa" />
              </SelectTrigger>
              <SelectContent className="max-w-[calc(100vw-2rem)] sm:max-w-[420px]">
                {mapsQuery.data.map((m: { id: string; nome: string }) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="block truncate">{m.nome}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            variant="outline"
            onClick={() => setAutoMarkOpen(true)}
            disabled={!map}
            title="Detectar áreas em uma imagem anotada e criar os taludes automaticamente"
          >
            <Wand2 className="mr-2 h-4 w-4" />
            Auto‑marcar
          </Button>
          <Button
            variant="outline"
            onClick={() => runAudit(false)}
            disabled={!map || auditing}
            title="Verificar e reparar inconsistências"
          >
            <ShieldCheck className={`mr-2 h-4 w-4 ${auditing ? "animate-pulse" : ""}`} />
            {auditing ? "Auditando…" : "Auditoria"}
          </Button>
          <Button variant="outline" onClick={doExport} disabled={!imageUrl || taludes.length === 0}>
            <Download className="mr-2 h-4 w-4" /> Baixar PNG
          </Button>
          <Button variant="default" onClick={doExportPDF} disabled={!imageUrl || taludes.length === 0} title="Relatório PDF com capa e detalhamento">
            <Download className="mr-2 h-4 w-4" /> Relatório PDF
          </Button>
          <Button variant="outline" onClick={doExportDXF} disabled={taludes.length === 0} title="Exportar geometria em DXF (AutoCAD) — cada talude em uma layer">
            <Download className="mr-2 h-4 w-4" /> DXF
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
            <TooltipProvider delayDuration={150}>
              <div className="animate-fade-in flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-2 py-1 shadow-sm backdrop-blur">
                <Info className="h-3 w-3 text-muted-foreground" />
                <span className="mr-1 text-[10px] uppercase tracking-widest text-muted-foreground">
                  Status
                </span>
                {(["programado", "em_execucao", "finalizado"] as TaludeStatus[]).map((s) => {
                  const meta = STATUS_META[s];
                  const Icon = statusIcon[s];
                  return (
                    <Tooltip key={s}>
                      <TooltipTrigger asChild>
                        <span
                          className="inline-flex cursor-help items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm transition-transform hover:scale-105"
                          style={{ background: meta.fill }}
                        >
                          <span
                            className="inline-block h-2 w-2 rounded-full ring-2 ring-white/40"
                            style={{ background: "#fff" }}
                          />
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="text-xs">
                        {s === "programado" && "Talude planejado, aguardando execução."}
                        {s === "em_execucao" && "Manutenção em andamento no talude."}
                        {s === "finalizado" && "Serviço concluído. Próxima data calculada automaticamente."}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
            <div className="ml-auto flex items-center gap-2">
              {drawingNewMode || drawingNumero || editingPolygonFor ? (
                <>
                  <div className="animate-fade-in flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-[11px] font-medium shadow-sm backdrop-blur">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/60" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                    </span>
                    <span className="font-semibold text-primary">
                      {editingPolygonFor ? "Editando" : "Demarcando"}
                    </span>
                    <span className="text-muted-foreground">·</span>
                    <span>
                      <strong className="text-foreground">{drawingPoints.length}</strong> ponto{drawingPoints.length === 1 ? "" : "s"}
                    </span>
                    {cursorPct && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span className="tabular-nums text-muted-foreground">
                          {cursorPct.x.toFixed(1)}, {cursorPct.y.toFixed(1)}
                        </span>
                      </>
                    )}
                    {snapHint && (
                      <span className="ml-1 rounded-full bg-cyan-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-300">
                        snap
                      </span>
                    )}
                  </div>
                  <div className="hidden items-center gap-1 text-[10px] text-muted-foreground md:flex">
                    <kbd className="rounded border border-border/60 bg-muted px-1 py-0.5 font-mono">Del</kbd>
                    <span>remove</span>
                    <kbd className="ml-1 rounded border border-border/60 bg-muted px-1 py-0.5 font-mono">Esc</kbd>
                    <span>cancela</span>
                  </div>
                  <Button size="sm" onClick={finishPolygon} disabled={drawingPoints.length < 3}>
                    <Save className="mr-1 h-3.5 w-3.5" /> Finalizar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelDrawing}>
                    <X className="mr-1 h-3.5 w-3.5" /> Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  size="sm"
                  onClick={() => {
                    resetHistory();
                    setDrawingPoints([]);
                    setDrawingNewMode(true);
                    setDrawingNumero("");
                    toast.info("Clique no mapa para adicionar pontos (≥3). Ctrl+Z desfaz. O número será solicitado ao finalizar.");
                  }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Novo talude
                </Button>
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

          {(() => {
            // ─── zoom & transform ───
            const isDrawing = !!(drawingNumero || editingPolygonFor || drawingNewMode);
            const zoomTarget =
              taludes.find((x) => x.id === (editingPolygonFor || zoomedTaludeId)) || null;
            let transform: string | undefined;
            let originStr: string | undefined;
            let usingAutoZoom = false;
            if (zoomTarget && zoomTarget.polygon.length >= 3) {
              let minX = 100, minY = 100, maxX = 0, maxY = 0;
              for (const p of zoomTarget.polygon) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
              }
              const w = Math.max(4, maxX - minX);
              const h = Math.max(4, maxY - minY);
              const cx = (minX + maxX) / 2;
              const cy = (minY + maxY) / 2;
              const s = Math.min(4.5, 80 / Math.max(w, h));
              originStr = `${cx}% ${cy}%`;
              transform = `translate(${50 - cx}%, ${50 - cy}%) scale(${s})`;
              usingAutoZoom = true;
            } else {
              originStr = "0 0";
              transform = `translate(${view.tx}%, ${view.ty}%) scale(${view.scale})`;
            }

            // Pan disponível sempre que houver zoom — durante desenho use Space
            // ou o botão do meio do mouse para não conflitar com a marcação.
            const canPan = !usingAutoZoom && view.scale > 1;
            const onPanDown = (e: React.PointerEvent) => {
              if (!canPan) return;
              const middle = e.button === 1;
              const leftWithModifier = e.button === 0 && (spaceDown || !isDrawing);
              if (!middle && !leftWithModifier) return;
              e.preventDefault();
              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
              setPanState({ sx: e.clientX, sy: e.clientY, tx: view.tx, ty: view.ty, moved: false });
            };
            const onPanMove = (e: React.PointerEvent) => {
              if (!panState) return;
              const el = viewportRef.current;
              if (!el) return;
              const rect = el.getBoundingClientRect();
              const dx = ((e.clientX - panState.sx) / rect.width) * 100;
              const dy = ((e.clientY - panState.sy) / rect.height) * 100;
              if (!panState.moved && (Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3)) {
                setPanState({ ...panState, moved: true });
              }
              setView((v) => ({ ...v, tx: panState.tx + dx, ty: panState.ty + dy }));
            };
            const onPanUp = () => setPanState(null);
            const panCursor =
              canPan && (spaceDown || !isDrawing)
                ? panState
                  ? "grabbing"
                  : "grab"
                : undefined;

            return (
              <div
                ref={viewportRef}
                className="relative mx-auto flex items-center justify-center overflow-hidden rounded-xl border border-border/50 bg-black/5"
                onPointerDown={onPanDown}
                onPointerMove={onPanMove}
                onPointerUp={onPanUp}
                onPointerLeave={onPanUp}
                onContextMenu={(e) => { if (panState) e.preventDefault(); }}
                style={{
                  cursor: panCursor,
                  touchAction: "none",
                  // Container respects the image's real aspect ratio and
                  // grows up to the image's natural resolution, capped only
                  // by the available viewport. This shows the map ENTIRELY
                  // at 1:1 pixels when there is room, and scales down
                  // proportionally on smaller screens without cropping.
                  width: imgSize ? `min(100%, ${imgSize.w}px)` : "100%",
                  height: "auto",
                  maxWidth: "100%",
                  maxHeight: imgSize
                    ? `min(${imgSize.h}px, calc(100dvh - 4rem))`
                    : "calc(100dvh - 4rem)",
                  aspectRatio: imgSize ? `${imgSize.w} / ${imgSize.h}` : undefined,
                }}
              >



                {/* zoom toolbar */}
                {imageUrl && (
                  <div className="pointer-events-none absolute right-2 top-2 z-20 flex flex-col gap-1">
                    <Button
                      size="icon"
                      variant="secondary"
                      className="pointer-events-auto h-8 w-8 shadow-lg"
                      onClick={() => zoomBy(1.25)}
                      disabled={usingAutoZoom || view.scale >= 8}
                      title="Aproximar (roda do mouse)"
                    >
                      <ZoomIn className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="pointer-events-auto h-8 w-8 shadow-lg"
                      onClick={() => zoomBy(1 / 1.25)}
                      disabled={usingAutoZoom || view.scale <= 1}
                      title="Afastar"
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    {!usingAutoZoom && view.scale > 1 && (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="pointer-events-auto h-8 w-8 shadow-lg"
                        onClick={resetView}
                        title="Restaurar zoom"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    )}
                    {(zoomedTaludeId || editingPolygonFor) ? (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="pointer-events-auto h-8 w-8 shadow-lg"
                        onClick={() => setZoomedTaludeId(null)}
                        title="Sair do foco no talude"
                      >
                        <ZoomOut className="h-4 w-4" />
                      </Button>
                    ) : (
                      selected && (
                        <Button
                          size="icon"
                          variant="secondary"
                          className="pointer-events-auto h-8 w-8 shadow-lg"
                          onClick={() => setZoomedTaludeId(selected.id)}
                          title={`Focar no talude ${selected.numero}`}
                        >
                          <MapPin className="h-4 w-4" />
                        </Button>
                      )
                    )}
                    <ImageEnhancerControls
                      adj={imgAdj}
                      updateAdj={updateImgAdj}
                      resetAdj={resetImgAdj}
                      maskMode={maskMode}
                      onToggleMaskMode={() => setMaskMode((v) => !v)}
                      maskCount={imgMasks.length}
                      onClearMasks={clearImgMasks}
                    />
                  </div>
                )}
                {imageUrl ? (
                  <div
                    ref={imageLayerRef}
                    data-talude-image-layer
                    className="relative block h-full w-full align-middle"
                    style={{
                      transform,
                      transformOrigin: originStr,
                      transition: panState ? "none" : "transform 400ms cubic-bezier(0.22, 1, 0.36, 1)",
                      willChange: "transform",
                      lineHeight: 0,
                      // Wrapper fills the viewport (which itself uses the
                      // image's aspect ratio). SVG overlay and PNG export
                      // therefore share the exact same 0..100 coord system.
                    }}
                  >
                    {!imgLoaded && (
                      <div className="absolute inset-0 z-10 animate-pulse bg-gradient-to-br from-muted/40 via-muted/20 to-muted/40" />

                    )}
                    <img
                      src={imageUrl}
                      alt={map?.nome}
                      className="block h-full w-full select-none"
                      draggable={false}
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      style={{
                        filter: imgFilter,
                        display: "block",
                        objectFit: "fill",
                      }}
                      onLoad={(e) => {
                        const el = e.currentTarget;
                        setImgLoaded(true);
                        if (el.naturalWidth && el.naturalHeight) {
                          setImgSize({ w: el.naturalWidth, h: el.naturalHeight });
                        }
                      }}
                    />



                    <LogoMaskOverlay
                      masks={imgMasks}
                      showHandles={maskMode}
                      onRemove={removeImgMask}
                    />
                    {maskMode && (
                      <div
                        className="absolute inset-0 z-20 cursor-crosshair"
                        style={{ touchAction: "none" }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.preventDefault();
                          e.stopPropagation();
                          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                          const r = e.currentTarget.getBoundingClientRect();
                          const x = ((e.clientX - r.left) / r.width) * 100;
                          const y = ((e.clientY - r.top) / r.height) * 100;
                          setMaskDrag({ sx: x, sy: y, x, y, w: 0, h: 0 });
                        }}
                        onPointerMove={(e) => {
                          if (!maskDrag) return;
                          const r = e.currentTarget.getBoundingClientRect();
                          const x = ((e.clientX - r.left) / r.width) * 100;
                          const y = ((e.clientY - r.top) / r.height) * 100;
                          setMaskDrag({
                            ...maskDrag,
                            x: Math.min(maskDrag.sx, x),
                            y: Math.min(maskDrag.sy, y),
                            w: Math.abs(x - maskDrag.sx),
                            h: Math.abs(y - maskDrag.sy),
                          });
                        }}
                        onPointerUp={async () => {
                          const d = maskDrag;
                          setMaskDrag(null);
                          if (!d || d.w < 0.5 || d.h < 0.5 || !imageUrl) return;
                          const color = await sampleBorderColor(imageUrl, { x: d.x, y: d.y, w: d.w, h: d.h });
                          addImgMask({
                            id: crypto.randomUUID(),
                            x: d.x, y: d.y, w: d.w, h: d.h,
                            color,
                          });
                        }}
                      >
                        {maskDrag && (
                          <div
                            className="absolute border-2 border-primary bg-primary/20"
                            style={{
                              left: `${maskDrag.x}%`,
                              top: `${maskDrag.y}%`,
                              width: `${maskDrag.w}%`,
                              height: `${maskDrag.h}%`,
                            }}
                          />
                        )}
                      </div>
                    )}
                    <svg
                      ref={svgRef}
                      onClick={handleMapClick}
                      onDoubleClick={(e) => {
                        if (drawingPoints.length >= 3) {
                          e.stopPropagation();
                          void finishPolygon();
                        }
                      }}
                      onPointerMove={handleSvgPointerMove}
                      onPointerUp={handleSvgPointerUp}
                      onPointerLeave={handleSvgPointerUp}
                      viewBox="0 0 100 100"
                      preserveAspectRatio="none"
                      data-talude-svg
                      className={`absolute inset-0 h-full w-full ${isDrawing ? "cursor-crosshair" : ""}`}
                    >
                      {taludes.map((t) => {
                        if (t.polygon.length < 3) return null;
                        const meta = STATUS_META[t.status];
                        const isSel = t.id === selectedTaludeId;
                        const isHover = t.id === hoverId;
                        const isEditing = t.id === editingPolygonFor;
                        if (isEditing) return null;
                        const pts = t.polygon.map((p) => `${p.x},${p.y}`).join(" ");
                        const anchor = polygonLabelAnchor(t.polygon);
                        const cx = anchor.number.x;
                        const cy = anchor.number.y;
                        return (
                          <g
                            key={t.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isDrawing) return;
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
                              fill={t.cor || meta.fill}
                              fillOpacity={isSel ? 0.72 : isHover ? 0.62 : 0.5}
                              stroke={t.cor || meta.stroke}
                              strokeWidth={isSel || isHover ? 0.6 : 0.35}
                              strokeLinejoin="round"
                              style={{
                                transition: "fill 300ms ease, fill-opacity 300ms ease, stroke-width 200ms ease",
                                filter:
                                  t.status === "em_execucao"
                                    ? `drop-shadow(0 0 0.7px ${meta.glow})`
                                    : isHover || isSel
                                      ? `drop-shadow(0 0 0.6px ${meta.glow})`
                                      : undefined,
                                animation: t.status === "em_execucao" ? "taludePulse 2s ease-in-out infinite" : undefined,
                              }}
                            />
                            {/* number label — apenas na maior parte do grupo (evita labels duplicados) */}
                            {labelOwnerIds.has(t.id) && (
                              <text
                                x={cx}
                                y={cy}
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
                            )}

                          </g>
                        );
                      })}
                      {/* Reference grid while drawing/editing */}
                      {isDrawing && (
                        <g pointerEvents="none">
                          {Array.from({ length: 9 }).map((_, i) => (
                            <line
                              key={`gv-${i}`}
                              x1={(i + 1) * 10}
                              y1={0}
                              x2={(i + 1) * 10}
                              y2={100}
                              stroke="rgba(255,255,255,0.55)"
                              strokeWidth={0.05}
                              strokeDasharray="0.35,0.35"
                            />
                          ))}
                          {Array.from({ length: 9 }).map((_, i) => (
                            <line
                              key={`gh-${i}`}
                              x1={0}
                              y1={(i + 1) * 10}
                              x2={100}
                              y2={(i + 1) * 10}
                              stroke="rgba(255,255,255,0.55)"
                              strokeWidth={0.05}
                              strokeDasharray="0.35,0.35"
                            />
                          ))}
                        </g>
                      )}
                      {/* drawing / editing preview with draggable vertices */}
                      {drawingPoints.length > 0 && (() => {
                        const accent = editingPolygonFor ? "#8b5cf6" : "#ef4444";
                        return (
                        <>
                          <polygon
                            points={drawingPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                            fill={accent}
                            fillOpacity="0.22"
                            stroke={accent}
                            strokeWidth="0.35"
                            strokeDasharray="0.8,0.6"
                          />
                          {/* Midpoint insert markers */}
                          {drawingPoints.length >= 2 && drawingPoints.map((p, i) => {
                            const next = drawingPoints[(i + 1) % drawingPoints.length];
                            const mx = (p.x + next.x) / 2;
                            const my = (p.y + next.y) / 2;
                            return (
                              <g key={`mid-${i}`} style={{ cursor: "copy" }}
                                onClick={(e) => { e.stopPropagation(); insertVertexAt(i, { x: mx, y: my }); }}
                              >
                                <circle cx={mx} cy={my} r={0.9} fill="transparent" />
                                <circle cx={mx} cy={my} r={0.32} fill="#fff" stroke={accent} strokeWidth={0.1} opacity={0.85} />
                                <line x1={mx - 0.18} y1={my} x2={mx + 0.18} y2={my} stroke={accent} strokeWidth={0.09} strokeLinecap="round" />
                                <line x1={mx} y1={my - 0.18} x2={mx} y2={my + 0.18} stroke={accent} strokeWidth={0.09} strokeLinecap="round" />
                              </g>
                            );
                          })}
                          {/* Snap indicator */}
                          {snapHint && (
                            <g pointerEvents="none">
                              <circle cx={snapHint.x} cy={snapHint.y} r={1.4} fill="none" stroke="#22d3ee" strokeWidth={0.12} strokeDasharray="0.4,0.3" />
                              <circle cx={snapHint.x} cy={snapHint.y} r={0.25} fill="#22d3ee" />
                            </g>
                          )}
                          {/* Vertex markers — halo + core + hit area */}
                          {drawingPoints.map((p, i) => {
                            const isDrag = draggingIdx === i;
                            const isSel = selectedVertexIdx === i;
                            return (
                              <g key={`v-${i}`}>
                                {(isDrag || isSel) && (
                                  <circle cx={p.x} cy={p.y} r={0.75} fill={accent} fillOpacity={0.14} />
                                )}
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r={isDrag ? 0.28 : isSel ? 0.26 : 0.42}
                                  fill="#ffffff"
                                  stroke={accent}
                                  strokeWidth={isDrag || isSel ? 0.12 : 0.16}
                                />

                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r={isDrag ? 0.14 : isSel ? 0.13 : 0.22}
                                  fill={accent}
                                  pointerEvents="none"
                                />
                                {/* Enlarged transparent hit area for easier grab */}
                                <circle
                                  cx={p.x}
                                  cy={p.y}
                                  r={1.6}
                                  fill="transparent"
                                  style={{ cursor: isDrag ? "grabbing" : "grab", touchAction: "none" }}
                                  onPointerDown={(e) => handleVertexPointerDown(i, e)}
                                  onClick={(e) => { e.stopPropagation(); setSelectedVertexIdx(i); }}
                                  onContextMenu={(e) => removeVertex(i, e)}
                                />
                                {/* Small index label above vertex */}
                                <text
                                  x={p.x}
                                  y={p.y - 1.4}
                                  textAnchor="middle"
                                  fontSize="1.4"
                                  fontWeight="700"
                                  fill="#0f172a"
                                  stroke="#ffffff"
                                  strokeWidth="0.3"
                                  style={{ paintOrder: "stroke", pointerEvents: "none" }}
                                >
                                  {i + 1}
                                </text>
                              </g>
                            );
                          })}
                          {/* Guide line + close preview + close halo on first vertex */}
                          {isDrawing && cursorPct && draggingIdx === null && drawingPoints.length > 0 && (() => {
                            const last = drawingPoints[drawingPoints.length - 1];
                            const first = drawingPoints[0];
                            const nearFirst =
                              drawingPoints.length >= 3 &&
                              Math.hypot(cursorPct.x - first.x, cursorPct.y - first.y) <= CLOSE_SNAP;
                            return (
                              <g pointerEvents="none">
                                <line
                                  x1={last.x}
                                  y1={last.y}
                                  x2={cursorPct.x}
                                  y2={cursorPct.y}
                                  stroke={accent}
                                  strokeWidth={0.12}
                                  strokeDasharray="0.6,0.4"
                                  opacity={0.9}
                                />
                                {drawingPoints.length >= 3 && (
                                  <line
                                    x1={cursorPct.x}
                                    y1={cursorPct.y}
                                    x2={first.x}
                                    y2={first.y}
                                    stroke={nearFirst ? "#22c55e" : accent}
                                    strokeWidth={nearFirst ? 0.2 : 0.09}
                                    strokeDasharray="0.4,0.35"
                                    opacity={nearFirst ? 0.95 : 0.55}
                                  />
                                )}
                                {drawingPoints.length >= 3 && (
                                  <>
                                    <circle
                                      cx={first.x}
                                      cy={first.y}
                                      r={nearFirst ? 1.9 : 1.2}
                                      fill="none"
                                      stroke="#22c55e"
                                      strokeWidth={nearFirst ? 0.2 : 0.12}
                                      opacity={nearFirst ? 1 : 0.6}
                                      style={{ transition: "r 120ms ease" }}
                                    />
                                    {nearFirst && (
                                      <text
                                        x={first.x}
                                        y={first.y - 2.4}
                                        textAnchor="middle"
                                        fontSize="1.6"
                                        fontWeight="800"
                                        fill="#052e16"
                                        stroke="#bbf7d0"
                                        strokeWidth="0.35"
                                        style={{ paintOrder: "stroke" }}
                                      >
                                        Fechar
                                      </text>
                                    )}
                                  </>
                                )}
                              </g>
                            );
                          })()}
                          {/* Cursor crosshair while drawing (not dragging) */}
                          {isDrawing && cursorPct && draggingIdx === null && (
                            <g pointerEvents="none" opacity={0.85}>
                              <line x1={cursorPct.x - 1.2} y1={cursorPct.y} x2={cursorPct.x + 1.2} y2={cursorPct.y} stroke={accent} strokeWidth={0.08} />
                              <line x1={cursorPct.x} y1={cursorPct.y - 1.2} x2={cursorPct.x} y2={cursorPct.y + 1.2} stroke={accent} strokeWidth={0.08} />
                            </g>
                          )}
                        </>
                        );
                      })()}
                    </svg>

                    {/* ─── Modern floating date pills (HTML, crisp typography) ─── */}
                    {taludes.map((t) => {
                      if (t.polygon.length < 3) return null;
                      const dateIso =
                        t.status === "finalizado"
                          ? t.proxima_data || t.data_conclusao
                          : t.status === "em_execucao"
                            ? t.data_execucao
                            : t.data_programada;
                      if (!dateIso) return null;
                      const anchor = polygonLabelAnchor(t.polygon);
                      const isSel = t.id === selectedTaludeId;
                      const meta = STATUS_META[t.status];
                      const prefix =
                        t.status === "finalizado" ? "Próx" : t.status === "em_execucao" ? "Exec" : "Prog";
                      return (
                        <div
                          key={`pill-${t.id}`}
                          className="pointer-events-none absolute z-[5] -translate-x-1/2 animate-fade-in"
                          style={{
                            left: `${anchor.date.x}%`,
                            top: `${anchor.date.y}%`,
                            transform:
                              anchor.datePlacement === "below"
                                ? "translate(-50%, 0)"
                                : "translate(-50%, -100%)",
                            transition: "transform 300ms ease",
                          }}
                        >
                          <div
                            className={`flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)] backdrop-blur-sm ring-1 ring-white/20 ${
                              isSel ? "scale-125" : ""
                            }`}
                            style={{
                              background: "rgba(15,23,42,0.88)",
                              transition: "transform 300ms ease, box-shadow 300ms ease",
                            }}
                          >
                            <span
                              className="inline-block h-1.5 w-1.5 rounded-full"
                              style={{ background: meta.fill, boxShadow: `0 0 6px ${meta.glow}` }}
                            />
                            <span className="opacity-70">{prefix}</span>
                            <span>{fmtBr(dateIso)}</span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Hover tooltip (HTML, positioned in % over image) */}
                    {hoverId && hoverPos && !editingPolygonFor && !drawingNumero && (() => {
                      const t = taludes.find((x) => x.id === hoverId);
                      if (!t) return null;
                      const meta = STATUS_META[t.status];
                      const left = Math.min(hoverPos.x, 75);
                      const top = Math.min(hoverPos.y + 2, 90);
                      return (
                        <div
                          className="pointer-events-none absolute z-10 min-w-[170px] animate-fade-in rounded-lg border border-border/60 bg-background/95 p-2.5 text-[11px] shadow-xl backdrop-blur"
                          style={{ left: `${left}%`, top: `${top}%` }}
                        >
                          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full ring-2 ring-white/50"
                              style={{ background: meta.fill, boxShadow: `0 0 8px ${meta.glow}` }}
                            />
                            Talude {t.numero}
                            <span className="ml-auto text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                              {meta.label}
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-muted-foreground">
                            <div>Prog: <strong className="text-foreground">{fmtBr(t.data_programada)}</strong></div>
                            <div>Exec: <strong className="text-foreground">{fmtBr(t.data_execucao)}</strong></div>
                            <div>Conc: <strong className="text-foreground">{fmtBr(t.data_conclusao)}</strong></div>
                            <div>Próx: <strong className="text-foreground">{fmtBr(t.proxima_data)}</strong></div>
                          </div>
                        </div>
                      );
                    })()}
                    <style>{`@keyframes taludePulse { 0%,100% { fill-opacity: 0.5 } 50% { fill-opacity: 0.78 } }`}</style>
                  </div>
                ) : (
                  <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Carregando mapa…
                  </div>
                )}
              </div>
            );
          })()}
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
                onNewPart={() => startNewPart(selected)}

                onDelete={() => removeTalude(selected)}
                onBumpDate={(days) => bumpDate(selected, days)}
                onCycleStatus={() => cycleStatus(selected)}
                saving={updateMutation.isPending}
              />
            </GlassCard>
          )}
        </div>
      </div>
      <AuditReportDialog report={auditReport} onClose={() => setAuditReport(null)} />

      {/* Prompt de número do talude ao finalizar demarcação */}
      <Dialog
        open={numberPromptOpen}
        onOpenChange={(v) => {
          if (!v) setNumberPromptOpen(false);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" /> Número do talude
            </DialogTitle>
            <DialogDescription>
              Área demarcada com {drawingPoints.length} pontos. Informe o número identificador do
              talude para concluir o cadastro.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              commitNewTalude(pendingNumber);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="talude-numero" className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Nº do talude
              </Label>
              <Input
                id="talude-numero"
                type="number"
                min={1}
                autoFocus
                value={pendingNumber}
                onChange={(e) => setPendingNumber(e.target.value)}
                placeholder="Ex.: 12"
                className="h-11 text-lg font-semibold"
              />
              <p className="text-[11px] text-muted-foreground">
                Sugestão: próximo número livre pré-preenchido.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setNumberPromptOpen(false);
                }}
              >
                Continuar editando
              </Button>
              <Button type="submit" disabled={!pendingNumber}>
                <Save className="mr-1.5 h-4 w-4" /> Salvar talude
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Otimização de impressão do mapa */}
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { background: #fff !important; }
          /* Esconde chrome do app durante a impressão */
          aside, nav, header, footer,
          [data-sidebar], [data-app-header],
          .no-print { display: none !important; }
          /* Expande área principal */
          main, [data-page-shell] { padding: 0 !important; margin: 0 !important; max-width: 100% !important; }
          /* Cards viram folhas planas */
          .glass-card, [data-glass-card] {
            background: #fff !important;
            box-shadow: none !important;
            border-color: #ddd !important;
            break-inside: avoid;
          }
          /* Garante que o mapa apareça inteiro */
          [data-talude-map] {
            page-break-inside: avoid;
            break-inside: avoid;
            max-height: 90vh !important;
          }
        }
      `}</style>
      <AutoMarkDialog
        open={autoMarkOpen}
        onOpenChange={setAutoMarkOpen}
        mapId={map?.id ?? null}
        existingNumeros={taludes.map((t) => t.numero)}
        onApply={async (items) => {
          if (!map) return;
          for (const it of items) {
            await upsertFn({
              data: {
                map_id: map.id,
                numero: it.numero,
                polygon: it.polygon,
                status: "programado",
                data_programada: today(),
                cor: it.cor ?? null,
              },
            });
          }
          await qc.invalidateQueries({ queryKey: ["talude-map-detail", map.id] });
        }}
      />
    </PageShell>
  );
}

function TaludeDetail({
  talude,
  onChangeStatus,
  onPatch,
  onRedraw,
  onNewPart,
  onDelete,
  onBumpDate,
  onCycleStatus,
  saving,
}: {
  talude: TaludeRow;
  onChangeStatus: (s: TaludeStatus) => void;
  onPatch: (patch: Partial<TaludeRow>) => void;
  onRedraw: () => void;
  onNewPart: () => void;
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
          style={{ background: talude.cor || meta.fill }}
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
        <Button size="icon" variant="ghost" onClick={onNewPart} title="Redemarcar (substitui a área anterior deste número)">
          <Plus className="h-4 w-4" />
        </Button>

        <Button size="icon" variant="ghost" onClick={onDelete} title="Excluir">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>

      {talude.polygon.length >= 3 && (() => {
        const areaPct = polygonAreaPct(talude.polygon);
        const perimPct = polygonPerimeterPct(talude.polygon);
        const areaM2 = (talude as unknown as { area_m2?: number | null }).area_m2 ?? null;
        const perimM = (talude as unknown as { perimetro_m?: number | null }).perimetro_m ?? null;
        return (
          <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 text-[11px]">
            <div>
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Área</div>
              <div className="font-semibold">{formatArea(areaPct, areaM2)}</div>
            </div>
            <div>
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Perímetro</div>
              <div className="font-semibold">{formatPerimeter(perimPct, perimM)}</div>
            </div>
          </div>
        );
      })()}


      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2">
        <Label className="text-[10px] uppercase text-muted-foreground">Cor</Label>
        <input
          type="color"
          value={rgbLikeToHex(talude.cor) || meta.fill}
          onChange={(e) => onPatch({ cor: e.target.value } as Partial<TaludeRow>)}
          className="h-7 w-10 cursor-pointer rounded border border-border/60 bg-transparent"
          title="Cor personalizada do talude"
        />
        <span className="flex-1 truncate text-[11px] text-muted-foreground">
          {talude.cor ? talude.cor : `Padrão do status (${meta.fill})`}
        </span>
        {talude.cor && (
          <Button size="sm" variant="ghost" onClick={() => onPatch({ cor: null } as Partial<TaludeRow>)}>
            Reset
          </Button>
        )}
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

function AuditReportDialog({
  report,
  onClose,
}: {
  report: Awaited<ReturnType<typeof verifyAndRepairMap>> | null;
  onClose: () => void;
}) {
  const open = report !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Relatório de auditoria
          </DialogTitle>
          <DialogDescription>
            {report && (
              <>
                {report.total} talude(s) analisado(s) em{" "}
                {new Date(report.finishedAt).toLocaleTimeString("pt-BR")}
                {report.dryRun && " · modo simulação (nenhuma correção aplicada)"}
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {report && (
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg border border-border/50 bg-muted/30 p-3">
                <div className="text-2xl font-bold">{report.checks.length}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Verificações
                </div>
              </div>
              <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300">
                <div className="text-2xl font-bold">{report.fixed.length}</div>
                <div className="text-[10px] uppercase tracking-widest">Corrigidas</div>
              </div>
              <div className="rounded-lg border border-orange-500/40 bg-orange-500/10 p-3 text-orange-700 dark:text-orange-300">
                <div className="text-2xl font-bold">{report.unresolved.length}</div>
                <div className="text-[10px] uppercase tracking-widest">Pendentes</div>
              </div>
            </div>

            {report.fixed.length > 0 && (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Correções aplicadas
                </h4>
                <ul className="space-y-1">
                  {report.fixed.map((e, i) => (
                    <li key={i} className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-1.5 text-xs">
                      <div className="font-medium">{e.message}</div>
                      {e.action && <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">{e.action}</div>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.unresolved.length > 0 && (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-orange-600 dark:text-orange-400">
                  <AlertTriangle className="h-3.5 w-3.5" /> Requer atenção manual
                </h4>
                <ul className="space-y-1">
                  {report.unresolved.map((e, i) => (
                    <li key={i} className="rounded-md border border-orange-500/30 bg-orange-500/5 px-2.5 py-1.5 text-xs">
                      {e.numero != null && <strong>Talude {e.numero}: </strong>}
                      {e.message}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.checks.length === 0 && (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-center text-sm text-emerald-700 dark:text-emerald-300">
                ✓ Nenhuma inconsistência encontrada. Tudo em ordem.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

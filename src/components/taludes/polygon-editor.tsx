import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Crosshair,
  Grid3X3,
  Hand,
  Magnet,
  Maximize2,
  MousePointer2,
  Pentagon,
  Redo2,
  Ruler,
  Save,
  Spline,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Point } from "@/lib/taludes/api";
import {
  centroid,
  clampPoint,
  nearestEdge,
  pointInPolygon,
  snapToGrid,
  validatePolygon,
} from "@/lib/taludes/geometry";
import { pushEntry } from "@/lib/taludes/history";


export interface EditorPolygon {
  id: string;
  points: Point[];
  color: string;
  opacity: number;
  visible: boolean;
  locked: boolean;
  label: string;
}

export type EditorTool = "select" | "draw" | "edit" | "pan" | "calibrate";

export interface PolygonEditorProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  polygons: EditorPolygon[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  /** Chamado ao terminar uma manipulação (commit). */
  onGeometryChange: (id: string, points: Point[]) => void;
  onCreate: (points: Point[]) => void;
  /** Rascunho contínuo durante arrasto (auto-save local). */
  onDraftChange?: (id: string, points: Point[]) => void;
  calibration?: { a: Point; b: Point; meters: number } | null;
  onCalibrate?: (a: Point, b: Point) => void;
  className?: string;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 12;
const CLOSE_SNAP_PX = 14;

interface HistoryEntry {
  id: string;
  points: Point[];
}

export function PolygonEditor({
  imageUrl,
  imageWidth,
  imageHeight,
  polygons,
  selectedId,
  onSelect,
  onGeometryChange,
  onCreate,
  onDraftChange,
  calibration,
  onCalibrate,
  className,
}: PolygonEditorProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<EditorTool>("select");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [grid, setGrid] = useState(false);
  const [snap, setSnap] = useState(true);
  const [draft, setDraft] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [calDraft, setCalDraft] = useState<Point[]>([]);

  // working geometry (permite edição fluida antes do commit)
  const [working, setWorking] = useState<Record<string, Point[]>>({});
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  const spaceRef = useRef(false);
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const dragRef = useRef<
    | {
        kind: "vertex";
        id: string;
        index: number;
        before: Point[];
        /** Diferença entre o vértice e o ponteiro no início do arrasto. */
        grab: Point;
      }
    | { kind: "move"; id: string; before: Point[]; start: Point }
    | null
  >(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);
  const movedRef = useRef(false);

  const geometryOf = useCallback(
    (p: EditorPolygon) => working[p.id] ?? p.points,
    [working],
  );

  /**
   * Descarta geometria local assim que os dados salvos chegam. Sem isso o
   * editor podia exibir um contorno antigo enquanto o PNG/PDF usava o
   * polígono do banco — as duas versões ficavam fora de lugar.
   */
  useEffect(() => {
    setWorking((w) => {
      const keys = Object.keys(w);
      if (keys.length === 0) return w;
      const dragging = dragRef.current?.id;
      const next: Record<string, Point[]> = {};
      let changed = false;
      for (const k of keys) {
        if (k === dragging) {
          next[k] = w[k];
          continue;
        }
        changed = true;
      }
      return changed ? next : w;
    });
  }, [polygons]);


  /* ------------------------------ coordenadas ------------------------------ */

  const toPercent = useCallback((clientX: number, clientY: number): Point => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return clampPoint({
      x: ((clientX - rect.left) / rect.width) * 100,
      y: ((clientY - rect.top) / rect.height) * 100,
    });
  }, []);

  const pxPerPercent = useCallback(() => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 1, y: 1 };
    return { x: rect.width / 100, y: rect.height / 100 };
  }, []);

  /**
   * Aproximação assistida. Nunca aproxima de vértices do próprio polígono
   * em edição (isso fazia o ponto "saltar" para o vizinho).
   */
  const applySnap = useCallback(
    (p: Point, excludeId?: string): Point => {
      let out = grid ? snapToGrid(p, 1) : p;
      if (!snap) return clampPoint(out);
      const per = pxPerPercent();
      let best: { d: number; pt: Point } | null = null;
      for (const poly of polygons) {
        if (!poly.visible) continue;
        if (poly.id === excludeId) continue;
        const pts = geometryOf(poly);
        pts.forEach((v) => {
          const d = Math.hypot((v.x - p.x) * per.x, (v.y - p.y) * per.y);
          if (d < 8 && (!best || d < best.d)) best = { d, pt: v };
        });
      }
      if (best) out = { ...(best as { pt: Point }).pt };
      return clampPoint(out);
    },
    [grid, snap, polygons, geometryOf, pxPerPercent],
  );


  /* -------------------------------- histórico ------------------------------- */

  const pushHistory = useCallback((id: string, before: Point[]) => {
    setUndoStack((s) => pushEntry(s, { id, points: before }));
    setRedoStack([]);
  }, []);


  const undo = useCallback(() => {
    setUndoStack((stack) => {
      const last = stack[stack.length - 1];
      if (!last) return stack;
      const current = working[last.id] ?? polygons.find((p) => p.id === last.id)?.points ?? [];
      setRedoStack((r) => [...r, { id: last.id, points: current }]);
      setWorking((w) => ({ ...w, [last.id]: last.points }));
      onGeometryChange(last.id, last.points);
      return stack.slice(0, -1);
    });
  }, [working, polygons, onGeometryChange]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      const last = stack[stack.length - 1];
      if (!last) return stack;
      const current = working[last.id] ?? polygons.find((p) => p.id === last.id)?.points ?? [];
      setUndoStack((u) => [...u, { id: last.id, points: current }]);
      setWorking((w) => ({ ...w, [last.id]: last.points }));
      onGeometryChange(last.id, last.points);
      return stack.slice(0, -1);
    });
  }, [working, polygons, onGeometryChange]);

  /* -------------------------------- teclado --------------------------------- */

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /input|textarea|select/i.test(target.tagName)) return;
      if (e.code === "Space") {
        spaceRef.current = true;
        e.preventDefault();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      }
      if (e.key === "Escape") {
        setDraft([]);
        setCalDraft([]);
        if (tool !== "select") setTool("select");
      }
      if (e.key === "v") setTool("select");
      if (e.key === "p") setTool("draw");
      if (e.key === "e") setTool("edit");
      if (e.key === "h") setTool("pan");
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceRef.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [undo, redo, tool]);

  /* ---------------------------------- zoom ---------------------------------- */

  const zoomAt = useCallback(
    (factor: number, clientX?: number, clientY?: number) => {
      const vp = viewportRef.current;
      if (!vp) return;
      const rect = vp.getBoundingClientRect();
      const cx = (clientX ?? rect.left + rect.width / 2) - rect.left;
      const cy = (clientY ?? rect.top + rect.height / 2) - rect.top;
      setZoom((z) => {
        const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
        const ratio = nz / z;
        setOffset((o) => ({
          x: cx - (cx - o.x) * ratio,
          y: cy - (cy - o.y) * ratio,
        }));
        return nz;
      });
    },
    [],
  );

  const fitToScreen = useCallback(() => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  }, []);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* -------------------------------- ponteiros -------------------------------- */

  const isPanning = () => tool === "pan" || spaceRef.current;

  const onPointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    downRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;


    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      panRef.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ox: offset.x, oy: offset.y };
      setDraft((d) => d); // sem alterações
      return;
    }

    if (isPanning() || e.button === 1) {
      panRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    // pinch
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, (pinchRef.current.zoom * dist) / pinchRef.current.dist));
      setZoom(nz);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (panRef.current) {
        setOffset({
          x: panRef.current.ox + (mid.x - panRef.current.x),
          y: panRef.current.oy + (mid.y - panRef.current.y),
        });
      }
      movedRef.current = true;
      return;
    }

    if (panRef.current && (isPanning() || e.buttons === 4)) {
      setOffset({
        x: panRef.current.ox + (e.clientX - panRef.current.x),
        y: panRef.current.oy + (e.clientY - panRef.current.y),
      });
      movedRef.current = true;
      return;
    }

    const p = toPercent(e.clientX, e.clientY);
    if (tool === "draw" || tool === "calibrate") setHoverPoint(p);

    const drag = dragRef.current;
    if (!drag) return;
    movedRef.current = true;
    if (drag.kind === "vertex") {
      const next = [...(working[drag.id] ?? drag.before)];
      // Mantém a distância original entre o ponteiro e o vértice: sem "pulo".
      const raw = clampPoint({ x: p.x + drag.grab.x, y: p.y + drag.grab.y });
      next[drag.index] = applySnap(raw, drag.id);
      setWorking((w) => ({ ...w, [drag.id]: next }));
      onDraftChange?.(drag.id, next);

    } else if (drag.kind === "move") {
      const dx = p.x - drag.start.x;
      const dy = p.y - drag.start.y;
      const next = drag.before.map((v) => clampPoint({ x: v.x + dx, y: v.y + dy }));
      setWorking((w) => ({ ...w, [drag.id]: next }));
      onDraftChange?.(drag.id, next);
    }
  };

  const endDrag = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const next = working[drag.id];
    if (!next) return;
    const check = validatePolygon(next);
    if (!check.ok) toast.warning(check.message ?? "Geometria inválida");
    pushHistory(drag.id, drag.before);
    onGeometryChange(drag.id, next);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const wasPanning = !!panRef.current;
    const down = downRef.current;
    downRef.current = null;
    panRef.current = null;
    const hadDrag = !!dragRef.current;
    endDrag();
    // Tolerância de toque: pequenos tremores não invalidam o clique.
    const slipped = down ? Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 : false;
    if (wasPanning || hadDrag || (movedRef.current && slipped)) return;



    // clique simples no palco
    const p = toPercent(e.clientX, e.clientY);
    if (tool === "draw") {
      const per = pxPerPercent();
      if (draft.length >= 3) {
        const first = draft[0];
        const d = Math.hypot((first.x - p.x) * per.x, (first.y - p.y) * per.y);
        if (d <= CLOSE_SNAP_PX) {
          commitDraft(draft);
          return;
        }
      }
      setDraft((d) => [...d, applySnap(p)]);
      return;
    }
    if (tool === "calibrate") {
      const next = [...calDraft, p];
      if (next.length === 2) {
        onCalibrate?.(next[0], next[1]);
        setCalDraft([]);
        setTool("select");
      } else {
        setCalDraft(next);
      }
      return;
    }
    // seleção por hit-test
    const hit = [...polygons]
      .reverse()
      .find((poly) => poly.visible && pointInPolygon(p, geometryOf(poly)));
    onSelect(hit?.id ?? null);
  };

  const commitDraft = (pts: Point[]) => {
    const check = validatePolygon(pts);
    if (!check.ok) {
      toast.error(check.message ?? "Polígono inválido");
      return;
    }
    onCreate(pts);
    setDraft([]);
    setTool("select");
  };

  /* -------------------------- manipulação de vértices ------------------------ */

  const startVertexDrag = (e: React.PointerEvent, poly: EditorPolygon, index: number) => {
    if (poly.locked) return;
    e.stopPropagation();
    const before = geometryOf(poly);
    const at = toPercent(e.clientX, e.clientY);
    const v = before[index];
    dragRef.current = {
      kind: "vertex",
      id: poly.id,
      index,
      before,
      grab: { x: v.x - at.x, y: v.y - at.y },
    };
    setWorking((w) => ({ ...w, [poly.id]: before }));

    onSelect(poly.id);
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const startPolyDrag = (e: React.PointerEvent, poly: EditorPolygon) => {
    if (poly.locked || tool !== "edit") return;
    e.stopPropagation();
    const before = geometryOf(poly);
    dragRef.current = {
      kind: "move",
      id: poly.id,
      before,
      start: toPercent(e.clientX, e.clientY),
    };
    setWorking((w) => ({ ...w, [poly.id]: before }));
    onSelect(poly.id);
  };

  const addVertexOnEdge = (poly: EditorPolygon, at: Point) => {
    const pts = geometryOf(poly);
    const near = nearestEdge(at, pts);
    if (!near) return;
    const next = [...pts];
    next.splice(near.index + 1, 0, near.point);
    pushHistory(poly.id, pts);
    setWorking((w) => ({ ...w, [poly.id]: next }));
    onGeometryChange(poly.id, next);
  };

  const removeVertex = (poly: EditorPolygon, index: number) => {
    const pts = geometryOf(poly);
    if (pts.length <= 3) {
      toast.error("O polígono precisa de pelo menos 3 pontos.");
      return;
    }
    const next = pts.filter((_, i) => i !== index);
    pushHistory(poly.id, pts);
    setWorking((w) => ({ ...w, [poly.id]: next }));
    onGeometryChange(poly.id, next);
  };

  /* --------------------------------- render --------------------------------- */

  const selected = polygons.find((p) => p.id === selectedId) ?? null;
  const draftInvalid = useMemo(
    () => draft.length >= 3 && !validatePolygon(draft).ok,
    [draft],
  );

  const cursor =
    isPanning() ? "grab" : tool === "draw" || tool === "calibrate" ? "crosshair" : "default";

  return (
    <div className={cn("space-y-2", className)}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5">
        <ToolButton active={tool === "select"} onClick={() => setTool("select")} icon={MousePointer2} label="Selecionar" />
        <ToolButton active={tool === "draw"} onClick={() => { setTool("draw"); setDraft([]); }} icon={Pentagon} label="Desenhar" />
        <ToolButton active={tool === "edit"} onClick={() => setTool("edit")} icon={Spline} label="Editar" />
        <ToolButton active={tool === "pan"} onClick={() => setTool("pan")} icon={Hand} label="Mover mapa" />
        <ToolButton
          active={tool === "calibrate"}
          onClick={() => { setTool("calibrate"); setCalDraft([]); }}
          icon={Ruler}
          label="Calibrar escala"
        />
        <span className="mx-1 h-6 w-px bg-border" />
        <ToolButton active={grid} onClick={() => setGrid((g) => !g)} icon={Grid3X3} label="Grade" />
        <ToolButton active={snap} onClick={() => setSnap((s) => !s)} icon={Magnet} label="Snap em vértices" />
        <span className="mx-1 h-6 w-px bg-border" />
        <ToolButton onClick={undo} disabled={undoStack.length === 0} icon={Undo2} label="Desfazer" />
        <ToolButton onClick={redo} disabled={redoStack.length === 0} icon={Redo2} label="Refazer" />
        <span className="mx-1 h-6 w-px bg-border" />
        <ToolButton onClick={() => zoomAt(1.2)} icon={ZoomIn} label="Aproximar" />
        <ToolButton onClick={() => zoomAt(1 / 1.2)} icon={ZoomOut} label="Afastar" />
        <ToolButton onClick={fitToScreen} icon={Maximize2} label="Ajustar à tela" />
        <Badge variant="secondary" className="ml-auto tabular-nums">
          {Math.round(zoom * 100)}%
        </Badge>
      </div>

      {tool === "draw" && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <Crosshair className="h-3.5 w-3.5 text-primary" />
          <span>
            Clique para adicionar pontos. Clique no <b>primeiro ponto</b> para fechar. {draft.length} ponto
            {draft.length === 1 ? "" : "s"}.
          </span>
          {draftInvalid && <span className="text-destructive font-medium">Contorno cruzado!</span>}
          <div className="ml-auto flex gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => setDraft((d) => d.slice(0, -1))} disabled={!draft.length} className="h-8 gap-1">
              <Undo2 className="h-3.5 w-3.5" /> Ponto
            </Button>
            <Button size="sm" onClick={() => commitDraft(draft)} disabled={draft.length < 3} className="h-8 gap-1">
              <Save className="h-3.5 w-3.5" /> Concluir
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft([]); setTool("select"); }} className="h-8 gap-1">
              <X className="h-3.5 w-3.5" /> Cancelar
            </Button>
          </div>
        </div>
      )}

      {tool === "calibrate" && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs">
          Clique em <b>dois pontos</b> de uma distância conhecida no mapa ({calDraft.length}/2).
        </div>
      )}

      {/* Viewport */}
      <div
        ref={viewportRef}
        className="relative w-full overflow-hidden rounded-2xl border bg-black/40 touch-none select-none"
        style={{ aspectRatio: `${imageWidth} / ${imageHeight}`, cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHoverPoint(null)}
      >
        <div
          ref={stageRef}
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        >
          <img
            src={imageUrl}
            alt="Mapa de taludes"
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full object-fill"
          />
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            {grid && (
              <g opacity={0.25}>
                {Array.from({ length: 19 }, (_, i) => (i + 1) * 5).map((v) => (
                  <g key={v}>
                    <line x1={v} y1={0} x2={v} y2={100} stroke="#7dd3fc" strokeWidth={0.08} />
                    <line x1={0} y1={v} x2={100} y2={v} stroke="#7dd3fc" strokeWidth={0.08} />
                  </g>
                ))}
              </g>
            )}

            {polygons
              .filter((p) => p.visible)
              .map((poly) => {
                const pts = geometryOf(poly);
                if (pts.length < 2) return null;
                const isSel = poly.id === selectedId;
                const c = centroid(pts);
                return (
                  <g key={poly.id}>
                    <polygon
                      points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                      fill={poly.color}
                      fillOpacity={isSel ? Math.min(0.65, poly.opacity + 0.15) : poly.opacity}
                      stroke={poly.color}
                      strokeWidth={(isSel ? 0.45 : 0.3) / zoom}
                      strokeLinejoin="round"
                      style={{ cursor: poly.locked ? "not-allowed" : tool === "edit" ? "move" : "pointer" }}
                      onPointerDown={(e) => startPolyDrag(e, poly)}
                      onDoubleClick={(e) => {
                        if (tool !== "edit" || poly.locked) return;
                        addVertexOnEdge(poly, toPercent(e.clientX, e.clientY));
                      }}
                    />
                    <text
                      x={c.x}
                      y={c.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize={Math.max(1.4, 2.6 / zoom)}
                      fontWeight={800}
                      fill="#fde047"
                      stroke="#0f172a"
                      strokeWidth={0.5 / zoom}
                      paintOrder="stroke"
                      className="pointer-events-none"
                    >
                      {poly.label}
                    </text>
                    {isSel && tool === "edit" && !poly.locked &&
                      pts.map((p, i) => (
                        <circle
                          key={i}
                          cx={p.x}
                          cy={p.y}
                          r={0.9 / zoom}
                          fill="#ffffff"
                          stroke={poly.color}
                          strokeWidth={0.35 / zoom}
                          style={{ cursor: "grab" }}
                          onPointerDown={(e) => startVertexDrag(e, poly, i)}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            removeVertex(poly, i);
                          }}
                        />
                      ))}
                  </g>
                );
              })}

            {/* rascunho de desenho */}
            {draft.length > 0 && (
              <g>
                <polyline
                  points={[...draft, ...(hoverPoint ? [hoverPoint] : [])].map((p) => `${p.x},${p.y}`).join(" ")}
                  fill={draft.length > 2 ? "#0ea5e9" : "none"}
                  fillOpacity={0.2}
                  stroke={draftInvalid ? "#ef4444" : "#0ea5e9"}
                  strokeWidth={0.35 / zoom}
                  strokeDasharray={`${1 / zoom} ${0.7 / zoom}`}
                />
                {draft.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={(i === 0 ? 1.3 : 0.85) / zoom}
                    fill={i === 0 ? "#22c55e" : "#ffffff"}
                    stroke="#0ea5e9"
                    strokeWidth={0.3 / zoom}
                  />
                ))}
              </g>
            )}

            {/* calibração */}
            {(calDraft.length > 0 || calibration) && (
              <g>
                {(() => {
                  const a = calDraft[0] ?? calibration?.a;
                  const b = calDraft[1] ?? (calDraft.length === 1 ? hoverPoint : calibration?.b);
                  if (!a || !b) return null;
                  return (
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="#f59e0b"
                      strokeWidth={0.4 / zoom}
                      strokeDasharray={`${1.2 / zoom} ${0.8 / zoom}`}
                    />
                  );
                })()}
              </g>
            )}
          </svg>
        </div>

        {/* indicador de zoom / minimapa */}
        {zoom > 1.05 && (
          <div className="pointer-events-none absolute bottom-2 right-2 rounded-lg bg-black/70 px-2 py-1 text-[11px] text-white">
            Zoom {Math.round(zoom * 100)}% · espaço + arraste para deslocar
          </div>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {tool === "edit"
          ? "Arraste vértices, arraste o polígono para mover, duplo clique na borda adiciona vértice e duplo clique no vértice remove."
          : "Roda do mouse: zoom · Espaço + arraste (ou dois dedos): deslocar · Ctrl+Z / Ctrl+Shift+Z: desfazer e refazer."}
        {selected?.locked && " · Camada bloqueada."}
      </p>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon: Icon,
  label,
  disabled,
}: {
  active?: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "secondary"}
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="h-9 min-w-9 gap-1.5 px-2.5"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden xl:inline text-xs">{label}</span>
    </Button>
  );
}

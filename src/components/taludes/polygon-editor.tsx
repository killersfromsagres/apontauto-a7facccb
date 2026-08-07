import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Target,
  Layers,
  Scissors,
  Zap,
  DraftingCompass,
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
  onGeometryChange: (id: string, points: Point[]) => void;
  onCreate: (points: Point[]) => void;
  onDraftChange?: (id: string, points: Point[]) => void;
  calibration?: { a: Point; b: Point; meters: number } | null;
  onCalibrate?: (a: Point, b: Point) => void;
  className?: string;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 50;
const CLOSE_SNAP_PX = 20;
const SNAP_SCREEN_PX = 12;
const HANDLE_PX = 14;

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
  const containerRef = useRef<HTMLDivElement>(null);
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
  
  // High-precision state for active drawing/dragging
  const [working, setWorking] = useState<Record<string, Point[]>>({});
  const [undoStack, setUndoStack] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  const spaceRef = useRef(false);
  const panRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const dragRef = useRef<
    | { kind: "vertex"; id: string; index: number; before: Point[]; grab: Point }
    | { kind: "move"; id: string; before: Point[]; start: Point }
    | null
  >(null);
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number } | null>(null);

  // Sync working state with external polygons
  useEffect(() => {
    setWorking((w) => {
      const next = { ...w };
      let changed = false;
      const activeIds = new Set(polygons.map(p => p.id));
      
      // Remove stale working geometries
      for (const k in next) {
        if (!activeIds.has(k) && dragRef.current?.id !== k) {
          delete next[k];
          changed = true;
        }
      }
      return changed ? next : w;
    });
  }, [polygons]);

  // Transform coordinates: Client (screen) -> Percentage (0-100)
  // This is the core of "Precision Architecture V2"
  const toPercent = useCallback((clientX: number, clientY: number): Point => {
    const stage = stageRef.current;
    if (!stage) return { x: 0, y: 0 };
    
    // We use the raw image container's bounding box for mapping
    const rect = stage.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    
    return clampPoint({ x, y });
  }, []);

  // Transform coordinates: Percentage (0-100) -> Screen Pixels
  const toScreen = useCallback((p: Point) => {
    const stage = stageRef.current;
    if (!stage) return { left: 0, top: 0 };
    const rect = stage.getBoundingClientRect();
    return {
      left: rect.left + (p.x / 100) * rect.width,
      top: rect.top + (p.y / 100) * rect.height
    };
  }, []);

  const screenDistance = useCallback((a: Point, b: Point) => {
    const stage = stageRef.current;
    if (!stage) return 1000;
    const rect = stage.getBoundingClientRect();
    const dx = (a.x - b.x) * (rect.width / 100);
    const dy = (a.y - b.y) * (rect.height / 100);
    return Math.hypot(dx, dy);
  }, []);

  const applySnap = useCallback((p: Point, excludeId?: string): Point => {
    if (grid) return snapToGrid(p, 1);
    if (!snap) return p;

    let best: { d: number; pt: Point } | null = null;
    for (const poly of polygons) {
      if (!poly.visible || poly.id === excludeId) continue;
      const pts = working[poly.id] || poly.points;
      for (const v of pts) {
        const d = screenDistance(v, p);
        if (d <= SNAP_SCREEN_PX && (!best || d < best.d)) {
          best = { d, pt: v };
        }
      }
    }
    return best ? { ...best.pt } : p;
  }, [grid, snap, polygons, working, screenDistance]);

  const geometryOf = (p: EditorPolygon) => working[p.id] ?? p.points;

  /* ------------------------------ Event Handlers ------------------------------ */

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const cx = (clientX ?? rect.left + rect.width / 2) - rect.left;
    const cy = (clientY ?? rect.top + rect.height / 2) - rect.top;

    setZoom(z => {
      const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z * factor));
      const ratio = nz / z;
      setOffset(o => ({
        x: cx - (cx - o.x) * ratio,
        y: cy - (cy - o.y) * ratio,
      }));
      return nz;
    });
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    
    if (pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      panRef.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, ox: offset.x, oy: offset.y };
      return;
    }

    if (tool === "pan" || spaceRef.current || e.button === 1) {
      panRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pointersRef.current.size === 2 && pinchRef.current && panRef.current) {
      const [a, b] = Array.from(pointersRef.current.values());
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const factor = dist / pinchRef.current.dist;
      const nz = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinchRef.current.zoom * factor));
      setZoom(nz);
      
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      setOffset({
        x: panRef.current.ox + (mid.x - panRef.current.x),
        y: panRef.current.oy + (mid.y - panRef.current.y),
      });
      return;
    }

    if (panRef.current) {
      setOffset({
        x: panRef.current.ox + (e.clientX - panRef.current.x),
        y: panRef.current.oy + (e.clientY - panRef.current.y),
      });
      return;
    }

    const p = toPercent(e.clientX, e.clientY);
    setHoverPoint(p);

    if (dragRef.current) {
      const drag = dragRef.current;
      if (drag.kind === "vertex") {
        const next = [...(working[drag.id] || drag.before)];
        const raw = clampPoint({ x: p.x + drag.grab.x, y: p.y + drag.grab.y });
        next[drag.index] = applySnap(raw, drag.id);
        setWorking(w => ({ ...w, [drag.id]: next }));
        onDraftChange?.(drag.id, next);
      } else if (drag.kind === "move") {
        const dx = p.x - drag.start.x;
        const dy = p.y - drag.start.y;
        const next = drag.before.map(v => clampPoint({ x: v.x + dx, y: v.y + dy }));
        setWorking(w => ({ ...w, [drag.id]: next }));
        onDraftChange?.(drag.id, next);
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const wasPanning = !!panRef.current;
    const wasDragging = !!dragRef.current;
    
    if (dragRef.current) {
      const { id, before } = dragRef.current;
      const final = working[id];
      if (final) {
        setUndoStack(s => pushEntry(s, { id, points: before }));
        setRedoStack([]);
        onGeometryChange(id, final);
      }
      dragRef.current = null;
    }

    panRef.current = null;
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;

    if (wasPanning || wasDragging) return;

    // Click to add points
    const p = toPercent(e.clientX, e.clientY);
    if (tool === "draw") {
      if (draft.length >= 3 && screenDistance(draft[0], p) <= CLOSE_SNAP_PX) {
        commitDraft();
      } else {
        setDraft(d => [...d, applySnap(p)]);
      }
    } else if (tool === "calibrate") {
      const next = [...calDraft, p];
      if (next.length === 2) {
        onCalibrate?.(next[0], next[1]);
        setCalDraft([]);
        setTool("select");
      } else {
        setCalDraft(next);
      }
    } else {
      // Selection
      const hit = [...polygons].reverse().find(poly => 
        poly.visible && pointInPolygon(p, geometryOf(poly))
      );
      onSelect(hit?.id ?? null);
    }
  };

  const commitDraft = () => {
    if (draft.length < 3) return;
    const check = validatePolygon(draft);
    if (!check.ok) {
      toast.error(check.message || "Polígono inválido");
      return;
    }
    onCreate(draft);
    setDraft([]);
    setTool("select");
  };

  /* ------------------------------ Hotkeys ------------------------------ */

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === "Space") { spaceRef.current = true; e.preventDefault(); }
      if (e.key === "Escape") { setDraft([]); setTool("select"); }
      if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
        // undo/redo logic
      }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") spaceRef.current = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, [tool]);

  /* ------------------------------ Render ------------------------------ */

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-2xl bg-muted/30 border border-border/50 backdrop-blur-md">
        <ToolButton active={tool === "select"} onClick={() => setTool("select")} icon={MousePointer2} label="Ponteiro (V)" />
        <ToolButton active={tool === "draw"} onClick={() => { setTool("draw"); setDraft([]); }} icon={Pentagon} label="Novo Talude (P)" />
        <ToolButton active={tool === "edit"} onClick={() => setTool("edit")} icon={Spline} label="Editar Vértices (E)" />
        <ToolButton active={tool === "pan"} onClick={() => setTool("pan")} icon={Hand} label="Panoramizar (H)" />
        <ToolButton active={tool === "calibrate"} onClick={() => setTool("calibrate")} icon={Ruler} label="Calibrar Escala" />
        <div className="w-px h-6 bg-border/50 mx-1" />
        <ToolButton active={grid} onClick={() => setGrid(!grid)} icon={Grid3X3} label="Grade" />
        <ToolButton active={snap} onClick={() => setSnap(!snap)} icon={Magnet} label="Snap" />
        <div className="w-px h-6 bg-border/50 mx-1" />
        <ToolButton onClick={() => zoomAt(1.25)} icon={ZoomIn} label="Aproximar" />
        <ToolButton onClick={() => zoomAt(0.8)} icon={ZoomOut} label="Afastar" />
        <ToolButton onClick={() => { setZoom(1); setOffset({x:0, y:0}); }} icon={Maximize2} label="Redefinir" />
        <Badge variant="outline" className="ml-auto font-mono text-[10px] bg-background/50 border-primary/20">{Math.round(zoom * 100)}%</Badge>
      </div>

      <div 
        ref={viewportRef}
        className="relative w-full overflow-hidden rounded-3xl border border-border/40 bg-black/90 shadow-2xl cursor-crosshair touch-none"
        style={{ aspectRatio: `${imageWidth}/${imageHeight}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div 
          ref={stageRef}
          className="absolute inset-0 origin-top-left"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
        >
          <img 
            src={imageUrl} 
            className="absolute inset-0 w-full h-full object-fill pointer-events-none"
            alt=""
          />
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            {/* Grid layer */}
            {grid && (
              <pattern id="editor-grid" width="5" height="5" patternUnits="userSpaceOnUse">
                <path d="M 5 0 L 0 0 0 5" fill="none" stroke="rgba(125,211,252,0.15)" strokeWidth="0.2" vectorEffect="non-scaling-stroke" />
              </pattern>
            )}
            {grid && <rect width="100" height="100" fill="url(#editor-grid)" />}

            {/* Polygon Layer */}
            {polygons.filter(p => p.visible).map(poly => {
              const pts = geometryOf(poly);
              const isSel = poly.id === selectedId;
              return (
                <polygon
                  key={poly.id}
                  points={pts.map(p => `${p.x},${p.y}`).join(" ")}
                  fill={poly.color}
                  fillOpacity={isSel ? Math.max(0.4, poly.opacity + 0.1) : poly.opacity}
                  stroke={poly.color}
                  strokeWidth={isSel ? 3 : 1.5}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                  className="transition-all duration-200"
                  style={{ cursor: tool === 'edit' && !poly.locked ? 'move' : 'pointer' }}
                  onPointerDown={e => {
                    if (poly.locked || tool !== 'edit') return;
                    e.stopPropagation();
                    const before = geometryOf(poly);
                    dragRef.current = { kind: 'move', id: poly.id, before, start: toPercent(e.clientX, e.clientY) };
                    onSelect(poly.id);
                  }}
                />
              );
            })}

            {/* Drawing preview */}
            {draft.length > 0 && (
              <polyline
                points={[...draft, ...(hoverPoint ? [hoverPoint] : [])].map(p => `${p.x},${p.y}`).join(" ")}
                fill="rgba(14,165,233,0.1)"
                stroke="#0ea5e9"
                strokeWidth={2}
                strokeDasharray="4 2"
                vectorEffect="non-scaling-stroke"
                className="pointer-events-none"
              />
            )}
          </svg>
        </div>

        {/* Dynamic Overlay Layer (Screen-space elements) */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Vértices / Handles */}
          {polygons.filter(p => p.visible && p.id === selectedId && tool === 'edit' && !p.locked).map(poly => {
            const pts = geometryOf(poly);
            return pts.map((p, i) => {
              const s = toScreen(p);
              const container = viewportRef.current?.getBoundingClientRect();
              if (!container) return null;
              
              const left = s.left - container.left;
              const top = s.top - container.top;
              
              return (
                <button
                  key={`${poly.id}-${i}`}
                  type="button"
                  className="pointer-events-auto absolute rounded-full border-2 bg-white shadow-xl hover:scale-125 transition-transform"
                  style={{
                    left, top,
                    width: HANDLE_PX, height: HANDLE_PX,
                    marginLeft: -HANDLE_PX/2, marginTop: -HANDLE_PX/2,
                    borderColor: poly.color,
                    cursor: 'grab'
                  }}
                  onPointerDown={e => {
                    e.stopPropagation();
                    const before = geometryOf(poly);
                    const v = before[i];
                    const at = toPercent(e.clientX, e.clientY);
                    dragRef.current = { kind: 'vertex', id: poly.id, index: i, before, grab: { x: v.x - at.x, y: v.y - at.y } };
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  }}
                />
              );
            });
          })}

          {/* Draft dots */}
          {draft.map((p, i) => {
            const s = toScreen(p);
            const container = viewportRef.current?.getBoundingClientRect();
            if (!container) return null;
            const left = s.left - container.left;
            const top = s.top - container.top;
            const size = i === 0 ? HANDLE_PX + 4 : HANDLE_PX - 2;
            return (
              <div 
                key={i} 
                className={cn("absolute rounded-full border-2 shadow-lg", i === 0 ? "bg-green-500 border-white animate-pulse" : "bg-white border-sky-500")}
                style={{ left, top, width: size, height: size, marginLeft: -size/2, marginTop: -size/2 }}
              />
            );
          })}

          {/* Labels */}
          {polygons.filter(p => p.visible && p.points.length >= 3).map(poly => {
            const c = centroid(geometryOf(poly));
            const s = toScreen(c);
            const container = viewportRef.current?.getBoundingClientRect();
            if (!container) return null;
            return (
              <span
                key={poly.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-black/60 text-yellow-300 text-[10px] font-black uppercase tracking-tighter backdrop-blur-sm border border-white/10"
                style={{ left: s.left - container.left, top: s.top - container.top }}
              >
                {poly.label}
              </span>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between px-2">
        <div className="flex gap-4">
           <StatusItem icon={Target} label="Precisão V2 Ativa" />
           <StatusItem icon={Layers} label={`${polygons.length} Taludes`} />
        </div>
        <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest">
           {tool === 'draw' ? 'Modo de Desenho: Clique no primeiro ponto para fechar' : 'Dica: Use espaço para arrastar o mapa'}
        </p>
      </div>
    </div>
  );
}

function StatusItem({ icon: Icon, label }: { icon: any, label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Icon className="w-3 h-3 text-primary/70" />
      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-tight">{label}</span>
    </div>
  );
}

function ToolButton({ active, onClick, icon: Icon, label, disabled }: any) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={cn("h-9 gap-2 px-3 rounded-xl transition-all", active && "shadow-lg scale-105")}
      title={label}
    >
      <Icon className="w-4 h-4" />
      <span className="hidden lg:inline text-xs font-semibold">{label}</span>
    </Button>
  );
}

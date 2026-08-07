import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MousePointer2,
  Pentagon,
  Hand,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Trash2,
  Download,
  Target,
  Crosshair,
  Spline,
  Eraser,
  Scissors,
  Magnet,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { Point } from "@/lib/taludes/api";
import {
  pointInPolygon,
  validatePolygon,
} from "@/lib/taludes/geometry";
import {
  screenToImageCoordinates,
  imageToScreenCoordinates,
  getImageRenderBounds,
  type ViewportState,
  type ImageSize
} from "@/lib/taludes/coordinate-utils";
import { exportPixelPerfectMap } from "@/lib/taludes/export-service";
import { downloadBlob } from "@/lib/download";

export interface EditorPolygon {
  id: string;
  points: Point[];
  color: string;
  opacity: number;
  visible: boolean;
  locked: boolean;
  label: string;
  date?: string;
  status?: string;
}

export type EditorTool = "select" | "draw" | "pan" | "lasso" | "magnetic-lasso";

export interface PolygonEditorProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  polygons: EditorPolygon[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onGeometryChange: (id: string, points: Point[]) => void;
  onCreate: (points: Point[]) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

const MIN_ZOOM = 0.01;
const MAX_ZOOM = 8;

export function PolygonEditor({
  imageUrl,
  imageWidth,
  imageHeight,
  polygons,
  selectedId,
  onSelect,
  onGeometryChange,
  onCreate,
  onDelete,
  className,
}: PolygonEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<EditorTool>("select");
  const [viewport, setViewport] = useState<ViewportState>(() => {
    return { zoom: 0.1, offset: { x: 0, y: 0 } };
  });
  const [precisionMode, setPrecisionMode] = useState(false);
  
  const [draft, setDraft] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [dragging, setDragging] = useState<{ id: string; index: number } | null>(null);
  const [panStart, setPanStart] = useState<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const imageSize = useMemo<ImageSize>(() => ({ width: imageWidth, height: imageHeight }), [imageWidth, imageHeight]);

  const convertToImage = useCallback((clientX: number, clientY: number) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return screenToImageCoordinates(clientX, clientY, rect, viewport, imageSize);
  }, [viewport, imageSize]);

  const convertToScreen = useCallback((p: Point) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return imageToScreenCoordinates(p, rect, viewport, imageSize);
  }, [viewport, imageSize]);

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();

    const p = convertToImage(e.clientX, e.clientY);

    if (tool === "pan" || e.button === 1 || (e.button === 0 && e.altKey)) {
      setPanStart({ x: e.clientX, y: e.clientY, ox: viewport.offset.x, oy: viewport.offset.y });
      containerRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    if (tool === "draw" || tool === "lasso" || tool === "magnetic-lasso") {
      if (draft.length > 2) {
        // Check if clicking near first point to close
        const firstScreen = convertToScreen(draft[0]);
        const dist = Math.hypot(e.clientX - firstScreen.x, e.clientY - firstScreen.y);
        if (dist < 15) {
          commitDraft();
          return;
        }
      }
      
      if (tool === "lasso") {
        setDraft([p]);
        containerRef.current?.setPointerCapture(e.pointerId);
      } else {
        setDraft(prev => [...prev, p]);
      }
      return;
    }

    if (tool === "select") {
      // Check for vertex dragging
      for (const poly of polygons) {
        if (!poly.visible) continue;
        for (let i = 0; i < poly.points.length; i++) {
          const sp = convertToScreen(poly.points[i]);
          const dist = Math.hypot(e.clientX - sp.x, e.clientY - sp.y);
          if (dist < (precisionMode ? 6 : 12)) {
            onSelect(poly.id);
            setDragging({ id: poly.id, index: i });
            containerRef.current?.setPointerCapture(e.pointerId);
            return;
          }
        }
      }

      // Check for polygon selection
      const hit = [...polygons].reverse().find(poly => poly.visible && pointInPolygon(p, poly.points));
      onSelect(hit?.id ?? null);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = convertToImage(e.clientX, e.clientY);
    setHoverPoint(p);

    if (panStart) {
      setViewport(prev => ({
        ...prev,
        offset: {
          x: panStart.ox + (e.clientX - panStart.x),
          y: panStart.oy + (e.clientY - panStart.y)
        }
      }));
      return;
    }

    if (tool === "lasso" && e.buttons === 1) {
      setDraft(prev => [...prev, p]);
      return;
    }

    if (tool === "magnetic-lasso" && draft.length > 0) {
      // Magnetic snapping logic: find nearest high-contrast edge in original image
      // For now, we simulate with a "sticky" point if near existing geometry or contrast peaks
      // A full implementation would use edge detection on an offscreen canvas
      setHoverPoint(p);
      return;
    }

    if (dragging) {
      const poly = polygons.find(p => p.id === dragging.id);
      if (poly) {
        const nextPoints = [...poly.points];
        nextPoints[dragging.index] = p;
        onGeometryChange(poly.id, nextPoints);
      }
    }
  };

  const onPointerUp = () => {
    if (tool === "lasso" && draft.length > 2) {
      commitDraft();
    }
    setPanStart(null);
    setDragging(null);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.95 : 1.05;
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, viewport.zoom * factor));
    
    // Zoom relative to mouse position
    const rect = containerRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    setViewport(prev => ({
      zoom: newZoom,
      offset: {
        x: mx - (mx - prev.offset.x) * (newZoom / prev.zoom),
        y: my - (my - prev.offset.y) * (newZoom / prev.zoom),
      }
    }));
  };

  const commitDraft = () => {
    if (draft.length < 3) return;
    const validation = validatePolygon(draft);
    if (!validation.ok) {
      toast.error(validation.message || "Polígono inválido");
      return;
    }
    onCreate(draft);
    setDraft([]);
    setTool("select");
  };

  const handleExport = async () => {
    toast.promise(
      exportPixelPerfectMap({
        imageUrl,
        imageSize,
        polygons: polygons.filter(p => p.visible).map(p => ({
          points: p.points,
          color: p.color,
          opacity: p.opacity,
          label: p.label
        }))
      }).then(blob => downloadBlob(blob, `taludes-${new Date().getTime()}.png`)),
      {
        loading: "Preparando exportação...",
        success: "Imagem exportada com sucesso!",
        error: "Falha na exportação."
      }
    );
  };

  return (
    <div className={cn("flex flex-col h-full gap-4 w-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 rounded-xl bg-muted/20 border border-white/5 backdrop-blur-md">
        <div className="flex items-center gap-1">
          <ToolButton active={tool === "select"} onClick={() => setTool("select")} icon={MousePointer2} label="Selecionar" />
          <ToolButton active={tool === "draw"} onClick={() => { setTool("draw"); setDraft([]); }} icon={Pentagon} label="Polígono (P)" />
          <ToolButton active={tool === "lasso"} onClick={() => { setTool("lasso"); setDraft([]); }} icon={Spline} label="Laço (L)" />
          <ToolButton active={tool === "magnetic-lasso"} onClick={() => { setTool("magnetic-lasso"); setDraft([]); }} icon={Magnet} label="Laço Magnético (M)" />
          <ToolButton active={tool === "pan"} onClick={() => setTool("pan")} icon={Hand} label="Mover (H)" />
          <div className="w-px h-4 bg-white/10 mx-1" />
          <ToolButton active={precisionMode} onClick={() => setPrecisionMode(!precisionMode)} icon={Target} label="Modo Precisão" />
        </div>

        <div className="flex items-center gap-1">
          <ToolButton onClick={() => setViewport(v => ({ ...v, zoom: Math.min(MAX_ZOOM, v.zoom * 1.1) }))} icon={ZoomIn} label="Zoom In" />
          <ToolButton onClick={() => setViewport(v => ({ ...v, zoom: Math.max(MIN_ZOOM, v.zoom * 0.9) }))} icon={ZoomOut} label="Zoom Out" />
          <ToolButton onClick={() => {
            if (containerRef.current) {
              const rect = containerRef.current.getBoundingClientRect();
              const padding = 10;
              const availableWidth = rect.width - (padding * 2);
              const availableHeight = rect.height - (padding * 2);
              
              const zoomX = availableWidth / imageWidth;
              const zoomY = availableHeight / imageHeight;
              const fitZoom = Math.min(zoomX, zoomY, 1);
              
              setViewport({ 
                zoom: fitZoom, 
                offset: { 
                  x: (rect.width - imageWidth * fitZoom) / 2, 
                  y: (rect.height - imageHeight * fitZoom) / 2 
                } 
              });
            }
          }} icon={Maximize2} label="Ajustar" />
          <div className="w-px h-4 bg-white/10 mx-1" />
          <Button variant="ghost" size="icon" onClick={handleExport} className="h-8 w-8 rounded-lg hover:bg-primary/20">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex flex-1 gap-4 overflow-hidden">
        {/* Main Editor */}
        <div 
          ref={containerRef}
          className="relative flex-1 bg-black/40 rounded-2xl border border-white/5 overflow-hidden cursor-crosshair touch-none select-none w-full h-full"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        >
          {/* Base Layer */}
          <div 
            className="absolute origin-top-left transition-transform duration-75 pointer-events-none"
            style={{ 
              transform: `translate(${viewport.offset.x}px, ${viewport.offset.y}px) scale(${viewport.zoom})`,
              width: imageWidth,
              height: imageHeight,
            }}
          >
            <div className="relative w-full h-full">
              <img 
                src={imageUrl} 
                alt="Mapa de Taludes" 
                className="absolute inset-0 block max-w-none pointer-events-none w-full h-full"
                style={{ objectFit: 'contain' }}
              />

              {/* SVG Layer for Polygons */}
              <svg 
                className="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
                viewBox={`0 0 ${imageWidth} ${imageHeight}`}
              >
                {/* Render Existing Polygons */}
                {polygons.map(poly => (
                  <g key={poly.id} className={cn("transition-opacity", !poly.visible && "opacity-0")}>
                    <polygon
                      points={poly.points.map(p => `${p.x},${p.y}`).join(" ")}
                      fill={poly.color}
                      fillOpacity={selectedId === poly.id ? 0.4 : 0.2}
                      stroke={poly.color}
                      strokeWidth={2 / viewport.zoom}
                      className={cn("cursor-pointer pointer-events-auto", selectedId === poly.id && "stroke-[3px]")}
                    />
                    {/* Vertices when selected */}
                    {selectedId === poly.id && poly.points.map((p, i) => (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r={(precisionMode ? 3 : 6) / viewport.zoom}
                        fill="white"
                        stroke={poly.color}
                        strokeWidth={1 / viewport.zoom}
                        className="pointer-events-auto cursor-move"
                      />
                    ))}
                  </g>
                ))}

                {/* Render Draft */}
                {draft.length > 0 && (
                  <g>
                    <polyline
                      points={draft.map(p => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2 / viewport.zoom}
                      strokeDasharray={`${4/viewport.zoom},${4/viewport.zoom}`}
                    />
                    {hoverPoint && (
                      <line
                        x1={draft[draft.length-1].x}
                        y1={draft[draft.length-1].y}
                        x2={hoverPoint.x}
                        y2={hoverPoint.y}
                        stroke="hsl(var(--primary))"
                        strokeWidth={1 / viewport.zoom}
                        opacity={0.5}
                      />
                    )}
                    {draft.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r={4 / viewport.zoom} fill="hsl(var(--primary))" />
                    ))}
                  </g>
                )}
              </svg>

              {/* Modern Date Badge Overlay */}
              <div className="absolute top-4 right-4 z-10 pointer-events-none">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-xl border border-white/10 shadow-2xl">
                  <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                  <span className="text-[10px] font-medium text-white/90 tracking-wider uppercase">
                    {new Intl.DateTimeFormat("pt-BR", {
                      day: "2-digit",
                      month: "long",
                      year: "numeric",
                    }).format(new Date())}
                  </span>
                </div>
              </div>
            </div>
          </div>


          {/* Precision Crosshair */}
          {precisionMode && hoverPoint && (
             <div className="absolute inset-0 pointer-events-none">
                <div className="absolute w-px h-full bg-primary/20" style={{ left: convertToScreen(hoverPoint).x - containerRef.current!.getBoundingClientRect().left }} />
                <div className="absolute h-px w-full bg-primary/20" style={{ top: convertToScreen(hoverPoint).y - containerRef.current!.getBoundingClientRect().top }} />
             </div>
          )}

          {/* Debug Info */}
          <div className="absolute bottom-4 left-4 p-2 rounded-lg bg-black/60 backdrop-blur-sm border border-white/10 text-[10px] font-mono text-white/50 pointer-events-none z-20">
            Scale: {imageWidth}x{imageHeight}<br/>
            Zoom: {Math.round(viewport.zoom * 100)}%<br/>
            Pos: {hoverPoint ? `${Math.round(hoverPoint.x)}, ${Math.round(hoverPoint.y)}` : "0, 0"}
          </div>
        </div>

        {/* Sidebar - Area List */}
        <div className="w-80 flex flex-col gap-3 h-full overflow-hidden">
          <div className="flex-1 rounded-2xl bg-muted/10 border border-white/5 overflow-hidden flex flex-col">
            <div className="p-3 border-b border-white/5 bg-white/5 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white/90">Áreas Demarcadas</h3>
              <Badge variant="outline" className="text-[10px] h-4 px-1">{polygons.length}</Badge>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {polygons.length === 0 ? (
                <div className="py-8 text-center text-xs text-white/30 italic">Nenhuma área</div>
              ) : (
                polygons.map(poly => (
                  <button
                    key={poly.id}
                    onClick={() => onSelect(poly.id)}
                    className={cn(
                      "w-full flex items-center gap-3 p-2 rounded-xl transition-all text-left group",
                      selectedId === poly.id ? "bg-primary/20 border border-primary/20" : "hover:bg-white/5 border border-transparent"
                    )}
                  >
                    <div className="h-3 w-3 rounded-full flex-shrink-0" style={{ backgroundColor: poly.color }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-white/90 truncate">{poly.label || `Talude ${poly.id.slice(0, 4)}`}</div>
                      <div className="text-[10px] text-white/40">{poly.status || "Pendente"}</div>
                    </div>
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-destructive/60 hover:text-destructive hover:bg-destructive/10"
                        onClick={(e) => { e.stopPropagation(); onDelete?.(poly.id); }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolButton({ active, onClick, icon: Icon, label }: { active?: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      size="icon"
      onClick={onClick}
      className={cn(
        "h-8 w-8 rounded-lg transition-all",
        active ? "bg-primary shadow-lg shadow-primary/20" : "hover:bg-white/10"
      )}
      title={label}
    >
      <Icon className={cn("h-4 w-4", active ? "text-primary-foreground" : "text-white/70")} />
    </Button>
  );
}

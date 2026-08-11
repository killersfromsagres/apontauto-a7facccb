import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { type Point, type TaludeMarcacao } from '@/lib/taludes/api';
import { calculatePolygonArea, getDistance } from '@/lib/taludes/geometry';
import { Button } from '@/components/ui/button';
import { 
  Plus, 
  Trash2, 
  MousePointer2, 
  PenTool, 
  Save, 
  ZoomIn, 
  ZoomOut, 
  Maximize,
  Undo2,
  Download,
  Eraser,
  X
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface PolygonEditorProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  marcacoes: TaludeMarcacao[];
  onSave: (marcacao: Partial<TaludeMarcacao>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type EditorMode = 'view' | 'draw' | 'edit';

interface HistoryState {
  marcacoes: TaludeMarcacao[];
  currentPoints: Point[];
}

export const PolygonEditor: React.FC<PolygonEditorProps> = ({
  imageUrl,
  imageWidth,
  imageHeight,
  marcacoes: initialMarcacoes,
  onSave,
  onDelete
}) => {
  // --- States ---
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<EditorMode>('view');
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [selectedMarcacaoId, setSelectedMarcacaoId] = useState<string | null>(null);
  const [draggedPointIndex, setDraggedPointIndex] = useState<{ marcacaoId: string, pointIndex: number } | null>(null);
  
  // Local state for undo/redo and immediate UI response
  const [localMarcacoes, setLocalMarcacoes] = useState<TaludeMarcacao[]>(initialMarcacoes);
  const [history, setHistory] = useState<HistoryState[]>([]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Sync initial props
  useEffect(() => {
    setLocalMarcacoes(initialMarcacoes);
  }, [initialMarcacoes]);

  // --- Map Utilities ---
  
  const fitToView = useCallback(() => {
    if (containerRef.current) {
      const container = containerRef.current;
      const padding = 40;
      const availableWidth = container.clientWidth - padding * 2;
      const availableHeight = container.clientHeight - padding * 2;
      
      if (availableWidth <= 0 || availableHeight <= 0) return;

      const fitZoom = Math.min(
        availableWidth / imageWidth,
        availableHeight / imageHeight
      );
      
      setZoom(fitZoom);
      setOffset({
        x: (container.clientWidth - imageWidth * fitZoom) / 2,
        y: (container.clientHeight - imageHeight * fitZoom) / 2
      });
    }
  }, [imageWidth, imageHeight]);

  useEffect(() => {
    if (imageLoaded) {
      fitToView();
    }
  }, [imageLoaded, fitToView, imageUrl]);

  // Handle Resize
  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (imageLoaded) fitToView();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [imageLoaded, fitToView]);

  // Screen to Map coordinates
  const getMapCoords = useCallback((e: React.MouseEvent | MouseEvent | WheelEvent): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;
    return { x, y };
  }, [offset, zoom]);

  // --- Interactions ---

  const handleMouseDown = (e: React.MouseEvent) => {
    // Middle click or Space/Alt + Left click for panning
    if (e.button === 1 || (mode === 'view' && e.button === 0)) {
      isPanning.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (mode === 'edit' && e.button === 0) {
      const coords = getMapCoords(e);
      const hitRadius = 12 / zoom;

      // Find if we clicked on a vertex
      for (const m of localMarcacoes) {
        for (let i = 0; i < m.polygon.length; i++) {
          const p = m.polygon[i];
          if (getDistance(coords, p) < hitRadius) {
            setDraggedPointIndex({ marcacaoId: m.id, pointIndex: i });
            setSelectedMarcacaoId(m.id);
            return;
          }
        }
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    const coords = getMapCoords(e);
    setHoverPoint(coords);

    if (draggedPointIndex) {
      setLocalMarcacoes(prev => prev.map(m => {
        if (m.id === draggedPointIndex.marcacaoId) {
          const newPolygon = [...m.polygon];
          newPolygon[draggedPointIndex.pointIndex] = coords;
          return { ...m, polygon: newPolygon };
        }
        return m;
      }));
    }
  };

  const handleMouseUp = async () => {
    isPanning.current = false;
    
    if (draggedPointIndex) {
      const target = localMarcacoes.find(m => m.id === draggedPointIndex.marcacaoId);
      if (target) {
        try {
          await onSave(target);
          toast.success("Posição atualizada");
        } catch (err) {
          toast.error("Erro ao salvar alteração");
        }
      }
      setDraggedPointIndex(null);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.button !== 0 || isPanning.current) return;
    
    const coords = getMapCoords(e);
    
    if (mode === 'draw') {
      // Check for closure
      if (currentPoints.length > 2) {
        const firstPoint = currentPoints[0];
        const dist = getDistance(coords, firstPoint);
        if (dist < 15 / zoom) {
          handleFinishDrawing();
          return;
        }
      }
      setCurrentPoints(prev => [...prev, coords]);
    } else if (mode === 'view') {
      // Selection logic could go here if needed
    }
  };

  const handleFinishDrawing = async () => {
    if (currentPoints.length < 3) {
      toast.error("Desenhe pelo menos 3 pontos para formar uma área.");
      return;
    }

    const newMarcacao: Partial<TaludeMarcacao> = {
      nome: `Talude ${localMarcacoes.length + 1}`,
      polygon: currentPoints,
      cor: '#ef4444', // Red for better visibility as requested
      opacidade: 0.3,
      visivel: true,
      bloqueado: false
    };

    try {
      await onSave(newMarcacao);
      setCurrentPoints([]);
      setMode('view');
      toast.success("Área demarcada com sucesso");
    } catch (error) {
      toast.error("Erro ao salvar demarcação");
    }
  };

  const handleUndo = () => {
    if (mode === 'draw') {
      setCurrentPoints(prev => prev.slice(0, -1));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
      setSelectedMarcacaoId(null);
      toast.success("Área removida");
    } catch (err) {
      toast.error("Erro ao remover área");
    }
  };

  // --- Zoom & Pan Logic ---
  const onWheel = useCallback((e: WheelEvent) => {
    if (!containerRef.current) return;
    e.preventDefault();
    
    const scaleFactor = 1.15;
    const delta = e.deltaY > 0 ? 1 / scaleFactor : scaleFactor;
    const newZoom = Math.min(Math.max(zoom * delta, 0.05), 20);
    
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const newOffsetX = mouseX - (mouseX - offset.x) * (newZoom / zoom);
    const newOffsetY = mouseY - (mouseY - offset.y) * (newZoom / zoom);

    setZoom(newZoom);
    setOffset({ x: newOffsetX, y: newOffsetY });
  }, [zoom, offset]);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', onWheel, { passive: false });
      return () => container.removeEventListener('wheel', onWheel);
    }
  }, [onWheel]);

  // --- Export Logic ---
  const handleExport = async () => {
    const canvas = document.createElement('canvas');
    canvas.width = imageWidth;
    canvas.height = imageHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw background image
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;
    
    await new Promise((resolve) => {
      img.onload = resolve;
    });

    ctx.drawImage(img, 0, 0, imageWidth, imageHeight);

    // Draw polygons
    localMarcacoes.forEach(m => {
      if (!m.visivel) return;
      ctx.beginPath();
      m.polygon.forEach((p, i) => {
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.closePath();
      
      // Lines
      ctx.strokeStyle = m.cor;
      ctx.lineWidth = 4;
      ctx.stroke();
      
      // Fill
      ctx.fillStyle = m.cor + '4D'; // 30% alpha
      ctx.fill();
    });

    // Trigger download
    const link = document.createElement('a');
    link.download = `talude-demarcacao-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast.success("Mapa exportado com sucesso");
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden flex flex-col group/editor">
      {/* Precision Toolbar */}
      <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
        <div className="flex gap-1 bg-black/60 p-1.5 rounded-xl backdrop-blur-md border border-white/10 shadow-2xl">
          <Button 
            variant={mode === 'view' ? 'premium' : 'ghost'} 
            size="icon"
            onClick={() => { setMode('view'); setCurrentPoints([]); }}
            className="h-9 w-9 rounded-lg"
          >
            <MousePointer2 className="h-4 w-4" />
          </Button>
          <Button 
            variant={mode === 'draw' ? 'premium' : 'ghost'} 
            size="icon"
            onClick={() => setMode('draw')}
            className="h-9 w-9 rounded-lg"
          >
            <PenTool className="h-4 w-4" />
          </Button>
          <Button 
            variant={mode === 'edit' ? 'premium' : 'ghost'} 
            size="icon"
            onClick={() => setMode('edit')}
            className="h-9 w-9 rounded-lg"
          >
            <MousePointer2 className="h-4 w-4 rotate-45" />
          </Button>
          
          <div className="w-px h-6 bg-white/10 self-center mx-1" />
          
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(z * 1.25, 20))} className="h-9 w-9">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(z / 1.25, 0.05))} className="h-9 w-9">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={fitToView} className="h-9 w-9 text-blue-400">
            <Maximize className="h-4 w-4" />
          </Button>
        </div>

        {/* Action Bar (Conditional) */}
        {(mode === 'draw' && currentPoints.length > 0) && (
          <div className="flex gap-1 bg-black/60 p-1.5 rounded-xl backdrop-blur-md border border-white/10 animate-in slide-in-from-left-2">
            <Button variant="ghost" size="icon" onClick={handleUndo} className="h-9 w-9 text-amber-400">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleFinishDrawing} className="h-9 w-9 text-emerald-400">
              <Save className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => setCurrentPoints([])} className="h-9 w-9 text-red-400">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Right Controls */}
      <div className="absolute top-4 right-4 z-50 flex flex-col gap-2">
         <Button 
            onClick={handleExport}
            variant="outline" 
            size="sm" 
            className="bg-black/60 border-white/10 backdrop-blur-md gap-2"
          >
            <Download className="h-4 w-4" /> Exportar
          </Button>
          
          {selectedMarcacaoId && (
             <Button 
                onClick={() => handleDelete(selectedMarcacaoId)}
                variant="destructive" 
                size="sm" 
                className="gap-2 shadow-lg"
              >
                <Trash2 className="h-4 w-4" /> Excluir Área
              </Button>
          )}
      </div>

      {/* Surface */}
      <div 
        ref={containerRef}
        className={cn(
          "flex-1 relative overflow-hidden transition-all duration-300",
          !imageLoaded && "opacity-0 scale-95",
          imageLoaded && "opacity-100 scale-100",
          mode === 'draw' ? "cursor-crosshair" : isPanning.current ? "cursor-grabbing" : "cursor-grab"
        )}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* Layer Stack */}
        <div 
          style={{
            width: imageWidth,
            height: imageHeight,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'absolute',
            top: 0,
            left: 0,
            willChange: 'transform'
          }}
        >
          {/* 1. Base Image */}
          <img 
            ref={imgRef}
            src={imageUrl} 
            alt="Mapa" 
            className="block pointer-events-none select-none"
            style={{ width: imageWidth, height: imageHeight, maxWidth: 'none' }}
            onLoad={() => setImageLoaded(true)}
          />

          {/* 2. SVG Overlay for Polygons & Interaction */}
          <svg 
            viewBox={`0 0 ${imageWidth} ${imageHeight}`}
            className="absolute inset-0 w-full h-full pointer-events-none"
            style={{ shapeRendering: 'geometricPrecision' }}
          >
            {/* Defined Areas */}
            {localMarcacoes.map((m) => (
              <g key={m.id} className="pointer-events-auto cursor-pointer" onClick={() => setSelectedMarcacaoId(m.id)}>
                <polygon
                  points={m.polygon.map(p => `${p.x},${p.y}`).join(' ')}
                  fill={m.cor}
                  fillOpacity={selectedMarcacaoId === m.id ? 0.4 : 0.25}
                  stroke={m.cor}
                  strokeWidth={2 / zoom}
                  className="transition-opacity duration-200"
                />
                
                {/* Vertices (only in edit mode) */}
                {mode === 'edit' && m.polygon.map((p, idx) => (
                  <circle
                    key={idx}
                    cx={p.x}
                    cy={p.y}
                    r={6 / zoom}
                    fill="white"
                    stroke={m.cor}
                    strokeWidth={2 / zoom}
                    className="cursor-move hover:scale-125 transition-transform"
                  />
                ))}
              </g>
            ))}

            {/* Current Drawing */}
            {currentPoints.length > 0 && (
              <g>
                <polyline
                  points={currentPoints.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth={2 / zoom}
                />
                {currentPoints.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={5 / zoom}
                    fill={i === 0 ? "#10b981" : "#ef4444"}
                    stroke="white"
                    strokeWidth={1 / zoom}
                  />
                ))}
                {/* Rubber-band line */}
                {hoverPoint && mode === 'draw' && (
                  <line
                    x1={currentPoints[currentPoints.length - 1].x}
                    y1={currentPoints[currentPoints.length - 1].y}
                    x2={hoverPoint.x}
                    y2={hoverPoint.y}
                    stroke="#ef4444"
                    strokeWidth={1 / zoom}
                    strokeDasharray={`${4 / zoom},${4 / zoom}`}
                  />
                )}
              </g>
            )}
          </svg>
        </div>
      </div>
      
      {/* Bottom Info Bar */}
      <div className="bg-black/80 backdrop-blur-md border-t border-white/10 p-2 text-[10px] uppercase tracking-wider text-slate-500 flex justify-between items-center px-4 font-mono">
        <div className="flex gap-4 items-center">
          <span className="flex items-center gap-1.5">
             <div className={cn("h-1.5 w-1.5 rounded-full", mode === 'draw' ? "bg-red-500 animate-pulse" : "bg-blue-500")} />
             MODO: {mode}
          </span>
          <span className="hidden sm:inline">COORDENADAS: {hoverPoint ? `${hoverPoint.x.toFixed(0)}, ${hoverPoint.y.toFixed(0)}` : '---'}</span>
        </div>
        <div className="flex gap-4 items-center">
          <span>ZOOM: {(zoom * 100).toFixed(0)}%</span>
          <span>ÁREAS: {localMarcacoes.length}</span>
        </div>
      </div>
    </div>
  );
};

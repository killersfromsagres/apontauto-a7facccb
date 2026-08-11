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
  X,
  Calendar,
  Settings2,
  CheckCircle2,
  Clock,
  PlayCircle,
  PauseCircle,
  AlertCircle,
  CloudRain
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
  const [currentColor, setCurrentColor] = useState('#f59e0b');
  const [statusDate, setStatusDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [statusText, setStatusText] = useState('Em Execução');
  const [lineThickness, setLineThickness] = useState(4);
  const [legendScale, setLegendScale] = useState(1);
  const [activeLegendScale, setActiveLegendScale] = useState(1);
  
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
      const hitRadius = 15 / zoom;

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
        } catch (err) {
          console.error("Erro ao salvar movimento de vértice:", err);
        }
      }
      setDraggedPointIndex(null);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.button !== 0 || isPanning.current) return;
    
    // Selection logic
    const coords = getMapCoords(e);
    
    // Check if we clicked inside any polygon
    for (const m of localMarcacoes) {
      if (isPointInPolygon(coords, m.polygon)) {
        setSelectedMarcacaoId(m.id);
        setLineThickness(m.espessura_linha || 4);
        setActiveLegendScale(m.tamanho_legenda || 1);
        setStatusDate(m.rotulo?.split(' - ')[1] || new Date().toISOString().split('T')[0]);
        setCurrentColor(m.cor);
        setStatusText(m.rotulo?.split(' - ')[0] || 'Em Execução');
        return;
      }
    }

    if (mode === 'draw') {
      // Check for closure
      if (currentPoints.length > 2) {
        const firstPoint = currentPoints[0];
        const dist = getDistance(coords, firstPoint);
        // Snapping radius for closure
        if (dist < 20 / zoom) {
          handleFinishDrawing();
          return;
        }
      }
      setCurrentPoints(prev => [...prev, coords]);
    } else if (mode === 'view') {
      setSelectedMarcacaoId(null);
    }
  };

  // Helper to check point in polygon
  const isPointInPolygon = (point: Point, vs: Point[]) => {
    let x = point.x, y = point.y;
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y;
        let xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
  };

  const handleFinishDrawing = async () => {
    if (currentPoints.length < 3) {
      toast.error("Desenhe pelo menos 3 pontos para formar uma área.");
      return;
    }

    const newMarcacao: Partial<TaludeMarcacao> = {
      nome: `Talude ${localMarcacoes.length + 1}`,
      rotulo: `${statusText} - ${statusDate}`,
      polygon: currentPoints,
      cor: currentColor,
      opacidade: 0.3,
      visivel: true,
      bloqueado: false,
      espessura_linha: lineThickness,
      tamanho_legenda: legendScale
    };

    try {
      console.log("Iniciando salvamento de nova demarcação...");
      await onSave(newMarcacao);
      setCurrentPoints([]);
      setMode('view');
    } catch (error: any) {
      console.error("Erro capturado no PolygonEditor:", error);
      // O toast agora é disparado pela mutação no componente pai
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
      
      // Fill
      ctx.fillStyle = m.cor + '4D'; // 30% alpha
      ctx.fill();

      // Lines
      ctx.strokeStyle = m.cor;
      ctx.lineWidth = m.espessura_linha || 4;
      ctx.stroke();

      // Draw Labels on Canvas
      if (m.polygon.length > 0) {
        const firstPoint = m.polygon[0];
        const status = m.rotulo?.split(' - ')[0] || '';
        const numero = m.numero || '#';
        const lScale = m.tamanho_legenda || 1;

        ctx.save();
        
        // Settings for shadow/glow
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 8 * lScale;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 4 * lScale;

        // Draw background pill for the number
        const numText = String(numero);
        ctx.font = `bold ${32 * lScale}px monospace`;
        const numWidth = ctx.measureText(numText).width;
        const pillWidth = Math.max(numWidth + 24 * lScale, 50 * lScale);
        const pillHeight = 46 * lScale;
        const pillX = firstPoint.x - pillWidth / 2;
        const pillY = firstPoint.y - (80 * lScale);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(pillX, pillY, pillWidth, pillHeight, 10 * lScale);
        } else {
          ctx.rect(pillX, pillY, pillWidth, pillHeight);
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2 * lScale;
        ctx.stroke();

        // Draw the number text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numText, firstPoint.x, pillY + pillHeight / 2);

        // Draw the secondary label (Status)
        ctx.shadowBlur = 4 * lScale;
        ctx.font = `bold ${24 * lScale}px sans-serif`;
        const dateStr = m.rotulo?.split(' - ')[1] || '';
        const statusTextFull = `${numero} - ${status}${dateStr ? ` - ${dateStr}` : ''}`;
        const statusWidth = ctx.measureText(statusTextFull).width;
        const sPillWidth = statusWidth + 50 * lScale;
        const sPillHeight = 36 * lScale;
        const sPillX = firstPoint.x - sPillWidth / 2;
        const sPillY = pillY + pillHeight + (12 * lScale);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.beginPath();
        if (typeof ctx.roundRect === 'function') {
          ctx.roundRect(sPillX, sPillY, sPillWidth, sPillHeight, 18 * lScale);
        } else {
          ctx.rect(sPillX, sPillY, sPillWidth, sPillHeight);
        }
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1 * lScale;
        ctx.stroke();

        // Color dot
        ctx.fillStyle = m.cor;
        ctx.beginPath();
        ctx.arc(sPillX + 20 * lScale, sPillY + sPillHeight / 2, 7 * lScale, 0, Math.PI * 2);
        ctx.fill();

        // Status text
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.fillText(statusTextFull, sPillX + 35 * lScale, sPillY + sPillHeight / 2);

        ctx.restore();
      }
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

          <div className="w-px h-6 bg-white/10 self-center mx-1" />

          {/* Color & Status selection */}
          <div className="flex gap-2 items-center px-1">
            <div className="flex gap-1 bg-black/40 p-1 rounded-lg border border-white/5">
              {[
                { color: '#ef4444', label: 'Interditado', icon: AlertCircle },
                { color: '#f59e0b', label: 'Em Execução', icon: PlayCircle },
                { color: '#10b981', label: 'Concluído', icon: CheckCircle2 },
                { color: '#3b82f6', label: 'Programado', icon: Clock },
                { color: '#8b5cf6', label: 'Interferência Climática', icon: CloudRain }
              ].map(item => (
                <button
                  key={item.color}
                  onClick={async () => {
                    setCurrentColor(item.color);
                    setStatusText(item.label);
                    
                    // IF we have a selected area, update it instantly
                    if (selectedMarcacaoId) {
                      const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                      if (target) {
                        try {
                          await onSave({
                            ...target,
                            cor: item.color,
                            rotulo: `${item.label} - ${statusDate}`
                          });
                        } catch (err) {
                          console.error("Erro ao atualizar cor/status:", err);
                        }
                      }
                    }
                  }}
                  title={item.label}
                  className={cn(
                    "w-8 h-8 rounded-md border border-white/10 transition-all flex items-center justify-center relative overflow-hidden group/btn",
                    currentColor === item.color ? "scale-110 border-white ring-2 ring-white/20 z-10 bg-white/10" : "hover:scale-105 opacity-60 hover:opacity-100"
                  )}
                >
                  <div 
                    className="absolute inset-0 opacity-20 group-hover/btn:opacity-40 transition-opacity" 
                    style={{ backgroundColor: item.color }} 
                  />
                  <item.icon className="h-4 w-4 relative z-10" style={{ color: item.color }} />
                  {currentColor === item.color && (
                    <div className="absolute bottom-0.5 right-0.5 w-1 h-1 bg-white rounded-full animate-pulse z-20" />
                  )}
                </button>
              ))}
            </div>

            {/* Thickness Control */}
            <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-white/5 px-2">
              <Settings2 className="h-3.5 w-3.5 text-white/50" />
              <input 
                type="range" 
                min="1" 
                max="12" 
                step="1"
                value={lineThickness}
                onChange={async (e) => {
                  const val = parseInt(e.target.value);
                  setLineThickness(val);
                  
                  if (selectedMarcacaoId) {
                    const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                    if (target) {
                      try {
                        await onSave({ ...target, espessura_linha: val });
                      } catch (err) {
                        console.error("Erro ao atualizar espessura:", err);
                      }
                    }
                  }
                }}
                className="w-16 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-[9px] font-mono text-white/40 w-4">{lineThickness}px</span>
            </div>

            {/* Legend Scale Control */}
            <div className="flex items-center gap-1.5 bg-black/40 p-1 rounded-lg border border-white/5 px-2">
              <span className="text-[10px] font-bold text-white/50">A</span>
              <input 
                type="range" 
                min="0.5" 
                max="4" 
                step="0.1"
                value={selectedMarcacaoId ? (localMarcacoes.find(m => m.id === selectedMarcacaoId)?.tamanho_legenda || 1) : legendScale}
                onChange={async (e) => {
                  const val = parseFloat(e.target.value);
                  setLegendScale(val);
                  
                  if (selectedMarcacaoId) {
                    const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                    if (target) {
                      try {
                        await onSave({ ...target, tamanho_legenda: val });
                      } catch (err) {
                        console.error("Erro ao atualizar tamanho da legenda:", err);
                      }
                    }
                  }
                }}
                className="w-16 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
              <span className="text-[9px] font-mono text-white/40 w-4">{(selectedMarcacaoId ? activeLegendScale : legendScale).toFixed(1)}x</span>
            </div>

            {/* Ultra Realist Glass Date Picker */}
            <div className="relative group/date">
              <div className="absolute inset-0 bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.36)]" />
              <div className="relative flex items-center gap-2 px-3 py-1.5 h-9">
                <Calendar className="h-3.5 w-3.5 text-blue-400" />
                <input 
                  type="date" 
                  value={statusDate}
                  onChange={async (e) => {
                    const newDate = e.target.value;
                    setStatusDate(newDate);
                    
                    if (selectedMarcacaoId) {
                      const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                      if (target) {
                        try {
                          await onSave({
                            ...target,
                            rotulo: `${statusText} - ${newDate}`
                          });
                        } catch (err) {
                          console.error("Erro ao atualizar data:", err);
                        }
                      }
                    }
                  }}
                  className="bg-transparent border-none text-[10px] font-medium text-white/90 outline-none w-[90px] cursor-pointer"
                />
              </div>
            </div>
          </div>
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
              <g key={m.id} className="pointer-events-auto cursor-pointer" onClick={(e) => { 
                e.stopPropagation(); 
                setSelectedMarcacaoId(m.id);
                setLineThickness(m.espessura_linha || 4);
                setLegendScale(m.tamanho_legenda || 1);
                setStatusDate(m.rotulo?.split(' - ')[1] || new Date().toISOString().split('T')[0]);
                setCurrentColor(m.cor);
                setStatusText(m.rotulo?.split(' - ')[0] || 'Em Execução');
              }}>
                <polygon
                  points={m.polygon.map(p => `${p.x},${p.y}`).join(' ')}
                  fill={m.cor}
                  fillOpacity={selectedMarcacaoId === m.id ? 0.4 : 0.25}
                  stroke={m.cor}
                  strokeWidth={(m.espessura_linha || 4) / zoom}
                  strokeDasharray={m.bloqueado ? "5,5" : "none"}
                />
                
                {/* Visual Label with Number and Status Color */}
                {m.polygon.length > 0 && (
                  <foreignObject
                    x={m.polygon[0].x}
                    y={m.polygon[0].y}
                    width={1}
                    height={1}
                    className="overflow-visible pointer-events-none"
                  >
                      <div 
                        className="flex flex-col items-center gap-1.5 transform"
                        style={{ 
                          transform: `translate(-50%, -100%) translateY(-10px) scale(${legendScale})`,
                          transformOrigin: 'bottom center'
                        }}
                      >
                        {/* Premium Number Badge */}
                        <div 
                          className="flex items-center justify-center min-w-[40px] h-10 px-3 rounded-xl bg-black/90 backdrop-blur-xl border border-white/30 text-white shadow-[0_8px_24px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
                        >
                          <span className="text-[16px] font-black font-mono tracking-tight leading-none">{m.numero || '#'}</span>
                        </div>

                        {/* Combined Information Badge */}
                        <div 
                          className="flex items-center gap-2 px-3.5 py-1.8 rounded-full bg-black/80 backdrop-blur-md border border-white/20 text-white shadow-2xl whitespace-nowrap min-h-[36px]"
                          style={{ 
                            fontSize: `14px`,
                          }}
                        >
                          <div className="w-3 h-3 rounded-full shadow-[0_0_12px_rgba(255,255,255,0.3)]" style={{ backgroundColor: m.cor }} />
                          <span className="font-black opacity-100">{m.numero || 'T'}</span>
                          <span className="opacity-50 font-light">-</span>
                          <div className="flex flex-col items-start leading-none gap-0.5">
                            <span className="font-bold opacity-100 text-[12px]">{m.rotulo?.split(' - ')[0]}</span>
                            <span className="text-[10px] opacity-60 font-medium">{m.rotulo?.split(' - ')[1]}</span>
                          </div>
                        </div>
                      </div>
                  </foreignObject>
                )}
                
                {/* Vertices (only in edit mode) */}
                {mode === 'edit' && m.id === selectedMarcacaoId && m.polygon.map((p, idx) => (
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
                  strokeWidth={3 / zoom}
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

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
  CloudRain,
  Move
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

type EditorMode = 'view' | 'draw' | 'edit' | 'move';

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
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<EditorMode>('view');
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [selectedMarcacaoId, setSelectedMarcacaoId] = useState<string | null>(null);
  const [draggedPointIndex, setDraggedPointIndex] = useState<{ marcacaoId: string, pointIndex: number } | null>(null);
  const [draggedLabel, setDraggedLabel] = useState<{ marcacaoId: string, type: 'numero' | 'data' } | null>(null);
  const [currentColor, setCurrentColor] = useState('#f59e0b');
  const [statusDate, setStatusDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [statusText, setStatusText] = useState('Em Execução');
  const [lineThickness, setLineThickness] = useState(4);
  const [legendScale, setLegendScale] = useState(1);
  const [activeLegendScale, setActiveLegendScale] = useState(1);
  const [numeroScale, setNumeroScale] = useState(1);
  const [dataScale, setDataScale] = useState(1);
  
  const [localMarcacoes, setLocalMarcacoes] = useState<TaludeMarcacao[]>(initialMarcacoes);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const isPanning = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setLocalMarcacoes(initialMarcacoes);
  }, [initialMarcacoes]);

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

  useEffect(() => {
    const observer = new ResizeObserver(() => {
      if (imageLoaded) fitToView();
    });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [imageLoaded, fitToView]);

  const getMapCoords = useCallback((e: React.MouseEvent | MouseEvent | WheelEvent): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;
    return { x, y };
  }, [offset, zoom]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (mode === 'view' && e.button === 0)) {
      isPanning.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      return;
    }

    if (mode === 'edit' && e.button === 0) {
      const coords = getMapCoords(e);
      const hitRadius = 15 / zoom;

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
    
    if (mode === 'move' && e.button === 0) {
      const coords = getMapCoords(e);
      // Logic for selecting label to move would go here
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
          console.error("Erro ao salvar vértice:", err);
        }
      }
      setDraggedPointIndex(null);
    }
  };

  const handleClick = (e: React.MouseEvent) => {
    if (e.button !== 0 || isPanning.current) return;
    
    const coords = getMapCoords(e);
    for (const m of localMarcacoes) {
      if (isPointInPolygon(coords, m.polygon)) {
        setSelectedMarcacaoId(m.id);
        setCurrentColor(m.cor);
        setLineThickness(m.espessura_linha || 4);
        setNumeroScale(m.numero_scale || 1);
        setDataScale(m.data_scale || 1);
        setStatusDate(m.rotulo?.split(' - ')[1] || new Date().toISOString().split('T')[0]);
        setStatusText(m.rotulo?.split(' - ')[0] || 'Em Execução');
        return;
      }
    }

    if (mode === 'draw') {
      if (currentPoints.length > 2) {
        const dist = getDistance(coords, currentPoints[0]);
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

  const isPointInPolygon = (point: Point, vs: Point[]) => {
    let inside = false;
    for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        let xi = vs[i].x, yi = vs[i].y;
        let xj = vs[j].x, yj = vs[j].y;
        let intersect = ((yi > point.y) !== (yj > point.y))
            && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
  };

  const handleFinishDrawing = async () => {
    if (currentPoints.length < 3) return;
    const newMarcacao: Partial<TaludeMarcacao> = {
      rotulo: `${statusText} - ${statusDate}`,
      polygon: currentPoints,
      cor: currentColor,
      espessura_linha: lineThickness,
      numero_scale: numeroScale,
      data_scale: dataScale
    };
    await onSave(newMarcacao);
    setCurrentPoints([]);
    setMode('view');
  };

  const handleExport = async () => {
    // Canvas logic will be updated later to handle manual label positioning
    toast.info("Exportação em atualização");
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden flex flex-col group/editor">
      <div className="absolute top-4 left-4 z-50 flex gap-1 bg-black/60 p-1.5 rounded-xl backdrop-blur-md border border-white/10 shadow-2xl">
          <Button variant={mode === 'view' ? 'premium' : 'ghost'} size="icon" onClick={() => setMode('view')} className="h-9 w-9"><MousePointer2 className="h-4 w-4" /></Button>
          <Button variant={mode === 'draw' ? 'premium' : 'ghost'} size="icon" onClick={() => setMode('draw')} className="h-9 w-9"><PenTool className="h-4 w-4" /></Button>
          <Button variant={mode === 'edit' ? 'premium' : 'ghost'} size="icon" onClick={() => setMode('edit')} className="h-9 w-9"><Move className="h-4 w-4" /></Button>
          <div className="w-px h-6 bg-white/10 self-center mx-1" />
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(z * 1.25, 20))} className="h-9 w-9"><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(z / 1.25, 0.05))} className="h-9 w-9"><ZoomOut className="h-4 w-4" /></Button>
      </div>

      <div 
        ref={containerRef}
        className={cn("flex-1 relative cursor-crosshair")}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
      >
        <div 
          style={{
            width: imageWidth,
            height: imageHeight,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            position: 'absolute',
            top: 0, left: 0,
            willChange: 'transform'
          }}
        >
          <img src={imageUrl} alt="Mapa" className="block" onLoad={() => setImageLoaded(true)} style={{ width: imageWidth, height: imageHeight }} />
          <svg viewBox={`0 0 ${imageWidth} ${imageHeight}`} className="absolute inset-0 w-full h-full pointer-events-none">
            {localMarcacoes.map((m) => (
              <g key={m.id}>
                <polygon
                  points={m.polygon.map(p => `${p.x},${p.y}`).join(' ')}
                  fill={m.cor}
                  fillOpacity={0.25}
                  stroke={m.cor}
                  strokeWidth={(m.espessura_linha || 4) / zoom}
                />
              </g>
            ))}
          </svg>
        </div>
      </div>
    </div>
  );
};

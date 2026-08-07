import React, { useState, useRef, useEffect, useCallback } from 'react';
import { type Point, type TaludeMarcacao } from '@/lib/taludes/api';
import { calculatePolygonArea } from '@/lib/taludes/geometry';
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
  Undo2
} from 'lucide-react';
import { toast } from 'sonner';

interface PolygonEditorProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  marcacoes: TaludeMarcacao[];
  onSave: (marcacao: Partial<TaludeMarcacao>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const PolygonEditor: React.FC<PolygonEditorProps> = ({
  imageUrl,
  imageWidth,
  imageHeight,
  marcacoes,
  onSave,
  onDelete
}) => {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<'view' | 'draw'>('view');
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const getRelativeCoords = (e: React.MouseEvent | MouseEvent): Point => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left - offset.x) / zoom;
    const y = (e.clientY - rect.top - offset.y) / zoom;
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (mode === 'view' && e.button === 0)) {
      isDragging.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
    
    if (mode === 'draw') {
      setHoverPoint(getRelativeCoords(e));
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (mode !== 'draw' || e.button !== 0) return;
    
    const coords = getRelativeCoords(e);
    
    // Check if clicking near the first point to close the polygon
    if (currentPoints.length > 2) {
      const firstPoint = currentPoints[0];
      const dist = Math.sqrt(
        Math.pow(coords.x - firstPoint.x, 2) + 
        Math.pow(coords.y - firstPoint.y, 2)
      );
      
      if (dist < 10 / zoom) {
        handleFinishDrawing();
        return;
      }
    }
    
    setCurrentPoints(prev => [...prev, coords]);
  };

  const handleFinishDrawing = async () => {
    if (currentPoints.length < 3) {
      toast.error("O polígono deve ter pelo menos 3 pontos");
      return;
    }

    const area = calculatePolygonArea(currentPoints);
    const newMarcacao: Partial<TaludeMarcacao> = {
      nome: `Talude ${marcacoes.length + 1}`,
      polygon: currentPoints,
      cor: '#3b82f6',
      opacidade: 0.4,
      visivel: true,
      bloqueado: false
    };

    try {
      await onSave(newMarcacao);
      setCurrentPoints([]);
      setMode('view');
      toast.success("Talude demarcado com sucesso");
    } catch (error) {
      toast.error("Erro ao salvar demarcação");
    }
  };

  const handleUndo = () => {
    setCurrentPoints(prev => prev.slice(0, -1));
  };

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(Math.max(prev + delta, 0.1), 5));
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="relative w-full h-full bg-slate-900 overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="absolute top-4 left-4 z-10 flex gap-2 bg-slate-800/80 p-2 rounded-lg backdrop-blur-sm border border-slate-700">
        <Button 
          variant={mode === 'view' ? 'default' : 'ghost'} 
          size="icon"
          onClick={() => { setMode('view'); setCurrentPoints([]); }}
          title="Modo Seleção"
        >
          <MousePointer2 className="h-4 w-4" />
        </Button>
        <Button 
          variant={mode === 'draw' ? 'default' : 'ghost'} 
          size="icon"
          onClick={() => setMode('draw')}
          title="Modo Desenho"
        >
          <PenTool className="h-4 w-4" />
        </Button>
        <div className="w-px h-8 bg-slate-700 mx-1" />
        <Button variant="ghost" size="icon" onClick={() => handleZoom(0.1)} title="Zoom In">
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={() => handleZoom(-0.1)} title="Zoom Out">
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={resetView} title="Reset View">
          <Maximize className="h-4 w-4" />
        </Button>
        {mode === 'draw' && currentPoints.length > 0 && (
          <>
            <div className="w-px h-8 bg-slate-700 mx-1" />
            <Button variant="ghost" size="icon" onClick={handleUndo} title="Desfazer último ponto">
              <Undo2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleFinishDrawing} className="text-emerald-400" title="Finalizar polígono">
              <Save className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* Editor Surface */}
      <div 
        ref={containerRef}
        className="flex-1 relative cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onClick={handleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div 
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isDragging.current ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          <img 
            src={imageUrl} 
            alt="Mapa de Taludes" 
            style={{ width: imageWidth, height: imageHeight }}
            draggable={false}
          />
          
          <svg 
            width={imageWidth} 
            height={imageHeight} 
            className="absolute top-0 left-0 pointer-events-none"
          >
            {/* Existing Polygons */}
            {marcacoes.map((m) => (
              <polygon
                key={m.id}
                points={m.polygon.map(p => `${p.x},${p.y}`).join(' ')}
                fill={m.cor}
                fillOpacity={m.opacidade}
                stroke={m.cor}
                strokeWidth={2 / zoom}
              />
            ))}
            
            {/* Current Drawing Polygon */}
            {currentPoints.length > 0 && (
              <g>
                <polyline
                  points={currentPoints.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke="#fbbf24"
                  strokeWidth={2 / zoom}
                  strokeDasharray={`${4 / zoom},${4 / zoom}`}
                />
                {currentPoints.map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={4 / zoom}
                    fill={i === 0 ? "#fbbf24" : "#fff"}
                    stroke="#fbbf24"
                    strokeWidth={1 / zoom}
                  />
                ))}
                {hoverPoint && currentPoints.length > 0 && (
                  <line
                    x1={currentPoints[currentPoints.length - 1].x}
                    y1={currentPoints[currentPoints.length - 1].y}
                    x2={hoverPoint.x}
                    y2={hoverPoint.y}
                    stroke="#fbbf24"
                    strokeWidth={1 / zoom}
                    strokeDasharray={`${2 / zoom},${2 / zoom}`}
                  />
                )}
              </g>
            )}
          </svg>
        </div>
      </div>
      
      {/* Status Bar */}
      <div className="bg-slate-800 border-t border-slate-700 p-2 text-xs text-slate-400 flex justify-between items-center px-4">
        <div>
          {mode === 'draw' ? 'Modo Desenho: Clique para adicionar pontos, clique no ponto inicial para fechar.' : 'Modo Visualização'}
        </div>
        <div className="flex gap-4">
          <span>Zoom: {(zoom * 100).toFixed(0)}%</span>
          <span>Taludes: {marcacoes.length}</span>
        </div>
      </div>
    </div>
  );
};

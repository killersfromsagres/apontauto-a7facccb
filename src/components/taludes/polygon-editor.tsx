import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { type Point, type TaludeMarcacao } from '@/lib/taludes/api';
import { calculatePolygonArea, getDistance, getCentroid } from '@/lib/taludes/geometry';
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
  const [statusText, setStatusText] = useState('Programado');
  const [statusType, setStatusType] = useState<'concluido' | 'execucao' | 'perimetro' | 'programado'>('programado');
  
  const STATUS_CONFIG = {
    concluido: { color: '#10b981', label: 'Concluído' },
    execucao: { color: '#f59e0b', label: 'Em Execução' },
    perimetro: { color: '#ef4444', label: 'Perímetro' },
    programado: { color: '#3b82f6', label: 'Programado' }
  };
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
    const observer = new ResizeObserver((entries) => {
      // Use requestAnimationFrame to avoid "ResizeObserver loop completed with undelivered notifications"
      window.requestAnimationFrame(() => {
        if (!Array.isArray(entries) || !entries.length) return;
        if (imageLoaded) fitToView();
      });
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

    const coords = getMapCoords(e);
    const hitRadius = 20 / zoom;

    if (mode === 'edit' && e.button === 0) {
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
      // Check for label hits
      for (const m of localMarcacoes) {
        const centroid = getCentroid(m.polygon);
        const numPos = { x: m.numero_x ?? centroid.x, y: m.numero_y ?? centroid.y };
        const dataPos = { x: m.data_x ?? centroid.x, y: m.data_y ?? (centroid.y + 30) };

        if (getDistance(coords, numPos) < hitRadius) {
          setDraggedLabel({ marcacaoId: m.id, type: 'numero' });
          setSelectedMarcacaoId(m.id);
          return;
        }
        if (getDistance(coords, dataPos) < hitRadius) {
          setDraggedLabel({ marcacaoId: m.id, type: 'data' });
          setSelectedMarcacaoId(m.id);
          return;
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

    if (draggedLabel) {
      setLocalMarcacoes(prev => prev.map(m => {
        if (m.id === draggedLabel.marcacaoId) {
          if (draggedLabel.type === 'numero') {
            return { ...m, numero_x: coords.x, numero_y: coords.y };
          } else {
            return { ...m, data_x: coords.x, data_y: coords.y };
          }
        }
        return m;
      }));
    }
  };

  const handleMouseUp = async () => {
    isPanning.current = false;
    
    if (draggedPointIndex || draggedLabel) {
      const id = draggedPointIndex?.marcacaoId || draggedLabel?.marcacaoId;
      const target = localMarcacoes.find(m => m.id === id);
      if (target) {
        try {
          await onSave(target);
          toast.success("Posição atualizada");
        } catch (err) {
          console.error("Erro ao salvar posição:", err);
        }
      }
      setDraggedPointIndex(null);
      setDraggedLabel(null);
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
        const fullRotulo = m.rotulo || '';
        const foundStatus = Object.entries(STATUS_CONFIG).find(([_, cfg]) => fullRotulo.includes(cfg.label));
        setStatusType(foundStatus ? (foundStatus[0] as any) : 'programado');
        setStatusText(foundStatus ? foundStatus[1].label : 'Programado');
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
    } else if (mode === 'view' || mode === 'edit' || mode === 'move') {
      // Find which marcacao was clicked
      const clicked = localMarcacoes.find(m => isPointInPolygon(coords, m.polygon));
      if (clicked) {
        setSelectedMarcacaoId(clicked.id);
        setCurrentColor(clicked.cor);
        setLineThickness(clicked.espessura_linha || 4);
        setNumeroScale(clicked.numero_scale || 1);
        setDataScale(clicked.data_scale || 1);
        setStatusDate(clicked.rotulo?.split(' - ')[1] || new Date().toISOString().split('T')[0]);
        const fullRotulo = clicked.rotulo || '';
        const foundStatus = Object.entries(STATUS_CONFIG).find(([_, cfg]) => fullRotulo.includes(cfg.label));
        setStatusType(foundStatus ? (foundStatus[0] as any) : 'programado');
        setStatusText(foundStatus ? foundStatus[1].label : 'Programado');
      } else {
        setSelectedMarcacaoId(null);
      }
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
      rotulo: `${STATUS_CONFIG[statusType].label} - ${statusDate}`,
      polygon: currentPoints,
      cor: STATUS_CONFIG[statusType].color,
      espessura_linha: lineThickness,
      numero_scale: numeroScale,
      data_scale: dataScale
    };
    await onSave(newMarcacao);
    setCurrentPoints([]);
    setMode('view');
  };

  const handleExport = async () => {
    if (!imgRef.current) return;
    
    toast.loading("Gerando imagem de alta resolução...");
    
    try {
      const canvas = document.createElement('canvas');
      canvas.width = imageWidth;
      canvas.height = imageHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Could not get canvas context");

      // 1. Draw Background Image
      ctx.drawImage(imgRef.current, 0, 0, imageWidth, imageHeight);

      // 2. Draw Polygons and Labels
      localMarcacoes.forEach(m => {
        if (!m.visivel) return;

        // Draw Polygon
        ctx.beginPath();
        m.polygon.forEach((p, i) => {
          if (i === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        
        ctx.fillStyle = `${m.cor}${Math.round((m.opacidade || 0.3) * 255).toString(16).padStart(2, '0')}`;
        ctx.fill();
        ctx.strokeStyle = m.cor;
        ctx.lineWidth = m.espessura_linha || 4;
        ctx.stroke();

        // Calculate Label Positions
        const centroid = getCentroid(m.polygon);
        const numPos = { x: m.numero_x ?? centroid.x, y: m.numero_y ?? centroid.y };
        const dataPos = { x: m.data_x ?? centroid.x, y: m.data_y ?? (centroid.y + 30) };

        // Draw Number Circle
        const numRadius = 20 * (m.numero_scale || 1);
        ctx.beginPath();
        ctx.arc(numPos.x, numPos.y, numRadius, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fill();
        ctx.strokeStyle = m.cor;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Number Text
        ctx.fillStyle = 'white';
        ctx.font = `800 ${22 * (m.numero_scale || 1)}px "SF Pro Display", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(m.numero), numPos.x, numPos.y);

        // Draw Date Label
        const dateText = m.rotulo?.split(' - ')[1] || m.rotulo || '';
        const dataScale = m.data_scale || 1;
        ctx.font = `800 ${18 * dataScale}px "SF Pro Display", system-ui, sans-serif`;
        const textWidth = ctx.measureText(dateText).width;
        const rectWidth = textWidth + 20 * dataScale;
        const rectHeight = 30 * dataScale;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.roundRect(dataPos.x - rectWidth / 2, dataPos.y - rectHeight / 2, rectWidth, rectHeight, 6 * dataScale);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = 'white';
        ctx.fillText(dateText, dataPos.x, dataPos.y);
      });

      // 3. Trigger Download
      const link = document.createElement('a');
      link.download = `Mapa-Taludes-${new Date().toLocaleDateString()}.png`;
      link.href = canvas.toDataURL('image/png', 1.0);
      link.click();
      
      toast.dismiss();
      toast.success("Mapa exportado com sucesso!");
    } catch (err) {
      console.error("Erro na exportação:", err);
      toast.dismiss();
      toast.error("Erro ao exportar mapa");
    }
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden flex flex-col group/editor">
      <div className="absolute top-4 left-4 z-50 flex flex-col gap-2">
        <div className="flex gap-1 bg-black/60 p-1.5 rounded-xl backdrop-blur-md border border-white/10 shadow-2xl">
          <Button variant={mode === 'view' ? 'premium' : 'ghost'} size="icon" onClick={() => setMode('view')} className="h-9 w-9" title="Visualizar"><MousePointer2 className="h-4 w-4" /></Button>
          <Button variant={mode === 'draw' ? 'premium' : 'ghost'} size="icon" onClick={() => setMode('draw')} className="h-9 w-9" title="Desenhar Área"><Plus className="h-4 w-4" /></Button>
          <Button variant={mode === 'edit' ? 'premium' : 'ghost'} size="icon" onClick={() => setMode('edit')} className="h-9 w-9" title="Editar Pontos"><PenTool className="h-4 w-4" /></Button>
          <Button variant={mode === 'move' ? 'premium' : 'ghost'} size="icon" onClick={() => setMode('move')} className="h-9 w-9" title="Mover Legendas"><Move className="h-4 w-4" /></Button>
          <div className="w-px h-6 bg-white/10 self-center mx-1" />
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(z * 1.25, 20))} className="h-9 w-9"><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(z / 1.25, 0.05))} className="h-9 w-9"><ZoomOut className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={fitToView} className="h-9 w-9" title="Resetar Visualização"><Maximize className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={handleExport} className="h-9 w-9 text-emerald-400" title="Exportar Mapa"><Download className="h-4 w-4" /></Button>
        </div>

        {selectedMarcacaoId && (
          <div className="bg-black/80 p-3 rounded-xl backdrop-blur-md border border-white/10 shadow-2xl flex flex-col gap-3 min-w-[200px] animate-in slide-in-from-left-2">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Configurar Legenda</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelectedMarcacaoId(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-[10px] text-white/70 uppercase">Status da Atividade</span>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
                    <button
                      key={key}
                      onClick={() => {
                        const type = key as keyof typeof STATUS_CONFIG;
                        setStatusType(type);
                        setLocalMarcacoes(prev => prev.map(m => 
                          m.id === selectedMarcacaoId 
                            ? { ...m, cor: cfg.color, rotulo: `${cfg.label} - ${statusDate}` } 
                            : m
                        ));
                        const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                        if (target) onSave({ ...target, cor: cfg.color, rotulo: `${cfg.label} - ${statusDate}` });
                      }}
                      className={cn(
                        "flex items-center gap-2 p-2 rounded-lg border text-[10px] transition-all",
                        statusType === key 
                          ? "bg-white/10 border-white/20 text-white" 
                          : "bg-transparent border-white/5 text-white/50 hover:bg-white/5"
                      )}
                    >
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                      {cfg.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="text-[10px] text-white/70 uppercase">Data do Status</span>
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40" />
                  <input 
                    type="date" 
                    value={statusDate}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setStatusDate(newDate);
                      setLocalMarcacoes(prev => prev.map(m => 
                        m.id === selectedMarcacaoId 
                          ? { ...m, rotulo: `${STATUS_CONFIG[statusType].label} - ${newDate}` } 
                          : m
                      ));
                      const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                      if (target) onSave({ ...target, rotulo: `${STATUS_CONFIG[statusType].label} - ${newDate}` });
                    }}
                    className="w-full bg-white/5 border border-white/10 rounded-lg py-1.5 pl-8 pr-2 text-[10px] text-white focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-white/70">Escala Número</span>
                  <span className="text-blue-400 font-mono">{(numeroScale).toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="5" step="0.1" 
                  value={numeroScale} 
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setNumeroScale(val);
                    setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, numero_scale: val } : m));
                  }}
                  onMouseUp={() => {
                    const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                    if (target) onSave(target);
                  }}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-blue-500"
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-[10px]">
                  <span className="text-white/70">Escala Data</span>
                  <span className="text-emerald-400 font-mono">{(dataScale).toFixed(1)}x</span>
                </div>
                <input 
                  type="range" min="0.5" max="5" step="0.1" 
                  value={dataScale} 
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setDataScale(val);
                    setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, data_scale: val } : m));
                  }}
                  onMouseUp={() => {
                    const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                    if (target) onSave(target);
                  }}
                  className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="flex gap-2">
                <Button 
                  size="sm" variant="outline" className="flex-1 h-8 text-[10px] border-white/5 bg-white/5"
                  onClick={() => {
                    setLocalMarcacoes(prev => prev.map(m => {
                      if (m.id === selectedMarcacaoId) {
                        return { ...m, numero_x: null, numero_y: null, data_x: null, data_y: null };
                      }
                      return m;
                    }));
                    const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                    if (target) onSave({ ...target, numero_x: null, numero_y: null, data_x: null, data_y: null });
                    toast.info("Legendas resetadas");
                  }}
                >
                  <Undo2 className="h-3 w-3 mr-1" /> Resetar
                </Button>
                <Button 
                  size="sm" variant="destructive" className="flex-1 h-8 text-[10px]"
                  onClick={() => {
                    if (selectedMarcacaoId) {
                      onDelete(selectedMarcacaoId);
                      setSelectedMarcacaoId(null);
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Excluir
                </Button>
              </div>
            </div>
          </div>
        )}
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
          <img ref={imgRef} src={imageUrl} alt="Mapa" className="block" onLoad={() => setImageLoaded(true)} style={{ width: imageWidth, height: imageHeight }} crossOrigin="anonymous" />
          <svg viewBox={`0 0 ${imageWidth} ${imageHeight}`} className="absolute inset-0 w-full h-full pointer-events-none overflow-visible">
            {localMarcacoes.map((m) => {
              const centroid = getCentroid(m.polygon);
              const numPos = { x: m.numero_x ?? centroid.x, y: m.numero_y ?? centroid.y };
              const dataPos = { x: m.data_x ?? centroid.x, y: m.data_y ?? (centroid.y + 30) };
              const isSelected = selectedMarcacaoId === m.id;

              return (
                <g key={m.id} className={cn("transition-opacity duration-300", isSelected ? "opacity-100" : "opacity-90")}>
                  {/* Polygon Area */}
                  <polygon
                    points={m.polygon.map(p => `${p.x},${p.y}`).join(' ')}
                    fill={m.cor}
                    fillOpacity={isSelected ? 0.4 : 0.25}
                    stroke={m.cor}
                    strokeWidth={(m.espessura_linha || 4) / zoom}
                    className="pointer-events-auto cursor-pointer"
                  />

                  {/* Manual Labels */}
                  <g className={cn(mode === 'move' ? "pointer-events-auto cursor-move" : "pointer-events-none")}>
                    {/* Slope Number */}
                    <circle cx={numPos.x} cy={numPos.y} r={20 * (m.numero_scale || 1)} fill="rgba(0,0,0,0.7)" stroke={m.cor} strokeWidth={2} />
                    <text
                      x={numPos.x}
                      y={numPos.y}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill="white"
                      fontSize={22 * (m.numero_scale || 1)}
                      fontWeight="800"
                      className="select-none font-['SF_Pro_Display']"
                      style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}
                    >
                      {m.numero}
                    </text>

                    {/* Status Date */}
                    <g transform={`translate(${dataPos.x}, ${dataPos.y}) scale(${m.data_scale || 1})`}>
                      <rect 
                        x="-55"
                        y="-18" 
                        width="110" 
                        height="36" 

                        rx="6" 
                        fill="rgba(0,0,0,0.85)" 
                        stroke="rgba(255,255,255,0.15)" 
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="0"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill={m.cor}
                        fontSize="13"
                        fontWeight="700"
                        className="select-none font-['SF_Pro_Display'] uppercase tracking-tight"
                      >
                        {m.rotulo?.split(' - ')[1] || m.rotulo}
                      </text>
                    </g>
                  </g>

                  {/* Edit Handles (only in Edit mode for selected) */}
                  {mode === 'edit' && isSelected && m.polygon.map((p, idx) => (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r={6 / zoom}
                      fill="white"
                      stroke={m.cor}
                      strokeWidth={2 / zoom}
                      className="pointer-events-auto cursor-pointer"
                    />
                  ))}
                </g>
              );
            })}

            {/* Current Drawing Points */}
            {mode === 'draw' && currentPoints.length > 0 && (
              <g>
                <polyline
                  points={currentPoints.map(p => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                  stroke={currentColor}
                  strokeWidth={lineThickness / zoom}
                  strokeDasharray="5,5"
                />
                {currentPoints.map((p, idx) => (
                  <circle key={idx} cx={p.x} cy={p.y} r={4 / zoom} fill={currentColor} />
                ))}
                {hoverPoint && currentPoints.length > 0 && (
                  <line
                    x1={currentPoints[currentPoints.length - 1].x}
                    y1={currentPoints[currentPoints.length - 1].y}
                    x2={hoverPoint.x}
                    y2={hoverPoint.y}
                    stroke={currentColor}
                    strokeWidth={lineThickness / zoom}
                    strokeDasharray="5,5"
                    opacity={0.5}
                  />
                )}
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};

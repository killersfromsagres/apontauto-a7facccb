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
  Move,
  Trees,
  Ban
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
  const [draggedLabel, setDraggedLabel] = useState<{ marcacaoId: string, type: 'numero' | 'data' | 'icone' | 'icone_data' } | null>(null);
  const [currentColor, setCurrentColor] = useState('#f59e0b');
  const [statusDate, setStatusDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [statusText, setStatusText] = useState('Programado');
  const [prazoDate, setPrazoDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [statusType, setStatusType] = useState<'concluido' | 'execucao' | 'perimetro' | 'programado'>('programado');
  
  const STATUS_CONFIG = {
    concluido: { color: '#10b981', label: 'Concluído' },
    execucao: { color: '#f59e0b', label: 'Em Execução' },
    perimetro: { color: '#ef4444', label: 'Perímetro' },
    programado: { color: '#3b82f6', label: 'Programado' }
  };
  const [lineThickness, setLineThickness] = useState(4);
  const [numeroScale, setNumeroScale] = useState(1);
  const [dataScale, setDataScale] = useState(1);
  const [numeroVisivel, setNumeroVisivel] = useState(true);
  const [dataVisivel, setDataVisivel] = useState(true);
  const [iconeTipo, setIconeTipo] = useState<'arvore' | 'interdicao' | null>(null);
  const [iconeScale, setIconeScale] = useState(1);
  const [iconeVisivel, setIconeVisivel] = useState(true);
  const [iconeDataTexto, setIconeDataTexto] = useState<string>('');
  const [iconeDataScale, setIconeDataScale] = useState(1);
  const [iconeDataVisivel, setIconeDataVisivel] = useState(true);
  const [numeroEditavel, setNumeroEditavel] = useState<number>(0);
  
  const [localMarcacoes, setLocalMarcacoes] = useState<TaludeMarcacao[]>(initialMarcacoes);
  const [history, setHistory] = useState<HistoryState[]>([]);

  
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
      // Check for label hits - expand hit area significantly
      const labelHitRadius = 100 / zoom; 
      
      let closestLabel = null;
      let minDistance = Infinity;

      for (const m of localMarcacoes) {
        const centroid = getCentroid(m.polygon);
        const numPos = { x: m.numero_x ?? centroid.x, y: m.numero_y ?? centroid.y };
        const dataPos = { x: m.data_x ?? centroid.x, y: m.data_y ?? (centroid.y + 30) };
        const iconePos = { x: m.icone_x ?? centroid.x, y: m.icone_y ?? (centroid.y - 30) };
        const iconeDataPos = { x: m.icone_data_x ?? centroid.x, y: m.icone_data_y ?? (centroid.y + 60) };

        const dNum = getDistance(coords, numPos);
        const dData = getDistance(coords, dataPos);
        const dIcone = getDistance(coords, iconePos);
        const dIconeData = getDistance(coords, iconeDataPos);

        // Adjust hit radius based on current scale to make sure big labels are easy to grab
        const currentNumScale = m.numero_scale || 1;
        const currentDataScale = m.data_scale || 1;
        const currentIconeScale = m.icone_scale || 1;
        const currentIconeDataScale = m.icone_data_scale || 1;
        const numHitRadius = (25 * currentNumScale) / zoom;
        const dataHitRadius = (60 * currentDataScale) / zoom;
        const iconeHitRadius = (40 * currentIconeScale) / zoom;
        const iconeDataHitRadius = (60 * currentIconeDataScale) / zoom;

        if (dNum < numHitRadius && dNum < minDistance) {
          minDistance = dNum;
          closestLabel = { id: m.id, type: 'numero' as const };
        }
        if (dData < dataHitRadius && dData < minDistance) {
          minDistance = dData;
          closestLabel = { id: m.id, type: 'data' as const };
        }
        if (m.icone_tipo && dIcone < iconeHitRadius && dIcone < minDistance) {
          minDistance = dIcone;
          closestLabel = { id: m.id, type: 'icone' as const };
        }
        if (m.icone_tipo && dIconeData < iconeDataHitRadius && dIconeData < minDistance) {
          minDistance = dIconeData;
          closestLabel = { id: m.id, type: 'icone_data' as const };
        }
      }

      if (closestLabel) {
        setDraggedLabel({ marcacaoId: closestLabel.id, type: closestLabel.type });
        setSelectedMarcacaoId(closestLabel.id);
        isPanning.current = false;
        return;
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
          } else if (draggedLabel.type === 'data') {
            return { ...m, data_x: coords.x, data_y: coords.y };
          } else if (draggedLabel.type === 'icone') {
            return { ...m, icone_x: coords.x, icone_y: coords.y };
          } else if (draggedLabel.type === 'icone_data') {
            return { ...m, icone_data_x: coords.x, icone_data_y: coords.y };
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
    
    // Check for label hits first to avoid losing selection when clicking labels
    const labelHitRadius = 60 / zoom;
    for (const m of localMarcacoes) {
      const centroid = getCentroid(m.polygon);
      const numPos = { x: m.numero_x ?? centroid.x, y: m.numero_y ?? centroid.y };
      const dataPos = { x: m.data_x ?? centroid.x, y: m.data_y ?? (centroid.y + 30) };
      const iconePos = { x: m.icone_x ?? centroid.x, y: m.icone_y ?? (centroid.y - 30) };

      if (getDistance(coords, numPos) < labelHitRadius || getDistance(coords, dataPos) < labelHitRadius || (m.icone_tipo && getDistance(coords, iconePos) < labelHitRadius)) {
        setSelectedMarcacaoId(m.id);
        setCurrentColor(m.cor);
        setLineThickness(m.espessura_linha || 4);
        setNumeroScale(m.numero_scale || 1);
        setNumeroEditavel(m.numero || 0);
        setDataScale(m.data_scale || 1);
        setNumeroVisivel(m.numero_visivel !== false);
        setDataVisivel(m.data_visivel !== false);
        setIconeTipo(m.icone_tipo || null);
        setIconeScale(m.icone_scale || 1);
        setIconeVisivel(m.icone_visivel !== false);
        setIconeDataTexto(m.icone_data_texto || '');
        setIconeDataScale(m.icone_data_scale || 1);
        setIconeDataVisivel(m.icone_data_visivel !== false);
        setStatusDate(m.rotulo?.split(' - ')[1] || new Date().toISOString().split('T')[0]);
        setPrazoDate(m.prazo_rotulo || new Date().toISOString().split('T')[0]);
        const fullRotulo = m.rotulo || '';
        const foundStatus = Object.entries(STATUS_CONFIG).find(([_, cfg]) => fullRotulo.includes(cfg.label));
        setStatusType(foundStatus ? (foundStatus[0] as any) : 'programado');
        setStatusText(foundStatus ? foundStatus[1].label : 'Programado');
        return;
      }
    }

    for (const m of localMarcacoes) {
      if (isPointInPolygon(coords, m.polygon)) {
        setSelectedMarcacaoId(m.id);
        setCurrentColor(m.cor);
        setLineThickness(m.espessura_linha || 4);
        setNumeroScale(m.numero_scale || 1);
        setNumeroEditavel(m.numero || 0);
        setDataScale(m.data_scale || 1);
        setNumeroVisivel(m.numero_visivel !== false);
        setDataVisivel(m.data_visivel !== false);
        setIconeTipo(m.icone_tipo || null);
        setIconeScale(m.icone_scale || 1);
        setIconeVisivel(m.icone_visivel !== false);
        setIconeDataTexto(m.icone_data_texto || '');
        setIconeDataScale(m.icone_data_scale || 1);
        setIconeDataVisivel(m.icone_data_visivel !== false);
        setStatusDate(m.rotulo?.split(' - ')[1] || new Date().toISOString().split('T')[0]);
        setPrazoDate(m.prazo_rotulo || new Date().toISOString().split('T')[0]);
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
        if (dist < 30 / zoom) { // Increased hit radius for mobile/easy closing
          handleFinishDrawing();
          return;
        }
      }
      setCurrentPoints(prev => [...prev, coords]);
    } else {
      // If we clicked empty space and didn't hit any label, deselect
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
    if (currentPoints.length < 3) {
      toast.error("Desenhe pelo menos 3 pontos para criar uma área");
      return;
    }
    
    // Auto-calculate centroid if not provided to help with initial label placement
    const centroid = getCentroid(currentPoints);
    
    const newMarcacao: Partial<TaludeMarcacao> = {
      rotulo: `${STATUS_CONFIG[statusType].label} - ${statusDate}`,
      polygon: currentPoints,
      cor: STATUS_CONFIG[statusType].color,
      espessura_linha: lineThickness,
      numero_scale: numeroScale,
      data_scale: dataScale,
      numero_visivel: numeroVisivel,
      data_visivel: dataVisivel,
      icone_tipo: iconeTipo,
      icone_scale: iconeScale,
      icone_visivel: iconeVisivel,
      // Initialize label positions to centroid to avoid "missing" labels
      numero_x: centroid.x,
      numero_y: centroid.y,
      data_x: centroid.x,
      data_y: centroid.y + 30,
      icone_x: centroid.x,
      icone_y: centroid.y - 30,
      icone_data_x: centroid.x,
      icone_data_y: centroid.y + 60,
      icone_data_visivel: true,
      icone_data_texto: iconeTipo === 'arvore' ? iconeDataTexto : null
    };
    
    try {
      toast.loading("Salvando demarcação...");
      await onSave(newMarcacao);
      setCurrentPoints([]);
      setMode('view');
      toast.dismiss();
      toast.success("Área demarcada com sucesso");
    } catch (error) {
      toast.dismiss();
      console.error("Erro ao finalizar desenho:", error);
      toast.error("Erro ao salvar demarcação");
    }
  };


  const handleDelete = async (id: string) => {
    // Save state before deleting
    setHistory(prev => [...prev, { marcacoes: [...localMarcacoes] }].slice(-10));
    
    try {
      await onDelete(id);
      setSelectedMarcacaoId(null);
      toast.success("Demarcação excluída");
    } catch (error) {
      console.error("Erro ao excluir:", error);
      toast.error("Erro ao excluir demarcação");
      // Remove from history if failed to delete actually? 
      // Actually, onDelete should update the parent state which updates initialMarcacoes
    }
  };

  const handleUndo = async () => {
    if (history.length === 0) return;
    
    const lastState = history[history.length - 1];
    const newHistory = history.slice(0, -1);
    
    // Find what was deleted
    const currentIds = new Set(localMarcacoes.map(m => m.id));
    const deleted = lastState.marcacoes.filter(m => !currentIds.has(m.id));
    
    if (deleted.length > 0) {
      toast.loading("Restaurando demarcação...");
      try {
        for (const m of deleted) {
          const { id, ...rest } = m;
          await onSave(rest);
        }
        setHistory(newHistory);
        toast.dismiss();
        toast.success("Demarcação restaurada");
      } catch (error) {
        toast.dismiss();
        console.error("Erro ao restaurar:", error);
        toast.error("Erro ao restaurar demarcação");
      }
    }
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
        const iconePos = { x: m.icone_x ?? centroid.x, y: m.icone_y ?? (centroid.y - 30) };
        const iconeDataPos = { x: m.icone_data_x ?? centroid.x, y: m.icone_data_y ?? (centroid.y + 60) };

        // Draw Number Circle
        if (m.numero_visivel !== false) {
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
          ctx.font = `800 ${28 * (m.numero_scale || 1)}px "SF Pro Display", system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(m.numero), numPos.x, numPos.y);
        }

        // Draw Date Labels (Start/End)
        const rotuloParts = m.rotulo?.split(' - ') || [];
        const dateText = rotuloParts[1] || m.rotulo || '';
        const currentDataScale = m.data_scale || 1;
        
        // Brazilian format: DD/MM
        const formatDate = (dateStr: string) => {
          if (!dateStr || !dateStr.includes('-')) return dateStr;
          const [y, m, d] = dateStr.split('-');
          return `${d}/${m}`;
        };

        const displayDate = formatDate(dateText);
        const deadlineText = m.prazo_rotulo || '';
        const displayDeadline = formatDate(deadlineText);

        const baseFontSize = 24;
        const scaledFontSize = baseFontSize * currentDataScale;
        const rectWidth = 120 * currentDataScale;
        const rectHeight = 60 * currentDataScale;

        if (m.data_visivel !== false) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
          ctx.beginPath();
          ctx.roundRect(dataPos.x - rectWidth / 2, dataPos.y - rectHeight / 2, rectWidth, rectHeight, 8 * currentDataScale);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.stroke();

          ctx.fillStyle = 'white';
          ctx.font = `900 ${scaledFontSize}px "SF Pro Display", system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(displayDate, dataPos.x, dataPos.y - 12 * currentDataScale);
          
          ctx.fillText(displayDeadline || displayDate, dataPos.x, dataPos.y + 14 * currentDataScale);
        }

        // Draw Icons (Arvore / Interdicao)
        if (m.icone_tipo && m.icone_visivel !== false) {
          const currentIconeScale = m.icone_scale || 1;
          const iconSize = 40 * currentIconeScale;
          
          ctx.save();
          ctx.translate(iconePos.x, iconePos.y);
          
          // Icon Background Circle
          ctx.beginPath();
          ctx.arc(0, 0, iconSize / 2 + 10, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          ctx.fill();
          ctx.strokeStyle = m.cor;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Simplified SVG paths for icons (since we can't easily use Lucide components in Canvas context)
          ctx.fillStyle = m.cor;
          if (m.icone_tipo === 'arvore') {
            // Tree Shape
            ctx.beginPath();
            ctx.moveTo(0, -iconSize / 2);
            ctx.lineTo(iconSize / 3, -iconSize / 6);
            ctx.lineTo(iconSize / 6, -iconSize / 6);
            ctx.lineTo(iconSize / 2, iconSize / 6);
            ctx.lineTo(iconSize / 4, iconSize / 6);
            ctx.lineTo(iconSize / 2, iconSize / 2);
            ctx.lineTo(-iconSize / 2, iconSize / 2);
            ctx.lineTo(-iconSize / 4, iconSize / 6);
            ctx.lineTo(-iconSize / 2, iconSize / 6);
            ctx.lineTo(-iconSize / 6, -iconSize / 6);
            ctx.lineTo(-iconSize / 3, -iconSize / 6);
            ctx.closePath();
            ctx.fill();
            // Text for Eco+ Space
            ctx.fillStyle = 'white';
            ctx.font = `900 ${12 * currentIconeScale}px "Inter", sans-serif`;
            ctx.textAlign = 'center';
            ctx.strokeStyle = 'black';
            ctx.lineWidth = 2.5 * currentIconeScale;
            ctx.strokeText('ESPAÇO ECO+', 0, iconSize / 2 + 25);
            ctx.fillText('ESPAÇO ECO+', 0, iconSize / 2 + 25);
            
            // ICone Data
            if (m.icone_data_visivel !== false && m.icone_data_texto) {
              const currentIconeDataScale = m.icone_data_scale || 1;
              const scaledIconeDataFontSize = 24 * currentIconeDataScale;
              
              // We need to calculate position relative to translate(iconePos.x, iconePos.y)
              // Or better, restore and draw separately to avoid double scaling if needed
              // But for now let's draw relative
              ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
              const idRectW = 120 * currentIconeDataScale;
              const idRectH = 40 * currentIconeDataScale;
              const relX = iconeDataPos.x - iconePos.x;
              const relY = iconeDataPos.y - iconePos.y;

              ctx.beginPath();
              ctx.roundRect(relX - idRectW / 2, relY - idRectH / 2, idRectW, idRectH, 6 * currentIconeDataScale);
              ctx.fill();
              
              ctx.fillStyle = 'white';
              ctx.font = `900 ${scaledIconeDataFontSize}px "Inter", system-ui, sans-serif`;
              // Hidden by user request: ctx.fillText(m.icone_data_texto, relX, relY + 2);
            }
          } else if (m.icone_tipo === 'interdicao') {
            // Prohibition Sign
            ctx.strokeStyle = '#ef4444'; // Red for prohibition
            ctx.lineWidth = 4 * currentIconeScale;
            ctx.beginPath();
            ctx.arc(0, 0, iconSize / 2, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-iconSize / 2.5, -iconSize / 2.5);
            ctx.lineTo(iconSize / 2.5, iconSize / 2.5);
            ctx.stroke();
          }
          
          ctx.restore();
        }
      });

      // 3. Draw Legend (Bottom-Left)
      const legendX = 20;
      const legendY = imageHeight - 240;
      const legendWidth = 240;
      const legendHeight = 220;

      // Legend Background
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.beginPath();
      ctx.roundRect(legendX, legendY, legendWidth, legendHeight, 12);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Legend Title
      ctx.fillStyle = 'white';
      ctx.font = 'bold 16px "SF Pro Display", system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('LEGENDA STATUS', legendX + 20, legendY + 15);

      // Legend Items
      let currentY = legendY + 50;
      Object.entries(STATUS_CONFIG).forEach(([key, cfg]) => {
        // Color Box
        ctx.fillStyle = cfg.color;
        ctx.beginPath();
        ctx.roundRect(legendX + 20, currentY, 12, 12, 3);
        ctx.fill();

        // Label
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = '500 14px "SF Pro Display", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(cfg.label, legendX + 45, currentY + 6);

        currentY += 25;
      });

      // Add Icon Legends
      currentY += 10;
      
      // Tree Icon Legend
      ctx.fillStyle = 'white';
      ctx.font = '500 14px "SF Pro Display", system-ui, sans-serif';
      ctx.fillText('Espaço ECO+ (Árvore)', legendX + 45, currentY + 6);
      
      // Draw small tree
      ctx.fillStyle = '#10b981';
      ctx.beginPath();
      ctx.moveTo(legendX + 26, currentY);
      ctx.lineTo(legendX + 32, currentY + 12);
      ctx.lineTo(legendX + 20, currentY + 12);
      ctx.closePath();
      ctx.fill();
      
      currentY += 25;
      
      // Interdiction Icon Legend
      ctx.fillStyle = 'white';
      ctx.fillText('Área Interditada', legendX + 45, currentY + 6);
      
      // Draw small prohibition
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(legendX + 26, currentY + 6, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(legendX + 22, currentY + 2);
      ctx.lineTo(legendX + 30, currentY + 10);
      ctx.stroke();

      // 4. Trigger Download
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
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleUndo} 
            disabled={history.length === 0}
            className={cn(
              "h-9 w-9 transition-colors",
              history.length > 0 ? "text-amber-400 hover:bg-amber-400/10" : "text-white/20 opacity-50"
            )} 
            title="Desfazer Exclusão"
          >
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.min(z * 1.25, 20))} className="h-9 w-9"><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => setZoom(z => Math.max(z / 1.25, 0.05))} className="h-9 w-9"><ZoomOut className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={fitToView} className="h-9 w-9" title="Resetar Visualização"><Maximize className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={handleExport} className="h-9 w-9 text-emerald-400" title="Exportar Mapa"><Download className="h-4 w-4" /></Button>

        </div>

        {selectedMarcacaoId && (
          <div className="bg-black/90 p-3 rounded-xl backdrop-blur-xl border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.5)] flex flex-col gap-3 min-w-[240px] animate-in slide-in-from-left-2 overflow-y-auto max-h-[80vh]">
            <div className="flex justify-between items-center border-b border-white/10 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400">Configurar Legenda</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/10" onClick={() => setSelectedMarcacaoId(null)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-[10px] text-white/70 uppercase font-bold">Numeração do Talude</span>
                <input 
                  type="number"
                  value={numeroEditavel}
                  onChange={(e) => {
                    const val = parseInt(e.target.value) || 0;
                    setNumeroEditavel(val);
                    setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, numero: val } : m));
                  }}
                  onBlur={() => {
                    const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                    if (target) onSave({ ...target, numero: numeroEditavel });
                  }}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-white focus:outline-none focus:border-blue-500/50"
                />
              </div>

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
                <span className="text-[10px] text-white/70 uppercase">Data Prazo (Manual)</span>
                <div className="relative">
                  <Calendar className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-white/40" />
                  <input 
                    type="date" 
                    value={prazoDate}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setPrazoDate(newDate);
                      setLocalMarcacoes(prev => prev.map(m => 
                        m.id === selectedMarcacaoId 
                          ? { ...m, prazo_rotulo: newDate } 
                          : m
                      ));
                      const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                      if (target) onSave({ ...target, prazo_rotulo: newDate });
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
                  type="range" min="0.5" max="15" step="0.1" 

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
                  type="range" min="0.5" max="15" step="0.1" 
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

              <div className="space-y-3 pt-2 border-t border-white/5">
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-tight">Ícones Operacionais</span>
                <div className="grid grid-cols-2 gap-2">
                  <Button 
                    size="sm" 
                    variant={iconeTipo === 'arvore' ? "premium" : "outline"}
                    className={cn(
                      "flex-1 h-9 text-[10px] transition-all",
                      iconeTipo === 'arvore' ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : "border-white/5 bg-white/5"
                    )}
                    onClick={() => {
                      const newType = iconeTipo === 'arvore' ? null : 'arvore';
                      setIconeTipo(newType);
                      setIconeVisivel(true); // Auto-show icon when selected
                      setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, icone_tipo: newType, icone_visivel: true } : m));
                      const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                      if (target) {
                        onSave({ ...target, icone_tipo: newType, icone_visivel: true });
                        if (newType) toast.success("Ícone de Árvore ativado");
                        else toast.info("Ícone removido");
                      }
                    }}
                  >
                    <Trees className="h-3.5 w-3.5 mr-1.5" /> Árvore
                  </Button>
                  <Button 
                    size="sm" 
                    variant={iconeTipo === 'interdicao' ? "premium" : "outline"}
                    className={cn(
                      "flex-1 h-9 text-[10px] transition-all",
                      iconeTipo === 'interdicao' ? "bg-red-500/20 border-red-500 text-red-400" : "border-white/5 bg-white/5"
                    )}
                    onClick={() => {
                      const newType = iconeTipo === 'interdicao' ? null : 'interdicao';
                      setIconeTipo(newType);
                      setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, icone_tipo: newType } : m));
                      const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                      if (target) onSave({ ...target, icone_tipo: newType });
                      if (newType) toast.error("Alerta de Interdição ativado");
                    }}
                  >
                    <Ban className="h-3.5 w-3.5 mr-1.5" /> Interdição
                  </Button>
                </div>
              </div>

              {iconeTipo && (
                <div className="space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="text-white/60">Tamanho do Ícone</span>
                    <span className="text-amber-400 font-mono font-bold bg-amber-400/10 px-1.5 py-0.5 rounded">{(iconeScale).toFixed(1)}x</span>
                  </div>
                  <input 
                    type="range" min="0.5" max="15" step="0.1" 
                    value={iconeScale} 
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setIconeScale(val);
                      setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, icone_scale: val } : m));
                    }}
                    onMouseUp={() => {
                      const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                      if (target) onSave(target);
                    }}
                    className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-amber-500"
                  />
                  <Button 
                    size="sm" 
                    variant={iconeVisivel ? "premium" : "outline"} 
                    className={cn("w-full h-8 text-[10px] mt-1", !iconeVisivel && "opacity-50")}
                    onClick={() => {
                      const newVal = !iconeVisivel;
                      setIconeVisivel(newVal);
                      setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, icone_visivel: newVal } : m));
                      const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                      if (target) onSave({ ...target, icone_visivel: newVal });
                    }}
                  >
                    {iconeVisivel ? "Ocultar Ícone" : "Mostrar Ícone"}
                  </Button>

                  {iconeTipo === 'arvore' && (
                    <div className="space-y-3 pt-3 border-t border-white/5 mt-3 animate-in fade-in">
                      <div className="flex gap-2">
                        <Button 
                          size="icon" 
                          variant={iconeDataVisivel ? "premium" : "outline"} 
                          className="h-8 w-8"
                          onClick={() => {
                            const newVal = !iconeDataVisivel;
                            setIconeDataVisivel(newVal);
                            setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, icone_data_visivel: newVal } : m));
                            const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                            if (target) onSave({ ...target, icone_data_visivel: newVal });
                          }}
                        >
                          <Calendar className="h-3.5 w-3.5" />
                        </Button>
                        <div className="flex-1 flex items-center">
                          <span className="text-[10px] text-white/50 italic">Data oculta (conforme solicitado)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <Button 
                  size="sm" 
                  variant={numeroVisivel ? "premium" : "outline"} 
                  className={cn("h-8 text-[10px]", !numeroVisivel && "opacity-50")}
                  onClick={() => {
                    const newVal = !numeroVisivel;
                    setNumeroVisivel(newVal);
                    setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, numero_visivel: newVal } : m));
                    const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                    if (target) onSave({ ...target, numero_visivel: newVal });
                  }}
                >
                  {numeroVisivel ? "Ocultar Nº" : "Mostrar Nº"}
                </Button>
                <Button 
                  size="sm" 
                  variant={dataVisivel ? "premium" : "outline"} 
                  className={cn("h-8 text-[10px]", !dataVisivel && "opacity-50")}
                  onClick={() => {
                    const newVal = !dataVisivel;
                    setDataVisivel(newVal);
                    setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, data_visivel: newVal } : m));
                    const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                    if (target) onSave({ ...target, data_visivel: newVal });
                  }}
                >
                  {dataVisivel ? "Ocultar Data" : "Mostrar Data"}
                </Button>
              </div>

              <div className="flex gap-2">
                <Button 
                  size="sm" variant="outline" className="flex-1 h-8 text-[10px] border-white/5 bg-white/5"
                  onClick={() => {
                    setLocalMarcacoes(prev => prev.map(m => {
                      if (m.id === selectedMarcacaoId) {
                        return { ...m, numero_x: null, numero_y: null, data_x: null, data_y: null, icone_x: null, icone_y: null, icone_data_x: null, icone_data_y: null };
                      }
                      return m;
                    }));
                    const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                    if (target) onSave({ ...target, numero_x: null, numero_y: null, data_x: null, data_y: null, icone_x: null, icone_y: null, icone_data_x: null, icone_data_y: null });
                    toast.info("Legendas resetadas");
                  }}
                >
                  <Undo2 className="h-3 w-3 mr-1" /> Resetar
                </Button>
                <Button 
                  size="sm" variant="destructive" className="flex-1 h-8 text-[10px]"
                  onClick={() => {
                    if (selectedMarcacaoId) {
                      handleDelete(selectedMarcacaoId);
                    }
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Excluir Área
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-white/5">
                <Button 
                  size="sm" variant="outline" className="h-8 text-[10px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  onClick={() => {
                    setNumeroVisivel(false);
                    setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, numero_visivel: false } : m));
                    const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                    if (target) onSave({ ...target, numero_visivel: false });
                    toast.info("Numeração removida (oculta)");
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Excluir Nº
                </Button>
                <Button 
                  size="sm" variant="outline" className="h-8 text-[10px] border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                  onClick={() => {
                    setDataVisivel(false);
                    setLocalMarcacoes(prev => prev.map(m => m.id === selectedMarcacaoId ? { ...m, data_visivel: false } : m));
                    const target = localMarcacoes.find(m => m.id === selectedMarcacaoId);
                    if (target) onSave({ ...target, data_visivel: false });
                    toast.info("Data removida (oculta)");
                  }}
                >
                  <Trash2 className="h-3 w-3 mr-1" /> Excluir Data
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
              const iconePos = { x: m.icone_x ?? centroid.x, y: m.icone_y ?? (centroid.y - 30) };
              const iconeDataPos = { x: m.icone_data_x ?? centroid.x, y: m.icone_data_y ?? (centroid.y + 60) };
              const isSelected = selectedMarcacaoId === m.id;

              return (
                <g key={m.id} className={cn("transition-opacity duration-300", isSelected ? "opacity-100" : "opacity-90")}>
                  {/* Polygon Area */}
                  <polygon
                    points={m.polygon.map(p => `${p.x},${p.y}`).join(' ')}
                    fill={m.cor}
                    fillOpacity={m.icone_tipo === 'arvore' ? (isSelected ? 0.6 : 0.4) : (isSelected ? 0.4 : 0.25)}
                    stroke={m.cor}
                    strokeWidth={(m.espessura_linha || 4) / zoom}
                    className="pointer-events-auto cursor-pointer"
                  />

                  {/* Manual Labels */}
                  <g className={cn(mode === 'move' ? "pointer-events-auto cursor-move" : "pointer-events-none")}>
                    {/* Invisible hit areas for easier dragging */}
                    {mode === 'move' && (
                      <g className="pointer-events-auto cursor-move">
                        <circle 
                          cx={numPos.x} 
                          cy={numPos.y} 
                          r={100 / zoom} 
                          fill="transparent" 
                        />
                        <circle 
                          cx={dataPos.x} 
                          cy={dataPos.y} 
                          r={100 / zoom} 
                          fill="transparent" 
                        />
                        {m.icone_tipo && (
                          <circle 
                            cx={iconePos.x} 
                            cy={iconePos.y} 
                            r={100 / zoom} 
                            fill="transparent" 
                          />
                        )}
                        {m.icone_tipo && (
                          <circle 
                            cx={iconeDataPos.x} 
                            cy={iconeDataPos.y} 
                            r={100 / zoom} 
                            fill="transparent" 
                          />
                        )}
                      </g>
                    )}
                    {/* Slope Number */}
                    {m.numero_visivel !== false && (


                      <g>
                        <circle cx={numPos.x} cy={numPos.y} r={20 * (m.numero_scale || 1)} fill="rgba(0,0,0,0.7)" stroke={m.cor} strokeWidth={2} />
                        <text
                          x={numPos.x}
                          y={numPos.y}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fill="white"
                          fontSize={28 * (m.numero_scale || 1)}
                          fontWeight="900"
                          className="select-none font-['SF_Pro_Display']"
                          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.8)' }}
                        >
                          {m.numero}
                        </text>
                      </g>
                    )}

                    {/* Status Dates */}
                    {m.data_visivel !== false && (
                      <g transform={`translate(${dataPos.x}, ${dataPos.y}) scale(${m.data_scale || 1})`}>
                      {(() => {
                        const rotuloParts = m.rotulo?.split(' - ') || [];
                        const dateText = rotuloParts[1] || m.rotulo || '';
                        
                        const formatDate = (dateStr: string) => {
                          if (!dateStr || !dateStr.includes('-')) return dateStr;
                          const [y, mm, dd] = dateStr.split('-');
                          return `${dd}/${mm}`;
                        };

                        const displayDate = formatDate(dateText);
                        const deadlineText = m.prazo_rotulo || '';
                        const displayDeadline = formatDate(deadlineText);

                        const baseFontSize = 24;
                        const labelWidth = 120;
                        const labelHeight = 60;

                        return (
                          <g>
                            <rect 
                               x={-labelWidth / 2}
                               y={-labelHeight / 2} 
                               width={labelWidth} 
                               height={labelHeight} 
                               rx="8" 
                               fill="rgba(0,0,0,0.85)" 
                               stroke="rgba(255,255,255,0.15)" 
                               strokeWidth="1"
                               className="backdrop-blur-sm"
                             />
                             <text
                               x="0"
                               y="-12"
                               textAnchor="middle"
                               dominantBaseline="middle"
                               fill="white"
                               fontSize={baseFontSize}
                               fontWeight="900"
                               className="select-none font-['SF_Pro_Display'] tracking-tight"
                             >
                               {displayDate}
                             </text>
                             <text
                               x="0"
                               y="14"
                               textAnchor="middle"
                               dominantBaseline="middle"
                               fill="white"
                               fontSize={baseFontSize}
                               fontWeight="900"
                               className="select-none font-['SF_Pro_Display'] tracking-tight"
                             >
                               {displayDeadline || displayDate}
                             </text>
                          </g>
                        );
                      })()}
                    </g>
                    )}

                    {/* Icons (Arvore / Interdicao) */}
                    {m.icone_tipo && m.icone_visivel !== false && (
                      <g transform={`translate(${iconePos.x}, ${iconePos.y}) scale(${m.icone_scale || 1})`}>
                        <circle cx="0" cy="0" r="30" fill="rgba(0,0,0,0.7)" stroke={m.cor} strokeWidth="2" />
                        {m.icone_tipo === 'arvore' ? (
                          <g transform="translate(-15, -15)">
                            <Trees size={30} className="text-emerald-400 fill-emerald-500/30 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]" />
                            <text 
                              y="48" 
                              x="15" 
                              textAnchor="middle" 
                              fill="white" 
                              fontSize="11" 
                              fontWeight="900"
                              className="font-['Inter']"
                              style={{ 
                                stroke: 'black', 
                                strokeWidth: '1.2px', 
                                paintOrder: 'stroke',
                                textShadow: '0 1px 2px rgba(0,0,0,0.5)'
                              }}
                            >
                              ESPAÇO ECO+
                            </text>
                            
                            {/* Icon Date Label (SVG) - Hidden by user request */}
                            {false && m.icone_data_visivel !== false && (m.icone_data_texto || mode === 'move') && (
                              <g transform={`translate(${iconeDataPos.x - iconePos.x}, ${iconeDataPos.y - iconePos.y}) scale(${m.icone_data_scale || 1})`}>
                                <rect 
                                   x="-60"
                                   y="-20" 
                                   width="120" 
                                   height="40" 
                                   rx="6" 
                                   fill="rgba(0,0,0,0.85)" 
                                   stroke="rgba(255,255,255,0.15)" 
                                   strokeWidth="1"
                                 />
                                 <text
                                   x="0"
                                   y="2"
                                   textAnchor="middle"
                                   dominantBaseline="middle"
                                   fill="white"
                                   fontSize="24"
                                   fontWeight="900"
                                   className="select-none font-['Inter']"
                                 >
                                   {m.icone_data_texto}
                                 </text>
                              </g>
                            )}
                          </g>
                        ) : (
                          <g transform="translate(-15, -15)"><Ban size={30} className="text-white fill-current" /></g>
                        )}
                      </g>
                    )}
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
            {mode === 'draw' && (
              <g>
                {currentPoints.length > 0 && (
                  <>
                    <polyline
                      points={currentPoints.map(p => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke={currentColor}
                      strokeWidth={lineThickness / zoom}
                      strokeDasharray="5,5"
                    />
                    {currentPoints.map((p, idx) => (
                      <circle key={idx} cx={p.x} cy={p.y} r={6 / zoom} fill={currentColor} stroke="white" strokeWidth={1/zoom} />
                    ))}
                  </>
                )}
                
                {hoverPoint && currentPoints.length > 0 && (
                  <line
                    x1={currentPoints[currentPoints.length - 1].x}
                    y1={currentPoints[currentPoints.length - 1].y}
                    x2={hoverPoint.x}
                    y2={hoverPoint.y}
                    stroke={currentColor}
                    strokeWidth={lineThickness / zoom}
                    strokeDasharray="5,5"
                    opacity={0.8}
                  />
                )}
                
                {/* Visual feedback for the very first point to start drawing */}
                {hoverPoint && currentPoints.length === 0 && (
                  <circle cx={hoverPoint.x} cy={hoverPoint.y} r={6 / zoom} fill={currentColor} opacity={0.5} />
                )}
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};

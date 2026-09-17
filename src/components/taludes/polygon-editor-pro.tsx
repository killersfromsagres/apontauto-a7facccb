import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Focus,
  Layers3,
  Lock,
  MapPin,
  Maximize,
  Move,
  MousePointer2,
  Palette,
  PenTool,
  Plus,
  RotateCcw,
  Ruler,
  Settings2,
  Trash2,
  Trees,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Point, TaludeMarcacao } from "@/lib/taludes/api";
import { calculatePolygonArea, getCentroid, getDistance } from "@/lib/taludes/geometry";

interface PolygonEditorProProps {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  marcacoes: TaludeMarcacao[];
  onSave: (marcacao: Partial<TaludeMarcacao>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

type EditorMode = "view" | "draw" | "edit" | "move";
type LabelType = "numero" | "data" | "icone";

type StatusType = "concluido" | "execucao" | "perimetro" | "programado";

const STATUS_CONFIG: Record<StatusType, { color: string; label: string }> = {
  concluido: { color: "#10b981", label: "Concluído" },
  execucao: { color: "#f59e0b", label: "Em Execução" },
  perimetro: { color: "#ef4444", label: "Perímetro" },
  programado: { color: "#3b82f6", label: "Programado" },
};

const DATE_COLOR_STORAGE_KEY = "apontauto:taludes:date-colors";
const DEFAULT_NUMBER_BG = "#0f172a";
const DEFAULT_NUMBER_TEXT = "#ffffff";
const DEFAULT_DATE_BG = "#0f172a";
const DEFAULT_DATE_TEXT = "#ffffff";
const NUMBER_PRESETS = [
  ["#0f172a", "#ffffff"],
  ["#ffffff", "#0f172a"],
  ["#1d4ed8", "#ffffff"],
  ["#047857", "#ffffff"],
  ["#991b1b", "#ffffff"],
  ["#facc15", "#111827"],
] as const;

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) return `rgba(15,23,42,${alpha})`;
  const value = Number.parseInt(normalized, 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatShortDate(raw?: string | null) {
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[3]}/${iso[2]}` : raw;
}

function parseStatus(m?: TaludeMarcacao | null): StatusType {
  const label = m?.rotulo ?? "";
  const found = (Object.entries(STATUS_CONFIG) as Array<[StatusType, { color: string; label: string }]>).find(
    ([, config]) => label.includes(config.label),
  );
  return found?.[0] ?? "programado";
}

function statusDateFrom(m?: TaludeMarcacao | null) {
  const raw = m?.rotulo?.split(" - ")[1];
  return raw && /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : new Date().toISOString().slice(0, 10);
}

function perimeter(points: Point[]) {
  if (points.length < 2) return 0;
  return points.reduce((total, current, index) => {
    const next = points[(index + 1) % points.length];
    return total + getDistance(current, next);
  }, 0);
}

function pointInPolygon(point: Point, polygon: Point[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function AccordionSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-white/[0.035]">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/75 transition hover:bg-white/[0.04]"
      >
        <span className="text-cyan-300">{icon}</span>
        <span className="flex-1">{title}</span>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      </button>
      {open && <div className="space-y-3 border-t border-white/[0.06] p-3">{children}</div>}
    </section>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-white/45">{children}</span>;
}

export const PolygonEditorPro: React.FC<PolygonEditorProProps> = ({
  imageUrl,
  imageWidth,
  imageHeight,
  marcacoes,
  onSave,
  onDelete,
}) => {
  const [local, setLocal] = useState<TaludeMarcacao[]>(marcacoes);
  const [mode, setMode] = useState<EditorMode>("view");
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showLayers, setShowLayers] = useState(false);
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [hoverPoint, setHoverPoint] = useState<Point | null>(null);
  const [draggedPoint, setDraggedPoint] = useState<{ id: string; index: number } | null>(null);
  const [draggedLabel, setDraggedLabel] = useState<{ id: string; type: LabelType } | null>(null);

  const [statusType, setStatusType] = useState<StatusType>("programado");
  const [statusDate, setStatusDate] = useState(new Date().toISOString().slice(0, 10));
  const [prazoDate, setPrazoDate] = useState("");
  const [numero, setNumero] = useState(0);
  const [numeroBg, setNumeroBg] = useState(DEFAULT_NUMBER_BG);
  const [numeroText, setNumeroText] = useState(DEFAULT_NUMBER_TEXT);
  const [dateBg, setDateBg] = useState(DEFAULT_DATE_BG);
  const [dateText, setDateText] = useState(DEFAULT_DATE_TEXT);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const panningRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const frameRef = useRef<number | null>(null);

  useEffect(() => setLocal(marcacoes), [marcacoes]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(DATE_COLOR_STORAGE_KEY);
      if (!stored) return;
      const parsed = JSON.parse(stored) as { backgroundColor?: string; textColor?: string };
      if (/^#[0-9a-fA-F]{6}$/.test(parsed.backgroundColor ?? "")) setDateBg(parsed.backgroundColor!);
      if (/^#[0-9a-fA-F]{6}$/.test(parsed.textColor ?? "")) setDateText(parsed.textColor!);
    } catch {
      // preferência visual opcional
    }
  }, []);

  const selected = useMemo(() => local.find((m) => m.id === selectedId) ?? null, [local, selectedId]);
  const visibleMarcacoes = useMemo(() => local.filter((m) => m.visivel !== false), [local]);

  const metrics = useMemo(() => {
    if (!selected) return null;
    return {
      vertices: selected.polygon.length,
      area: calculatePolygonArea(selected.polygon),
      perimeter: perimeter(selected.polygon),
    };
  }, [selected]);

  const updateLocal = useCallback((id: string, patch: Partial<TaludeMarcacao>) => {
    setLocal((items) => items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const persistPatch = useCallback(
    async (id: string, patch: Partial<TaludeMarcacao>, successMessage?: string) => {
      const current = local.find((item) => item.id === id);
      if (!current) return;
      const next = { ...current, ...patch };
      updateLocal(id, patch);
      try {
        await onSave(next);
        if (successMessage) toast.success(successMessage);
      } catch (error) {
        console.error("[Taludes] Falha ao salvar alteração:", error);
        setLocal((items) => items.map((item) => (item.id === id ? current : item)));
        toast.error("Não foi possível salvar a alteração.");
      }
    },
    [local, onSave, updateLocal],
  );

  const selectMarcacao = useCallback((m: TaludeMarcacao) => {
    setSelectedId(m.id);
    setNumero(m.numero ?? 0);
    setNumeroBg(m.numero_cor_fundo || DEFAULT_NUMBER_BG);
    setNumeroText(m.numero_cor_texto || DEFAULT_NUMBER_TEXT);
    setStatusType(parseStatus(m));
    setStatusDate(statusDateFrom(m));
    setPrazoDate(m.prazo_rotulo ?? "");
  }, []);

  const fitToView = useCallback(() => {
    const container = containerRef.current;
    if (!container || !imageWidth || !imageHeight) return;
    const padding = 36;
    const fit = Math.min(
      (container.clientWidth - padding * 2) / imageWidth,
      (container.clientHeight - padding * 2) / imageHeight,
    );
    const nextZoom = Math.max(0.03, fit);
    setZoom(nextZoom);
    setOffset({
      x: (container.clientWidth - imageWidth * nextZoom) / 2,
      y: (container.clientHeight - imageHeight * nextZoom) / 2,
    });
  }, [imageHeight, imageWidth]);

  useEffect(() => {
    if (imageLoaded) fitToView();
  }, [fitToView, imageLoaded, imageUrl]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(() => {
      if (imageLoaded && mode === "view") requestAnimationFrame(fitToView);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [fitToView, imageLoaded, mode]);

  const mapCoords = useCallback(
    (event: React.MouseEvent | MouseEvent): Point => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (event.clientX - rect.left - offset.x) / zoom,
        y: (event.clientY - rect.top - offset.y) / zoom,
      };
    },
    [offset.x, offset.y, zoom],
  );

  const finishDrawing = useCallback(async () => {
    if (currentPoints.length < 3) {
      toast.error("Marque pelo menos 3 vértices para concluir a área.");
      return;
    }
    const centroid = getCentroid(currentPoints);
    const config = STATUS_CONFIG[statusType];
    try {
      await onSave({
        polygon: currentPoints,
        rotulo: `${config.label} - ${statusDate}`,
        prazo_rotulo: prazoDate || null,
        cor: config.color,
        opacidade: 0.28,
        visivel: true,
        bloqueado: false,
        espessura_linha: 4,
        numero_scale: 1,
        data_scale: 1,
        numero_visivel: true,
        data_visivel: true,
        numero_cor_fundo: numeroBg,
        numero_cor_texto: numeroText,
        numero_x: centroid.x,
        numero_y: centroid.y,
        data_x: centroid.x,
        data_y: centroid.y + 46,
      });
      setCurrentPoints([]);
      setHoverPoint(null);
      setMode("view");
      toast.success("Área demarcada com sucesso.");
    } catch (error) {
      console.error(error);
      toast.error("Erro ao salvar a demarcação.");
    }
  }, [currentPoints, numeroBg, numeroText, onSave, prazoDate, statusDate, statusType]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      if (event.key === "Escape") {
        if (mode === "draw" && currentPoints.length) {
          setCurrentPoints([]);
          setHoverPoint(null);
          setMode("view");
        } else {
          setSelectedId(null);
          setMode("view");
        }
      }
      if (mode === "draw" && event.key === "Enter" && currentPoints.length >= 3) {
        event.preventDefault();
        void finishDrawing();
      }
      if (mode === "draw" && (event.key === "Backspace" || event.key === "Delete") && currentPoints.length) {
        event.preventDefault();
        setCurrentPoints((points) => points.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentPoints.length, finishDrawing, mode]);

  const centerSelection = useCallback(() => {
    if (!selected || !containerRef.current) return;
    const centroid = getCentroid(selected.polygon);
    const box = containerRef.current.getBoundingClientRect();
    setOffset({ x: box.width / 2 - centroid.x * zoom, y: box.height / 2 - centroid.y * zoom });
  }, [selected, zoom]);

  const handleMouseDown = (event: React.MouseEvent) => {
    if (event.button === 1 || (mode === "view" && event.button === 0)) {
      panningRef.current = true;
      lastMouseRef.current = { x: event.clientX, y: event.clientY };
      return;
    }
    if (event.button !== 0) return;
    const point = mapCoords(event);
    const hit = 18 / zoom;

    if (mode === "edit") {
      for (const marking of visibleMarcacoes) {
        if (marking.bloqueado) continue;
        for (let index = 0; index < marking.polygon.length; index += 1) {
          if (getDistance(point, marking.polygon[index]) < hit) {
            selectMarcacao(marking);
            setDraggedPoint({ id: marking.id, index });
            return;
          }
        }
      }
    }

    if (mode === "move") {
      let best: { id: string; type: LabelType; distance: number } | null = null;
      for (const marking of visibleMarcacoes) {
        if (marking.bloqueado) continue;
        const centroid = getCentroid(marking.polygon);
        const positions: Array<[LabelType, Point, number]> = [
          ["numero", { x: marking.numero_x ?? centroid.x, y: marking.numero_y ?? centroid.y }, 38 * (marking.numero_scale || 1)],
          ["data", { x: marking.data_x ?? centroid.x, y: marking.data_y ?? centroid.y + 46 }, 80 * (marking.data_scale || 1)],
          ["icone", { x: marking.icone_x ?? centroid.x, y: marking.icone_y ?? centroid.y - 52 }, 54 * (marking.icone_scale || 1)],
        ];
        for (const [type, position, radius] of positions) {
          if (type === "icone" && !marking.icone_tipo) continue;
          const distance = getDistance(point, position);
          if (distance <= radius / zoom && (!best || distance < best.distance)) best = { id: marking.id, type, distance };
        }
      }
      if (best) {
        const marking = local.find((m) => m.id === best!.id);
        if (marking) selectMarcacao(marking);
        setDraggedLabel({ id: best.id, type: best.type });
      }
    }
  };

  const handleMouseMove = (event: React.MouseEvent) => {
    if (panningRef.current) {
      const dx = event.clientX - lastMouseRef.current.x;
      const dy = event.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: event.clientX, y: event.clientY };
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => setOffset((prev) => ({ x: prev.x + dx, y: prev.y + dy })));
      return;
    }

    if (mode !== "draw" && !draggedPoint && !draggedLabel) return;
    const point = mapCoords(event);
    if (mode === "draw") setHoverPoint(point);

    if (draggedPoint) {
      setLocal((items) =>
        items.map((item) => {
          if (item.id !== draggedPoint.id || item.bloqueado) return item;
          const polygon = [...item.polygon];
          polygon[draggedPoint.index] = point;
          return { ...item, polygon };
        }),
      );
    }
    if (draggedLabel) {
      setLocal((items) =>
        items.map((item) => {
          if (item.id !== draggedLabel.id || item.bloqueado) return item;
          if (draggedLabel.type === "numero") return { ...item, numero_x: point.x, numero_y: point.y };
          if (draggedLabel.type === "data") return { ...item, data_x: point.x, data_y: point.y };
          return { ...item, icone_x: point.x, icone_y: point.y };
        }),
      );
    }
  };

  const handleMouseUp = async () => {
    panningRef.current = false;
    const id = draggedPoint?.id ?? draggedLabel?.id;
    if (id) {
      const target = local.find((item) => item.id === id);
      if (target) {
        try {
          await onSave(target);
        } catch (error) {
          console.error(error);
          toast.error("Não foi possível salvar a nova posição.");
        }
      }
    }
    setDraggedPoint(null);
    setDraggedLabel(null);
  };

  const handleClick = (event: React.MouseEvent) => {
    if (event.button !== 0 || panningRef.current || draggedPoint || draggedLabel) return;
    const point = mapCoords(event);

    if (mode === "draw") {
      if (currentPoints.length >= 3 && getDistance(point, currentPoints[0]) < 26 / zoom) {
        void finishDrawing();
      } else {
        setCurrentPoints((points) => [...points, point]);
      }
      return;
    }

    for (const marking of [...visibleMarcacoes].reverse()) {
      if (pointInPolygon(point, marking.polygon)) {
        selectMarcacao(marking);
        return;
      }
    }
    if (mode === "view") setSelectedId(null);
  };

  const persistDateColors = (backgroundColor: string, textColor: string) => {
    setDateBg(backgroundColor);
    setDateText(textColor);
    try {
      localStorage.setItem(DATE_COLOR_STORAGE_KEY, JSON.stringify({ backgroundColor, textColor }));
    } catch {
      // preferência local não crítica
    }
  };

  const handleExport = async () => {
    if (!imageRef.current) return;
    const toastId = toast.loading("Gerando mapa em alta definição...");
    try {
      const scale = 1.5;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(imageWidth * scale);
      canvas.height = Math.round(imageHeight * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      ctx.scale(scale, scale);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(imageRef.current, 0, 0, imageWidth, imageHeight);

      for (const marking of visibleMarcacoes) {
        ctx.beginPath();
        marking.polygon.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
        ctx.closePath();
        ctx.fillStyle = hexToRgba(marking.cor, marking.opacidade ?? 0.28);
        ctx.fill();
        ctx.strokeStyle = marking.cor;
        ctx.lineWidth = marking.espessura_linha || 4;
        ctx.stroke();

        const centroid = getCentroid(marking.polygon);
        const numberPos = { x: marking.numero_x ?? centroid.x, y: marking.numero_y ?? centroid.y };
        const dataPos = { x: marking.data_x ?? centroid.x, y: marking.data_y ?? centroid.y + 46 };
        const iconPos = { x: marking.icone_x ?? centroid.x, y: marking.icone_y ?? centroid.y - 52 };

        if (marking.numero_visivel !== false) {
          const s = marking.numero_scale || 1;
          const text = String(marking.numero ?? "—");
          ctx.font = `800 ${25 * s}px Inter, Arial, sans-serif`;
          const width = Math.max(48 * s, ctx.measureText(text).width + 28 * s);
          const height = 42 * s;
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,.38)";
          ctx.shadowBlur = 10 * s;
          ctx.fillStyle = marking.numero_cor_fundo || DEFAULT_NUMBER_BG;
          ctx.beginPath();
          ctx.roundRect(numberPos.x - width / 2, numberPos.y - height / 2, width, height, 13 * s);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = hexToRgba(marking.cor, 0.9);
          ctx.lineWidth = 2 * s;
          ctx.stroke();
          ctx.fillStyle = marking.numero_cor_texto || DEFAULT_NUMBER_TEXT;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(text, numberPos.x, numberPos.y + 1 * s);
          ctx.restore();
        }

        if (marking.data_visivel !== false) {
          const s = marking.data_scale || 1;
          const currentDate = formatShortDate(marking.rotulo?.split(" - ")[1] || "");
          const deadline = formatShortDate(marking.prazo_rotulo);
          const width = 154 * s;
          const height = (deadline ? 76 : 52) * s;
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,.32)";
          ctx.shadowBlur = 9 * s;
          ctx.fillStyle = hexToRgba(dateBg, 0.9);
          ctx.beginPath();
          ctx.roundRect(dataPos.x - width / 2, dataPos.y - height / 2, width, height, 12 * s);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = hexToRgba(dateText, 0.25);
          ctx.lineWidth = 1.2 * s;
          ctx.stroke();
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillStyle = hexToRgba(dateText, 0.62);
          ctx.font = `700 ${10 * s}px Inter, Arial, sans-serif`;
          ctx.fillText("STATUS", dataPos.x - 62 * s, dataPos.y - (deadline ? 19 : 9) * s);
          ctx.fillStyle = dateText;
          ctx.font = `800 ${16 * s}px Inter, Arial, sans-serif`;
          ctx.fillText(currentDate || "—", dataPos.x - 6 * s, dataPos.y - (deadline ? 19 : 9) * s);
          if (deadline) {
            ctx.strokeStyle = hexToRgba(dateText, 0.12);
            ctx.beginPath();
            ctx.moveTo(dataPos.x - 62 * s, dataPos.y);
            ctx.lineTo(dataPos.x + 62 * s, dataPos.y);
            ctx.stroke();
            ctx.fillStyle = hexToRgba(dateText, 0.62);
            ctx.font = `700 ${10 * s}px Inter, Arial, sans-serif`;
            ctx.fillText("PRAZO", dataPos.x - 62 * s, dataPos.y + 19 * s);
            ctx.fillStyle = dateText;
            ctx.font = `800 ${16 * s}px Inter, Arial, sans-serif`;
            ctx.fillText(deadline, dataPos.x - 6 * s, dataPos.y + 19 * s);
          }
          ctx.restore();
        }

        if (marking.icone_tipo && marking.icone_visivel !== false) {
          const s = marking.icone_scale || 1;
          ctx.save();
          ctx.translate(iconPos.x, iconPos.y);
          ctx.shadowColor = "rgba(0,0,0,.35)";
          ctx.shadowBlur = 10 * s;
          ctx.fillStyle = marking.icone_tipo === "arvore" ? "rgba(6,78,59,.88)" : "rgba(127,29,29,.9)";
          ctx.beginPath();
          ctx.roundRect(-34 * s, -31 * s, 68 * s, 62 * s, 19 * s);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = marking.icone_tipo === "arvore" ? "#34d399" : "#f87171";
          ctx.lineWidth = 2 * s;
          ctx.stroke();
          if (marking.icone_tipo === "arvore") {
            ctx.fillStyle = "#6ee7b7";
            for (const [x, y, r] of [[-9, -6, 11], [6, -8, 13], [0, 5, 14]] as const) {
              ctx.beginPath();
              ctx.arc(x * s, y * s, r * s, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.fillStyle = "#ecfdf5";
            ctx.fillRect(-3 * s, 7 * s, 6 * s, 13 * s);
          } else {
            ctx.strokeStyle = "#fee2e2";
            ctx.lineWidth = 4 * s;
            ctx.beginPath();
            ctx.arc(0, 0, 15 * s, 0, Math.PI * 2);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(-10 * s, -10 * s);
            ctx.lineTo(10 * s, 10 * s);
            ctx.stroke();
          }
          ctx.fillStyle = "rgba(2,6,23,.9)";
          ctx.beginPath();
          ctx.roundRect(-57 * s, 35 * s, 114 * s, 24 * s, 9 * s);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = `800 ${10 * s}px Inter, Arial, sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(marking.icone_tipo === "arvore" ? "RESERVA SUVINIL" : "INTERDIÇÃO", 0, 47 * s);
          ctx.restore();
        }
      }

      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Falha ao gerar PNG"))), "image/png", 1),
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `Mapa-Taludes-${new Date().toISOString().slice(0, 10)}.png`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("Mapa exportado em alta definição.", { id: toastId });
    } catch (error) {
      console.error(error);
      toast.error("Não foi possível exportar o mapa.", { id: toastId });
    }
  };

  const cursorClass =
    mode === "draw"
      ? "cursor-crosshair"
      : panningRef.current
        ? "cursor-grabbing"
        : mode === "view"
          ? "cursor-grab"
          : mode === "move"
            ? "cursor-move"
            : "cursor-default";

  return (
    <div className="relative flex h-full min-h-[520px] w-full overflow-hidden bg-[#07101d]">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex flex-wrap items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex flex-wrap items-center gap-1 rounded-2xl border border-white/10 bg-slate-950/85 p-1.5 shadow-2xl backdrop-blur-xl">
          {([
            ["view", MousePointer2, "Navegar"],
            ["draw", Plus, "Demarcar"],
            ["edit", PenTool, "Editar vértices"],
            ["move", Move, "Mover etiquetas"],
          ] as const).map(([value, Icon, label]) => (
            <Button
              key={value}
              type="button"
              variant={mode === value ? "premium" : "ghost"}
              size="sm"
              title={label}
              onClick={() => {
                setMode(value);
                if (value !== "draw") {
                  setCurrentPoints([]);
                  setHoverPoint(null);
                }
              }}
              className="h-9 gap-1.5 px-2.5 text-[10px]"
            >
              <Icon className="h-4 w-4" />
              <span className="hidden xl:inline">{label}</span>
            </Button>
          ))}
          <span className="mx-1 h-6 w-px bg-white/10" />
          <Button variant="ghost" size="icon-sm" title="Zoom +" onClick={() => setZoom((value) => Math.min(value * 1.2, 20))}><ZoomIn /></Button>
          <Button variant="ghost" size="icon-sm" title="Zoom −" onClick={() => setZoom((value) => Math.max(value / 1.2, 0.03))}><ZoomOut /></Button>
          <Button variant="ghost" size="icon-sm" title="Enquadrar mapa" onClick={fitToView}><Maximize /></Button>
          <Button variant="ghost" size="icon-sm" title="Centralizar seleção" disabled={!selected} onClick={centerSelection}><Focus /></Button>
          <span className="mx-1 h-6 w-px bg-white/10" />
          <Button
            variant={showLayers ? "soft" : "ghost"}
            size="sm"
            className="h-9 gap-1.5 px-2.5 text-[10px]"
            onClick={() => setShowLayers((value) => !value)}
            title="Camadas"
          >
            <Layers3 className="h-4 w-4" /> Camadas
          </Button>
          <Button variant="ghost" size="icon-sm" title="Exportar PNG HD" className="text-emerald-300" onClick={() => void handleExport()}><Download /></Button>
        </div>

        <div className="pointer-events-auto rounded-xl border border-white/10 bg-slate-950/75 px-3 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-white/45 backdrop-blur-xl">
          Zoom {Math.round(zoom * 100)}% · {visibleMarcacoes.length}/{local.length} visíveis
        </div>
      </div>

      {showLayers && (
        <div className="absolute left-3 top-16 z-50 max-h-[56vh] w-[300px] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-extrabold text-white">Camadas</p>
              <p className="text-[9px] text-white/40">Visibilidade e proteção das áreas</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setShowLayers(false)}><X /></Button>
          </div>
          <div className="space-y-1.5">
            {local.map((marking) => (
              <div
                key={marking.id}
                className={cn(
                  "flex items-center gap-2 rounded-xl border p-2 transition",
                  selectedId === marking.id ? "border-cyan-400/30 bg-cyan-400/[0.07]" : "border-white/[0.06] bg-white/[0.025]",
                )}
              >
                <button type="button" onClick={() => selectMarcacao(marking)} className="min-w-0 flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <span className="grid h-7 min-w-7 place-items-center rounded-lg border border-white/10 bg-black/30 px-1.5 text-[10px] font-black" style={{ color: marking.numero_cor_texto || "#fff", backgroundColor: marking.numero_cor_fundo || DEFAULT_NUMBER_BG }}>
                      {marking.numero ?? "—"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[10px] font-bold text-white/85">{marking.nome || `Talude ${marking.numero ?? "—"}`}</p>
                      <p className="truncate text-[9px] text-white/35">{marking.rotulo || "Sem status"}</p>
                    </div>
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={marking.visivel === false ? "Mostrar" : "Ocultar"}
                  onClick={() => void persistPatch(marking.id, { visivel: marking.visivel === false })}
                >
                  {marking.visivel === false ? <EyeOff /> : <Eye />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={marking.bloqueado ? "Desbloquear" : "Bloquear"}
                  onClick={() => void persistPatch(marking.id, { bloqueado: !marking.bloqueado })}
                >
                  {marking.bloqueado ? <Lock className="text-amber-300" /> : <Unlock />}
                </Button>
              </div>
            ))}
            {!local.length && <p className="py-5 text-center text-[10px] text-white/35">Nenhuma demarcação.</p>}
          </div>
        </div>
      )}

      {selected && (
        <aside className="absolute bottom-3 right-3 top-16 z-50 w-[min(350px,calc(100%-24px))] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/95 p-3 shadow-2xl backdrop-blur-xl">
          <div className="mb-3 flex items-center justify-between border-b border-white/[0.06] pb-3">
            <div>
              <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-300">Editor de Talude</p>
              <p className="mt-0.5 text-sm font-extrabold text-white">Talude {selected.numero ?? "—"}</p>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={() => setSelectedId(null)}><X /></Button>
          </div>

          <div className="space-y-2">
            <AccordionSection title="Identificação" icon={<MapPin className="h-3.5 w-3.5" />} defaultOpen>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <FieldLabel>Número</FieldLabel>
                  <input
                    type="number"
                    value={numero}
                    onChange={(e) => {
                      const value = Number(e.target.value || 0);
                      setNumero(value);
                      updateLocal(selected.id, { numero: value });
                    }}
                    onBlur={() => void persistPatch(selected.id, { numero })}
                    className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 text-sm font-bold outline-none focus:border-cyan-400/40"
                  />
                </div>
                <div className="space-y-1.5">
                  <FieldLabel>Proteção</FieldLabel>
                  <Button
                    type="button"
                    variant={selected.bloqueado ? "warning" : "outline"}
                    size="sm"
                    className="h-9 w-full gap-1.5 text-[10px]"
                    onClick={() => void persistPatch(selected.id, { bloqueado: !selected.bloqueado }, selected.bloqueado ? "Área desbloqueada" : "Área bloqueada")}
                  >
                    {selected.bloqueado ? <Lock /> : <Unlock />} {selected.bloqueado ? "Bloqueada" : "Desbloqueada"}
                  </Button>
                </div>
              </div>
            </AccordionSection>

            <AccordionSection title="Status e datas" icon={<Calendar className="h-3.5 w-3.5" />} defaultOpen>
              <div className="grid grid-cols-2 gap-1.5">
                {(Object.entries(STATUS_CONFIG) as Array<[StatusType, { color: string; label: string }]>).map(([key, config]) => (
                  <button
                    key={key}
                    type="button"
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-[9px] font-bold transition",
                      statusType === key ? "border-white/20 bg-white/10 text-white" : "border-white/[0.06] bg-white/[0.02] text-white/50 hover:bg-white/[0.05]",
                    )}
                    onClick={() => {
                      setStatusType(key);
                      void persistPatch(selected.id, { cor: config.color, rotulo: `${config.label} - ${statusDate}` });
                    }}
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: config.color }} /> {config.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1.5"><FieldLabel>Data do status</FieldLabel><input type="date" value={statusDate} onChange={(e) => { setStatusDate(e.target.value); void persistPatch(selected.id, { rotulo: `${STATUS_CONFIG[statusType].label} - ${e.target.value}` }); }} className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[10px] outline-none" /></label>
                <label className="space-y-1.5"><FieldLabel>Prazo</FieldLabel><input type="date" value={prazoDate} onChange={(e) => { setPrazoDate(e.target.value); void persistPatch(selected.id, { prazo_rotulo: e.target.value || null }); }} className="h-9 w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 text-[10px] outline-none" /></label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1"><FieldLabel>Fundo das datas</FieldLabel><input type="color" value={dateBg} onChange={(e) => persistDateColors(e.target.value, dateText)} className="h-8 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5" /></label>
                <label className="space-y-1"><FieldLabel>Texto das datas</FieldLabel><input type="color" value={dateText} onChange={(e) => persistDateColors(dateBg, e.target.value)} className="h-8 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5" /></label>
              </div>
            </AccordionSection>

            <AccordionSection title="Aparência" icon={<Palette className="h-3.5 w-3.5" />}>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><FieldLabel>Opacidade</FieldLabel><span className="text-[9px] font-mono text-cyan-300">{Math.round((selected.opacidade ?? 0.28) * 100)}%</span></div>
                <input type="range" min="0.05" max="0.8" step="0.05" value={selected.opacidade ?? 0.28} onChange={(e) => updateLocal(selected.id, { opacidade: Number(e.target.value) })} onMouseUp={() => void persistPatch(selected.id, { opacidade: local.find((m) => m.id === selected.id)?.opacidade ?? 0.28 })} className="w-full accent-cyan-400" />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between"><FieldLabel>Espessura da linha</FieldLabel><span className="text-[9px] font-mono text-cyan-300">{selected.espessura_linha || 4}px</span></div>
                <input type="range" min="1" max="12" step="1" value={selected.espessura_linha || 4} onChange={(e) => updateLocal(selected.id, { espessura_linha: Number(e.target.value) })} onMouseUp={() => void persistPatch(selected.id, { espessura_linha: local.find((m) => m.id === selected.id)?.espessura_linha || 4 })} className="w-full accent-cyan-400" />
              </div>
              <Button size="sm" variant="outline" className="w-full gap-2 text-[10px]" onClick={() => void persistPatch(selected.id, { visivel: selected.visivel === false })}>{selected.visivel === false ? <EyeOff /> : <Eye />} {selected.visivel === false ? "Mostrar área" : "Ocultar área"}</Button>
            </AccordionSection>

            <AccordionSection title="Numeração" icon={<Settings2 className="h-3.5 w-3.5" />} defaultOpen>
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/20 p-2.5">
                <div><FieldLabel>Prévia</FieldLabel><p className="mt-1 text-[9px] text-white/35">Campo e texto salvos por talude</p></div>
                <div className="min-w-12 rounded-xl border px-3 py-2 text-center text-sm font-black shadow-lg" style={{ backgroundColor: numeroBg, color: numeroText, borderColor: hexToRgba(selected.cor, 0.75) }}>{numero || selected.numero || "—"}</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1"><FieldLabel>Cor do campo</FieldLabel><input type="color" value={numeroBg} onChange={(e) => { setNumeroBg(e.target.value); updateLocal(selected.id, { numero_cor_fundo: e.target.value }); }} onBlur={() => void persistPatch(selected.id, { numero_cor_fundo: numeroBg })} className="h-9 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5" /></label>
                <label className="space-y-1"><FieldLabel>Cor do texto</FieldLabel><input type="color" value={numeroText} onChange={(e) => { setNumeroText(e.target.value); updateLocal(selected.id, { numero_cor_texto: e.target.value }); }} onBlur={() => void persistPatch(selected.id, { numero_cor_texto: numeroText })} className="h-9 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent p-0.5" /></label>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {NUMBER_PRESETS.map(([bg, text]) => <button key={`${bg}-${text}`} type="button" title={`${bg} / ${text}`} onClick={() => { setNumeroBg(bg); setNumeroText(text); void persistPatch(selected.id, { numero_cor_fundo: bg, numero_cor_texto: text }); }} className="h-7 w-7 rounded-lg border border-white/15 shadow-inner" style={{ backgroundColor: bg }}><span className="text-[9px] font-black" style={{ color: text }}>Nº</span></button>)}
                <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[9px]" onClick={() => { setNumeroBg(DEFAULT_NUMBER_BG); setNumeroText(DEFAULT_NUMBER_TEXT); void persistPatch(selected.id, { numero_cor_fundo: DEFAULT_NUMBER_BG, numero_cor_texto: DEFAULT_NUMBER_TEXT }); }}><RotateCcw className="h-3 w-3" /> Padrão</Button>
              </div>
              <div className="space-y-1.5"><div className="flex justify-between"><FieldLabel>Escala</FieldLabel><span className="text-[9px] font-mono text-cyan-300">{(selected.numero_scale || 1).toFixed(1)}x</span></div><input type="range" min="0.5" max="5" step="0.1" value={selected.numero_scale || 1} onChange={(e) => updateLocal(selected.id, { numero_scale: Number(e.target.value) })} onMouseUp={() => void persistPatch(selected.id, { numero_scale: local.find((m) => m.id === selected.id)?.numero_scale || 1 })} className="w-full accent-cyan-400" /></div>
              <Button variant="outline" size="sm" className="w-full text-[10px]" onClick={() => void persistPatch(selected.id, { numero_visivel: selected.numero_visivel === false })}>{selected.numero_visivel === false ? "Mostrar número" : "Ocultar número"}</Button>
            </AccordionSection>

            <AccordionSection title="Símbolos" icon={<Trees className="h-3.5 w-3.5" />}>
              <div className="grid grid-cols-2 gap-2">
                <Button variant={selected.icone_tipo === "arvore" ? "success" : "outline"} size="sm" className="gap-1 text-[9px]" onClick={() => void persistPatch(selected.id, { icone_tipo: selected.icone_tipo === "arvore" ? null : "arvore", icone_visivel: true })}><Trees /> Reserva</Button>
                <Button variant={selected.icone_tipo === "interdicao" ? "destructive" : "outline"} size="sm" className="gap-1 text-[9px]" onClick={() => void persistPatch(selected.id, { icone_tipo: selected.icone_tipo === "interdicao" ? null : "interdicao", icone_visivel: true })}><Ban /> Interdição</Button>
              </div>
              {selected.icone_tipo && <div className="space-y-1.5"><div className="flex justify-between"><FieldLabel>Tamanho do símbolo</FieldLabel><span className="text-[9px] font-mono text-cyan-300">{(selected.icone_scale || 1).toFixed(1)}x</span></div><input type="range" min="0.5" max="5" step="0.1" value={selected.icone_scale || 1} onChange={(e) => updateLocal(selected.id, { icone_scale: Number(e.target.value) })} onMouseUp={() => void persistPatch(selected.id, { icone_scale: local.find((m) => m.id === selected.id)?.icone_scale || 1 })} className="w-full accent-cyan-400" /></div>}
            </AccordionSection>

            <AccordionSection title="Geometria" icon={<Ruler className="h-3.5 w-3.5" />}>
              <div className="grid grid-cols-3 gap-2">
                {[['Vértices', metrics?.vertices ?? 0], ['Área', `${Math.round(metrics?.area ?? 0).toLocaleString('pt-BR')} px²`], ['Perímetro', `${Math.round(metrics?.perimeter ?? 0).toLocaleString('pt-BR')} px`]].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-white/[0.06] bg-black/20 p-2 text-center"><p className="text-[8px] font-bold uppercase text-white/35">{label}</p><p className="mt-1 text-[10px] font-black text-white/80">{value}</p></div>)}
              </div>
              <p className="text-[9px] leading-relaxed text-white/35">Medidas no mapa, sem escala real. Não representam metros ou m².</p>
            </AccordionSection>

            <AccordionSection title="Ações" icon={<Settings2 className="h-3.5 w-3.5" />}>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" size="sm" className="gap-1 text-[9px]" onClick={centerSelection}><Focus /> Centralizar</Button>
                <Button variant="destructive" size="sm" className="gap-1 text-[9px]" onClick={() => { if (confirm(`Excluir o Talude ${selected.numero ?? ''}?`)) void onDelete(selected.id).then(() => setSelectedId(null)); }}><Trash2 /> Excluir</Button>
              </div>
            </AccordionSection>
          </div>
        </aside>
      )}

      {mode === "draw" && (
        <div className="pointer-events-auto absolute bottom-4 left-1/2 z-50 flex max-w-[calc(100%-24px)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border border-white/10 bg-slate-950/92 p-2 shadow-2xl backdrop-blur-xl">
          <div className="px-2 text-[9px] text-white/45"><span className="font-bold text-white/80">{currentPoints.length}</span> vértices · Enter finalizar · Esc cancelar · Backspace voltar</div>
          <Button size="sm" variant="success" disabled={currentPoints.length < 3} onClick={() => void finishDrawing()} className="h-8 gap-1 text-[9px]"><Check /> Finalizar área</Button>
          <Button size="sm" variant="outline" onClick={() => { setCurrentPoints([]); setHoverPoint(null); setMode("view"); }} className="h-8 gap-1 text-[9px]"><X /> Cancelar</Button>
        </div>
      )}

      <div
        ref={containerRef}
        className={cn("relative flex-1 overflow-hidden", cursorClass)}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={() => void handleMouseUp()}
        onMouseLeave={() => { panningRef.current = false; }}
        onClick={handleClick}
      >
        <div style={{ width: imageWidth, height: imageHeight, transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transformOrigin: "0 0", position: "absolute", inset: 0, willChange: "transform" }}>
          <img ref={imageRef} src={imageUrl} alt="Mapa de taludes" className="block select-none" draggable={false} crossOrigin="anonymous" onLoad={() => setImageLoaded(true)} style={{ width: imageWidth, height: imageHeight }} />
          <svg viewBox={`0 0 ${imageWidth} ${imageHeight}`} className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
            {visibleMarcacoes.map((marking) => {
              const centroid = getCentroid(marking.polygon);
              const numberPos = { x: marking.numero_x ?? centroid.x, y: marking.numero_y ?? centroid.y };
              const dataPos = { x: marking.data_x ?? centroid.x, y: marking.data_y ?? centroid.y + 46 };
              const iconPos = { x: marking.icone_x ?? centroid.x, y: marking.icone_y ?? centroid.y - 52 };
              const isSelected = selectedId === marking.id;
              const numberScale = marking.numero_scale || 1;
              const numberText = String(marking.numero ?? "—");
              const badgeWidth = Math.max(48, 28 + numberText.length * 17) * numberScale;
              const badgeHeight = 42 * numberScale;
              const statusDate = formatShortDate(marking.rotulo?.split(" - ")[1] || "");
              const deadline = formatShortDate(marking.prazo_rotulo);

              return (
                <g key={marking.id} opacity={isSelected ? 1 : 0.92}>
                  <polygon points={marking.polygon.map((point) => `${point.x},${point.y}`).join(" ")} fill={marking.cor} fillOpacity={isSelected ? Math.min(0.8, (marking.opacidade ?? 0.28) + 0.12) : marking.opacidade ?? 0.28} stroke={marking.cor} strokeWidth={(marking.espessura_linha || 4) / zoom} className="pointer-events-auto cursor-pointer" />

                  {marking.numero_visivel !== false && (
                    <g transform={`translate(${numberPos.x} ${numberPos.y})`}>
                      <rect x={-badgeWidth / 2} y={-badgeHeight / 2} width={badgeWidth} height={badgeHeight} rx={13 * numberScale} fill={marking.numero_cor_fundo || DEFAULT_NUMBER_BG} stroke={marking.cor} strokeWidth={2 * numberScale} className="drop-shadow-lg" />
                      <text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fill={marking.numero_cor_texto || DEFAULT_NUMBER_TEXT} fontSize={25 * numberScale} fontWeight="800" className="select-none font-['Inter']">{numberText}</text>
                    </g>
                  )}

                  {marking.data_visivel !== false && (
                    <g transform={`translate(${dataPos.x} ${dataPos.y}) scale(${marking.data_scale || 1})`}>
                      <rect x="-77" y={deadline ? -38 : -26} width="154" height={deadline ? 76 : 52} rx="12" fill={hexToRgba(dateBg, 0.9)} stroke={hexToRgba(dateText, 0.25)} strokeWidth="1.2" className="drop-shadow-lg" />
                      <text x="-63" y={deadline ? -17 : -5} fill={hexToRgba(dateText, 0.58)} fontSize="9" fontWeight="800">STATUS</text>
                      <text x="-6" y={deadline ? -17 : -5} fill={dateText} fontSize="16" fontWeight="900">{statusDate || "—"}</text>
                      {deadline && <><line x1="-63" x2="63" y1="0" y2="0" stroke={hexToRgba(dateText, 0.12)} /><text x="-63" y="22" fill={hexToRgba(dateText, 0.58)} fontSize="9" fontWeight="800">PRAZO</text><text x="-6" y="22" fill={dateText} fontSize="16" fontWeight="900">{deadline}</text></>}
                    </g>
                  )}

                  {marking.icone_tipo && marking.icone_visivel !== false && (
                    <g transform={`translate(${iconPos.x} ${iconPos.y}) scale(${marking.icone_scale || 1})`}>
                      <rect x="-34" y="-31" width="68" height="62" rx="19" fill={marking.icone_tipo === "arvore" ? "rgba(6,78,59,.9)" : "rgba(127,29,29,.9)"} stroke={marking.icone_tipo === "arvore" ? "#34d399" : "#f87171"} strokeWidth="2" className="drop-shadow-lg" />
                      {marking.icone_tipo === "arvore" ? <g fill="#6ee7b7"><circle cx="-9" cy="-6" r="11" /><circle cx="6" cy="-8" r="13" /><circle cx="0" cy="5" r="14" /><rect x="-3" y="7" width="6" height="13" rx="2" fill="#ecfdf5" /></g> : <g fill="none" stroke="#fee2e2" strokeWidth="4"><circle cx="0" cy="0" r="15" /><line x1="-10" y1="-10" x2="10" y2="10" /></g>}
                      <rect x="-57" y="35" width="114" height="24" rx="9" fill="rgba(2,6,23,.92)" stroke="rgba(255,255,255,.12)" />
                      <text x="0" y="47" textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="10" fontWeight="800">{marking.icone_tipo === "arvore" ? "RESERVA SUVINIL" : "INTERDIÇÃO"}</text>
                    </g>
                  )}

                  {mode === "edit" && isSelected && !marking.bloqueado && marking.polygon.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={6 / zoom} fill="#fff" stroke={marking.cor} strokeWidth={2 / zoom} className="pointer-events-auto cursor-move" />)}
                  {isSelected && marking.bloqueado && <g transform={`translate(${centroid.x} ${centroid.y - 38})`}><rect x="-29" y="-12" width="58" height="24" rx="9" fill="rgba(15,23,42,.9)" stroke="rgba(251,191,36,.55)" /><text x="0" y="1" textAnchor="middle" dominantBaseline="middle" fill="#fbbf24" fontSize="9" fontWeight="800">BLOQUEADO</text></g>}
                </g>
              );
            })}

            {mode === "draw" && currentPoints.length > 0 && (
              <g>
                <polyline points={currentPoints.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={STATUS_CONFIG[statusType].color} strokeWidth={4 / zoom} strokeDasharray={`${9 / zoom} ${6 / zoom}`} />
                {currentPoints.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={(index === 0 && currentPoints.length >= 3 ? 9 : 6) / zoom} fill={index === 0 && currentPoints.length >= 3 ? "#22c55e" : STATUS_CONFIG[statusType].color} stroke="#fff" strokeWidth={1.5 / zoom} />)}
                {hoverPoint && <line x1={currentPoints[currentPoints.length - 1].x} y1={currentPoints[currentPoints.length - 1].y} x2={hoverPoint.x} y2={hoverPoint.y} stroke={STATUS_CONFIG[statusType].color} strokeWidth={3 / zoom} strokeDasharray={`${8 / zoom} ${6 / zoom}`} opacity=".8" />}
              </g>
            )}
          </svg>
        </div>
      </div>
    </div>
  );
};

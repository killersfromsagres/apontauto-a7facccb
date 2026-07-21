// Enhancer de imagem para mapas de taludes:
//  1) Ajustes de qualidade (brilho, contraste, saturação, nitidez) via CSS filter.
//  2) Máscaras de cobertura para remover logos (Sherwin Williams, Grupo GPS, etc.)
//     — o usuário arrasta um retângulo sobre a logo e o sistema amostra a cor
//     da borda para preencher a área de forma homogênea com o fundo.
//
// Persistência: localStorage por mapId (não requer migração de banco).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sliders, Eraser, Trash2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export interface ImageAdjustments {
  brightness: number; // 0.5–1.5 (1 = neutro)
  contrast: number;   // 0.5–1.8
  saturation: number; // 0–2
  sharpness: number;  // 0–1 (mistura de contrast/saturate + filtro drop-shadow neutralizado)
}

export interface LogoMask {
  id: string;
  x: number; // 0–100
  y: number; // 0–100
  w: number; // 0–100
  h: number; // 0–100
  color: string; // rgb(...)
}

const DEFAULT_ADJ: ImageAdjustments = {
  brightness: 1.02,
  contrast: 1.1,
  saturation: 1.05,
  sharpness: 0.35,
};

const KEY_ADJ = (id: string) => `talude-img-adj-${id}`;
const KEY_MASKS = (id: string) => `talude-img-masks-${id}`;

export function useImageEnhancer(mapId: string | null) {
  const [adj, setAdj] = useState<ImageAdjustments>(DEFAULT_ADJ);
  const [masks, setMasks] = useState<LogoMask[]>([]);

  useEffect(() => {
    if (!mapId) {
      setAdj(DEFAULT_ADJ);
      setMasks([]);
      return;
    }
    try {
      const a = localStorage.getItem(KEY_ADJ(mapId));
      setAdj(a ? { ...DEFAULT_ADJ, ...JSON.parse(a) } : DEFAULT_ADJ);
    } catch { setAdj(DEFAULT_ADJ); }
    try {
      const m = localStorage.getItem(KEY_MASKS(mapId));
      setMasks(m ? JSON.parse(m) : []);
    } catch { setMasks([]); }
  }, [mapId]);

  const updateAdj = useCallback((patch: Partial<ImageAdjustments>) => {
    setAdj((cur) => {
      const next = { ...cur, ...patch };
      if (mapId) localStorage.setItem(KEY_ADJ(mapId), JSON.stringify(next));
      return next;
    });
  }, [mapId]);

  const resetAdj = useCallback(() => {
    setAdj(DEFAULT_ADJ);
    if (mapId) localStorage.removeItem(KEY_ADJ(mapId));
  }, [mapId]);

  const addMask = useCallback((m: LogoMask) => {
    setMasks((cur) => {
      const next = [...cur, m];
      if (mapId) localStorage.setItem(KEY_MASKS(mapId), JSON.stringify(next));
      return next;
    });
  }, [mapId]);

  const removeMask = useCallback((id: string) => {
    setMasks((cur) => {
      const next = cur.filter((m) => m.id !== id);
      if (mapId) localStorage.setItem(KEY_MASKS(mapId), JSON.stringify(next));
      return next;
    });
  }, [mapId]);

  const clearMasks = useCallback(() => {
    setMasks([]);
    if (mapId) localStorage.removeItem(KEY_MASKS(mapId));
  }, [mapId]);

  const filter = useMemo(() => {
    const sh = Math.max(0, Math.min(1, adj.sharpness));
    // "Nitidez" simulada por leve incremento adicional de contraste/saturação.
    const c = adj.contrast * (1 + sh * 0.15);
    const s = adj.saturation * (1 + sh * 0.1);
    return `brightness(${adj.brightness.toFixed(2)}) contrast(${c.toFixed(2)}) saturate(${s.toFixed(2)})`;
  }, [adj]);

  return { adj, updateAdj, resetAdj, masks, addMask, removeMask, clearMasks, filter };
}

// Amostra a cor média em uma faixa ao redor do retângulo (em %), usando a
// imagem original carregada num canvas offscreen. Fallback: cor neutra.
export async function sampleBorderColor(
  imageUrl: string,
  rect: { x: number; y: number; w: number; h: number },
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const cw = img.naturalWidth;
        const ch = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve("rgb(240,240,240)");
        ctx.drawImage(img, 0, 0);
        const px = Math.round((rect.x / 100) * cw);
        const py = Math.round((rect.y / 100) * ch);
        const pw = Math.max(2, Math.round((rect.w / 100) * cw));
        const ph = Math.max(2, Math.round((rect.h / 100) * ch));
        const pad = Math.max(4, Math.round(Math.min(pw, ph) * 0.2));
        const sx = Math.max(0, px - pad);
        const sy = Math.max(0, py - pad);
        const sw = Math.min(cw - sx, pw + pad * 2);
        const sh = Math.min(ch - sy, ph + pad * 2);
        const data = ctx.getImageData(sx, sy, sw, sh).data;
        let r = 0, g = 0, b = 0, n = 0;
        for (let y = 0; y < sh; y++) {
          for (let x = 0; x < sw; x++) {
            const inside =
              x >= pad && x < sw - pad && y >= pad && y < sh - pad;
            if (inside) continue;
            const i = (y * sw + x) * 4;
            r += data[i];
            g += data[i + 1];
            b += data[i + 2];
            n++;
          }
        }
        if (!n) return resolve("rgb(240,240,240)");
        resolve(`rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`);
      } catch {
        resolve("rgb(240,240,240)");
      }
    };
    img.onerror = () => resolve("rgb(240,240,240)");
    img.src = imageUrl;
  });
}

// Overlay que renderiza as máscaras posicionadas em %. Usa position absoluta
// para acompanhar a mesma transformação (zoom/pan) do container do mapa.
export function LogoMaskOverlay({
  masks,
  showHandles,
  onRemove,
}: {
  masks: LogoMask[];
  showHandles: boolean;
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0">
      {masks.map((m) => (
        <div
          key={m.id}
          className="absolute"
          style={{
            left: `${m.x}%`,
            top: `${m.y}%`,
            width: `${m.w}%`,
            height: `${m.h}%`,
            background: m.color,
            outline: showHandles ? "1px dashed rgba(59,130,246,0.9)" : undefined,
          }}
        >
          {showHandles && onRemove && (
            <button
              type="button"
              onClick={() => onRemove(m.id)}
              className="pointer-events-auto absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-white shadow"
              title="Remover cobertura"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// Popover de controles: sliders + toggles do modo de máscara.
export function ImageEnhancerControls({
  adj,
  updateAdj,
  resetAdj,
  maskMode,
  onToggleMaskMode,
  maskCount,
  onClearMasks,
}: {
  adj: ImageAdjustments;
  updateAdj: (patch: Partial<ImageAdjustments>) => void;
  resetAdj: () => void;
  maskMode: boolean;
  onToggleMaskMode: () => void;
  maskCount: number;
  onClearMasks: () => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant={maskMode ? "default" : "secondary"}
          className="pointer-events-auto h-8 w-8 shadow-lg"
          title="Ajustes de imagem e cobertura de logos"
        >
          <Sliders className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-3" align="end">
        <div className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Qualidade da imagem
        </div>
        <SliderRow
          label="Brilho"
          value={adj.brightness}
          min={0.6} max={1.5} step={0.02}
          onChange={(v) => updateAdj({ brightness: v })}
        />
        <SliderRow
          label="Contraste"
          value={adj.contrast}
          min={0.6} max={1.8} step={0.02}
          onChange={(v) => updateAdj({ contrast: v })}
        />
        <SliderRow
          label="Saturação"
          value={adj.saturation}
          min={0} max={2} step={0.05}
          onChange={(v) => updateAdj({ saturation: v })}
        />
        <SliderRow
          label="Nitidez"
          value={adj.sharpness}
          min={0} max={1} step={0.05}
          onChange={(v) => updateAdj({ sharpness: v })}
        />
        <div className="flex justify-end">
          <Button size="sm" variant="ghost" onClick={resetAdj}>
            Restaurar padrão
          </Button>
        </div>
        <div className="border-t pt-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Cobrir logos
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant={maskMode ? "default" : "outline"}
              onClick={onToggleMaskMode}
              className="flex-1"
            >
              {maskMode ? (
                <>
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Concluir
                </>
              ) : (
                <>
                  <Eraser className="mr-1 h-3.5 w-3.5" />
                  Marcar área
                </>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onClearMasks}
              disabled={maskCount === 0}
              title="Remover todas as coberturas"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            {maskMode
              ? "Arraste sobre a logo. O sistema preenche com a cor do fundo ao redor."
              : `${maskCount} cobertura(s) aplicada(s). Ative para adicionar novas.`}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function SliderRow({
  label, value, min, max, step, onChange,
}: {
  label: string;
  value: number;
  min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {value.toFixed(2)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min} max={max} step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

// Hook para desenho de retângulo de máscara. Retorna handlers para PointerDown
// no viewport, e o retângulo em progresso para renderização.
export function useMaskDraw(
  active: boolean,
  onCommit: (rect: { x: number; y: number; w: number; h: number }) => void,
) {
  const [drag, setDrag] = useState<null | { sx: number; sy: number; x: number; y: number; w: number; h: number }>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    setDrag({ sx: x, sy: y, x, y, w: 0, h: 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!active || !drag) return;
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    const nx = Math.min(drag.sx, x);
    const ny = Math.min(drag.sy, y);
    setDrag({ ...drag, x: nx, y: ny, w: Math.abs(x - drag.sx), h: Math.abs(y - drag.sy) });
  };
  const onPointerUp = () => {
    if (!drag) return;
    if (drag.w > 0.5 && drag.h > 0.5) {
      onCommit({ x: drag.x, y: drag.y, w: drag.w, h: drag.h });
    }
    setDrag(null);
  };

  return { containerRef, drag, onPointerDown, onPointerMove, onPointerUp };
}

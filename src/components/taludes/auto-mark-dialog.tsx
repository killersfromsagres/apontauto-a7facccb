import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Wand2, Sparkles, FileImage, Move } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  detectPolygonsFromImage,
  type DetectedRegion,
  type Pt,
} from "@/lib/taludes/auto-detect";

export interface AutoMarkDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  mapId: string | null;
  existingNumeros: number[];
  onApply: (regions: Array<{ numero: number; polygon: Pt[]; cor?: string | null }>) => Promise<void>;
}

type Align = { offX: number; offY: number; scaleX: number; scaleY: number };
const DEFAULT_ALIGN: Align = { offX: 0, offY: 0, scaleX: 100, scaleY: 100 };

function applyAlign(polygon: Pt[], a: Align): Pt[] {
  // Escala relativa ao centro (50,50), depois offset. Mantém pontos dentro de 0..100.
  return polygon.map((p) => {
    const sx = 50 + (p.x - 50) * (a.scaleX / 100);
    const sy = 50 + (p.y - 50) * (a.scaleY / 100);
    return {
      x: +Math.max(0, Math.min(100, sx + a.offX)).toFixed(3),
      y: +Math.max(0, Math.min(100, sy + a.offY)).toFixed(3),
    };
  });
}

export function AutoMarkDialog({
  open,
  onOpenChange,
  mapId,
  existingNumeros,
  onApply,
}: AutoMarkDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [regions, setRegions] = useState<DetectedRegion[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState(false);
  const [sensitivity, setSensitivity] = useState<number>(30);
  const [minArea, setMinArea] = useState<number>(0.08);
  const [simplify, setSimplify] = useState<number>(0.2);
  const [source, setSource] = useState<"image" | "psd">("image");
  const [align, setAlign] = useState<Align>(DEFAULT_ALIGN);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setRegions([]);
      setSelected(new Set());
      setBusy(false);
      setAlign(DEFAULT_ALIGN);
    }
  }, [open]);

  const runDetection = async (source?: File) => {
    const src = source ?? file;
    if (!src) return;
    setBusy(true);
    try {
      const isPsd = /\.psd$/i.test(src.name) || src.type === "image/vnd.adobe.photoshop";
      if (isPsd) {
        const { detectPolygonsFromPsd } = await import("@/lib/taludes/psd-detect");
        const result = await detectPolygonsFromPsd(src, {
          minAreaPct: minArea,
          simplifyPct: simplify,
        });
        setRegions(result.regions);
        setPreview(result.previewDataUrl);
        setSelected(new Set(result.regions.map((_, i) => i)));
        setSource("psd");
        if (result.regions.length === 0) {
          toast.warning("Nenhuma camada válida encontrada no PSD.");
        } else {
          toast.success(`${result.regions.length} camada(s) importada(s) do PSD`);
        }
      } else {
        const result = await detectPolygonsFromImage(src, {
          minSaturation: sensitivity / 100,
          minAreaPct: minArea,
          simplifyPct: simplify,
        });
        setRegions(result.regions);
        setPreview(result.previewDataUrl);
        setSelected(new Set(result.regions.map((_, i) => i)));
        setSource("image");
        if (result.regions.length === 0) {
          toast.warning(
            "Nenhuma área detectada — reduza a sensibilidade ou verifique a imagem.",
          );
        } else {
          toast.success(`${result.regions.length} área(s) identificada(s)`);
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha na detecção");
    } finally {
      setBusy(false);
    }
  };

  const nextNumbersFor = useMemo(() => {
    const used = new Set(existingNumeros);
    return (count: number) => {
      const nums: number[] = [];
      let n = 1;
      while (nums.length < count) {
        if (!used.has(n)) { nums.push(n); used.add(n); }
        n++;
      }
      return nums;
    };
  }, [existingNumeros]);

  const previewNumbers = useMemo(
    () => nextNumbersFor(regions.length),
    [nextNumbersFor, regions.length],
  );

  const alignedRegions = useMemo(
    () => regions.map((r) => ({ ...r, polygon: applyAlign(r.polygon, align) })),
    [regions, align],
  );

  const toggleRegion = (i: number) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i); else s.add(i);
      return s;
    });
  };

  const apply = async () => {
    if (!mapId) return;
    const chosen = alignedRegions
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => selected.has(i));
    if (chosen.length === 0) { toast.error("Selecione pelo menos uma área."); return; }
    const nums = nextNumbersFor(chosen.length);
    setApplying(true);
    try {
      await onApply(
        chosen.map(({ r }, k) => ({ numero: nums[k], polygon: r.polygon, cor: r.color })),
      );
      toast.success(`${chosen.length} talude(s) criados`);
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao aplicar no mapa");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[92vh] overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Auto‑marcar taludes (imagem ou PSD)
          </DialogTitle>
          <DialogDescription>
            Envie uma imagem anotada (PNG/JPG) — as áreas coloridas são separadas por matiz para
            evitar fusão entre taludes vizinhos — ou um <strong>PSD com uma camada por talude</strong>:
            neste caso o contorno vem direto da camada, sem depender das cores.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          <div className="rounded-xl border border-border/60 bg-muted/20 p-2">
            {preview ? (
              <div className="relative w-full overflow-hidden rounded-lg bg-black/40">
                <img src={preview} alt="preview" className="block h-auto w-full" />
                <svg
                  ref={svgRef}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  {alignedRegions.map((r, i) => {
                    const pts = r.polygon.map((p) => `${p.x},${p.y}`).join(" ");
                    const active = selected.has(i);
                    return (
                      <g key={i} opacity={active ? 1 : 0.22}>
                        <polygon
                          points={pts}
                          fill={r.color}
                          fillOpacity={0.35}
                          stroke={active ? "#22d3ee" : "#94a3b8"}
                          strokeWidth={0.35}
                          vectorEffect="non-scaling-stroke"
                        />
                        <text
                          x={r.centroid.x + align.offX}
                          y={r.centroid.y + align.offY}
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="3.5"
                          fontWeight={700}
                          fill="#ffffff"
                          stroke="#0f172a"
                          strokeWidth={0.35}
                          paintOrder="stroke"
                        >
                          {previewNumbers[i]}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            ) : (
              <div className="flex h-64 items-center justify-center text-center text-sm text-muted-foreground">
                <div className="space-y-2">
                  <Sparkles className="mx-auto h-8 w-8 opacity-50" />
                  <p>Selecione uma imagem (PNG/JPG) ou um arquivo .PSD.</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Arquivo</Label>
              <Input
                type="file"
                accept="image/*,.psd,application/octet-stream"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f) runDetection(f);
                }}
              />
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <FileImage className="h-3 w-3" />
                PNG/JPG (detecção por cor) ou <strong>PSD</strong> (uma camada por talude).
              </p>
            </div>

            {source === "image" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs uppercase tracking-widest text-muted-foreground">Sensibilidade de cor</Label>
                  <span className="text-xs tabular-nums">{sensitivity}%</span>
                </div>
                <Slider value={[sensitivity]} min={10} max={80} step={5} onValueChange={([v]) => setSensitivity(v)} />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Área mínima</Label>
                <span className="text-xs tabular-nums">{minArea.toFixed(2)}%</span>
              </div>
              <Slider value={[minArea * 100]} min={2} max={100} step={2} onValueChange={([v]) => setMinArea(v / 100)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">Suavização</Label>
                <span className="text-xs tabular-nums">{simplify.toFixed(2)}%</span>
              </div>
              <Slider value={[simplify * 100]} min={5} max={150} step={5} onValueChange={([v]) => setSimplify(v / 100)} />
            </div>

            <Button variant="secondary" onClick={() => runDetection()} disabled={!file || busy} className="w-full">
              {busy ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Detectando…</>
              ) : (
                <><Wand2 className="mr-2 h-4 w-4" /> Reprocessar</>
              )}
            </Button>

            {regions.length > 0 && (
              <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <Move className="h-3 w-3" /> Alinhamento fino
                </p>
                {([
                  ["Offset X", "offX", -30, 30, 0.5, "%"],
                  ["Offset Y", "offY", -30, 30, 0.5, "%"],
                  ["Escala X", "scaleX", 70, 130, 0.5, "%"],
                  ["Escala Y", "scaleY", 70, 130, 0.5, "%"],
                ] as const).map(([label, key, min, max, step, suffix]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="tabular-nums">{align[key].toFixed(1)}{suffix}</span>
                    </div>
                    <Slider
                      value={[align[key]]}
                      min={min}
                      max={max}
                      step={step}
                      onValueChange={([v]) => setAlign((a) => ({ ...a, [key]: v }))}
                    />
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="w-full" onClick={() => setAlign(DEFAULT_ALIGN)}>
                  Restaurar alinhamento
                </Button>
              </div>
            )}

            {regions.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Áreas ({selected.size}/{regions.length})
                  </p>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set(regions.map((_, i) => i)))}>Todas</Button>
                    <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Nenhuma</Button>
                  </div>
                </div>
                <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {regions.map((r, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40">
                      <Checkbox checked={selected.has(i)} onCheckedChange={() => toggleRegion(i)} />
                      <span className="inline-block h-3 w-3 rounded-full border border-border/60" style={{ background: r.color }} />
                      <span className="flex-1 text-sm">Talude {previewNumbers[i]}</span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {r.areaPct.toFixed(2)}% · {r.polygon.length} pts
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button onClick={apply} disabled={!mapId || applying || selected.size === 0} className="w-full">
              {applying ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aplicando…</>
              ) : (
                <><Upload className="mr-2 h-4 w-4" /> Aplicar {selected.size || ""} área(s) no mapa</>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Upload, Wand2, Sparkles } from "lucide-react";

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
  onApply: (regions: Array<{ numero: number; polygon: Pt[] }>) => Promise<void>;
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
  const [sensitivity, setSensitivity] = useState<number>(30); // % saturação mínima
  const [minArea, setMinArea] = useState<number>(0.08); // % da imagem
  const [simplify, setSimplify] = useState<number>(0.4); // % da maior dim
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setPreview(null);
      setRegions([]);
      setSelected(new Set());
      setBusy(false);
    }
  }, [open]);

  const runDetection = async (source?: File) => {
    const src = source ?? file;
    if (!src) return;
    setBusy(true);
    try {
      const result = await detectPolygonsFromImage(src, {
        minSaturation: sensitivity / 100,
        minAreaPct: minArea,
        simplifyPct: simplify,
      });
      setRegions(result.regions);
      setPreview(result.previewDataUrl);
      setSelected(new Set(result.regions.map((_, i) => i)));
      if (result.regions.length === 0) {
        toast.warning(
          "Nenhuma área detectada — reduza a sensibilidade ou verifique a imagem.",
        );
      } else {
        toast.success(`${result.regions.length} área(s) identificada(s)`);
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
        if (!used.has(n)) {
          nums.push(n);
          used.add(n);
        }
        n++;
      }
      return nums;
    };
  }, [existingNumeros]);

  const previewNumbers = useMemo(
    () => nextNumbersFor(regions.length),
    [nextNumbersFor, regions.length],
  );

  const toggleRegion = (i: number) => {
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return s;
    });
  };

  const apply = async () => {
    if (!mapId) return;
    const chosen = regions
      .map((r, i) => ({ r, i }))
      .filter(({ i }) => selected.has(i));
    if (chosen.length === 0) {
      toast.error("Selecione pelo menos uma área.");
      return;
    }
    const nums = nextNumbersFor(chosen.length);
    setApplying(true);
    try {
      await onApply(
        chosen.map(({ r }, k) => ({ numero: nums[k], polygon: r.polygon })),
      );
      toast.success(`${chosen.length} talude(s) criados a partir da imagem`);
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
            Auto‑marcar taludes a partir de imagem
          </DialogTitle>
          <DialogDescription>
            Envie uma imagem com as áreas destacadas em cor (mesmo mapa base ou
            print anotado). O sistema detecta as regiões, extrai o contorno e
            replica os polígonos no mapa selecionado.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
          {/* PREVIEW */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-2">
            {preview ? (
              <div className="relative w-full overflow-hidden rounded-lg bg-black/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="preview" className="block h-auto w-full" />
                <svg
                  ref={svgRef}
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="pointer-events-none absolute inset-0 h-full w-full"
                >
                  {regions.map((r, i) => {
                    const pts = r.polygon.map((p) => `${p.x},${p.y}`).join(" ");
                    const active = selected.has(i);
                    return (
                      <g key={i} opacity={active ? 1 : 0.25}>
                        <polygon
                          points={pts}
                          fill={r.color}
                          fillOpacity={0.35}
                          stroke={active ? "#22d3ee" : "#94a3b8"}
                          strokeWidth={0.35}
                          vectorEffect="non-scaling-stroke"
                        />
                        <text
                          x={r.centroid.x}
                          y={r.centroid.y}
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
                  <p>Selecione uma imagem para começar.</p>
                </div>
              </div>
            )}
          </div>

          {/* CONTROLES */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Imagem anotada</Label>
              <Input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f) runDetection(f);
                }}
              />
              <p className="text-xs text-muted-foreground">
                Aceita PNG/JPG. As áreas coloridas são detectadas automaticamente.
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Sensibilidade de cor
                </Label>
                <span className="text-xs tabular-nums">{sensitivity}%</span>
              </div>
              <Slider
                value={[sensitivity]}
                min={10}
                max={80}
                step={5}
                onValueChange={([v]) => setSensitivity(v)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Área mínima
                </Label>
                <span className="text-xs tabular-nums">{minArea.toFixed(2)}%</span>
              </div>
              <Slider
                value={[minArea * 100]}
                min={2}
                max={100}
                step={2}
                onValueChange={([v]) => setMinArea(v / 100)}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-widest text-muted-foreground">
                  Suavização
                </Label>
                <span className="text-xs tabular-nums">{simplify.toFixed(2)}%</span>
              </div>
              <Slider
                value={[simplify * 100]}
                min={10}
                max={150}
                step={5}
                onValueChange={([v]) => setSimplify(v / 100)}
              />
            </div>

            <Button
              variant="secondary"
              onClick={() => runDetection()}
              disabled={!file || busy}
              className="w-full"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Detectando…
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" /> Reprocessar
                </>
              )}
            </Button>

            {regions.length > 0 && (
              <div className="rounded-lg border border-border/60 bg-card/40 p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    Áreas detectadas ({selected.size}/{regions.length})
                  </p>
                  <div className="flex gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setSelected(new Set(regions.map((_, i) => i)))
                      }
                    >
                      Todas
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelected(new Set())}
                    >
                      Nenhuma
                    </Button>
                  </div>
                </div>
                <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
                  {regions.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40"
                    >
                      <Checkbox
                        checked={selected.has(i)}
                        onCheckedChange={() => toggleRegion(i)}
                      />
                      <span
                        className="inline-block h-3 w-3 rounded-full border border-border/60"
                        style={{ background: r.color }}
                      />
                      <span className="flex-1 text-sm">
                        Talude {previewNumbers[i]}
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground">
                        {r.areaPct.toFixed(2)}% · {r.polygon.length} pts
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              onClick={apply}
              disabled={!mapId || applying || selected.size === 0}
              className="w-full"
            >
              {applying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aplicando…
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Aplicar {selected.size || ""} área(s) no mapa
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Point, Talude, TaludeStatus } from "@/lib/taludes";
import { STATUS_META, polygonCentroid } from "@/lib/taludes";

type Props = {
  imageUrl: string;
  taludes: Talude[];
  editing: boolean;
  draftPoints: Point[];
  onAddPoint: (p: Point) => void;
  onMoveDraftPoint: (i: number, p: Point) => void;
  onMoveExistingPoint: (taludeId: string, i: number, p: Point) => void;
  onSelectTalude: (id: string) => void;
  onHoverTalude: (id: string | null) => void;
  hoveredId: string | null;
  selectedId: string | null;
};

function StatusIcon({ status, className }: { status: TaludeStatus; className?: string }) {
  const Icon =
    status === "programado" ? Clock : status === "em_execucao" ? Loader2 : CheckCircle2;
  return (
    <Icon
      className={cn(
        "h-3.5 w-3.5",
        status === "em_execucao" && "animate-spin-slow",
        className,
      )}
    />
  );
}

export function TaludeMapCanvas({
  imageUrl,
  taludes,
  editing,
  draftPoints,
  onAddPoint,
  onMoveDraftPoint,
  onMoveExistingPoint,
  onSelectTalude,
  onHoverTalude,
  hoveredId,
  selectedId,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<
    | { kind: "draft"; index: number }
    | { kind: "existing"; taludeId: string; index: number }
    | null
  >(null);

  const toPercent = useCallback((clientX: number, clientY: number): Point | null => {
    const el = wrapRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }, []);

  const handleClick = (e: React.MouseEvent) => {
    if (!editing) return;
    if (drag) return;
    const target = e.target as SVGElement;
    if (target.dataset?.role === "vertex" || target.dataset?.role === "polygon") return;
    const p = toPercent(e.clientX, e.clientY);
    if (p) onAddPoint(p);
  };

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent) => {
      const p = toPercent(e.clientX, e.clientY);
      if (!p) return;
      if (drag.kind === "draft") onMoveDraftPoint(drag.index, p);
      else onMoveExistingPoint(drag.taludeId, drag.index, p);
    };
    const onUp = () => setDrag(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [drag, onMoveDraftPoint, onMoveExistingPoint, toPercent]);

  const draftPath = draftPoints.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <div
      ref={wrapRef}
      className={cn(
        "relative w-full select-none overflow-hidden rounded-xl border border-border/60 bg-black/40",
        editing ? "cursor-crosshair" : "cursor-default",
      )}
      onClick={handleClick}
    >
      <img
        src={imageUrl}
        alt="Mapa dos taludes"
        className="block h-auto w-full"
        draggable={false}
      />
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
      >
        {/* Polígonos existentes */}
        {taludes.map((t) => {
          if (!t.polygon || t.polygon.length < 3) return null;
          const meta = STATUS_META[t.status];
          const pts = t.polygon.map((p) => `${p.x},${p.y}`).join(" ");
          const isHover = hoveredId === t.id || selectedId === t.id;
          return (
            <g key={t.id} className="pointer-events-auto">
              <polygon
                data-role="polygon"
                points={pts}
                fill={meta.hexSoft}
                stroke={meta.ring}
                strokeWidth={isHover ? 0.6 : 0.35}
                vectorEffect="non-scaling-stroke"
                style={{
                  transition: "fill 300ms ease, stroke 200ms ease, stroke-width 200ms ease",
                  filter:
                    t.status === "em_execucao"
                      ? `drop-shadow(0 0 0.6px ${meta.hex})`
                      : isHover
                        ? `drop-shadow(0 0 0.4px ${meta.hex})`
                        : undefined,
                  cursor: "pointer",
                }}
                onMouseEnter={() => onHoverTalude(t.id)}
                onMouseLeave={() => onHoverTalude(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectTalude(t.id);
                }}
              >
                {t.status === "em_execucao" && (
                  <animate
                    attributeName="fill-opacity"
                    values="0.35;0.7;0.35"
                    dur="2.4s"
                    repeatCount="indefinite"
                  />
                )}
              </polygon>
              {/* Vértices em modo edição */}
              {editing &&
                t.polygon.map((p, i) => (
                  <circle
                    key={i}
                    data-role="vertex"
                    cx={p.x}
                    cy={p.y}
                    r={0.9}
                    fill="#fff"
                    stroke={meta.hex}
                    strokeWidth={0.3}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: "grab" }}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setDrag({ kind: "existing", taludeId: t.id, index: i });
                    }}
                  />
                ))}
            </g>
          );
        })}

        {/* Rascunho */}
        {draftPoints.length > 0 && (
          <g className="pointer-events-auto">
            {draftPoints.length >= 2 && (
              <polyline
                points={draftPath}
                fill={draftPoints.length >= 3 ? "rgba(168,85,247,0.25)" : "none"}
                stroke="#a855f7"
                strokeWidth={0.5}
                strokeDasharray="1 1"
                vectorEffect="non-scaling-stroke"
              />
            )}
            {draftPoints.map((p, i) => (
              <circle
                key={i}
                data-role="vertex"
                cx={p.x}
                cy={p.y}
                r={1}
                fill="#a855f7"
                stroke="#fff"
                strokeWidth={0.3}
                vectorEffect="non-scaling-stroke"
                style={{ cursor: "grab" }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  setDrag({ kind: "draft", index: i });
                }}
              />
            ))}
          </g>
        )}
      </svg>

      {/* Labels HTML sobrepostos (ficam mais nítidas que texto SVG) */}
      <div className="pointer-events-none absolute inset-0">
        {taludes.map((t) => {
          if (!t.polygon || t.polygon.length < 3) return null;
          const c = polygonCentroid(t.polygon);
          const meta = STATUS_META[t.status];
          return (
            <div
              key={t.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${c.x}%`, top: `${c.y}%` }}
            >
              <div
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-md border bg-slate-900/85 px-2 py-1 text-[10px] font-semibold text-white shadow-lg backdrop-blur-sm sm:text-xs",
                )}
                style={{ borderColor: meta.hex }}
              >
                <div className="flex items-center gap-1.5">
                  <StatusIcon status={t.status} className="shrink-0" />
                  <span className="tracking-wide">T{String(t.numero).padStart(2, "0")}</span>
                </div>
                <span
                  className="text-[9px] font-medium uppercase tracking-wider sm:text-[10px]"
                  style={{ color: meta.hex }}
                >
                  {meta.label}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

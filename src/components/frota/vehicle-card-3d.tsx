import { memo } from "react";
import { Lock } from "lucide-react";

import { cn } from "@/lib/utils";
import { VEHICLE_STATUS_LABEL, vehicleLabel, type Vehicle } from "@/lib/frota/api";
import { VehiclePhoto } from "@/components/frota/vehicle-photo";
import { formatPlate } from "@/lib/frota/plate";

const STATUS_TONE: Record<string, string> = {
  disponivel: "text-emerald-300 bg-emerald-400/10 border-emerald-400/30",
  em_uso: "text-sky-300 bg-sky-400/10 border-sky-400/30",
  bloqueado: "text-rose-300 bg-rose-400/10 border-rose-400/30",
  manutencao: "text-amber-300 bg-amber-400/10 border-amber-400/30",
  inativo: "text-muted-foreground bg-muted/20 border-border/50",
};

/**
 * Card do veículo com miniatura realista (SVG) — sem download de modelo 3D,
 * carrega instantâneo e mantém o visual moderno em qualquer aparelho.
 */
export const VehicleCard3D = memo(function VehicleCard3D({
  vehicle,
  active,
  onSelect,
}: {
  vehicle: Vehicle;
  active: boolean;
  onSelect: (v: Vehicle) => void;
}) {
  const photo = vehicle.thumbnail_url || vehicle.model_poster_url;

  return (
    <button
      type="button"
      onClick={() => onSelect(vehicle)}
      aria-pressed={active}
      className={cn(
        "group relative flex min-h-[44px] w-full flex-col overflow-hidden rounded-3xl border text-left transition-all",
        active
          ? "border-primary/60 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.35)]"
          : "border-border/50 bg-card/40 hover:border-primary/40",
      )}
    >
      <div className="relative flex h-16 w-full items-center justify-center overflow-hidden bg-gradient-to-br from-primary/15 via-transparent to-transparent p-2">
        {photo ? (
          <img
            src={photo}
            alt={vehicleLabel(vehicle)}
            loading="lazy"
            decoding="async"
            className="max-h-full max-w-[70%] object-contain"
          />
        ) : (
          <VehiclePhoto
            brand={vehicle.brand}
            model={vehicle.model}
            version={vehicle.version}
            color={vehicle.color}
            title={vehicleLabel(vehicle)}
            className={cn(
              "mx-auto max-h-full !w-auto max-w-[70%] drop-shadow-[0_4px_10px_rgba(0,0,0,.45)] transition-transform duration-300",
              active ? "scale-105" : "group-hover:scale-105",
            )}
          />
        )}


        {vehicle.status === "bloqueado" && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full border border-rose-400/40 bg-rose-500/20 px-2 py-1 text-[10px] font-semibold text-rose-200">
            <Lock className="h-3 w-3" /> Bloqueado
          </span>
        )}
      </div>

      {/* Identificação textual sempre visível. */}
      <div className="space-y-1 p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-xs font-bold tracking-widest text-primary">
            {vehicle.prefix}
          </span>
          <span
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium",
              STATUS_TONE[vehicle.status] ?? STATUS_TONE.inativo,
            )}
          >
            {VEHICLE_STATUS_LABEL[vehicle.status]}
          </span>
        </div>
        <p className="truncate text-sm font-semibold">{vehicleLabel(vehicle)}</p>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-border/60 bg-background/60 px-2 py-0.5 font-mono text-[11px] font-bold tracking-widest">
            {formatPlate(vehicle.plate) || "SEM PLACA"}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {vehicle.year_model ?? "—"}
          </span>
        </div>
      </div>
    </button>
  );
});
